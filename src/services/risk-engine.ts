/**
 * Risk aggregation engine.
 *
 * Walks every holding, reads its asset-tag weights, and builds an aggregated
 * risk report that shows total exposure by risk category, plus concentration
 * warnings when any single position or bucket exceeds configurable thresholds.
 */

import { Database } from '../db/adapter';
import {
  RiskReport, RiskExposure, RiskContributor, ConcentrationWarning,
  RiskCategory, TagCategory, Holding, Asset, AssetTag, Tag,
} from '../models/types';
import { HoldingRepo, AssetRepo, AssetTagRepo, TagRepo, InstitutionRepo, AccountRepo } from '../db/repositories';

// ── Configuration ───────────────────────────────────────────────────

export interface RiskThresholds {
  singleAsset: number;        // warn if one asset > X% of portfolio
  singleInstitution: number;  // warn if one institution > X% of portfolio
  riskCategory: number;       // warn if one risk category > X% of portfolio
  singleSector: number;       // warn if one sector > X% of portfolio
  singleGeography: number;    // warn if one geography > X% of portfolio
}

const DEFAULT_THRESHOLDS: RiskThresholds = {
  singleAsset: 0.20,
  singleInstitution: 0.40,
  riskCategory: 0.50,
  singleSector: 0.35,
  singleGeography: 0.60,
};

// Map from tag name → RiskCategory
const TAG_TO_RISK_CATEGORY: Record<string, RiskCategory> = {
  equity_risk: RiskCategory.EQUITY_RISK,
  credit_risk: RiskCategory.CREDIT_RISK,
  interest_rate_risk: RiskCategory.INTEREST_RATE_RISK,
  commodity_risk: RiskCategory.COMMODITY_RISK,
  currency_risk: RiskCategory.CURRENCY_RISK,
  real_estate_risk: RiskCategory.REAL_ESTATE_RISK,
  inflation_risk: RiskCategory.INFLATION_RISK,
  liquidity_risk: RiskCategory.LIQUIDITY_RISK,
  crypto_risk: RiskCategory.CRYPTO_RISK,
  depreciation_risk: RiskCategory.DEPRECIATION_RISK,
  other_risk: RiskCategory.OTHER_RISK,
};

// ── Engine ───────────────────────────────────────────────────────────

export class RiskEngine {
  private holdingRepo: HoldingRepo;
  private assetRepo: AssetRepo;
  private assetTagRepo: AssetTagRepo;
  private tagRepo: TagRepo;
  private institutionRepo: InstitutionRepo;
  private accountRepo: AccountRepo;

  constructor(
    private db: Database,
    private thresholds: RiskThresholds = DEFAULT_THRESHOLDS,
  ) {
    this.holdingRepo = new HoldingRepo(db);
    this.assetRepo = new AssetRepo(db);
    this.assetTagRepo = new AssetTagRepo(db);
    this.tagRepo = new TagRepo(db);
    this.institutionRepo = new InstitutionRepo(db);
    this.accountRepo = new AccountRepo(db);
  }

