/**
 * Intelligent asset tagging engine.
 *
 * Automatically classifies assets into risk, geography, sector, and strategy
 * tags based on symbol patterns, name keywords, and asset class.
 *
 * Key design goal: look *through* the wrapper to the underlying exposure.
 *   - A US High Yield ETF (e.g. HYG) → credit_risk, not equity_risk
 *   - A Gold ETF (e.g. GLD) → commodity/gold, not equity_risk
 *   - A REIT ETF (e.g. VNQ) → real_estate_risk
 *   - An S&P 500 ETF (e.g. SPY) → equity_risk
 */

import { Database } from '../db/adapter';
import { Asset, TagCategory } from '../models/types';
import { TagRepo, AssetTagRepo } from '../db/repositories';

// ── Rule Definitions ────────────────────────────────────────────────

interface TagRule {
  tag: string;
  category: TagCategory;
  description: string;
  weight: number;
}

interface ClassificationRule {
  /** Regex patterns matched against symbol (case-insensitive) */
  symbolPatterns?: RegExp[];
  /** Regex patterns matched against name (case-insensitive) */
  namePatterns?: RegExp[];
  /** Match by asset class (string labels) */
  assetClasses?: string[];
  /** Tags to apply when this rule matches */
  tags: TagRule[];
}

// ── Classification Rules ────────────────────────────────────────────

