/**
 * Data access layer — thin repository wrappers around SQLite queries.
 */

import { Database } from './adapter';
import { v4 as uuid } from 'uuid';
import {
  Institution, Account, Asset, Holding, Tag, AssetTag,
  InstitutionType, Currency, TagCategory,
} from '../models/types';

// ── Helpers ─────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString();
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Institution Repository ──────────────────────────────────────────

export class InstitutionRepo {
  constructor(private db: Database) {}

  create(data: { name: string; type: InstitutionType; notes?: string }): Institution {
    const inst: Institution = {
      id: uuid(),
      name: data.name,
      type: data.type,
      notes: data.notes,
      createdAt: now(),
      updatedAt: now(),
    };
    this.db.prepare(`
      INSERT INTO institutions (id, name, type, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(inst.id, inst.name, inst.type, inst.notes ?? null, inst.createdAt, inst.updatedAt);
    return inst;
  }

  getById(id: string): Institution | undefined {
    const row = this.db.prepare('SELECT * FROM institutions WHERE id = ?').get(id) as any;
    return row ? this.mapRow(row) : undefined;
  }

  getAll(): Institution[] {
    return (this.db.prepare('SELECT * FROM institutions ORDER BY name').all() as any[]).map(this.mapRow);
  }

  update(id: string, data: Partial<Pick<Institution, 'name' | 'type' | 'notes'>>): Institution | undefined {
    const existing = this.getById(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...data, updatedAt: now() };
    this.db.prepare(`
      UPDATE institutions SET name = ?, type = ?, notes = ?, updated_at = ? WHERE id = ?
    `).run(updated.name, updated.type, updated.notes ?? null, updated.updatedAt, id);
    return updated;
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM institutions WHERE id = ?').run(id).changes > 0;
  }

  private mapRow(row: any): Institution {
    return {
      id: row.id,
      name: row.name,
      type: row.type as InstitutionType,
      notes: row.notes ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

// ── Account Repository ──────────────────────────────────────────────

export class AccountRepo {
  constructor(private db: Database) {}

  create(data: {
    institutionId: string; name: string; accountType: string;
    currency?: Currency; notes?: string;
  }): Account {
    const acct: Account = {
      id: uuid(),
      institutionId: data.institutionId,
      name: data.name,
      accountType: data.accountType,
      currency: data.currency ?? Currency.USD,
      notes: data.notes,
      createdAt: now(),
      updatedAt: now(),
    };
    this.db.prepare(`
      INSERT INTO accounts (id, institution_id, name, account_type, currency, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(acct.id, acct.institutionId, acct.name, acct.accountType, acct.currency, acct.notes ?? null, acct.createdAt, acct.updatedAt);
    return acct;
  }

  getById(id: string): Account | undefined {
    const row = this.db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as any;
    return row ? this.mapRow(row) : undefined;
  }

  getByInstitution(institutionId: string): Account[] {
    return (this.db.prepare('SELECT * FROM accounts WHERE institution_id = ? ORDER BY name').all(institutionId) as any[]).map(this.mapRow);
  }

  getAll(): Account[] {
    return (this.db.prepare('SELECT * FROM accounts ORDER BY name').all() as any[]).map(this.mapRow);
  }

  update(id: string, data: Partial<Pick<Account, 'name' | 'accountType' | 'currency' | 'notes'>>): Account | undefined {
    const existing = this.getById(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...data, updatedAt: now() };
    this.db.prepare(`
      UPDATE accounts SET name = ?, account_type = ?, currency = ?, notes = ?, updated_at = ? WHERE id = ?
    `).run(updated.name, updated.accountType, updated.currency, updated.notes ?? null, updated.updatedAt, id);
    return updated;
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM accounts WHERE id = ?').run(id).changes > 0;
  }

  private mapRow(row: any): Account {
    return {
      id: row.id,
      institutionId: row.institution_id,
      name: row.name,
      accountType: row.account_type,
      currency: row.currency as Currency,
      notes: row.notes ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

// ── Asset Repository ────────────────────────────────────────────────

export class AssetRepo {
  constructor(private db: Database) {}

  create(data: {
    symbol?: string; name: string; assetClass: string;
    currency?: Currency; currentPrice?: number; metadata?: Record<string, string>;
  }): Asset {
    const asset: Asset = {
      id: uuid(),
      symbol: data.symbol,
      name: data.name,
      assetClass: data.assetClass,
      currency: data.currency ?? Currency.USD,
      currentPrice: data.currentPrice,
      priceAsOf: data.currentPrice != null ? now() : undefined,
      metadata: data.metadata,
      createdAt: now(),
      updatedAt: now(),
    };
    this.db.prepare(`
      INSERT INTO assets (id, symbol, name, asset_class, currency, current_price, price_as_of, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      asset.id, asset.symbol ?? null, asset.name, asset.assetClass, asset.currency,
      asset.currentPrice ?? null, asset.priceAsOf ?? null,
      asset.metadata ? JSON.stringify(asset.metadata) : null,
      asset.createdAt, asset.updatedAt,
    );
    return asset;
  }

  getById(id: string): Asset | undefined {
    const row = this.db.prepare('SELECT * FROM assets WHERE id = ?').get(id) as any;
    return row ? this.mapRow(row) : undefined;
  }

  getBySymbol(symbol: string): Asset | undefined {
    const row = this.db.prepare('SELECT * FROM assets WHERE symbol = ?').get(symbol) as any;
    return row ? this.mapRow(row) : undefined;
  }

  getAll(): Asset[] {
    return (this.db.prepare('SELECT * FROM assets ORDER BY name').all() as any[]).map(this.mapRow);
  }

  update(id: string, data: Partial<Pick<Asset, 'symbol' | 'name' | 'assetClass' | 'currency' | 'currentPrice' | 'metadata'>>): Asset | undefined {
    const existing = this.getById(id);
    if (!existing) return undefined;
    const updated: Asset = {
      ...existing,
      ...data,
      priceAsOf: data.currentPrice != null ? now() : existing.priceAsOf,
      updatedAt: now(),
    };
    this.db.prepare(`
      UPDATE assets SET symbol = ?, name = ?, asset_class = ?, currency = ?, current_price = ?,
        price_as_of = ?, metadata = ?, updated_at = ?
      WHERE id = ?
    `).run(
      updated.symbol ?? null, updated.name, updated.assetClass, updated.currency,
      updated.currentPrice ?? null, updated.priceAsOf ?? null,
      updated.metadata ? JSON.stringify(updated.metadata) : null,
      updated.updatedAt, id,
    );
    return updated;
  }

  getDistinctAssetClasses(): string[] {
    const rows = this.db.prepare('SELECT DISTINCT asset_class FROM assets ORDER BY asset_class').all() as any[];
    return rows.map(r => r.asset_class);
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM assets WHERE id = ?').run(id).changes > 0;
  }

  private mapRow(row: any): Asset {
    return {
      id: row.id,
      symbol: row.symbol ?? undefined,
      name: row.name,
      assetClass: row.asset_class as string,
      currency: row.currency as Currency,
      currentPrice: row.current_price ?? undefined,
      priceAsOf: row.price_as_of ?? undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

// ── Holding Repository ──────────────────────────────────────────────

export class HoldingRepo {
  constructor(private db: Database) {}

  create(data: {
    accountId: string; assetId: string; quantity: number;
    costBasis?: number; currentValue?: number; asOfDate?: string; notes?: string;
  }): Holding {
    const holding: Holding = {
      id: uuid(),
      accountId: data.accountId,
      assetId: data.assetId,
      quantity: data.quantity,
      costBasis: data.costBasis ?? 0,
      currentValue: data.currentValue ?? 0,
      asOfDate: data.asOfDate ?? today(),
      notes: data.notes,
      createdAt: now(),
      updatedAt: now(),
    };
    this.db.prepare(`
      INSERT INTO holdings (id, account_id, asset_id, quantity, cost_basis, current_value, as_of_date, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      holding.id, holding.accountId, holding.assetId, holding.quantity,
      holding.costBasis, holding.currentValue, holding.asOfDate,
      holding.notes ?? null, holding.createdAt, holding.updatedAt,
    );
    return holding;
  }

  getById(id: string): Holding | undefined {
    const row = this.db.prepare('SELECT * FROM holdings WHERE id = ?').get(id) as any;
    return row ? this.mapRow(row) : undefined;
  }

  getByAccount(accountId: string): Holding[] {
    return (this.db.prepare('SELECT * FROM holdings WHERE account_id = ?').all(accountId) as any[]).map(this.mapRow);
  }

  getByAsset(assetId: string): Holding[] {
    return (this.db.prepare('SELECT * FROM holdings WHERE asset_id = ?').all(assetId) as any[]).map(this.mapRow);
  }

  getAll(): Holding[] {
    return (this.db.prepare('SELECT * FROM holdings ORDER BY as_of_date DESC').all() as any[]).map(this.mapRow);
  }

  update(id: string, data: Partial<Pick<Holding, 'quantity' | 'costBasis' | 'currentValue' | 'asOfDate' | 'notes'>>): Holding | undefined {
    const existing = this.getById(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...data, updatedAt: now() };
    this.db.prepare(`
      UPDATE holdings SET quantity = ?, cost_basis = ?, current_value = ?, as_of_date = ?, notes = ?, updated_at = ?
      WHERE id = ?
    `).run(updated.quantity, updated.costBasis, updated.currentValue, updated.asOfDate, updated.notes ?? null, updated.updatedAt, id);
    return updated;
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM holdings WHERE id = ?').run(id).changes > 0;
  }

  private mapRow(row: any): Holding {
    return {
      id: row.id,
      accountId: row.account_id,
      assetId: row.asset_id,
      quantity: row.quantity,
      costBasis: row.cost_basis,
      currentValue: row.current_value,
      asOfDate: row.as_of_date,
      notes: row.notes ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

// ── Tag Repository ──────────────────────────────────────────────────

export class TagRepo {
  constructor(private db: Database) {}

  create(data: { name: string; category: TagCategory; description?: string }): Tag {
    const tag: Tag = { id: uuid(), ...data };
    this.db.prepare(`
      INSERT INTO tags (id, name, category, description) VALUES (?, ?, ?, ?)
    `).run(tag.id, tag.name, tag.category, tag.description ?? null);
    return tag;
  }

  getById(id: string): Tag | undefined {
    const row = this.db.prepare('SELECT * FROM tags WHERE id = ?').get(id) as any;
    return row ? this.mapRow(row) : undefined;
  }

  getByName(name: string): Tag | undefined {
    const row = this.db.prepare('SELECT * FROM tags WHERE name = ?').get(name) as any;
    return row ? this.mapRow(row) : undefined;
  }

  getByNameAndCategory(name: string, category: TagCategory): Tag | undefined {
    const row = this.db.prepare('SELECT * FROM tags WHERE name = ? AND category = ?').get(name, category) as any;
    return row ? this.mapRow(row) : undefined;
  }

  getAll(): Tag[] {
    return (this.db.prepare('SELECT * FROM tags ORDER BY category, name').all() as any[]).map(this.mapRow);
  }

  getByCategory(category: TagCategory): Tag[] {
    return (this.db.prepare('SELECT * FROM tags WHERE category = ? ORDER BY name').all(category) as any[]).map(this.mapRow);
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM tags WHERE id = ?').run(id).changes > 0;
  }

  private mapRow(row: any): Tag {
    return {
      id: row.id,
      name: row.name,
      category: row.category as TagCategory,
      description: row.description ?? undefined,
    };
  }
}

// ── AssetTag Repository ─────────────────────────────────────────────

export class AssetTagRepo {
  constructor(private db: Database) {}

  set(data: { assetId: string; tagId: string; weight?: number; source?: 'auto' | 'manual' }): AssetTag {
    const at: AssetTag = {
      assetId: data.assetId,
      tagId: data.tagId,
      weight: data.weight ?? 1.0,
      source: data.source ?? 'manual',
    };
    this.db.prepare(`
      INSERT INTO asset_tags (asset_id, tag_id, weight, source)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(asset_id, tag_id) DO UPDATE SET weight = excluded.weight, source = excluded.source
    `).run(at.assetId, at.tagId, at.weight, at.source);
    return at;
  }

  getByAsset(assetId: string): AssetTag[] {
    return (this.db.prepare('SELECT * FROM asset_tags WHERE asset_id = ?').all(assetId) as any[]).map(this.mapRow);
  }

  getByTag(tagId: string): AssetTag[] {
    return (this.db.prepare('SELECT * FROM asset_tags WHERE tag_id = ?').all(tagId) as any[]).map(this.mapRow);
  }

  remove(assetId: string, tagId: string): boolean {
    return this.db.prepare('DELETE FROM asset_tags WHERE asset_id = ? AND tag_id = ?').run(assetId, tagId).changes > 0;
  }

  removeAutoTags(assetId: string): void {
    this.db.prepare("DELETE FROM asset_tags WHERE asset_id = ? AND source = 'auto'").run(assetId);
  }

  private mapRow(row: any): AssetTag {
    return {
      assetId: row.asset_id,
      tagId: row.tag_id,
      weight: row.weight,
      source: row.source as 'auto' | 'manual',
    };
  }
}
