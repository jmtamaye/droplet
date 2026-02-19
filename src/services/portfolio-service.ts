/**
 * High-level portfolio service that ties together repositories, the tagging
 * engine, and the risk engine to provide a unified API for managing and
 * viewing portfolios.
 */

import { Database } from '../db/adapter';
import {
  Institution, Account, Asset, Holding, Tag, AssetTag,
  InstitutionType, AssetClass, Currency, TagCategory,
  PortfolioSummary, InstitutionBreakdown, AccountBreakdown,
  HoldingView, AllocationSlice, RiskReport,
} from '../models/types';
import {
  InstitutionRepo, AccountRepo, AssetRepo, HoldingRepo,
  TagRepo, AssetTagRepo,
} from '../db/repositories';
import { TaggingEngine } from './tagging-engine';
import { RiskEngine, RiskThresholds } from './risk-engine';

export class PortfolioService {
  private institutionRepo: InstitutionRepo;
  private accountRepo: AccountRepo;
  private assetRepo: AssetRepo;
  private holdingRepo: HoldingRepo;
  private tagRepo: TagRepo;
  private assetTagRepo: AssetTagRepo;
  private taggingEngine: TaggingEngine;
  private riskEngine: RiskEngine;

  constructor(private db: Database, thresholds?: RiskThresholds) {
    this.institutionRepo = new InstitutionRepo(db);
    this.accountRepo = new AccountRepo(db);
    this.assetRepo = new AssetRepo(db);
    this.holdingRepo = new HoldingRepo(db);
    this.tagRepo = new TagRepo(db);
    this.assetTagRepo = new AssetTagRepo(db);
    this.taggingEngine = new TaggingEngine(db);
    this.riskEngine = new RiskEngine(db, thresholds);
  }

  // ── Institutions ──────────────────────────────────────────────────

  addInstitution(data: { name: string; type: InstitutionType; notes?: string }): Institution {
    return this.institutionRepo.create(data);
  }

  getInstitutions(): Institution[] {
    return this.institutionRepo.getAll();
  }

  getInstitution(id: string): Institution | undefined {
    return this.institutionRepo.getById(id);
  }

  updateInstitution(id: string, data: Partial<Pick<Institution, 'name' | 'type' | 'notes'>>): Institution | undefined {
    return this.institutionRepo.update(id, data);
  }

  deleteInstitution(id: string): boolean {
    return this.institutionRepo.delete(id);
  }

  // ── Accounts ──────────────────────────────────────────────────────

  addAccount(data: {
    institutionId: string; name: string; accountType: string;
    currency?: Currency; notes?: string;
  }): Account {
    return this.accountRepo.create(data);
  }

  getAccounts(): Account[] {
    return this.accountRepo.getAll();
  }

  getAccount(id: string): Account | undefined {
    return this.accountRepo.getById(id);
  }

  getAccountsByInstitution(institutionId: string): Account[] {
    return this.accountRepo.getByInstitution(institutionId);
  }

  updateAccount(id: string, data: Partial<Pick<Account, 'name' | 'accountType' | 'currency' | 'notes'>>): Account | undefined {
    return this.accountRepo.update(id, data);
  }

  deleteAccount(id: string): boolean {
    return this.accountRepo.delete(id);
  }

  // ── Assets ────────────────────────────────────────────────────────

  addAsset(data: {
    symbol?: string; name: string; assetClass: AssetClass;
    currency?: Currency; currentPrice?: number; metadata?: Record<string, string>;
  }): Asset {
    const asset = this.assetRepo.create(data);
    this.taggingEngine.classify(asset);
    return asset;
  }

  getAssets(): Asset[] {
    return this.assetRepo.getAll();
  }

  getAsset(id: string): Asset | undefined {
    return this.assetRepo.getById(id);
  }

  getAssetBySymbol(symbol: string): Asset | undefined {
    return this.assetRepo.getBySymbol(symbol);
  }

  updateAsset(id: string, data: Partial<Pick<Asset, 'symbol' | 'name' | 'assetClass' | 'currency' | 'currentPrice' | 'metadata'>>): Asset | undefined {
    const updated = this.assetRepo.update(id, data);
    if (updated) {
      this.taggingEngine.classify(updated);
    }
    return updated;
  }

  deleteAsset(id: string): boolean {
    return this.assetRepo.delete(id);
  }

  reclassifyAllAssets(): void {
    const assets = this.assetRepo.getAll();
    this.taggingEngine.classifyAll(assets);
  }

  // ── Holdings ──────────────────────────────────────────────────────

  addHolding(data: {
    accountId: string; assetId: string; quantity: number;
    costBasis?: number; currentValue?: number; asOfDate?: string; notes?: string;
  }): Holding {
    return this.holdingRepo.create(data);
  }

  getHoldings(): Holding[] {
    return this.holdingRepo.getAll();
  }

  getHolding(id: string): Holding | undefined {
    return this.holdingRepo.getById(id);
  }

  getHoldingsByAccount(accountId: string): Holding[] {
    return this.holdingRepo.getByAccount(accountId);
  }

  updateHolding(id: string, data: Partial<Pick<Holding, 'quantity' | 'costBasis' | 'currentValue' | 'asOfDate' | 'notes'>>): Holding | undefined {
    return this.holdingRepo.update(id, data);
  }

  deleteHolding(id: string): boolean {
    return this.holdingRepo.delete(id);
  }

  // ── Tags ──────────────────────────────────────────────────────────

  getTags(): Tag[] {
    return this.tagRepo.getAll();
  }

  getTagsForAsset(assetId: string): (AssetTag & { tag: Tag })[] {
    const assetTags = this.assetTagRepo.getByAsset(assetId);
    return assetTags.map(at => {
      const tag = this.tagRepo.getById(at.tagId)!;
      return { ...at, tag };
    }).filter(at => at.tag != null);
  }