const RULES: ClassificationRule[] = [
  // ── High Yield / Credit ──
  {
    symbolPatterns: [/^(HYG|JNK|USHY|SHYG|HYLD|HYLB|ANGL|FALN|BKLN|SRLN|FTSL)$/i],
    namePatterns: [/high\s*yield/i, /junk\s*bond/i, /leveraged\s*loan/i, /senior\s*loan/i, /fallen\s*angel/i],
    tags: [
      { tag: 'credit_risk', category: TagCategory.RISK_TYPE, description: 'Exposed to credit/default risk', weight: 1.0 },
      { tag: 'fixed_income', category: TagCategory.ASSET_TYPE, description: 'Fixed income exposure', weight: 1.0 },
      { tag: 'high_yield', category: TagCategory.STRATEGY, description: 'High yield / below investment grade', weight: 1.0 },
    ],
  },

  // ── Investment Grade Bonds ──
  {
    symbolPatterns: [/^(LQD|VCIT|VCSH|IGSB|IGIB|SPLB|BND|AGG|SCHZ|FBND)$/i],
    namePatterns: [/investment\s*grade/i, /aggregate\s*bond/i, /corporate\s*bond/i, /total\s*bond/i],
    tags: [
      { tag: 'interest_rate_risk', category: TagCategory.RISK_TYPE, description: 'Sensitive to interest rate changes', weight: 0.6 },
      { tag: 'credit_risk', category: TagCategory.RISK_TYPE, description: 'Exposed to credit/default risk', weight: 0.4 },
      { tag: 'fixed_income', category: TagCategory.ASSET_TYPE, description: 'Fixed income exposure', weight: 1.0 },
      { tag: 'investment_grade', category: TagCategory.STRATEGY, description: 'Investment grade bonds', weight: 1.0 },
    ],
  },

  // ── Government / Treasury Bonds ──
  {
    symbolPatterns: [/^(TLT|IEF|SHY|SHV|GOVT|VGSH|VGIT|VGLT|SPTL|SPTS|BIL|SGOV|TIPS|VTIP|STIP|TIP)$/i],
    namePatterns: [/treasury/i, /government\s*bond/i, /sovereign/i, /tips/i, /inflation.protected/i],
    tags: [
      { tag: 'interest_rate_risk', category: TagCategory.RISK_TYPE, description: 'Sensitive to interest rate changes', weight: 1.0 },
      { tag: 'fixed_income', category: TagCategory.ASSET_TYPE, description: 'Fixed income exposure', weight: 1.0 },
      { tag: 'us', category: TagCategory.GEOGRAPHY, description: 'US exposure', weight: 1.0 },
    ],
  },

  // ── Gold / Precious Metals ──
  {
    symbolPatterns: [/^(GLD|IAU|SGOL|AAAU|BAR|OUNZ|GLDM|GDX|GDXJ|SLV|SIVR|PPLT|PALL)$/i],
    namePatterns: [/\bgold\b/i, /\bsilver\b/i, /\bplatinum\b/i, /\bpalladium\b/i, /precious\s*metal/i],
    tags: [
      { tag: 'commodity_risk', category: TagCategory.RISK_TYPE, description: 'Commodity price risk', weight: 1.0 },
      { tag: 'gold', category: TagCategory.ASSET_TYPE, description: 'Gold / precious metals exposure', weight: 1.0 },
    ],
  },

  // ── Broad Commodities ──
  {
    symbolPatterns: [/^(DBC|GSG|PDBC|COMT|DJP|BCI|USCI|COM|COMB)$/i],
    namePatterns: [/\bcommodit/i, /natural\s*resource/i],
    tags: [
      { tag: 'commodity_risk', category: TagCategory.RISK_TYPE, description: 'Commodity price risk', weight: 1.0 },
      { tag: 'commodities', category: TagCategory.ASSET_TYPE, description: 'Broad commodity exposure', weight: 1.0 },
    ],
  },

  // ── Oil / Energy Commodities ──
  {
    symbolPatterns: [/^(USO|BNO|UCO|DBO|UNG|BOIL|KOLD)$/i],
    namePatterns: [/\bcrude\b/i, /\boil\b/i, /natural\s*gas/i, /\benergy\s*commodity/i],
    tags: [
      { tag: 'commodity_risk', category: TagCategory.RISK_TYPE, description: 'Commodity price risk', weight: 1.0 },
      { tag: 'energy', category: TagCategory.SECTOR, description: 'Energy sector', weight: 1.0 },
    ],
  },

  // ── US Large Cap Equity ──
  {
    symbolPatterns: [/^(SPY|VOO|IVV|VTI|ITOT|SPTM|SCHB|SPLG|VV|MGC|QQQ|QQQM)$/i],
    namePatterns: [/s\&?p\s*500/i, /total\s*(stock\s*)?market/i, /large\s*cap/i, /nasdaq.100/i],
    tags: [
      { tag: 'equity_risk', category: TagCategory.RISK_TYPE, description: 'Equity market risk', weight: 1.0 },
      { tag: 'us', category: TagCategory.GEOGRAPHY, description: 'US exposure', weight: 1.0 },
      { tag: 'large_cap', category: TagCategory.STRATEGY, description: 'Large cap stocks', weight: 1.0 },
    ],
  },

  // ── US Small / Mid Cap Equity ──
  {
    symbolPatterns: [/^(IWM|VB|SCHA|IJR|SPSM|VXF|MDY|IJH|VO|IVOO)$/i],
    namePatterns: [/small\s*cap/i, /mid\s*cap/i, /russell\s*2000/i, /smid/i],
    tags: [
      { tag: 'equity_risk', category: TagCategory.RISK_TYPE, description: 'Equity market risk', weight: 1.0 },
      { tag: 'us', category: TagCategory.GEOGRAPHY, description: 'US exposure', weight: 1.0 },
      { tag: 'small_cap', category: TagCategory.STRATEGY, description: 'Small / mid cap stocks', weight: 1.0 },
    ],
  },

  // ── International Developed Equity ──
  {
    symbolPatterns: [/^(EFA|VEA|IEFA|SCHF|SPDW|IXUS|VEU|VXUS|ACWX)$/i],
    namePatterns: [/international\s*(developed)?/i, /eafe/i, /ex.us/i, /world\s*ex/i],
    tags: [
      { tag: 'equity_risk', category: TagCategory.RISK_TYPE, description: 'Equity market risk', weight: 0.8 },
      { tag: 'currency_risk', category: TagCategory.RISK_TYPE, description: 'Foreign currency exposure', weight: 0.2 },
      { tag: 'international', category: TagCategory.GEOGRAPHY, description: 'International / developed markets', weight: 1.0 },
    ],
  },

  // ── Emerging Markets Equity ──
  {
    symbolPatterns: [/^(EEM|VWO|IEMG|SCHE|SPEM|EMXC|XSOE|DFAE)$/i],
    namePatterns: [/emerging\s*market/i],
    tags: [
      { tag: 'equity_risk', category: TagCategory.RISK_TYPE, description: 'Equity market risk', weight: 0.7 },
      { tag: 'currency_risk', category: TagCategory.RISK_TYPE, description: 'Foreign currency exposure', weight: 0.3 },
      { tag: 'emerging_markets', category: TagCategory.GEOGRAPHY, description: 'Emerging markets', weight: 1.0 },
    ],
  },

  // ── REITs / Real Estate Securities ──
  {
    symbolPatterns: [/^(VNQ|VNQI|SCHH|IYR|XLRE|RWR|USRT|REET|REM|MORT)$/i],
    namePatterns: [/\breit\b/i, /real\s*estate\s*(investment\s*trust|etf|fund|index)/i],
    tags: [
      { tag: 'real_estate_risk', category: TagCategory.RISK_TYPE, description: 'Real estate market risk', weight: 0.7 },
      { tag: 'interest_rate_risk', category: TagCategory.RISK_TYPE, description: 'Sensitive to interest rate changes', weight: 0.3 },
      { tag: 'real_estate', category: TagCategory.SECTOR, description: 'Real estate sector', weight: 1.0 },
    ],
  },

  // ── Crypto ──
  {
    symbolPatterns: [/^(BTC|ETH|SOL|ADA|DOT|AVAX|MATIC|LINK|UNI|AAVE|GBTC|ETHE|BITO|IBIT|FBTC)$/i],
    namePatterns: [/\bcrypto/i, /\bbitcoin\b/i, /\bethereum\b/i, /\bblockchain\b/i, /digital\s*asset/i],
    tags: [
      { tag: 'crypto_risk', category: TagCategory.RISK_TYPE, description: 'Cryptocurrency volatility risk', weight: 1.0 },
      { tag: 'crypto', category: TagCategory.ASSET_TYPE, description: 'Cryptocurrency / digital asset', weight: 1.0 },
    ],
  },

  // ── Technology Sector ──
  {
    symbolPatterns: [/^(XLK|VGT|FTEC|IGV|SOXX|SMH|ARKK|ARKW|HACK|WCLD|SKYY|CLOU|CIBR)$/i],
    namePatterns: [/technology\s*(sector|etf|fund|index)/i, /semiconductor/i, /software/i, /\btech\s*(etf|fund)/i, /cloud\s*computing/i, /cyber/i],
    tags: [
      { tag: 'equity_risk', category: TagCategory.RISK_TYPE, description: 'Equity market risk', weight: 1.0 },
      { tag: 'technology', category: TagCategory.SECTOR, description: 'Technology sector', weight: 1.0 },
      { tag: 'us', category: TagCategory.GEOGRAPHY, description: 'US exposure', weight: 0.8 },
    ],
  },

  // ── Healthcare Sector ──
  {
    symbolPatterns: [/^(XLV|VHT|FHLC|IBB|XBI|IHI|ARKG)$/i],
    namePatterns: [/health\s*care/i, /biotech/i, /pharma/i, /medical\s*device/i],
    tags: [
      { tag: 'equity_risk', category: TagCategory.RISK_TYPE, description: 'Equity market risk', weight: 1.0 },
      { tag: 'healthcare', category: TagCategory.SECTOR, description: 'Healthcare sector', weight: 1.0 },
    ],
  },

  // ── Financials Sector ──
  {
    symbolPatterns: [/^(XLF|VFH|FNCL|KBE|KRE|IAI)$/i],
    namePatterns: [/financial\s*(sector|etf|fund|index)/i, /\bbank/i, /insurance\s*etf/i],
    tags: [
      { tag: 'equity_risk', category: TagCategory.RISK_TYPE, description: 'Equity market risk', weight: 0.7 },
      { tag: 'interest_rate_risk', category: TagCategory.RISK_TYPE, description: 'Sensitive to interest rate changes', weight: 0.3 },
      { tag: 'financials', category: TagCategory.SECTOR, description: 'Financials sector', weight: 1.0 },
    ],
  },

  // ── Energy Sector (Equities) ──
  {
    symbolPatterns: [/^(XLE|VDE|FENY|IYE|OIH|XOP|AMLP|MLPA)$/i],
    namePatterns: [/energy\s*(sector|etf|fund|index|equity)/i, /\bmlp\b/i, /oil\s*(services|equity|stock)/i],
    tags: [
      { tag: 'equity_risk', category: TagCategory.RISK_TYPE, description: 'Equity market risk', weight: 0.6 },
      { tag: 'commodity_risk', category: TagCategory.RISK_TYPE, description: 'Commodity price risk', weight: 0.4 },
      { tag: 'energy', category: TagCategory.SECTOR, description: 'Energy sector', weight: 1.0 },
    ],
  },

  // ── Utilities ──
  {
    symbolPatterns: [/^(XLU|VPU|FUTY|IDU)$/i],
    namePatterns: [/utilit(y|ies)\s*(sector|etf|fund|index)/i],
    tags: [
      { tag: 'equity_risk', category: TagCategory.RISK_TYPE, description: 'Equity market risk', weight: 0.5 },
      { tag: 'interest_rate_risk', category: TagCategory.RISK_TYPE, description: 'Sensitive to interest rate changes', weight: 0.5 },
      { tag: 'utilities', category: TagCategory.SECTOR, description: 'Utilities sector', weight: 1.0 },
    ],
  },

  // ── Physical Real Estate ──
  {
    assetClasses: ['real_estate'],
    tags: [
      { tag: 'real_estate_risk', category: TagCategory.RISK_TYPE, description: 'Real estate market risk', weight: 0.7 },
      { tag: 'liquidity_risk', category: TagCategory.RISK_TYPE, description: 'Illiquid asset — hard to sell quickly', weight: 0.3 },
      { tag: 'real_estate', category: TagCategory.SECTOR, description: 'Real estate', weight: 1.0 },
    ],
  },

  // ── Vehicles ──
  {
    assetClasses: ['vehicle'],
    tags: [
      { tag: 'depreciation_risk', category: TagCategory.RISK_TYPE, description: 'Value depreciates over time', weight: 1.0 },
      { tag: 'vehicle', category: TagCategory.ASSET_TYPE, description: 'Vehicle / auto asset', weight: 1.0 },
    ],
  },

  // ── Cash & Equivalents ──
  {
    assetClasses: ['cash'],
    symbolPatterns: [/^(SHV|BIL|SGOV|VMFXX|SPAXX|FDRXX)$/i],
    namePatterns: [/money\s*market/i, /cash/i, /savings/i, /\bt.bill/i],
    tags: [
      { tag: 'inflation_risk', category: TagCategory.RISK_TYPE, description: 'Purchasing power erosion over time', weight: 1.0 },
      { tag: 'cash', category: TagCategory.ASSET_TYPE, description: 'Cash or cash equivalent', weight: 1.0 },
    ],
  },

  // ── Collectibles / Alternative ──
  {
    assetClasses: ['collectible', 'alternative'],
    tags: [
      { tag: 'liquidity_risk', category: TagCategory.RISK_TYPE, description: 'Illiquid asset — hard to sell quickly', weight: 0.6 },
      { tag: 'other_risk', category: TagCategory.RISK_TYPE, description: 'Unique / hard-to-model risk', weight: 0.4 },
      { tag: 'alternative', category: TagCategory.ASSET_TYPE, description: 'Alternative / collectible asset', weight: 1.0 },
    ],
  },
];

