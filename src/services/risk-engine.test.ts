import { createInMemoryDatabase } from '../db/schema';
import { InstitutionRepo, AccountRepo, AssetRepo, HoldingRepo } from '../db/repositories';
import { TaggingEngine } from './tagging-engine';
import { RiskEngine } from './risk-engine';
import { AssetClass, InstitutionType, Currency } from '../models/types';

async function setupPortfolio() {
  const db = await createInMemoryDatabase();
  const instRepo = new InstitutionRepo(db);
  const acctRepo = new AccountRepo(db);
  const assetRepo = new AssetRepo(db);
  const holdingRepo = new HoldingRepo(db);
  const engine = new TaggingEngine(db);
  const riskEngine = new RiskEngine(db, {
    singleAsset: 0.20,
    singleInstitution: 0.40,
    riskCategory: 0.50,
    singleSector: 0.35,
    singleGeography: 0.60,
  });

  // Set up institution + account
  const fidelity = instRepo.create({ name: 'Fidelity', type: InstitutionType.BROKERAGE });
  const brokerage = acctRepo.create({
    institutionId: fidelity.id, name: 'Taxable Brokerage', accountType: 'brokerage',
  });

  return { db, instRepo, acctRepo, assetRepo, holdingRepo, engine, riskEngine, fidelity, brokerage };
}

describe('RiskEngine', () => {
  it('returns empty report for empty portfolio', async () => {
    const { riskEngine } = await setupPortfolio();
    const report = riskEngine.generateReport();

    expect(report.totalPortfolioValue).toBe(0);
    expect(report.exposures).toHaveLength(0);
  });

  it('correctly attributes HYG holding to credit risk', async () => {
    const { assetRepo, holdingRepo, engine, riskEngine, brokerage } = await setupPortfolio();

    const hyg = assetRepo.create({
      symbol: 'HYG', name: 'iShares High Yield Bond ETF', assetClass: AssetClass.FIXED_INCOME,
    });
    engine.classify(hyg);
    holdingRepo.create({
      accountId: brokerage.id, assetId: hyg.id, quantity: 100,
      costBasis: 7500, currentValue: 8000,
    });

    const report = riskEngine.generateReport();

    expect(report.totalPortfolioValue).toBe(8000);
    const creditExposure = report.exposures.find(e => e.category === 'credit_risk');
    expect(creditExposure).toBeDefined();
    expect(creditExposure!.value).toBe(8000); // 100% weight on credit risk
    expect(creditExposure!.pctOfPortfolio).toBe(1.0);

    // Should NOT have equity risk
    const equityExposure = report.exposures.find(e => e.category === 'equity_risk');
    expect(equityExposure).toBeUndefined();
  });

  it('splits risk across mixed portfolio', async () => {
    const { assetRepo, holdingRepo, engine, riskEngine, brokerage } = await setupPortfolio();

    // SPY → equity risk
    const spy = assetRepo.create({
      symbol: 'SPY', name: 'SPDR S&P 500 ETF', assetClass: AssetClass.EQUITY,
    });
    engine.classify(spy);
    holdingRepo.create({
      accountId: brokerage.id, assetId: spy.id, quantity: 50,
      costBasis: 20000, currentValue: 25000,
    });

    // GLD → commodity risk
    const gld = assetRepo.create({
      symbol: 'GLD', name: 'SPDR Gold Shares', assetClass: AssetClass.COMMODITY,
    });
    engine.classify(gld);
    holdingRepo.create({
      accountId: brokerage.id, assetId: gld.id, quantity: 100,
      costBasis: 15000, currentValue: 15000,
    });

    // HYG → credit risk
    const hyg = assetRepo.create({
      symbol: 'HYG', name: 'iShares High Yield Bond ETF', assetClass: AssetClass.FIXED_INCOME,
    });
    engine.classify(hyg);
    holdingRepo.create({
      accountId: brokerage.id, assetId: hyg.id, quantity: 100,
      costBasis: 10000, currentValue: 10000,
    });

    const report = riskEngine.generateReport();

    expect(report.totalPortfolioValue).toBe(50000);

    const equity = report.exposures.find(e => e.category === 'equity_risk');
    const commodity = report.exposures.find(e => e.category === 'commodity_risk');
    const credit = report.exposures.find(e => e.category === 'credit_risk');

    expect(equity).toBeDefined();
    expect(equity!.value).toBe(25000);
    expect(equity!.pctOfPortfolio).toBeCloseTo(0.5, 2);

    expect(commodity).toBeDefined();
    expect(commodity!.value).toBe(15000);
    expect(commodity!.pctOfPortfolio).toBeCloseTo(0.3, 2);

    expect(credit).toBeDefined();
    expect(credit!.value).toBe(10000);
    expect(credit!.pctOfPortfolio).toBeCloseTo(0.2, 2);
  });

  it('generates concentration warning for large single-asset position', async () => {
    const { assetRepo, holdingRepo, engine, riskEngine, brokerage } = await setupPortfolio();

    const spy = assetRepo.create({
      symbol: 'SPY', name: 'SPDR S&P 500 ETF', assetClass: AssetClass.EQUITY,
    });
    engine.classify(spy);

    // SPY is 80% of portfolio
    holdingRepo.create({
      accountId: brokerage.id, assetId: spy.id, quantity: 100,
      costBasis: 40000, currentValue: 40000,
    });

    const gld = assetRepo.create({
      symbol: 'GLD', name: 'SPDR Gold Shares', assetClass: AssetClass.COMMODITY,
    });
    engine.classify(gld);
    holdingRepo.create({
      accountId: brokerage.id, assetId: gld.id, quantity: 50,
      costBasis: 10000, currentValue: 10000,
    });

    const report = riskEngine.generateReport();

    expect(report.concentrationWarnings.length).toBeGreaterThan(0);
    const spyWarning = report.concentrationWarnings.find(w => w.label === 'SPDR S&P 500 ETF');
    expect(spyWarning).toBeDefined();
    expect(spyWarning!.type).toBe('single_asset');
    expect(spyWarning!.pctOfPortfolio).toBeCloseTo(0.8, 2);
  });

  it('generates institution concentration warning', async () => {
    const { instRepo, acctRepo, assetRepo, holdingRepo, engine, riskEngine, fidelity, brokerage } = await setupPortfolio();

    // Schwab has just 10%
    const schwab = instRepo.create({ name: 'Schwab', type: InstitutionType.BROKERAGE });
    const schwabAcct = acctRepo.create({
      institutionId: schwab.id, name: 'Schwab Brokerage', accountType: 'brokerage',
    });

    const spy = assetRepo.create({
      symbol: 'SPY', name: 'SPDR S&P 500 ETF', assetClass: AssetClass.EQUITY,
    });
    engine.classify(spy);

    // $90k at Fidelity
    holdingRepo.create({
      accountId: brokerage.id, assetId: spy.id, quantity: 200,
      costBasis: 90000, currentValue: 90000,
    });

    const gld = assetRepo.create({
      symbol: 'GLD', name: 'SPDR Gold Shares', assetClass: AssetClass.COMMODITY,
    });
    engine.classify(gld);

    // $10k at Schwab
    holdingRepo.create({
      accountId: schwabAcct.id, assetId: gld.id, quantity: 50,
      costBasis: 10000, currentValue: 10000,
    });

    const report = riskEngine.generateReport();

    const instWarning = report.concentrationWarnings.find(w => w.type === 'single_institution');
    expect(instWarning).toBeDefined();
    expect(instWarning!.label).toBe('Fidelity');
    expect(instWarning!.pctOfPortfolio).toBeCloseTo(0.9, 2);
  });
});
