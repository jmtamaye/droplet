/**
 * Express REST API routes for the portfolio management system.
 */

import express, { Router, Request, Response } from 'express';
import { PortfolioService } from '../services/portfolio-service';
import { InstitutionType, AssetClass, Currency, TagCategory } from '../models/types';

/** Parse a single CSV line, respecting quoted fields. */
function parseCsvLine(line: string): string[] {
  const cols: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { cur += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { cols.push(cur); cur = ''; }
      else { cur += ch; }
    }
  }
  cols.push(cur);
  return cols;
}

export function createRouter(svc: PortfolioService): Router {
  const router = Router();

  // ── Institutions ────────────────────────────────────────────────

  router.get('/institutions', (_req: Request, res: Response) => {
    res.json(svc.getInstitutions());
  });

  router.get('/institutions/:id', (req: Request, res: Response) => {
    const inst = svc.getInstitution(req.params.id);
    if (!inst) return res.status(404).json({ error: 'Institution not found' });
    res.json(inst);
  });

  router.post('/institutions', (req: Request, res: Response) => {
    const { name, type, notes } = req.body;
    if (!name || !type) return res.status(400).json({ error: 'name and type are required' });
    const inst = svc.addInstitution({ name, type: type as InstitutionType, notes });
    res.status(201).json(inst);
  });

  router.put('/institutions/:id', (req: Request, res: Response) => {
    const updated = svc.updateInstitution(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Institution not found' });
    res.json(updated);
  });

  router.delete('/institutions/:id', (req: Request, res: Response) => {
    const deleted = svc.deleteInstitution(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Institution not found' });
    res.status(204).send();
  });

  // ── Accounts ────────────────────────────────────────────────────

  router.get('/accounts', (_req: Request, res: Response) => {
    res.json(svc.getAccounts());
  });

  router.get('/accounts/:id', (req: Request, res: Response) => {
    const acct = svc.getAccount(req.params.id);
    if (!acct) return res.status(404).json({ error: 'Account not found' });
    res.json(acct);
  });

  router.get('/institutions/:id/accounts', (req: Request, res: Response) => {
    res.json(svc.getAccountsByInstitution(req.params.id));
  });

  router.post('/accounts', (req: Request, res: Response) => {
    const { institutionId, name, accountType, currency, notes } = req.body;
    if (!institutionId || !name || !accountType) {
      return res.status(400).json({ error: 'institutionId, name, and accountType are required' });
    }
    const acct = svc.addAccount({
      institutionId, name, accountType,
      currency: currency as Currency | undefined, notes,
    });
    res.status(201).json(acct);
  });

  router.put('/accounts/:id', (req: Request, res: Response) => {
    const updated = svc.updateAccount(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Account not found' });
    res.json(updated);
  });

  router.delete('/accounts/:id', (req: Request, res: Response) => {
    const deleted = svc.deleteAccount(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Account not found' });
    res.status(204).send();
  });

  // ── Assets ──────────────────────────────────────────────────────

  router.get('/assets', (_req: Request, res: Response) => {
    res.json(svc.getAssets());
  });

  router.get('/assets/:id', (req: Request, res: Response) => {
    const asset = svc.getAsset(req.params.id);
    if (!asset) return res.status(404).json({ error: 'Asset not found' });
    res.json(asset);
  });

  router.get('/assets/symbol/:symbol', (req: Request, res: Response) => {
    const asset = svc.getAssetBySymbol(req.params.symbol);
    if (!asset) return res.status(404).json({ error: 'Asset not found' });
    res.json(asset);
  });

  router.post('/assets', (req: Request, res: Response) => {
    const { symbol, name, assetClass, currency, currentPrice, metadata } = req.body;
    if (!name || !assetClass) return res.status(400).json({ error: 'name and assetClass are required' });
    const asset = svc.addAsset({
      symbol, name, assetClass: assetClass as AssetClass,
      currency: currency as Currency | undefined, currentPrice, metadata,
    });
    res.status(201).json(asset);
  });

  router.put('/assets/:id', (req: Request, res: Response) => {
    const updated = svc.updateAsset(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Asset not found' });
    res.json(updated);
  });

  router.delete('/assets/:id', (req: Request, res: Response) => {
    const deleted = svc.deleteAsset(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Asset not found' });
    res.status(204).send();
  });

  router.post('/assets/reclassify', (_req: Request, res: Response) => {
    svc.reclassifyAllAssets();
    res.json({ message: 'All assets reclassified' });
  });

  // ── CSV Import ──────────────────────────────────────────────────

  router.post('/assets/import-csv', express.text({ type: '*/*', limit: '2mb' }), (req: Request, res: Response) => {
    const csv = typeof req.body === 'string' ? req.body : '';
    if (!csv.trim()) return res.status(400).json({ error: 'Empty CSV body' });

    const lines = csv.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return res.status(400).json({ error: 'CSV must have a header row and at least one data row' });

    // Parse header
    const header = lines[0].split(',').map(h => h.trim().toLowerCase());
    const nameIdx = header.indexOf('name');
    const symbolIdx = header.indexOf('symbol');
    const classIdx = header.findIndex(h => h === 'assetclass' || h === 'asset_class' || h === 'class');
    const currencyIdx = header.indexOf('currency');
    const priceIdx = header.findIndex(h => h === 'currentprice' || h === 'current_price' || h === 'price');
    const qtyIdx = header.indexOf('quantity');
    const valueIdx = header.findIndex(h => h === 'marketvalue' || h === 'market_value' || h === 'currentvalue' || h === 'current_value' || h === 'value');
    const accountIdx = header.indexOf('account');

    if (nameIdx === -1) return res.status(400).json({ error: 'CSV must have a "name" column' });
    if (classIdx === -1) return res.status(400).json({ error: 'CSV must have an "assetClass" (or "asset_class" or "class") column' });

    const hasHoldingCols = qtyIdx >= 0;
    if (hasHoldingCols && accountIdx === -1) {
      return res.status(400).json({ error: 'CSV has a "quantity" column but no "account" column. Add an "account" column to specify which account each holding belongs to.' });
    }

    // Build account name → id lookup (case-insensitive)
    const accountsByName = new Map<string, string>();
    if (hasHoldingCols) {
      for (const acct of svc.getAccounts()) {
        accountsByName.set(acct.name.toLowerCase(), acct.id);
      }
    }

    const validClasses = new Set([
      'equity', 'fixed_income', 'commodity', 'real_estate', 'cash',
      'crypto', 'vehicle', 'collectible', 'alternative', 'other',
    ]);

    const created: any[] = [];
    const holdingsCreated: any[] = [];
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      const name = cols[nameIdx]?.trim();
      const assetClassRaw = cols[classIdx]?.trim().toLowerCase();

      if (!name) { errors.push(`Row ${i + 1}: missing name`); continue; }
      if (!assetClassRaw || !validClasses.has(assetClassRaw)) {
        errors.push(`Row ${i + 1}: invalid assetClass "${assetClassRaw}"`);
        continue;
      }

      const symbol = symbolIdx >= 0 ? cols[symbolIdx]?.trim() || undefined : undefined;
      const currency = currencyIdx >= 0 ? cols[currencyIdx]?.trim() as Currency || undefined : undefined;
      const priceStr = priceIdx >= 0 ? cols[priceIdx]?.trim() : undefined;
      const currentPrice = priceStr ? parseFloat(priceStr) : undefined;

      // Resolve account name for holdings
      let resolvedAccountId: string | undefined;
      if (hasHoldingCols && accountIdx >= 0) {
        const accountName = cols[accountIdx]?.trim();
        if (accountName) {
          resolvedAccountId = accountsByName.get(accountName.toLowerCase());
          if (!resolvedAccountId) {
            errors.push(`Row ${i + 1}: account "${accountName}" not found`);
            continue;
          }
        }
      }

      try {
        const asset = svc.addAsset({
          symbol,
          name,
          assetClass: assetClassRaw as AssetClass,
          currency,
          currentPrice: currentPrice != null && !isNaN(currentPrice) ? currentPrice : undefined,
        });
        created.push(asset);

        // Create holding if quantity column exists and account resolved
        if (hasHoldingCols && resolvedAccountId) {
          const qtyStr = cols[qtyIdx]?.trim();
          const quantity = qtyStr ? parseFloat(qtyStr) : undefined;
          const valStr = valueIdx >= 0 ? cols[valueIdx]?.trim() : undefined;
          const marketValue = valStr ? parseFloat(valStr) : undefined;

          if (quantity != null && !isNaN(quantity) && quantity > 0) {
            const holding = svc.addHolding({
              accountId: resolvedAccountId,
              assetId: asset.id,
              quantity,
              currentValue: marketValue != null && !isNaN(marketValue) ? marketValue : 0,
              costBasis: marketValue != null && !isNaN(marketValue) ? marketValue : 0,
            });
            holdingsCreated.push(holding);
          }
        }
      } catch (err: any) {
        errors.push(`Row ${i + 1}: ${err.message}`);
      }
    }

    res.status(201).json({ imported: created.length, holdings: holdingsCreated.length, errors });
  });

  // ── Asset Tags ──────────────────────────────────────────────────

  router.get('/assets/:id/tags', (req: Request, res: Response) => {
    const tags = svc.getTagsForAsset(req.params.id);
    res.json(tags);
  });

  router.post('/assets/:id/tags', (req: Request, res: Response) => {
    const { tagName, category, weight, description } = req.body;
    if (!tagName || !category) return res.status(400).json({ error: 'tagName and category are required' });
    const tag = svc.addManualTag(req.params.id, tagName, category as TagCategory, weight, description);
    res.status(201).json(tag);
  });

  router.delete('/assets/:assetId/tags/:tagId', (req: Request, res: Response) => {
    const removed = svc.removeTag(req.params.assetId, req.params.tagId);
    if (!removed) return res.status(404).json({ error: 'Tag association not found' });
    res.status(204).send();
  });

  // ── Holdings ────────────────────────────────────────────────────

  router.get('/holdings', (_req: Request, res: Response) => {
    res.json(svc.getHoldings());
  });

  router.get('/holdings/:id', (req: Request, res: Response) => {
    const holding = svc.getHolding(req.params.id);
    if (!holding) return res.status(404).json({ error: 'Holding not found' });
    res.json(holding);
  });

  router.get('/accounts/:id/holdings', (req: Request, res: Response) => {
    res.json(svc.getHoldingsByAccount(req.params.id));
  });

  router.post('/holdings', (req: Request, res: Response) => {
    const { accountId, assetId, quantity, costBasis, currentValue, asOfDate, notes } = req.body;
    if (!accountId || !assetId || quantity == null) {
      return res.status(400).json({ error: 'accountId, assetId, and quantity are required' });
    }
    const holding = svc.addHolding({ accountId, assetId, quantity, costBasis, currentValue, asOfDate, notes });
    res.status(201).json(holding);
  });

  router.put('/holdings/:id', (req: Request, res: Response) => {
    const updated = svc.updateHolding(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Holding not found' });
    res.json(updated);
  });

  router.delete('/holdings/:id', (req: Request, res: Response) => {
    const deleted = svc.deleteHolding(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Holding not found' });
    res.status(204).send();
  });

  // ── Tags ────────────────────────────────────────────────────────

  router.get('/tags', (_req: Request, res: Response) => {
    res.json(svc.getTags());
  });

  // ── Portfolio Views ─────────────────────────────────────────────

  router.get('/portfolio/summary', (_req: Request, res: Response) => {
    res.json(svc.getSummary());
  });

  router.get('/portfolio/risk', (_req: Request, res: Response) => {
    res.json(svc.getRiskReport());
  });

  return router;
}