// ── Fallback by AssetClass ──────────────────────────────────────────

const ASSET_CLASS_FALLBACKS: Record<string, TagRule[]> = {
  equity: [
    { tag: 'equity_risk', category: TagCategory.RISK_TYPE, description: 'Equity market risk', weight: 1.0 },
  ],
  fixed_income: [
    { tag: 'interest_rate_risk', category: TagCategory.RISK_TYPE, description: 'Sensitive to interest rate changes', weight: 0.5 },
    { tag: 'credit_risk', category: TagCategory.RISK_TYPE, description: 'Exposed to credit/default risk', weight: 0.5 },
    { tag: 'fixed_income', category: TagCategory.ASSET_TYPE, description: 'Fixed income exposure', weight: 1.0 },
  ],
  commodity: [
    { tag: 'commodity_risk', category: TagCategory.RISK_TYPE, description: 'Commodity price risk', weight: 1.0 },
  ],
  real_estate: [
    { tag: 'real_estate_risk', category: TagCategory.RISK_TYPE, description: 'Real estate market risk', weight: 1.0 },
  ],
  cash: [
    { tag: 'inflation_risk', category: TagCategory.RISK_TYPE, description: 'Purchasing power erosion', weight: 1.0 },
    { tag: 'cash', category: TagCategory.ASSET_TYPE, description: 'Cash or cash equivalent', weight: 1.0 },
  ],
  crypto: [
    { tag: 'crypto_risk', category: TagCategory.RISK_TYPE, description: 'Cryptocurrency volatility risk', weight: 1.0 },
  ],
  vehicle: [
    { tag: 'depreciation_risk', category: TagCategory.RISK_TYPE, description: 'Value depreciates over time', weight: 1.0 },
  ],
  collectible: [
    { tag: 'liquidity_risk', category: TagCategory.RISK_TYPE, description: 'Illiquid asset', weight: 1.0 },
  ],
  alternative: [
    { tag: 'other_risk', category: TagCategory.RISK_TYPE, description: 'Unique / hard-to-model risk', weight: 1.0 },
  ],
  other: [
    { tag: 'other_risk', category: TagCategory.RISK_TYPE, description: 'Unclassified risk', weight: 1.0 },
  ],
};

