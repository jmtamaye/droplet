import { createInMemoryDatabase } from '../db/schema';
import { AssetRepo, AssetTagRepo, TagRepo } from '../db/repositories';
import { TaggingEngine } from './tagging-engine';
import { AssetClass, Currency } from '../models/types';

function setup() {
  const db = createInMemoryDatabase();
  const assetRepo = new AssetRepo(db);
  const assetTagRepo = new AssetTagRepo(db);
  const tagRepo = new TagRepo(db);
  const engine = new TaggingEngine(db);
  return { db, assetRepo, assetTagRepo, tagRepo, engine };
}

function getTagNames(assetId: string, assetTagRepo: AssetTagRepo, tagRepo: TagRepo): string[] {
  return assetTagRepo.getByAsset(assetId)
    .map(at => tagRepo.getById(at.tagId)?.name)
    .filter(Boolean) as string[];
}

describe('TaggingEngine', () => {
  describe('US High Yield ETF → credit risk, not equity risk', () => {
    it('classifies HYG as credit risk', () => {
      const { assetRepo, assetTagRepo, tagRepo, engine } = setup();
      const hyg = assetRepo.create({
        symbol: 'HYG',
        name: 'iShares iBoxx $ High Yield Corporate Bond ETF',
        assetClass: AssetClass.FIXED_INCOME,
      });

      engine.classify(hyg);
      const tags = getTagNames(hyg.id, assetTagRepo, tagRepo);

      expect(tags).toContain('credit_risk');
      expect(tags).toContain('high_yield');
      expect(tags).toContain('fixed_income');
      expect(tags).not.toContain('equity_risk');
    });

    it('classifies JNK as credit risk', () => {
      const { assetRepo, assetTagRepo, tagRepo, engine } = setup();
      const jnk = assetRepo.create({
        symbol: 'JNK',
        name: 'SPDR Bloomberg High Yield Bond ETF',
        assetClass: AssetClass.FIXED_INCOME,
      });

      engine.classify(jnk);
      const tags = getTagNames(jnk.id, assetTagRepo, tagRepo);

      expect(tags).toContain('credit_risk');
      expect(tags).not.toContain('equity_risk');
    });

    it('classifies by name pattern "high yield" even without known symbol', () => {
      const { assetRepo, assetTagRepo, tagRepo, engine } = setup();
      const custom = assetRepo.create({
        symbol: 'XHYLD',
        name: 'Custom High Yield Bond Fund',
        assetClass: AssetClass.FIXED_INCOME,
      });

      engine.classify(custom);
      const tags = getTagNames(custom.id, assetTagRepo, tagRepo);

      expect(tags).toContain('credit_risk');
      expect(tags).toContain('high_yield');
    });
  });

  describe('Gold ETF → commodity/gold, not equity risk', () => {
    it('classifies GLD as gold / commodity risk', () => {
      const { assetRepo, assetTagRepo, tagRepo, engine } = setup();
      const gld = assetRepo.create({
        symbol: 'GLD',
        name: 'SPDR Gold Shares',
        assetClass: AssetClass.COMMODITY,
      });

      engine.classify(gld);
      const tags = getTagNames(gld.id, assetTagRepo, tagRepo);

      expect(tags).toContain('commodity_risk');
      expect(tags).toContain('gold');
      expect(tags).not.toContain('equity_risk');
    });

    it('classifies IAU as gold', () => {
      const { assetRepo, assetTagRepo, tagRepo, engine } = setup();
      const iau = assetRepo.create({
        symbol: 'IAU',
        name: 'iShares Gold Trust',
        assetClass: AssetClass.COMMODITY,
      });

      engine.classify(iau);
      const tags = getTagNames(iau.id, assetTagRepo, tagRepo);

      expect(tags).toContain('gold');
      expect(tags).toContain('commodity_risk');
    });
  });

  describe('US Large Cap Equity', () => {
    it('classifies SPY as equity risk', () => {
      const { assetRepo, assetTagRepo, tagRepo, engine } = setup();
      const spy = assetRepo.create({
        symbol: 'SPY',
        name: 'SPDR S&P 500 ETF Trust',
        assetClass: AssetClass.EQUITY,
      });

      engine.classify(spy);
      const tags = getTagNames(spy.id, assetTagRepo, tagRepo);

      expect(tags).toContain('equity_risk');
      expect(tags).toContain('us');
      expect(tags).toContain('large_cap');
      expect(tags).not.toContain('credit_risk');
    });
  });

  describe('REITs', () => {
    it('classifies VNQ as real estate risk', () => {
      const { assetRepo, assetTagRepo, tagRepo, engine } = setup();
      const vnq = assetRepo.create({
        symbol: 'VNQ',
        name: 'Vanguard Real Estate ETF',
        assetClass: AssetClass.EQUITY,
      });

      engine.classify(vnq);
      const tags = getTagNames(vnq.id, assetTagRepo, tagRepo);

      expect(tags).toContain('real_estate_risk');
      expect(tags).toContain('real_estate');
    });
  });

  describe('Treasury Bonds', () => {
    it('classifies TLT as interest rate risk', () => {
      const { assetRepo, assetTagRepo, tagRepo, engine } = setup();
      const tlt = assetRepo.create({
        symbol: 'TLT',
        name: 'iShares 20+ Year Treasury Bond ETF',
        assetClass: AssetClass.FIXED_INCOME,
      });

      engine.classify(tlt);
      const tags = getTagNames(tlt.id, assetTagRepo, tagRepo);

      expect(tags).toContain('interest_rate_risk');
      expect(tags).toContain('fixed_income');
      expect(tags).not.toContain('equity_risk');
    });
  });

  describe('Crypto', () => {
    it('classifies BTC as crypto risk', () => {
      const { assetRepo, assetTagRepo, tagRepo, engine } = setup();
      const btc = assetRepo.create({
        symbol: 'BTC',
        name: 'Bitcoin',
        assetClass: AssetClass.CRYPTO,
      });

      engine.classify(btc);
      const tags = getTagNames(btc.id, assetTagRepo, tagRepo);

      expect(tags).toContain('crypto_risk');
      expect(tags).toContain('crypto');
      expect(tags).not.toContain('equity_risk');
    });
  });

  describe('Physical assets', () => {
    it('classifies real estate as real_estate_risk + liquidity_risk', () => {
      const { assetRepo, assetTagRepo, tagRepo, engine } = setup();
      const house = assetRepo.create({
        name: 'Primary Residence',
        assetClass: AssetClass.REAL_ESTATE,
        metadata: { address: '123 Main St' },
      });

      engine.classify(house);
      const tags = getTagNames(house.id, assetTagRepo, tagRepo);

      expect(tags).toContain('real_estate_risk');
      expect(tags).toContain('liquidity_risk');
    });

    it('classifies vehicle as depreciation risk', () => {
      const { assetRepo, assetTagRepo, tagRepo, engine } = setup();
      const car = assetRepo.create({
        name: '2023 Tesla Model 3',
        assetClass: AssetClass.VEHICLE,
        metadata: { vin: '5YJ3E1EA1PF000001' },
      });

      engine.classify(car);
      const tags = getTagNames(car.id, assetTagRepo, tagRepo);

      expect(tags).toContain('depreciation_risk');
      expect(tags).toContain('vehicle');
    });
  });

  describe('Emerging Markets', () => {
    it('classifies EEM with equity + currency risk', () => {
      const { assetRepo, assetTagRepo, tagRepo, engine } = setup();
      const eem = assetRepo.create({
        symbol: 'EEM',
        name: 'iShares MSCI Emerging Markets ETF',
        assetClass: AssetClass.EQUITY,
      });

      engine.classify(eem);
      const tags = getTagNames(eem.id, assetTagRepo, tagRepo);

      expect(tags).toContain('equity_risk');
      expect(tags).toContain('currency_risk');
      expect(tags).toContain('emerging_markets');
    });
  });

  describe('Fallback classification', () => {
    it('falls back to asset class default when no rule matches', () => {
      const { assetRepo, assetTagRepo, tagRepo, engine } = setup();
      const unknown = assetRepo.create({
        symbol: 'XYZABC',
        name: 'Some Obscure Fund',
        assetClass: AssetClass.EQUITY,
      });

      engine.classify(unknown);
      const tags = getTagNames(unknown.id, assetTagRepo, tagRepo);

      expect(tags).toContain('equity_risk');
    });
  });

  describe('Re-classification preserves manual tags', () => {
    it('keeps manual tags when re-classifying', () => {
      const { db, assetRepo, assetTagRepo, tagRepo, engine } = setup();
      const spy = assetRepo.create({
        symbol: 'SPY',
        name: 'SPDR S&P 500 ETF Trust',
        assetClass: AssetClass.EQUITY,
      });

      engine.classify(spy);

      // Add a manual tag
      const manualTag = tagRepo.create({ name: 'core_holding', category: 'custom' as any });
      assetTagRepo.set({ assetId: spy.id, tagId: manualTag.id, weight: 1.0, source: 'manual' });

      // Re-classify
      engine.classify(spy);
      const allTags = assetTagRepo.getByAsset(spy.id);
      const manualTags = allTags.filter(at => at.source === 'manual');
      const autoTags = allTags.filter(at => at.source === 'auto');

      expect(manualTags).toHaveLength(1);
      expect(manualTags[0].tagId).toBe(manualTag.id);
      expect(autoTags.length).toBeGreaterThan(0);
    });
  });
});
