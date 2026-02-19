import { createInMemoryDatabase } from '../db/schema';
import { PortfolioService } from './portfolio-service';
import { AssetClass, InstitutionType, Currency, TagCategory } from '../models/types';

async function createService() {
  const db = await createInMemoryDatabase();
  return new PortfolioService(db);
}

describe('PortfolioService', () => {
  describe('end-to-end portfolio workflow', () => {
    it('creates institutions, accounts, assets, holdings and produces summary', async () => {
      const svc = await createService();

      // Set up institutions
      const fidelity = svc.addInstitution({ name: 'Fidelity', type: InstitutionType.BROKERAGE });
      const physical = svc.addInstitution({ name: 'Physical Assets', type: InstitutionType.PHYSICAL });

      expect(svc.getInstitutions()).toHaveLength(2);

      // Set up accounts
      const brokerage = svc.addAccount({
        institutionId: fidelity.id, name: 'Taxable Brokerage', accountType: 'brokerage',
      });
      const ira = svc.addAccount({
        institutionId: fidelity.id, name: 'Roth IRA', accountType: 'ira',
      });
      const realEstateAcct = svc.addAccount({
        institutionId: physical.id, name: 'Real Estate', accountType: 'property',
      });

      expect(svc.getAccounts()).toHaveLength(3);
      expect(svc.getAccountsByInstitution(fidelity.id)).toHaveLength(2);

      // Create assets (tagging engine auto-classifies)
      const spy = svc.addAsset({
        symbol: 'SPY', name: 'SPDR S&P 500 ETF', assetClass: AssetClass.EQUITY, currentPrice: 500,
      });
      const hyg = svc.addAsset({
        symbol: 'HYG', name: 'iShares High Yield Bond ETF', assetClass: AssetClass.FIXED_INCOME, currentPrice: 80,
      });
      const gld = svc.addAsset({
        symbol: 'GLD', name: 'SPDR Gold Shares', assetClass: AssetClass.COMMODITY, currentPrice: 190,
      });
      const house = svc.addAsset({
        name: 'Primary Residence', assetClass: AssetClass.REAL_ESTATE,
        metadata: { address: '123 Main St, Austin TX' },
      });

      // Verify auto-tags
      const spyTags = svc.getTagsForAsset(spy.id);
      expect(spyTags.map(t => t.tag.name)).toContain('equity_risk');

      const hygTags = svc.getTagsForAsset(hyg.id);
      expect(hygTags.map(t => t.tag.name)).toContain('credit_risk');
      expect(hygTags.map(t => t.tag.name)).not.toContain('equity_risk');

      const gldTags = svc.getTagsForAsset(gld.id);
      expect(gldTags.map(t => t.tag.name)).toContain('gold');
      expect(gldTags.map(t => t.tag.name)).toContain('commodity_risk');

      const houseTags = svc.getTagsForAsset(house.id);
      expect(houseTags.map(t => t.tag.name)).toContain('real_estate_risk');

      // Add holdings
      svc.addHolding({
        accountId: brokerage.id, assetId: spy.id, quantity: 100,
        costBasis: 45000, currentValue: 50000,
      });
      svc.addHolding({
        accountId: brokerage.id, assetId: hyg.id, quantity: 200,
        costBasis: 15000, currentValue: 16000,
      });
      svc.addHolding({
        accountId: ira.id, assetId: gld.id, quantity: 50,
        costBasis: 8000, currentValue: 9500,
      });
      svc.addHolding({
        accountId: realEstateAcct.id, assetId: house.id, quantity: 1,
        costBasis: 350000, currentValue: 450000,
      });

      // Portfolio summary
      const summary = svc.getSummary();
      expect(summary.totalValue).toBe(525500);
      expect(summary.totalCostBasis).toBe(418000);
      expect(summary.totalGainLoss).toBe(107500);
      expect(summary.byInstitution).toHaveLength(2);

      // Risk report
      const risk = svc.getRiskReport();
      expect(risk.totalPortfolioValue).toBe(525500);
      expect(risk.exposures.length).toBeGreaterThan(0);

      // House should dominate → real_estate_risk should be largest
      const reRisk = risk.exposures.find(e => e.category === 'real_estate_risk');
      expect(reRisk).toBeDefined();
      expect(reRisk!.pctOfPortfolio).toBeGreaterThan(0.5);
    });
  });

  describe('manual tagging', () => {
    it('adds manual tags and preserves them on reclassification', async () => {
      const svc = await createService();

      const spy = svc.addAsset({
        symbol: 'SPY', name: 'SPDR S&P 500 ETF', assetClass: AssetClass.EQUITY,
      });

      // Add a custom manual tag
      svc.addManualTag(spy.id, 'core_holding', TagCategory.CUSTOM, 1.0, 'Core portfolio position');

      const tags = svc.getTagsForAsset(spy.id);
      expect(tags.map(t => t.tag.name)).toContain('core_holding');
      expect(tags.map(t => t.tag.name)).toContain('equity_risk');

      // Reclassify all — manual should survive
      svc.reclassifyAllAssets();
      const tagsAfter = svc.getTagsForAsset(spy.id);
      expect(tagsAfter.map(t => t.tag.name)).toContain('core_holding');
      expect(tagsAfter.map(t => t.tag.name)).toContain('equity_risk');
    });
  });

  describe('CRUD operations', () => {
    it('updates and deletes institutions', async () => {
      const svc = await createService();
      const inst = svc.addInstitution({ name: 'Test', type: InstitutionType.BANK });

      const updated = svc.updateInstitution(inst.id, { name: 'Updated' });
      expect(updated?.name).toBe('Updated');

      expect(svc.deleteInstitution(inst.id)).toBe(true);
      expect(svc.getInstitution(inst.id)).toBeUndefined();
    });

    it('updates and deletes holdings', async () => {
      const svc = await createService();
      const inst = svc.addInstitution({ name: 'Fidelity', type: InstitutionType.BROKERAGE });
      const acct = svc.addAccount({ institutionId: inst.id, name: 'Brokerage', accountType: 'brokerage' });
      const asset = svc.addAsset({ symbol: 'VTI', name: 'Vanguard Total Stock Market', assetClass: AssetClass.EQUITY });

      const holding = svc.addHolding({
        accountId: acct.id, assetId: asset.id, quantity: 10,
        costBasis: 2000, currentValue: 2500,
      });

      const updated = svc.updateHolding(holding.id, { currentValue: 2700 });
      expect(updated?.currentValue).toBe(2700);

      expect(svc.deleteHolding(holding.id)).toBe(true);
      expect(svc.getHolding(holding.id)).toBeUndefined();
    });
  });

  describe('asset lookup by symbol', () => {
    it('finds assets by ticker symbol', async () => {
      const svc = await createService();
      svc.addAsset({ symbol: 'AAPL', name: 'Apple Inc', assetClass: AssetClass.EQUITY });

      const found = svc.getAssetBySymbol('AAPL');
      expect(found).toBeDefined();
      expect(found?.name).toBe('Apple Inc');

      expect(svc.getAssetBySymbol('MSFT')).toBeUndefined();
    });
  });
});
