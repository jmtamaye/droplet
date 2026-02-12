/**
 * Express REST API routes for the portfolio management system.
 */

import { Router, Request, Response } from 'express';
import { PortfolioService } from '../services/portfolio-service';
import { InstitutionType, AssetClass, Currency, TagCategory } from '../models/types';

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
