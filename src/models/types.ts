/**
 * Core domain types for the portfolio management system.
 */

// ── Asset Classification ────────────────────────────────────────────

export enum AssetClass {
  EQUITY = 'equity',
  FIXED_INCOME = 'fixed_income',
  COMMODITY = 'commodity',
  REAL_ESTATE = 'real_estate',
  CASH = 'cash',
  CRYPTO = 'crypto',
  VEHICLE = 'vehicle',
  COLLECTIBLE = 'collectible',
  ALTERNATIVE = 'alternative',
  OTHER = 'other',
}

export enum RiskCategory {
  EQUITY_RISK = 'equity_risk',
  CREDIT_RISK = 'credit_risk',
  INTEREST_RATE_RISK = 'interest_rate_risk',
  COMMODITY_RISK = 'commodity_risk',
  CURRENCY_RISK = 'currency_risk',
  REAL_ESTATE_RISK = 'real_estate_risk',
  INFLATION_RISK = 'inflation_risk',
  LIQUIDITY_RISK = 'liquidity_risk',
  CRYPTO_RISK = 'crypto_risk',
  CONCENTRATION_RISK = 'concentration_risk',
  DEPRECIATION_RISK = 'depreciation_risk',
  OTHER_RISK = 'other_risk',
}

export enum InstitutionType {
  BROKERAGE = 'brokerage',
  BANK = 'bank',
  RETIREMENT = 'retirement',
  CRYPTO_EXCHANGE = 'crypto_exchange',
  INSURANCE = 'insurance',
  PHYSICAL = 'physical',       // for real estate, vehicles, etc.
  OTHER = 'other',
}

export enum Currency {
  USD = 'USD',
  EUR = 'EUR',
  GBP = 'GBP',
  JPY = 'JPY',
  CHF = 'CHF',
  CAD = 'CAD',
  AUD = 'AUD',
  OTHER = 'OTHER',
}

// ── Tags ────────────────────────────────────────────────────────────

export interface Tag {
  id: string;
  name: string;
  category: TagCategory;
  description?: string;
}

export enum TagCategory {
  RISK_TYPE = 'risk_type',
  GEOGRAPHY = 'geography',
  SECTOR = 'sector',
  STRATEGY = 'strategy',
  ASSET_TYPE = 'asset_type',
  CUSTOM = 'custom',
}

// ── Institution & Account ───────────────────────────────────────────

export interface Institution {
  id: string;
  name: string;
  type: InstitutionType;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Account {
  id: string;
  institutionId: string;
  name: string;
  accountType: string;          // e.g. "brokerage", "401k", "IRA", "checking", "property"
  currency: Currency;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Holdings / Positions ────────────────────────────────────────────

export interface Holding {
  id: string;
  accountId: string;
  assetId: string;
  quantity: number;
  costBasis: number;            // total cost basis in account currency
  currentValue: number;         // current market value in account currency
  asOfDate: string;             // ISO date of the valuation
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Assets ──────────────────────────────────────────────────────────

export interface Asset {
  id: string;
  symbol?: string;              // ticker symbol if applicable (e.g. "SPY", "GLD")
  name: string;                 // human-readable name
  assetClass: string;           // free-form label (e.g. "equity", "fixed_income", or any custom value)
  currency: Currency;
  currentPrice?: number;        // latest known price per unit
  priceAsOf?: string;           // when the price was last updated
  metadata?: Record<string, string>; // flexible extra data (address, VIN, etc.)
  createdAt: string;
  updatedAt: string;
}

// ── Asset Tags (many-to-many) ───────────────────────────────────────

export interface AssetTag {
  assetId: string;
  tagId: string;
  weight: number;               // 0.0–1.0, how much of this asset maps to this tag
  source: 'auto' | 'manual';   // was this tag applied by the engine or the user?
}

// ── Portfolio Views ─────────────────────────────────────────────────

export interface PortfolioSummary {
  totalValue: number;
  totalCostBasis: number;
  totalGainLoss: number;
  totalGainLossPct: number;
  currency: Currency;
  asOfDate: string;
  byInstitution: InstitutionBreakdown[];
  byAssetClass: AllocationSlice[];
  byRiskCategory: AllocationSlice[];
  byGeography: AllocationSlice[];
  bySector: AllocationSlice[];
  byTag: AllocationSlice[];
}

export interface InstitutionBreakdown {
  institution: Institution;
  accounts: AccountBreakdown[];
  totalValue: number;
  totalCostBasis: number;
  totalGainLoss: number;
  pctOfPortfolio: number;
}

export interface AccountBreakdown {
  account: Account;
  holdings: HoldingView[];
  totalValue: number;
  totalCostBasis: number;
  totalGainLoss: number;
  pctOfPortfolio: number;
}

export interface HoldingView {
  holding: Holding;
  asset: Asset;
  tags: AssetTag[];
  gainLoss: number;
  gainLossPct: number;
  pctOfPortfolio: number;
}

export interface AllocationSliceAsset {
  assetName: string;
  symbol?: string;
  value: number;
  pctOfTotal: number;
}

export interface AllocationSlice {
  label: string;
  value: number;
  pctOfTotal: number;
  assets?: AllocationSliceAsset[];
}

// ── Risk Aggregation ────────────────────────────────────────────────

export interface RiskExposure {
  category: RiskCategory;
  label: string;
  value: number;
  pctOfPortfolio: number;
  contributors: RiskContributor[];
}

export interface RiskContributor {
  asset: Asset;
  holdingValue: number;
  weight: number;               // tag weight contributing to this risk
  effectiveExposure: number;    // holdingValue * weight
}

export interface RiskReport {
  totalPortfolioValue: number;
  asOfDate: string;
  exposures: RiskExposure[];
  concentrationWarnings: ConcentrationWarning[];
}

export interface ConcentrationWarning {
  type: 'single_asset' | 'single_institution' | 'risk_category' | 'sector' | 'geography';
  label: string;
  pctOfPortfolio: number;
  threshold: number;
  message: string;
}