  addManualTag(assetId: string, tagName: string, category: TagCategory, weight?: number, description?: string): AssetTag {
    let tag = this.tagRepo.getByName(tagName);
    if (!tag) {
      tag = this.tagRepo.create({ name: tagName, category, description });
    }
    return this.assetTagRepo.set({ assetId, tagId: tag.id, weight, source: 'manual' });
  }

  removeTag(assetId: string, tagId: string): boolean {
    return this.assetTagRepo.remove(assetId, tagId);
  }

  // ── Portfolio Summary ─────────────────────────────────────────────

  getSummary(): PortfolioSummary {
    const holdings = this.holdingRepo.getAll();
    const totalValue = holdings.reduce((s, h) => s + h.currentValue, 0);
    const totalCostBasis = holdings.reduce((s, h) => s + h.costBasis, 0);
    const totalGainLoss = totalValue - totalCostBasis;
    const totalGainLossPct = totalCostBasis > 0 ? totalGainLoss / totalCostBasis : 0;

    const institutions = this.institutionRepo.getAll();
    const byInstitution: InstitutionBreakdown[] = institutions.map(inst => {
      const accounts = this.accountRepo.getByInstitution(inst.id);
      const acctBreakdowns: AccountBreakdown[] = accounts.map(acct => {
        const acctHoldings = this.holdingRepo.getByAccount(acct.id);
        const holdingViews: HoldingView[] = acctHoldings.map(h => {
          const asset = this.assetRepo.getById(h.assetId)!;
          const tags = this.assetTagRepo.getByAsset(h.assetId);
          const gainLoss = h.currentValue - h.costBasis;
          const gainLossPct = h.costBasis > 0 ? gainLoss / h.costBasis : 0;
          return {
            holding: h,
            asset,
            tags,
            gainLoss,
            gainLossPct,
            pctOfPortfolio: totalValue > 0 ? h.currentValue / totalValue : 0,
          };
        });

        const acctValue = acctHoldings.reduce((s, h) => s + h.currentValue, 0);
        const acctCostBasis = acctHoldings.reduce((s, h) => s + h.costBasis, 0);
        return {
          account: acct,
          holdings: holdingViews,
          totalValue: acctValue,
          totalCostBasis: acctCostBasis,
          totalGainLoss: acctValue - acctCostBasis,
          pctOfPortfolio: totalValue > 0 ? acctValue / totalValue : 0,
        };
      });

      const instValue = acctBreakdowns.reduce((s, a) => s + a.totalValue, 0);
      const instCostBasis = acctBreakdowns.reduce((s, a) => s + a.totalCostBasis, 0);
      return {
        institution: inst,
        accounts: acctBreakdowns,
        totalValue: instValue,
        totalCostBasis: instCostBasis,
        totalGainLoss: instValue - instCostBasis,
        pctOfPortfolio: totalValue > 0 ? instValue / totalValue : 0,
      };
    }).filter(ib => ib.totalValue > 0 || ib.accounts.length > 0);

    return {
      totalValue,
      totalCostBasis,
      totalGainLoss,
      totalGainLossPct,
      currency: Currency.USD,
      asOfDate: new Date().toISOString().slice(0, 10),
      byInstitution,
      byAssetClass: this.aggregateByTagCategory(holdings, totalValue, TagCategory.ASSET_TYPE),
      byRiskCategory: this.aggregateByTagCategory(holdings, totalValue, TagCategory.RISK_TYPE),
      byGeography: this.aggregateByTagCategory(holdings, totalValue, TagCategory.GEOGRAPHY),
      bySector: this.aggregateByTagCategory(holdings, totalValue, TagCategory.SECTOR),
      byTag: this.aggregateAllTags(holdings, totalValue),
    };
  }

  // ── Risk Report ───────────────────────────────────────────────────

  getRiskReport(): RiskReport {
    return this.riskEngine.generateReport();
  }

  // ── Aggregation Helpers ───────────────────────────────────────────

  private aggregateByTagCategory(holdings: Holding[], total: number, category: TagCategory): AllocationSlice[] {
    const buckets = new Map<string, number>();

    for (const h of holdings) {
      const assetTags = this.assetTagRepo.getByAsset(h.assetId);
      const relevantTags = assetTags
        .map(at => ({ at, tag: this.tagRepo.getById(at.tagId) }))
        .filter(t => t.tag?.category === category);

      if (relevantTags.length === 0) {
        const label = 'unclassified';
        buckets.set(label, (buckets.get(label) ?? 0) + h.currentValue);
      } else {
        for (const { at, tag } of relevantTags) {
          const label = tag!.name;
          buckets.set(label, (buckets.get(label) ?? 0) + h.currentValue * at.weight);
        }
      }
    }

    return Array.from(buckets.entries())
      .map(([label, value]) => ({
        label,
        value,
        pctOfTotal: total > 0 ? value / total : 0,
      }))
      .sort((a, b) => b.value - a.value);
  }

  private aggregateAllTags(holdings: Holding[], total: number): AllocationSlice[] {
    const buckets = new Map<string, number>();

    for (const h of holdings) {
      const assetTags = this.assetTagRepo.getByAsset(h.assetId);
      for (const at of assetTags) {
        const tag = this.tagRepo.getById(at.tagId);
        if (!tag) continue;
        const label = `${tag.category}:${tag.name}`;
        buckets.set(label, (buckets.get(label) ?? 0) + h.currentValue * at.weight);
      }
    }

    return Array.from(buckets.entries())
      .map(([label, value]) => ({
        label,
        value,
        pctOfTotal: total > 0 ? value / total : 0,
      }))
      .sort((a, b) => b.value - a.value);
  }
}