// ── Engine ───────────────────────────────────────────────────────────

export class TaggingEngine {
  private tagRepo: TagRepo;
  private assetTagRepo: AssetTagRepo;

  constructor(private db: Database) {
    this.tagRepo = new TagRepo(db);
    this.assetTagRepo = new AssetTagRepo(db);
  }

  /**
   * Classify an asset and apply auto-tags.
   * Existing manual tags are preserved. Previous auto-tags are replaced.
   */
  classify(asset: Asset): void {
    // Remove prior auto-tags so we can re-classify cleanly
    this.assetTagRepo.removeAutoTags(asset.id);

    const matchedTags = this.resolveRules(asset);

    // If no specific rule matched, fall back to asset-class defaults
    if (matchedTags.length === 0) {
      const fallbacks = ASSET_CLASS_FALLBACKS[asset.assetClass]
        ?? ASSET_CLASS_FALLBACKS['other']
        ?? [];
      matchedTags.push(...fallbacks);
    }

    for (const rule of matchedTags) {
      const tag = this.ensureTag(rule.tag, rule.category, rule.description);
      this.assetTagRepo.set({
        assetId: asset.id,
        tagId: tag.id,
        weight: rule.weight,
        source: 'auto',
      });
    }
  }

  /**
   * Classify all assets in the database.
   */
  classifyAll(assets: Asset[]): void {
    for (const asset of assets) {
      this.classify(asset);
    }
  }