  generateReport(): RiskReport {
    const holdings = this.holdingRepo.getAll();
    const totalPortfolioValue = holdings.reduce((sum, h) => sum + h.currentValue, 0);

    if (totalPortfolioValue === 0) {
      return {
        totalPortfolioValue: 0,
        asOfDate: new Date().toISOString().slice(0, 10),
        exposures: [],
        concentrationWarnings: [],
      };
    }

    // Build risk exposures from tag weights
    const exposureMap = new Map<string, { category: RiskCategory; label: string; contributors: RiskContributor[] }>();

    for (const holding of holdings) {
      const asset = this.assetRepo.getById(holding.assetId);
      if (!asset) continue;

      const assetTags = this.assetTagRepo.getByAsset(asset.id);
      const tags = assetTags.map(at => ({
        assetTag: at,
        tag: this.tagRepo.getById(at.tagId),
      })).filter(t => t.tag !== undefined);

      // Only consider risk_type tags
      const riskTags = tags.filter(t => t.tag!.category === TagCategory.RISK_TYPE);

      if (riskTags.length === 0) {
        // No risk tags — put under OTHER_RISK
        this.addContributor(exposureMap, RiskCategory.OTHER_RISK, 'Other Risk', {
          asset,
          holdingValue: holding.currentValue,
          weight: 1.0,
          effectiveExposure: holding.currentValue,
        });
        continue;
      }

      for (const { assetTag, tag } of riskTags) {
        const riskCat = TAG_TO_RISK_CATEGORY[tag!.name] ?? RiskCategory.OTHER_RISK;
        const label = this.formatRiskLabel(riskCat);
        this.addContributor(exposureMap, riskCat, label, {
          asset,
          holdingValue: holding.currentValue,
          weight: assetTag.weight,
          effectiveExposure: holding.currentValue * assetTag.weight,
        });
      }
    }

    // Build exposure list
    const exposures: RiskExposure[] = Array.from(exposureMap.values()).map(entry => {
      const value = entry.contributors.reduce((sum, c) => sum + c.effectiveExposure, 0);
      return {
        category: entry.category,
        label: entry.label,
        value,
        pctOfPortfolio: value / totalPortfolioValue,
        contributors: entry.contributors.sort((a, b) => b.effectiveExposure - a.effectiveExposure),
      };
    }).sort((a, b) => b.value - a.value);

    // Concentration warnings
    const warnings = this.checkConcentration(holdings, totalPortfolioValue);

    return {
      totalPortfolioValue,
      asOfDate: new Date().toISOString().slice(0, 10),
      exposures,
      concentrationWarnings: warnings,
    };
  }

  private addContributor(
    map: Map<string, { category: RiskCategory; label: string; contributors: RiskContributor[] }>,
    category: RiskCategory,
    label: string,
    contributor: RiskContributor,
  ): void {
    if (!map.has(category)) {
      map.set(category, { category, label, contributors: [] });
    }
    map.get(category)!.contributors.push(contributor);
  }

  private checkConcentration(holdings: Holding[], total: number): ConcentrationWarning[] {
    const warnings: ConcentrationWarning[] = [];

    // Single asset concentration
    const assetValues = new Map<string, { name: string; value: number }>();
    for (const h of holdings) {
      const asset = this.assetRepo.getById(h.assetId);
      if (!asset) continue;
      const current = assetValues.get(asset.id) ?? { name: asset.name, value: 0 };
      current.value += h.currentValue;
      assetValues.set(asset.id, current);
    }

    for (const [, { name, value }] of assetValues) {
      const pct = value / total;
      if (pct > this.thresholds.singleAsset) {
        warnings.push({
          type: 'single_asset',
          label: name,
          pctOfPortfolio: pct,
          threshold: this.thresholds.singleAsset,
          message: `${name} represents ${(pct * 100).toFixed(1)}% of portfolio (threshold: ${(this.thresholds.singleAsset * 100).toFixed(0)}%)`,
        });
      }
    }

    // Institution concentration
    const instValues = new Map<string, { name: string; value: number }>();
    for (const h of holdings) {
      const account = this.accountRepo.getById(h.accountId);
      if (!account) continue;
      const inst = this.institutionRepo.getById(account.institutionId);
      if (!inst) continue;
      const current = instValues.get(inst.id) ?? { name: inst.name, value: 0 };
      current.value += h.currentValue;
      instValues.set(inst.id, current);
    }

    for (const [, { name, value }] of instValues) {
      const pct = value / total;
      if (pct > this.thresholds.singleInstitution) {
        warnings.push({
          type: 'single_institution',
          label: name,
          pctOfPortfolio: pct,
          threshold: this.thresholds.singleInstitution,
          message: `${name} holds ${(pct * 100).toFixed(1)}% of portfolio (threshold: ${(this.thresholds.singleInstitution * 100).toFixed(0)}%)`,
        });
      }
    }

    return warnings;
  }

  private formatRiskLabel(cat: RiskCategory): string {
    return cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
}
