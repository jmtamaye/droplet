// ── API Client ───────────────────────────────────────────────────────

const api = {
  async get(path) {
    const res = await fetch(`/api${path}`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async post(path, body) {
    const res = await fetch(`/api${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.status === 204 ? null : res.json();
  },
  async put(path, body) {
    const res = await fetch(`/api${path}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async del(path) {
    const res = await fetch(`/api${path}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) throw new Error(await res.text());
  },
};

// ── Formatting ───────────────────────────────────────────────────────

function fmtMoney(n) {
  if (n == null || isNaN(n)) return '--';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtPct(n) {
  if (n == null || isNaN(n)) return '--';
  return (n * 100).toFixed(1) + '%';
}

function fmtLabel(s) {
  return (s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function gainClass(n) {
  if (n > 0) return 'positive';
  if (n < 0) return 'negative';
  return '';
}

// ── Navigation ───────────────────────────────────────────────────────

const navLinks = document.querySelectorAll('.nav-link');
const views = document.querySelectorAll('.view');

function switchView(name) {
  navLinks.forEach(l => l.classList.toggle('active', l.dataset.view === name));
  views.forEach(v => v.classList.toggle('active', v.id === `view-${name}`));
  loadView(name);
}

navLinks.forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    switchView(link.dataset.view);
  });
});

// ── View Loaders ─────────────────────────────────────────────────────

async function loadView(name) {
  switch (name) {
    case 'dashboard': return loadDashboard();
    case 'risk': return loadRisk();
    case 'holdings': return loadHoldings();
    case 'institutions': return loadInstitutions();
    case 'assets': return loadAssets();
  }
}

// ── DASHBOARD ────────────────────────────────────────────────────────

async function loadDashboard() {
  try {
    const summary = await api.get('/portfolio/summary');
    renderDashboard(summary);
  } catch {
    document.getElementById('kpi-total-value').textContent = '--';
  }
}

function renderDashboard(s) {
  document.getElementById('dashboard-date').textContent = `As of ${s.asOfDate}`;
  document.getElementById('kpi-total-value').textContent = fmtMoney(s.totalValue);
  document.getElementById('kpi-cost-basis').textContent = fmtMoney(s.totalCostBasis);

  const glEl = document.getElementById('kpi-gain-loss');
  glEl.textContent = (s.totalGainLoss >= 0 ? '+' : '') + fmtMoney(s.totalGainLoss);
  glEl.className = 'kpi-value ' + gainClass(s.totalGainLoss);

  const retEl = document.getElementById('kpi-return');
  retEl.textContent = (s.totalGainLossPct >= 0 ? '+' : '') + fmtPct(s.totalGainLossPct);
  retEl.className = 'kpi-value ' + gainClass(s.totalGainLossPct);

  renderBarChart('chart-risk', s.byRiskCategory);
  renderBarChart('chart-asset-type', s.byAssetClass);
  renderBarChart('chart-geo', s.byGeography);
  renderBarChart('chart-sector', s.bySector);
  renderInstitutionBreakdown(s.byInstitution);
}

function renderBarChart(containerId, slices) {
  const el = document.getElementById(containerId);
  if (!slices || slices.length === 0) {
    el.innerHTML = '<div class="empty-state"><p>No data yet</p></div>';
    return;
  }

  const maxPct = Math.max(...slices.map(s => s.pctOfTotal), 0.01);

  el.innerHTML = slices.map((s, i) => `
    <div class="bar-row">
      <span class="bar-label" title="${fmtLabel(s.label)}">${fmtLabel(s.label)}</span>
      <div class="bar-track">
        <div class="bar-fill c${i % 10}" style="width: ${(s.pctOfTotal / maxPct * 100).toFixed(1)}%"></div>
      </div>
      <span class="bar-pct">${fmtPct(s.pctOfTotal)}</span>
    </div>
  `).join('');
}

function renderInstitutionBreakdown(institutions) {
  const el = document.getElementById('institution-breakdown');
  if (!institutions || institutions.length === 0) {
    el.innerHTML = '<div class="empty-state"><p>No institutions yet. Add one to get started.</p></div>';
    return;
  }

  el.innerHTML = institutions.map((ib, idx) => `
    <div class="inst-card">
      <div class="inst-header" onclick="toggleInstDetail(${idx})">
        <span class="inst-name">${ib.institution.name}</span>
        <span>
          <span class="inst-value">${fmtMoney(ib.totalValue)}</span>
          <span style="color:var(--text-dim); font-size:13px; margin-left:8px">${fmtPct(ib.pctOfPortfolio)}</span>
        </span>
      </div>
      <div class="inst-detail" id="inst-detail-${idx}">
        ${ib.accounts.map(ab => `
          <div class="inst-acct">
            <div class="inst-acct-header">${ab.account.name} (${ab.account.accountType})</div>
            <div class="inst-acct-value">
              ${fmtMoney(ab.totalValue)}
              <span class="${gainClass(ab.totalGainLoss)}" style="margin-left:12px; font-size:12px">
                ${ab.totalGainLoss >= 0 ? '+' : ''}${fmtMoney(ab.totalGainLoss)}
              </span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

window.toggleInstDetail = function(idx) {
  document.getElementById(`inst-detail-${idx}`)?.classList.toggle('open');
};

// ── RISK VIEW ────────────────────────────────────────────────────────

async function loadRisk() {
  try {
    const report = await api.get('/portfolio/risk');
    renderRisk(report);
  } catch {
    document.getElementById('risk-table').querySelector('tbody').innerHTML =
      '<tr><td colspan="4" class="empty-state">Could not load risk data</td></tr>';
  }
}

function renderRisk(report) {
  // Warnings
  const wEl = document.getElementById('risk-warnings');
  if (report.concentrationWarnings.length > 0) {
    wEl.innerHTML = report.concentrationWarnings.map(w => `
      <div class="warning-card">
        <span class="warning-icon">&#9888;</span>
        <span>${w.message}</span>
      </div>
    `).join('');
  } else {
    wEl.innerHTML = '';
  }

  // Table
  const tbody = document.getElementById('risk-table').querySelector('tbody');
  if (report.exposures.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No holdings to analyze</td></tr>';
    return;
  }

  tbody.innerHTML = report.exposures.map(e => `
    <tr>
      <td><strong>${e.label}</strong></td>
      <td class="num">${fmtMoney(e.value)}</td>
      <td class="num">${fmtPct(e.pctOfPortfolio)}</td>
      <td>${e.contributors.slice(0, 3).map(c =>
        `<span style="font-size:13px">${c.asset.symbol || c.asset.name} (${fmtMoney(c.effectiveExposure)})</span>`
      ).join(', ')}</td>
    </tr>
  `).join('');
}

// ── HOLDINGS VIEW ────────────────────────────────────────────────────

// Caches for dropdowns
let cachedAccounts = [];
let cachedAssets = [];

async function loadHoldings() {
  try {
    const [summary, accounts, assets] = await Promise.all([
      api.get('/portfolio/summary'),
      api.get('/accounts'),
      api.get('/assets'),
    ]);
    cachedAccounts = accounts;
    cachedAssets = assets;
    renderHoldings(summary);
  } catch {
    document.getElementById('holdings-table').querySelector('tbody').innerHTML =
      '<tr><td colspan="8" class="empty-state">Could not load holdings</td></tr>';
  }
}

function renderHoldings(summary) {
  const tbody = document.getElementById('holdings-table').querySelector('tbody');
  const allHoldings = [];
  for (const ib of summary.byInstitution) {
    for (const ab of ib.accounts) {
      for (const hv of ab.holdings) {
        allHoldings.push({ ...hv, accountName: ab.account.name, institutionName: ib.institution.name });
      }
    }
  }

  if (allHoldings.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8">
      <div class="empty-state">
        <div class="empty-state-icon">&#9744;</div>
        <p>No holdings yet. Add institutions, accounts, and assets first, then add holdings.</p>
      </div>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = allHoldings.map(hv => `
    <tr>
      <td>
        <strong>${hv.asset.symbol || '--'}</strong>
        <span style="color:var(--text-muted); margin-left:6px; font-size:12px">${hv.asset.name}</span>
      </td>
      <td style="font-size:13px">${hv.accountName}<br><span style="color:var(--text-dim); font-size:11px">${hv.institutionName}</span></td>
      <td class="num">${hv.holding.quantity.toLocaleString()}</td>
      <td class="num">${fmtMoney(hv.holding.costBasis)}</td>
      <td class="num">${fmtMoney(hv.holding.currentValue)}</td>
      <td class="num ${gainClass(hv.gainLoss)}">${hv.gainLoss >= 0 ? '+' : ''}${fmtMoney(hv.gainLoss)}<br>
        <span style="font-size:11px">${hv.gainLossPct >= 0 ? '+' : ''}${fmtPct(hv.gainLossPct)}</span>
      </td>
      <td class="num">${fmtPct(hv.pctOfPortfolio)}</td>
      <td>
        <button class="btn btn-sm btn-danger" onclick="deleteHolding('${hv.holding.id}')">Delete</button>
      </td>
    </tr>
  `).join('');
}

// ── INSTITUTIONS VIEW ────────────────────────────────────────────────

async function loadInstitutions() {
  try {
    const institutions = await api.get('/institutions');
    // For each institution, load accounts
    const withAccounts = await Promise.all(institutions.map(async inst => {
      const accounts = await api.get(`/institutions/${inst.id}/accounts`);
      return { ...inst, accounts };
    }));
    renderInstitutionsList(withAccounts);
  } catch {
    document.getElementById('institutions-list').innerHTML =
      '<div class="empty-state"><p>Could not load institutions</p></div>';
  }
}

function renderInstitutionsList(institutions) {
  const el = document.getElementById('institutions-list');
  if (institutions.length === 0) {
    el.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon">&#127963;</div>
      <p>No institutions yet. Add your first financial institution to get started.</p>
    </div>`;
    return;
  }

  el.innerHTML = institutions.map(inst => `
    <div class="inst-manage-card">
      <div class="inst-manage-header">
        <h3>${inst.name}</h3>
        <div style="display:flex; gap:8px; align-items:center">
          <span class="inst-manage-type">${inst.type}</span>
          <button class="btn btn-sm btn-danger" onclick="deleteInstitution('${inst.id}')">Delete</button>
        </div>
      </div>
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px">
        <span style="font-size:13px; color:var(--text-muted)">Accounts</span>
        <button class="btn btn-sm btn-secondary" onclick="openAddAccount('${inst.id}')">+ Add Account</button>
      </div>
      <div class="inst-accounts-list">
        ${inst.accounts.length === 0
          ? '<span style="color:var(--text-dim); font-size:13px">No accounts yet</span>'
          : inst.accounts.map(a => `
            <div class="account-chip">
              <span class="account-chip-name">${a.name}</span>
              <span class="account-chip-type">${a.accountType} &middot; ${a.currency}</span>
              <div class="account-chip-actions">
                <button class="btn btn-sm btn-danger" onclick="deleteAccount('${a.id}')">Delete</button>
              </div>
            </div>
          `).join('')
        }
      </div>
    </div>
  `).join('');
}

// ── ASSETS VIEW ──────────────────────────────────────────────────────

async function loadAssets() {
  try {
    const assets = await api.get('/assets');
    // Load tags for each asset
    const withTags = await Promise.all(assets.map(async a => {
      const tags = await api.get(`/assets/${a.id}/tags`);
      return { ...a, tags };
    }));
    renderAssets(withTags);
  } catch {
    document.getElementById('assets-table').querySelector('tbody').innerHTML =
      '<tr><td colspan="6" class="empty-state">Could not load assets</td></tr>';
  }
}

function renderAssets(assets) {
  const tbody = document.getElementById('assets-table').querySelector('tbody');
  if (assets.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6">
      <div class="empty-state">
        <div class="empty-state-icon">&#128176;</div>
        <p>No assets yet. Add your first asset.</p>
      </div>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = assets.map(a => `
    <tr>
      <td><strong>${a.symbol || '--'}</strong></td>
      <td>${a.name}</td>
      <td style="text-transform:capitalize">${(a.assetClass || '').replace(/_/g, ' ')}</td>
      <td class="num">${a.currentPrice != null ? '$' + Number(a.currentPrice).toFixed(2) : '--'}</td>
      <td>${(a.tags || []).map(t =>
        `<span class="tag tag-${t.tag.category} ${t.source === 'auto' ? 'tag-auto' : ''}" title="${t.tag.description || ''} (${t.source}, wt: ${t.weight})">${fmtLabel(t.tag.name)}</span>`
      ).join('')}</td>
      <td>
        <button class="btn btn-sm btn-secondary" onclick="openAddTag('${a.id}', '${a.symbol || a.name}')">+ Tag</button>
        <button class="btn btn-sm btn-danger" onclick="deleteAsset('${a.id}')">Delete</button>
      </td>
    </tr>
  `).join('');
}

// ── MODAL System ─────────────────────────────────────────────────────

const overlay = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const modalForm = document.getElementById('modal-form');
const modalSave = document.getElementById('modal-save');

let onSave = null;

function openModal(title, formHTML, saveFn) {
  modalTitle.textContent = title;
  modalForm.innerHTML = formHTML;
  onSave = saveFn;
  overlay.classList.add('open');
}

function closeModal() {
  overlay.classList.remove('open');
  onSave = null;
}

document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-cancel').addEventListener('click', closeModal);
overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

modalSave.addEventListener('click', async () => {
  if (onSave) {
    try {
      await onSave();
      closeModal();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  }
});

// ── Add Institution ──────────────────────────────────────────────────

document.getElementById('btn-add-institution').addEventListener('click', () => {
  openModal('Add Institution', `
    <div class="form-group">
      <label>Name</label>
      <input id="f-inst-name" placeholder="e.g. Fidelity, Schwab, Coinbase..." required />
    </div>
    <div class="form-group">
      <label>Type</label>
      <select id="f-inst-type">
        <option value="brokerage">Brokerage</option>
        <option value="bank">Bank</option>
        <option value="retirement">Retirement</option>
        <option value="crypto_exchange">Crypto Exchange</option>
        <option value="insurance">Insurance</option>
        <option value="physical">Physical (Real Estate, Vehicles)</option>
        <option value="other">Other</option>
      </select>
    </div>
    <div class="form-group">
      <label>Notes (optional)</label>
      <input id="f-inst-notes" placeholder="Any notes..." />
    </div>
  `, async () => {
    const name = document.getElementById('f-inst-name').value.trim();
    const type = document.getElementById('f-inst-type').value;
    const notes = document.getElementById('f-inst-notes').value.trim() || undefined;
    if (!name) throw new Error('Name is required');
    await api.post('/institutions', { name, type, notes });
    loadInstitutions();
  });
});

// ── Add Account ──────────────────────────────────────────────────────

window.openAddAccount = function(institutionId) {
  openModal('Add Account', `
    <div class="form-group">
      <label>Account Name</label>
      <input id="f-acct-name" placeholder="e.g. Taxable Brokerage, Roth IRA..." required />
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Account Type</label>
        <select id="f-acct-type">
          <option value="brokerage">Brokerage</option>
          <option value="ira">IRA</option>
          <option value="roth_ira">Roth IRA</option>
          <option value="401k">401(k)</option>
          <option value="hsa">HSA</option>
          <option value="checking">Checking</option>
          <option value="savings">Savings</option>
          <option value="property">Property</option>
          <option value="crypto">Crypto</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div class="form-group">
        <label>Currency</label>
        <select id="f-acct-currency">
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
          <option value="GBP">GBP</option>
          <option value="CAD">CAD</option>
          <option value="JPY">JPY</option>
          <option value="OTHER">Other</option>
        </select>
      </div>
    </div>
  `, async () => {
    const name = document.getElementById('f-acct-name').value.trim();
    const accountType = document.getElementById('f-acct-type').value;
    const currency = document.getElementById('f-acct-currency').value;
    if (!name) throw new Error('Name is required');
    await api.post('/accounts', { institutionId, name, accountType, currency });
    loadInstitutions();
  });
};

// ── Add Asset ────────────────────────────────────────────────────────

document.getElementById('btn-add-asset').addEventListener('click', () => {
  openModal('Add Asset', `
    <div class="form-row">
      <div class="form-group">
        <label>Symbol (optional)</label>
        <input id="f-asset-symbol" placeholder="e.g. SPY, GLD, BTC..." />
      </div>
      <div class="form-group">
        <label>Current Price</label>
        <input id="f-asset-price" type="number" step="0.01" placeholder="e.g. 500.00" />
      </div>
    </div>
    <div class="form-group">
      <label>Name</label>
      <input id="f-asset-name" placeholder="e.g. SPDR S&P 500 ETF, Primary Residence..." required />
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Asset Class</label>
        <select id="f-asset-class">
          <option value="equity">Equity</option>
          <option value="fixed_income">Fixed Income</option>
          <option value="commodity">Commodity</option>
          <option value="real_estate">Real Estate</option>
          <option value="cash">Cash</option>
          <option value="crypto">Crypto</option>
          <option value="vehicle">Vehicle</option>
          <option value="collectible">Collectible</option>
          <option value="alternative">Alternative</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div class="form-group">
        <label>Currency</label>
        <select id="f-asset-currency">
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
          <option value="GBP">GBP</option>
          <option value="OTHER">Other</option>
        </select>
      </div>
    </div>
  `, async () => {
    const symbol = document.getElementById('f-asset-symbol').value.trim() || undefined;
    const name = document.getElementById('f-asset-name').value.trim();
    const assetClass = document.getElementById('f-asset-class').value;
    const currency = document.getElementById('f-asset-currency').value;
    const priceStr = document.getElementById('f-asset-price').value;
    const currentPrice = priceStr ? parseFloat(priceStr) : undefined;
    if (!name) throw new Error('Name is required');
    await api.post('/assets', { symbol, name, assetClass, currency, currentPrice });
    loadAssets();
  });
});

// ── Add Holding ──────────────────────────────────────────────────────

document.getElementById('btn-add-holding').addEventListener('click', async () => {
  // Make sure we have fresh data for dropdowns
  const [accounts, assets] = await Promise.all([api.get('/accounts'), api.get('/assets')]);
  cachedAccounts = accounts;
  cachedAssets = assets;

  if (accounts.length === 0 || assets.length === 0) {
    alert('Please add at least one institution with an account and one asset before adding holdings.');
    return;
  }

  const acctOpts = accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
  const assetOpts = assets.map(a => `<option value="${a.id}">${a.symbol ? a.symbol + ' - ' : ''}${a.name}</option>`).join('');

  openModal('Add Holding', `
    <div class="form-row">
      <div class="form-group">
        <label>Account</label>
        <select id="f-hold-account">${acctOpts}</select>
      </div>
      <div class="form-group">
        <label>Asset</label>
        <select id="f-hold-asset">${assetOpts}</select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Quantity</label>
        <input id="f-hold-qty" type="number" step="any" placeholder="e.g. 100" required />
      </div>
      <div class="form-group">
        <label>As-of Date</label>
        <input id="f-hold-date" type="date" value="${new Date().toISOString().slice(0, 10)}" />
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Cost Basis ($)</label>
        <input id="f-hold-cost" type="number" step="0.01" placeholder="Total cost" />
      </div>
      <div class="form-group">
        <label>Current Value ($)</label>
        <input id="f-hold-value" type="number" step="0.01" placeholder="Current market value" />
      </div>
    </div>
  `, async () => {
    const accountId = document.getElementById('f-hold-account').value;
    const assetId = document.getElementById('f-hold-asset').value;
    const quantity = parseFloat(document.getElementById('f-hold-qty').value);
    const costBasis = parseFloat(document.getElementById('f-hold-cost').value) || 0;
    const currentValue = parseFloat(document.getElementById('f-hold-value').value) || 0;
    const asOfDate = document.getElementById('f-hold-date').value;
    if (isNaN(quantity)) throw new Error('Quantity is required');
    await api.post('/holdings', { accountId, assetId, quantity, costBasis, currentValue, asOfDate });
    loadHoldings();
  });
});

// ── Add Tag ──────────────────────────────────────────────────────────

window.openAddTag = function(assetId, assetLabel) {
  openModal(`Add Tag to ${assetLabel}`, `
    <div class="form-group">
      <label>Tag Name</label>
      <input id="f-tag-name" placeholder="e.g. core_holding, inflation_hedge..." required />
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Category</label>
        <select id="f-tag-category">
          <option value="risk_type">Risk Type</option>
          <option value="geography">Geography</option>
          <option value="sector">Sector</option>
          <option value="strategy">Strategy</option>
          <option value="asset_type">Asset Type</option>
          <option value="custom" selected>Custom</option>
        </select>
      </div>
      <div class="form-group">
        <label>Weight (0-1)</label>
        <input id="f-tag-weight" type="number" step="0.1" min="0" max="1" value="1.0" />
      </div>
    </div>
    <div class="form-group">
      <label>Description (optional)</label>
      <input id="f-tag-desc" placeholder="What does this tag mean?" />
    </div>
  `, async () => {
    const tagName = document.getElementById('f-tag-name').value.trim();
    const category = document.getElementById('f-tag-category').value;
    const weight = parseFloat(document.getElementById('f-tag-weight').value) || 1.0;
    const description = document.getElementById('f-tag-desc').value.trim() || undefined;
    if (!tagName) throw new Error('Tag name is required');
    await api.post(`/assets/${assetId}/tags`, { tagName, category, weight, description });
    loadAssets();
  });
};

// ── Delete Operations ────────────────────────────────────────────────

window.deleteInstitution = async function(id) {
  if (!confirm('Delete this institution and all its accounts? Holdings in those accounts will also be removed.')) return;
  await api.del(`/institutions/${id}`);
  loadInstitutions();
};

window.deleteAccount = async function(id) {
  if (!confirm('Delete this account and all its holdings?')) return;
  await api.del(`/accounts/${id}`);
  loadInstitutions();
};

window.deleteAsset = async function(id) {
  if (!confirm('Delete this asset? Related holdings will also be removed.')) return;
  await api.del(`/assets/${id}`);
  loadAssets();
};

window.deleteHolding = async function(id) {
  if (!confirm('Delete this holding?')) return;
  await api.del(`/holdings/${id}`);
  loadHoldings();
};

// ── CSV Import ──────────────────────────────────────────────────────

function csvHasHoldingColumns(text) {
  const firstLine = text.split(/\r?\n/)[0] || '';
  const headers = firstLine.toLowerCase();
  return headers.includes('quantity');
}

async function sendCsvImport(text, accountId) {
  let url = '/api/assets/import-csv';
  if (accountId) url += `?accountId=${encodeURIComponent(accountId)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/csv' },
    body: text,
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || 'Unknown error');
  return result;
}

document.getElementById('btn-import-csv').addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv,text/csv';
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    const text = await file.text();

    try {
      if (csvHasHoldingColumns(text)) {
        // CSV has quantity — need an account for holdings
        const accounts = await api.get('/accounts');
        if (accounts.length === 0) {
          alert('Your CSV has a "quantity" column but there are no accounts yet. Please create an institution and account first.');
          return;
        }
        const acctOpts = accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
        openModal('Import CSV — Select Account', `
          <div class="form-group">
            <p style="color:var(--text-muted); margin-bottom:12px">
              Your CSV includes quantity/value columns. Select the account to create holdings in:
            </p>
            <label>Account</label>
            <select id="f-csv-account">${acctOpts}</select>
          </div>
        `, async () => {
          const accountId = document.getElementById('f-csv-account').value;
          const result = await sendCsvImport(text, accountId);
          let msg = `Imported ${result.imported} asset(s) and ${result.holdings || 0} holding(s).`;
          if (result.errors && result.errors.length > 0) {
            msg += `\n\n${result.errors.length} row(s) skipped:\n` + result.errors.join('\n');
          }
          alert(msg);
          loadAssets();
        });
      } else {
        // No quantity column — just import assets
        const result = await sendCsvImport(text, null);
        let msg = `Imported ${result.imported} asset(s).`;
        if (result.errors && result.errors.length > 0) {
          msg += `\n\n${result.errors.length} row(s) skipped:\n` + result.errors.join('\n');
        }
        alert(msg);
        loadAssets();
      }
    } catch (err) {
      alert('Import failed: ' + err.message);
    }
  });
  input.click();
});

// ── Initial Load ─────────────────────────────────────────────────────

loadDashboard();