  /**
   * Run rule matching against an asset and return the tag rules that apply.
   */
  private resolveRules(asset: Asset): TagRule[] {
    const results: TagRule[] = [];

    for (const rule of RULES) {
      if (this.ruleMatches(rule, asset)) {
        results.push(...rule.tags);
      }
    }

    // Deduplicate by tag name, keeping highest weight
    const deduped = new Map<string, TagRule>();
    for (const tr of results) {
      const existing = deduped.get(tr.tag);
      if (!existing || tr.weight > existing.weight) {
        deduped.set(tr.tag, tr);
      }
    }

    return Array.from(deduped.values());
  }

  private ruleMatches(rule: ClassificationRule, asset: Asset): boolean {
    // Check asset class match
    if (rule.assetClasses && rule.assetClasses.includes(asset.assetClass)) {
      return true;
    }

    // Check symbol patterns
    if (asset.symbol && rule.symbolPatterns) {
      for (const pat of rule.symbolPatterns) {
        if (pat.test(asset.symbol)) return true;
      }
    }

    // Check name patterns
    if (rule.namePatterns) {
      for (const pat of rule.namePatterns) {
        if (pat.test(asset.name)) return true;
      }
    }

    return false;
  }

  /**
   * Ensure a tag exists in the database; create if missing.
   */
  private ensureTag(name: string, category: TagCategory, description: string): { id: string } {
    const existing = this.tagRepo.getByName(name);
    if (existing) return existing;
    return this.tagRepo.create({ name, category, description });
  }
}
