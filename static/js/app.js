// ── State ──────────────────────────────────────────────
const state = {
  month: new Date().toISOString().slice(0, 7),
  txType: 'expense',
  debtDir: 'owe',
  plannedType: 'expense',
  trendChart: null,
  calData: [],
  selectedDay: null,
  editingTxId: null,
  editingDebtId: null,
  editingPlannedId: null,
  editingSavingsId: null,
  txs: [],
  allDebts: [],
  allPlanned: [],
};

// ── Utils ──────────────────────────────────────────────
const fmt = n => new Intl.NumberFormat('sr-RS').format(Math.round(n)) + ' RSD';
const dispCat = c => (c && c.startsWith('savings:')) ? c.slice(8) : c;
const fmtShort = n => {
  const abs = Math.abs(n);
  if (abs >= 1000000) return (n/1000000).toFixed(1) + 'M';
  if (abs >= 1000) return (n/1000).toFixed(0) + 'k';
  return Math.round(n).toString();
};
const $ = id => document.getElementById(id);
const today = () => new Date().toISOString().slice(0, 10);

const MONTH_NAMES = ['Januar','Februar','Mart','April','Maj','Jun','Jul','Avgust','Septembar','Oktobar','Novembar','Decembar'];
const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','Maj','Jun','Jul','Avg','Sep','Okt','Nov','Dec'];

async function api(path, opts = {}) {
  const r = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (r.status === 401) { window.location.href = '/login'; return {}; }
  return r.json();
}

// ── Navigation ─────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(el => {
  el.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    el.classList.add('active');
    $('page-' + el.dataset.page).classList.add('active');
    refreshPage(el.dataset.page);
  });
});

function refreshPage(page) {
  if (page === 'dashboard')    loadDashboard();
  if (page === 'calendar')     loadCalendar();
  if (page === 'transactions') loadTransactions();
  if (page === 'debts')        loadDebts();
  if (page === 'budgets')      loadBudgets();
  if (page === 'savings')      loadSavings();
  if (page === 'admin')        loadAdmin();
}

$('globalMonth').value = state.month;
$('globalMonth').addEventListener('change', e => {
  state.month = e.target.value;
  state.selectedDay = null;
  // Keep mobile month picker in sync
  const mob = $('mobileMonth');
  if (mob) mob.value = e.target.value;
  const active = document.querySelector('.nav-item.active');
  if (active) refreshPage(active.dataset.page);
});

// ── Dashboard ──────────────────────────────────────────
function dashFilterParams() {
  const from   = $('dashFrom')?.value   || (state.month + '-01');
  const to     = $('dashTo')?.value     || today();
  const person = $('dashPerson')?.value || 'all';
  return { from, to, person };
}

async function loadDashboard() {
  const { from, to, person } = dashFilterParams();
  const [sumData, trend, txs] = await Promise.all([
    api(`/api/summary?month=${state.month}&date_from=${from}&date_to=${to}&person=${person}`),
    api(`/api/monthly_trend?person=${person}`),
    api('/api/transactions?month=' + state.month),
  ]);
  state.txs = txs;
  const { summary, by_category, current_balances } = sumData;
  setBalanceCard('totalBalance',   'totalInEx',   current_balances.total,    summary.total);
  setBalanceCard('milicaBalance',  'milicaInEx',  current_balances['Milica'], summary['Milica']);
  setBalanceCard('djordjeBalance', 'djordjeInEx', current_balances['Đorđe'],  summary['Đorđe']);
  renderCategoryBars(by_category);
  renderTrendChart(trend);
  renderTxList($('recentTxList'), txs.slice(0, 8));
}

function applyDashFilters() { loadDashboard(); }

function setBalanceCard(valId, subId, curBal, filteredData) {
  const el = $(valId);
  el.textContent = fmt(curBal);
  el.className = 'card-value ' + (curBal >= 0 ? 'positive' : 'negative');
  $(subId).textContent = `↑ ${fmt(filteredData.income)}  ↓ ${fmt(filteredData.expense)}`;
}

function renderCategoryBars(by_cat) {
  const entries = Object.entries(by_cat).filter(([,v]) => v > 0).sort((a,b) => b[1]-a[1]);
  const max = entries[0]?.[1] || 1;
  const html = entries.map(([cat, amt]) => `
    <div class="cat-bar-row">
      <div class="cat-bar-label">${dispCat(cat)}</div>
      <div class="cat-bar-track">
        <div class="cat-bar-fill" style="width:${(amt/max*100).toFixed(1)}%"></div>
      </div>
      <div class="cat-bar-amount">${fmtShort(amt)}</div>
    </div>
  `).join('');
  $('categoryBars').innerHTML = html || '<div class="empty-state">Nema rashoda</div>';
}

function renderTrendChart(data) {
  const canvas = $('trendChart');
  const ctx = canvas.getContext('2d');
  if (state.trendChart) state.trendChart.destroy?.();

  const labels   = data.map(d => SHORT_MONTHS[parseInt(d.month.split('-')[1])-1]);
  const incomes  = data.map(d => d.income);
  const expenses = data.map(d => d.expense);
  const W = canvas.parentElement.offsetWidth - 48;
  const H = 220;
  canvas.width = W; canvas.height = H;

  const pad = { t: 20, r: 10, b: 30, l: 45 };
  const cW = W - pad.l - pad.r;
  const cH = H - pad.t - pad.b;
  const maxVal = Math.max(...incomes, ...expenses, 1);

  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = '#D1DCE8'; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + (cH / 4) * i;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + cW, y); ctx.stroke();
    ctx.fillStyle = '#8FA3B8'; ctx.font = '10px DM Mono, monospace';
    ctx.fillText(fmtShort(maxVal * (1 - i/4)), 0, y + 4);
  }

  function drawLine(vals, color) {
    if (!vals.length) return;
    const step = cW / Math.max(vals.length - 1, 1);
    ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    vals.forEach((v, i) => {
      const x = pad.l + i * step;
      const y = pad.t + cH - (v / maxVal) * cH;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    vals.forEach((v, i) => {
      ctx.beginPath();
      ctx.arc(pad.l + i * step, pad.t + cH - (v / maxVal) * cH, 3, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
    });
  }

  drawLine(incomes, '#1A7A4A');
  drawLine(expenses, '#C0392B');

  ctx.fillStyle = '#8FA3B8'; ctx.font = '10px DM Mono, monospace'; ctx.textAlign = 'center';
  const step = cW / Math.max(labels.length - 1, 1);
  labels.forEach((l, i) => ctx.fillText(l, pad.l + i * step, H - 4));

  ctx.textAlign = 'left';
  ctx.fillStyle = '#1A7A4A'; ctx.fillRect(pad.l, 4, 10, 4);
  ctx.fillStyle = '#4A6080'; ctx.fillText('Prihod', pad.l + 14, 11);
  ctx.fillStyle = '#C0392B'; ctx.fillRect(pad.l + 70, 4, 10, 4);
  ctx.fillStyle = '#4A6080'; ctx.fillText('Rashod', pad.l + 84, 11);
}

// ── Calendar ───────────────────────────────────────────
async function loadCalendar() {
  const [calResp, planned] = await Promise.all([
    api('/api/calendar?month=' + state.month),
    api('/api/planned'),
  ]);
  const days = calResp.days;
  state.calData = days;
  renderCalSummary(days, calResp.cb_djordje, calResp.cb_milica);
  renderCalGrid(days);
  renderPlannedList(planned);
  if (state.selectedDay) showDayDetail(state.selectedDay);
  else $('dayDetail').style.display = 'none';
}

function renderCalSummary(days, cb_djordje, cb_milica) {
  function personStats(person) {
    const ri = days.reduce((s,d) => s + d.real.filter(t=>t.type==='income'  && t.person===person).reduce((a,t)=>a+t.amount,0), 0);
    const re = days.reduce((s,d) => s + d.real.filter(t=>t.type==='expense' && t.person===person).reduce((a,t)=>a+t.amount,0), 0);
    const pi = days.reduce((s,d) => s + d.planned.filter(t=>t.type==='income'  && t.person===person).reduce((a,t)=>a+t.amount,0), 0);
    const pe = days.reduce((s,d) => s + d.planned.filter(t=>t.type==='expense' && t.person===person).reduce((a,t)=>a+t.amount,0), 0);
    return { ri, re, pi, pe };
  }

  function personColumn(name, stats, cb) {
    const delta   = stats.ri - stats.re;
    const opening = cb - delta;
    return `
      <div class="cal-summary-column">
        <h3 class="cal-summary-name">${name}</h3>
        <div class="cal-strip-card">
          <div class="cal-strip-label">Stanje na početku meseca</div>
          <div class="cal-strip-val ${opening >= 0 ? 'positive':'negative'}">${fmt(opening)}</div>
        </div>
        <div class="cal-strip-card">
          <div class="cal-strip-label">Realizovano ovaj mesec</div>
          <div class="cal-strip-val ${delta >= 0 ? 'positive':'negative'}">${fmt(delta)}</div>
          <div class="cal-strip-sub">↑ ${fmt(stats.ri)} &nbsp; ↓ ${fmt(stats.re)}</div>
        </div>
        <div class="cal-strip-card">
          <div class="cal-strip-label">Planirano (ostatak meseca)</div>
          <div class="cal-strip-val">${fmt(stats.pi - stats.pe)}</div>
          <div class="cal-strip-sub">↑ ${fmt(stats.pi)} &nbsp; ↓ ${fmt(stats.pe)}</div>
        </div>
        <div class="cal-strip-card">
          <div class="cal-strip-label">Tekući saldo</div>
          <div class="cal-strip-val ${cb >= 0 ? 'positive':'negative'}">${fmt(cb)}</div>
        </div>
      </div>`;
  }

  $('calSummaryStrip').innerHTML = `
    <div class="cal-summary-row">
      ${personColumn('Đorđe', personStats('Đorđe'), cb_djordje)}
      ${personColumn('Milica', personStats('Milica'), cb_milica)}
    </div>`;
}

function renderCalGrid(days) {
  const grid = $('calGrid');
  const todayStr = today();

  const firstDay = new Date(days[0].date).getDay();
  const offset = (firstDay + 6) % 7;

  let html = '';
  for (let i = 0; i < offset; i++) {
    html += '<div class="cal-day empty-day"></div>';
  }

  for (const day of days) {
    const isToday = day.date === todayStr;
    const isSelected = day.date === state.selectedDay;
    const statusClass = day.status !== 'empty' ? day.status : '';
    const saldo = day.running_real;
    const saldoClass = saldo >= 0 ? 'positive' : 'negative';

    let chips = '';
    const unrealizedPlanned = day.planned.filter(
      p => !day.real.some(t => t.category === p.category && t.type === p.type)
    );
    const allItems = [
      ...day.real.map(t => ({ ...t, kind: 'real' })),
      ...unrealizedPlanned.map(t => ({ ...t, kind: 'plan' })),
    ];
    const shown = allItems.slice(0, 3);
    for (const item of shown) {
      const cls = item.kind === 'real'
        ? (item.type === 'income' ? 'real-income' : 'real-expense')
        : 'plan-pending';
      const sign = item.type === 'income' ? '+' : '−';
      const label = `${sign}${fmtShort(item.amount)} ${dispCat(item.category)}`;
      chips += `<div class="cal-chip ${cls}">${label}</div>`;
    }
    if (allItems.length > 3) chips += `<div class="cal-chip" style="color:var(--text3)">+${allItems.length-3} više</div>`;

    html += `
      <div class="cal-day ${isToday?'today':''} ${isSelected?'selected':''}"
           onclick="selectDay('${day.date}')">
        <div class="cal-day-num">${day.day}</div>
        <div class="cal-day-saldo ${saldoClass}">${fmtShort(saldo)}</div>
        <div class="cal-chips">${chips}</div>
        ${statusClass ? `<div class="cal-day-status ${statusClass}"></div>` : ''}
      </div>`;
  }

  grid.innerHTML = html;
}

function selectDay(dateStr) {
  state.selectedDay = dateStr;
  renderCalGrid(state.calData);
  showDayDetail(dateStr);
}

function showDayDetail(dateStr) {
  const day = state.calData.find(d => d.date === dateStr);
  if (!day) return;

  // Ensure real txs from calData are in state.txs so editTx can find them
  day.real.forEach(t => {
    if (!state.txs.find(x => x.id === t.id)) state.txs.push(t);
  });

  const [y, m, d] = dateStr.split('-');
  const monthName = MONTH_NAMES[parseInt(m)-1];
  $('dayDetailTitle').textContent = `${parseInt(d)}. ${monthName} ${y}`;

  const saldoClass = day.running_real >= 0 ? 'positive' : 'negative';
  let html = `
    <div class="detail-saldo-row">
      <div class="detail-saldo-label">Saldo na kraju dana (realizovano)</div>
      <div class="detail-saldo-val ${saldoClass}">${fmt(day.running_real)}</div>
    </div>
  `;

  if (day.real.length) {
    html += '<div class="detail-section-label">Realizovano</div>';
    html += renderDetailSection(day.real, 'real', `section-real-${dateStr}`, day, dateStr);
  }

  if (day.planned.length) {
    html += '<div class="detail-section-label">Planirano</div>';
    html += renderDetailSection(day.planned, 'planned', `section-planned-${dateStr}`, day, dateStr);
  }

  if (!day.real.length && !day.planned.length) {
    html += '<div class="empty-state" style="padding:20px 0">Nema aktivnosti ovog dana</div>';
  }

  $('dayDetailBody').innerHTML = html;
  $('dayDetail').style.display = 'block';
}

function closeDayDetail() {
  state.selectedDay = null;
  $('dayDetail').style.display = 'none';
  renderCalGrid(state.calData);
}

function renderDetailSection(items, type, sectionId, day, dateStr) {
  const total = items.length;
  const threshold = 3;
  const needsToggle = total > threshold;

  const renderItem = item => {
    if (type === 'real') {
      return `
        <div class="detail-tx-row">
          <div class="detail-tx-dot" style="background:${item.type==='income'?'var(--income-color)':'var(--expense-color)'}"></div>
          <div class="detail-tx-info">
            <div>${dispCat(item.category)}${item.description ? ' · '+item.description : ''}</div>
            <div class="detail-tx-meta">${item.person}</div>
          </div>
          <div class="detail-tx-amount ${item.type}">${item.type==='income'?'+':'−'}${fmt(item.amount)}</div>
          <button class="btn-edit" onclick="editTx(${item.id})">✎</button>
          <button class="tx-delete" onclick="deleteTx(${item.id})">✕</button>
        </div>`;
    } else {
      const isRealized = day.real.some(t => t.category === item.category && t.type === item.type);
      return `
        <div class="detail-tx-row detail-plan-row">
          <div class="detail-tx-dot" style="background:${item.type==='income'?'var(--accent)':'#e88898'}"></div>
          <div class="detail-tx-info">
            <div>${dispCat(item.category)}${item.description ? ' · '+item.description : ''}</div>
            <div class="detail-tx-meta">${item.person} · ${item.recurring ? 'mesečno' : 'jednom'}</div>
          </div>
          <div class="detail-tx-amount" style="color:${item.type==='income'?'var(--accent)':'#e88898'}">${item.type==='income'?'+':'−'}${fmt(item.amount)}</div>
          <button class="btn-edit" onclick="editPlanned(${item.id})">✎</button>
          <button class="tx-delete" onclick="deletePlanned(${item.id})">✕</button>
          ${!isRealized ? `<button class="btn-realize" onclick="realizePlanned('${dateStr}', ${item.id}, ${item.amount}, '${item.category}', '${item.person}', '${item.type}', '${item.description||''}')">Realizuj</button>` : ''}
        </div>`;
    }
  };

  let html = `<div id="${sectionId}" data-expanded="false">`;
  const visible = needsToggle ? items.slice(0, threshold) : items;
  const hidden  = needsToggle ? items.slice(threshold)    : [];

  visible.forEach(item => { html += renderItem(item); });

  if (needsToggle) {
    html += `<div class="section-overflow" style="display:none">`;
    hidden.forEach(item => { html += renderItem(item); });
    html += `</div>`;
    html += `<button class="detail-show-more" onclick="toggleDetailSection('${sectionId}', ${total})">Prikaži sve (${total})</button>`;
  }

  html += `</div>`;
  return html;
}

function toggleDetailSection(sectionId, totalCount) {
  const section = document.getElementById(sectionId);
  if (!section) return;
  const expanded = section.dataset.expanded === 'true';
  const overflow = section.querySelector('.section-overflow');
  const btn = section.querySelector('.detail-show-more');
  overflow.style.display = expanded ? 'none' : 'block';
  section.dataset.expanded = expanded ? 'false' : 'true';
  btn.textContent = expanded ? `Prikaži sve (${totalCount})` : 'Sakrij';
}

async function realizePlanned(dateStr, pid, amount, category, person, type, desc) {
  await api('/api/transactions', {
    method: 'POST',
    body: JSON.stringify({ date: dateStr, type, amount, category, person, description: desc }),
  });
  await loadCalendar();
}

function renderPlannedList(planned) {
  state.allPlanned = planned;
  const container = $('plannedList');
  if (!planned.length) {
    container.innerHTML = '<div class="empty-state">Nema planiranih transakcija. Klikni "+ Planiraj" da dodaš recurring stavke poput kirije, kredita itd.</div>';
    return;
  }
  container.innerHTML = planned.map(p => {
    const whenLabel = p.recurring
      ? `Svaki mesec, ${p.day_of_month}. u mesecu`
      : `Jednom: ${p.specific_date}`;
    return `
    <div class="planned-item">
      <span class="planned-badge ${p.recurring ? 'recurring':'once'}">${p.recurring ? '↻ recurring':'jednom'}</span>
      <div class="planned-info">
        <div class="planned-name">${dispCat(p.category)}${p.description ? ' · '+p.description : ''}</div>
        <div class="planned-meta">${whenLabel} · ${p.person}</div>
      </div>
      <div class="planned-amount ${p.type}">${p.type==='income'?'+':'−'}${fmt(p.amount)}</div>
      <button class="btn-edit" onclick="editPlanned(${p.id})">✎</button>
      <button class="tx-delete" onclick="deletePlanned(${p.id})">✕</button>
    </div>`;
  }).join('');
}

async function deletePlanned(id) {
  if (!confirm('Ukloniti planiranu transakciju?')) return;
  await api('/api/planned/' + id, { method: 'DELETE' });
  loadCalendar();
}

// ── Transactions ───────────────────────────────────────
async function loadTransactions() {
  const person = $('filterPerson').value;
  const txs = await api(`/api/transactions?month=${state.month}&person=${person}`);
  state.txs = txs;
  renderTxList($('txList'), txs);
}

function renderTxList(container, txs) {
  if (!txs.length) {
    container.innerHTML = '<div class="empty-state">Nema transakcija za ovaj period</div>';
    return;
  }
  container.innerHTML = txs.map(tx => `
    <div class="tx-item">
      <div class="tx-dot ${tx.type}"></div>
      <div class="tx-info">
        <div class="tx-cat">${dispCat(tx.category)}${tx.description ? ' · ' + tx.description : ''}</div>
        <div class="tx-meta">${tx.date} · ${tx.person}</div>
      </div>
      <div class="tx-amount ${tx.type}">
        ${tx.type === 'income' ? '+' : '−'}${fmt(tx.amount)}
      </div>
      <button class="btn-edit" onclick="editTx(${tx.id})">✎</button>
      <button class="tx-delete" onclick="deleteTx(${tx.id})">✕</button>
    </div>
  `).join('');
}

async function deleteTx(id) {
  if (!confirm('Obrisati transakciju?')) return;
  await api('/api/transactions/' + id, { method: 'DELETE' });
  loadTransactions();
  loadDashboard();
  const active = document.querySelector('.nav-item.active');
  if (active?.dataset.page === 'calendar') {
    closeDayDetail();
    loadCalendar();
  }
}

$('filterPerson').addEventListener('change', loadTransactions);

// ── Debts ──────────────────────────────────────────────
async function loadDebts() {
  const debts = await api('/api/debts');
  state.allDebts = debts;
  renderDebts(debts.filter(d => d.direction === 'owe'),  $('debtListOwe'),  'owe');
  renderDebts(debts.filter(d => d.direction === 'owed'), $('debtListOwed'), 'owed');
}

function renderDebts(debts, container, dir) {
  if (!debts.length) { container.innerHTML = '<div class="empty-state">Nema dugova</div>'; return; }
  container.innerHTML = debts.map(d => {
    const pct = Math.min((d.paid / d.amount) * 100, 100);
    return `
    <div class="debt-item">
      <div class="debt-top">
        <div class="debt-name">${d.name}${d.note ? ` <span style="color:var(--text3);font-size:11px">· ${d.note}</span>` : ''}</div>
        <div class="debt-amount ${dir}">${fmt(d.amount - d.paid)}</div>
      </div>
      <div class="debt-progress-track">
        <div class="debt-progress-fill" style="width:${pct.toFixed(1)}%"></div>
      </div>
      <div class="debt-meta">
        <div class="debt-meta-text">Plaćeno ${fmt(d.paid)} od ${fmt(d.amount)}</div>
        <div class="debt-actions">
          <button class="btn-small" onclick="markPaid(${d.id}, ${d.amount}, ${d.paid})">Uplati</button>
          <button class="btn-small" onclick="editDebt(${d.id})">Izmeni</button>
          <button class="btn-small danger" onclick="deleteDebt(${d.id})">✕</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

async function markPaid(id, total, paid) {
  const remaining = total - paid;
  const input = prompt(`Koliko uplatiti? (ostalo: ${fmt(remaining)})`, remaining.toString());
  if (!input) return;
  const newPaid = Math.min(paid + parseFloat(input), total);
  await api('/api/debts/' + id, { method: 'PATCH', body: JSON.stringify({ paid: newPaid }) });
  loadDebts();
}

async function deleteDebt(id) {
  if (!confirm('Obrisati dug?')) return;
  await api('/api/debts/' + id, { method: 'DELETE' });
  loadDebts();
}

// ── Budgets ────────────────────────────────────────────
async function loadBudgets() {
  const budgets = await api('/api/budgets?month=' + state.month);
  const container = $('budgetList');
  if (!budgets.length) {
    container.innerHTML = '<div class="panel"><div class="empty-state">Nema postavljenih budžeta za ovaj mesec.</div></div>';
    return;
  }
  container.innerHTML = '<div class="panel">' + budgets.map(b => {
    const pct = Math.min((b.spent / b.limit_amount) * 100, 100);
    const cls = pct >= 100 ? 'over' : pct >= 80 ? 'warning' : '';
    return `
    <div class="budget-item">
      <div class="budget-cat">${b.category}</div>
      <div class="budget-bar-wrap">
        <div class="budget-bar-track">
          <div class="budget-bar-fill ${cls}" style="width:${pct.toFixed(1)}%"></div>
        </div>
        <div class="budget-nums">${fmt(b.spent)} / ${fmt(b.limit_amount)} (${pct.toFixed(0)}%)</div>
      </div>
      <button class="btn-small" onclick="editBudget('${b.category}', ${b.limit_amount})">Izmeni</button>
    </div>`;
  }).join('') + '</div>';
}

// ── Modals ─────────────────────────────────────────────
function openModal(id) { $(id).classList.add('open'); }
function closeModal(id) { $(id).classList.remove('open'); }

function resetModalState(modalId) {
  if (modalId === 'modalTx') {
    state.editingTxId = null;
    document.querySelector('#modalTx .modal-header h2').textContent = 'Nova transakcija';
    $('saveTx').textContent = 'Sačuvaj';
  } else if (modalId === 'modalDebt') {
    state.editingDebtId = null;
    document.querySelector('#modalDebt .modal-header h2').textContent = 'Novi dug';
    $('saveDebt').textContent = 'Sačuvaj';
    $('debtName').disabled = false;
  } else if (modalId === 'modalPlanned') {
    state.editingPlannedId = null;
    document.querySelector('#modalPlanned .modal-header h2').textContent = 'Planirana transakcija';
    $('savePlanned').textContent = 'Sačuvaj plan';
  } else if (modalId === 'modalBudget') {
    $('budgetCat').disabled = false;
    document.querySelector('#modalBudget .modal-header h2').textContent = 'Postavi budžet';
    $('saveBudget').textContent = 'Sačuvaj';
  } else if (modalId === 'modalSavings') {
    state.editingSavingsId = null;
    document.querySelector('#modalSavings .modal-header h2').textContent = 'Nova štednja';
    $('saveSavingsBtn').textContent = 'Kreiraj';
  }
}

document.querySelectorAll('.modal-close[data-close]').forEach(btn => {
  btn.addEventListener('click', () => {
    resetModalState(btn.dataset.close);
    closeModal(btn.dataset.close);
  });
});
document.querySelectorAll('.modal-overlay').forEach(el => {
  el.addEventListener('click', e => {
    if (e.target === el) {
      resetModalState(el.id);
      closeModal(el.id);
    }
  });
});

// ── Transaction modal ──────────────────────────────────
function getActiveTxCategory() {
  return state.txType === 'expense'
    ? $('txCategoryExpense').value
    : $('txCategoryIncome').value;
}

function setActiveTxType(type) {
  state.txType = type;
  document.querySelectorAll('.type-btn[data-type]').forEach(b => {
    b.classList.toggle('active', b.dataset.type === type);
  });
  updateTxModalForType();
}

function updateTxModalForType() {
  const isExpense = state.txType === 'expense';
  $('txCategoryExpense').style.display = isExpense ? 'block' : 'none';
  $('txCategoryIncome').style.display  = isExpense ? 'none'  : 'block';
  $('pozajmicaFields').style.display = 'none';
  $('txDescLabel').textContent = 'Opis (opciono)';
  $('txDesc').placeholder = isExpense ? 'npr. Konzum, DIS...' : '';
}

function updateTxModalForCategory() {
  const cat = getActiveTxCategory();
  const isPoz = (state.txType === 'income' && cat === 'Pozajmica');
  $('pozajmicaFields').style.display = isPoz ? 'block' : 'none';
  if (isPoz) {
    $('txDescLabel').textContent = 'Napomena (opciono)';
    $('txDesc').placeholder = 'npr. za kiriju...';
  } else {
    $('txDescLabel').textContent = 'Opis (opciono)';
    $('txDesc').placeholder = state.txType === 'expense' ? 'npr. Konzum, DIS...' : '';
  }
}

[$('openAddTx'), $('openAddTx2'), $('openAddTxCal')].forEach(btn => {
  btn?.addEventListener('click', () => {
    resetModalState('modalTx');
    $('txDate').value = state.selectedDay || today();
    setActiveTxType('expense');
    openModal('modalTx');
  });
});

document.querySelectorAll('.type-btn[data-type]').forEach(btn => {
  btn.addEventListener('click', () => setActiveTxType(btn.dataset.type));
});

$('txCategoryIncome').addEventListener('change', updateTxModalForCategory);

function editTx(id) {
  const tx = state.txs.find(t => t.id === id);
  if (!tx) return;
  state.editingTxId = id;
  setActiveTxType(tx.type);
  $('txAmount').value = tx.amount;
  $('txDate').value = tx.date;
  $('txDesc').value = tx.description || '';
  $('txPerson').value = tx.person;
  if (tx.type === 'expense') {
    $('txCategoryExpense').value = tx.category;
  } else {
    $('txCategoryIncome').value = tx.category;
    updateTxModalForCategory();
  }
  document.querySelector('#modalTx .modal-header h2').textContent = 'Izmeni transakciju';
  $('saveTx').textContent = 'Ažuriraj';
  openModal('modalTx');
}

$('saveTx').addEventListener('click', async () => {
  const amount = parseFloat($('txAmount').value);
  if (!amount || amount <= 0) return alert('Unesi ispravan iznos');

  const category = getActiveTxCategory();

  if (state.txType === 'income' && category === 'Pozajmica' && !state.editingTxId) {
    const lender = $('txLender').value.trim();
    if (!lender) return alert('Unesi od koga pozajmljuješ');
  }

  const body = {
    type: state.txType,
    amount,
    category,
    person: $('txPerson').value,
    date: $('txDate').value,
    description: $('txDesc').value,
    lender: $('txLender')?.value || '',
  };

  if (state.editingTxId) {
    await api('/api/transactions/' + state.editingTxId, { method: 'PATCH', body: JSON.stringify(body) });
  } else {
    await api('/api/transactions', { method: 'POST', body: JSON.stringify(body) });
  }

  $('txAmount').value = '';
  $('txDesc').value = '';
  $('txLender').value = '';
  resetModalState('modalTx');
  closeModal('modalTx');
  loadDashboard();
  loadTransactions();
  const active = document.querySelector('.nav-item.active');
  if (active?.dataset.page === 'calendar') loadCalendar();
  if (active?.dataset.page === 'debts') loadDebts();
});

// ── Planned modal ──────────────────────────────────────
$('openAddPlanned').addEventListener('click', () => {
  resetModalState('modalPlanned');
  $('plannedDate').value = today();
  setActivePType('expense');
  $('plannedRecurSelect').value = 'once';
  updatePlannedDayInfo();
  openModal('modalPlanned');
});

function updatePlannedModalForType() {
  const isExpense = state.plannedType === 'expense';
  $('plannedCategoryExpense').style.display = isExpense ? 'block' : 'none';
  $('plannedCategoryIncome').style.display  = isExpense ? 'none'  : 'block';
}

function setActivePType(type) {
  state.plannedType = type;
  document.querySelectorAll('.type-btn[data-ptype]').forEach(b => {
    b.classList.toggle('active', b.dataset.ptype === type);
  });
  updatePlannedModalForType();
}

function updatePlannedDayInfo() {
  const val = $('plannedRecurSelect').value;
  const infoEl = $('plannedDayInfo');
  if (val === 'monthly') {
    $('oneTimeFields').style.display   = 'none';
    $('recurringFields').style.display = 'block';
    const day = parseInt($('plannedDay').value) || parseInt((state.selectedDay || today()).split('-')[2]);
    if (infoEl) infoEl.textContent = `Ponavlja se svakog ${day}. u mesecu`;
  } else if (val === 'weekly') {
    // TODO: handle weekly repeat properly in a later task
    $('oneTimeFields').style.display   = 'block';
    $('recurringFields').style.display = 'none';
    if (infoEl) infoEl.textContent = 'Nedeljno (uskoro)';
  } else {
    $('oneTimeFields').style.display   = 'block';
    $('recurringFields').style.display = 'none';
    const dateVal = $('plannedDate').value || state.selectedDay || today();
    if (infoEl) infoEl.textContent = `Jednokratno: ${dateVal}`;
  }
}

document.querySelectorAll('.type-btn[data-ptype]').forEach(btn => {
  btn.addEventListener('click', () => setActivePType(btn.dataset.ptype));
});

$('plannedRecurSelect').addEventListener('change', updatePlannedDayInfo);
$('plannedDate').addEventListener('change', updatePlannedDayInfo);

function editPlanned(id) {
  const p = state.allPlanned.find(x => x.id === id);
  if (!p) return;
  state.editingPlannedId = id;
  setActivePType(p.type);
  $('plannedAmount').value = p.amount;
  $('plannedDesc').value = p.description || '';
  $('plannedPerson').value = p.person;
  if (p.type === 'expense') {
    $('plannedCategoryExpense').value = p.category;
  } else {
    $('plannedCategoryIncome').value = p.category;
  }
  if (p.recurring) {
    $('plannedRecurSelect').value = 'monthly';
    $('plannedDay').value = p.day_of_month || '';
  } else {
    $('plannedRecurSelect').value = 'once';
    $('plannedDate').value = p.specific_date || today();
  }
  updatePlannedDayInfo();
  document.querySelector('#modalPlanned .modal-header h2').textContent = 'Izmeni plan';
  $('savePlanned').textContent = 'Ažuriraj';
  openModal('modalPlanned');
}

$('savePlanned').addEventListener('click', async () => {
  const amount = parseFloat($('plannedAmount').value);
  if (!amount || amount <= 0) return alert('Unesi ispravan iznos');

  const recurVal = $('plannedRecurSelect').value;
  const body = {
    type: state.plannedType,
    amount,
    category: state.plannedType === 'expense'
      ? $('plannedCategoryExpense').value
      : $('plannedCategoryIncome').value,
    description: $('plannedDesc').value,
    person: $('plannedPerson').value,
    recurring: recurVal === 'monthly' ? 1 : 0,
  };

  if (recurVal === 'monthly') {
    const dom = parseInt($('plannedDay').value);
    if (!dom || dom < 1 || dom > 31) return alert('Unesi dan u mesecu (1-31)');
    body.day_of_month = dom;
  } else {
    body.specific_date = $('plannedDate').value;
  }

  if (state.editingPlannedId) {
    await api('/api/planned/' + state.editingPlannedId, { method: 'PATCH', body: JSON.stringify(body) });
  } else {
    await api('/api/planned', { method: 'POST', body: JSON.stringify(body) });
  }

  $('plannedAmount').value = ''; $('plannedDesc').value = ''; $('plannedDay').value = '';
  resetModalState('modalPlanned');
  closeModal('modalPlanned');
  loadCalendar();
});

// ── Debt modal ─────────────────────────────────────────
$('openAddDebt').addEventListener('click', () => {
  resetModalState('modalDebt');
  setActiveDebtDir('owe');
  openModal('modalDebt');
});

function setActiveDebtDir(dir) {
  state.debtDir = dir;
  document.querySelectorAll('.type-btn[data-dir]').forEach(b => {
    b.classList.toggle('active', b.dataset.dir === dir);
  });
}

document.querySelectorAll('.type-btn[data-dir]').forEach(btn => {
  btn.addEventListener('click', () => setActiveDebtDir(btn.dataset.dir));
});

function editDebt(id) {
  const d = state.allDebts.find(x => x.id === id);
  if (!d) return;
  state.editingDebtId = id;
  setActiveDebtDir(d.direction);
  $('debtName').value = d.name;
  $('debtAmount').value = d.amount;
  $('debtPaid').value = d.paid;
  $('debtNote').value = d.note || '';
  document.querySelector('#modalDebt .modal-header h2').textContent = 'Izmeni dug';
  $('saveDebt').textContent = 'Ažuriraj';
  openModal('modalDebt');
}

$('saveDebt').addEventListener('click', async () => {
  const name = $('debtName').value.trim();
  const amount = parseFloat($('debtAmount').value);
  if (!name) return alert('Unesi ime');
  if (!amount || amount <= 0) return alert('Unesi ispravan iznos');

  const body = {
    name,
    amount,
    paid: parseFloat($('debtPaid').value) || 0,
    note: $('debtNote').value,
    direction: state.debtDir,
  };

  if (state.editingDebtId) {
    await api('/api/debts/' + state.editingDebtId, { method: 'PUT', body: JSON.stringify(body) });
  } else {
    await api('/api/debts', { method: 'POST', body: JSON.stringify(body) });
  }

  $('debtName').value = ''; $('debtAmount').value = ''; $('debtPaid').value = '0'; $('debtNote').value = '';
  resetModalState('modalDebt');
  closeModal('modalDebt');
  loadDebts();
});

// ── Budget modal ───────────────────────────────────────
$('openAddBudget').addEventListener('click', () => {
  resetModalState('modalBudget');
  openModal('modalBudget');
});

function editBudget(category, limitAmount) {
  $('budgetCat').value = category;
  $('budgetCat').disabled = true;
  $('budgetLimit').value = limitAmount;
  document.querySelector('#modalBudget .modal-header h2').textContent = 'Izmeni budžet';
  $('saveBudget').textContent = 'Ažuriraj';
  openModal('modalBudget');
}

$('saveBudget').addEventListener('click', async () => {
  const limit = parseFloat($('budgetLimit').value);
  if (!limit || limit <= 0) return alert('Unesi ispravan limit');
  await api('/api/budgets', {
    method: 'POST',
    body: JSON.stringify({ category: $('budgetCat').value, month: state.month, limit_amount: limit }),
  });
  $('budgetLimit').value = '';
  resetModalState('modalBudget');
  closeModal('modalBudget');
  loadBudgets();
});

// ── Savings ───────────────────────────────────────────
let _allSavings = [];

async function loadSavings() {
  _allSavings = await api('/api/savings');
  renderSavings(_allSavings);
  _applySavingsCategories(_allSavings);
}

function _applySavingsCategories(savings) {
  const names = savings.map(s => s.name);

  // Keep base EXPENSE_CATEGORIES (strip any previously appended savings names)
  if (!window._BASE_EXPENSE_CATEGORIES) {
    window._BASE_EXPENSE_CATEGORIES = [...window.EXPENSE_CATEGORIES];
  }
  window.EXPENSE_CATEGORIES = [...window._BASE_EXPENSE_CATEGORIES, ...names];

  // Update the category selects in the TX and Planned modals
  ['txCategoryExpense', 'plannedCategoryExpense'].forEach(selId => {
    const sel = $(selId);
    if (!sel) return;
    const old = sel.querySelector('optgroup[data-savings]');
    if (old) old.remove();
    if (!names.length) return;
    const grp = document.createElement('optgroup');
    grp.label = 'Štednja';
    grp.dataset.savings = 'true';
    names.forEach(name => {
      const o = document.createElement('option');
      o.value = 'savings:' + name;
      o.textContent = name;
      grp.appendChild(o);
    });
    sel.appendChild(grp);
  });
}

function renderSavings(savings) {
  const container = $('savingsList');
  if (!container) return;
  if (!savings.length) {
    container.innerHTML = '<div class="empty-state" style="padding:48px 0">Nema ciljeva štednje. Klikni "+ Nova štednja" da dodaš prvi cilj.</div>';
    return;
  }
  container.innerHTML = savings.map(s => {
    const pct    = s.progress_percent;
    const color  = pct >= 75 ? 's-green' : pct >= 25 ? 's-yellow' : 's-red';
    const dLeft  = s.days_left;
    const meta   = [
      s.target_date ? `Do: ${s.target_date}` : '',
      dLeft !== null ? `Preostalo: ${dLeft >= 0 ? dLeft + ' dana' : 'prošao rok'}` : '',
    ].filter(Boolean).join(' · ');
    return `
    <div class="savings-card">
      <div class="savings-card-top">
        <div class="savings-name">${s.name}</div>
        <div class="savings-person">${s.person}</div>
      </div>
      <div class="savings-bar-track">
        <div class="savings-bar-fill ${color}" style="width:${pct.toFixed(1)}%"></div>
      </div>
      <div class="savings-amounts">
        <span>${fmt(s.current_amount)} / ${fmt(s.target_amount)} RSD</span>
        <span class="savings-pct">${pct.toFixed(1)}%</span>
      </div>
      ${meta ? `<div class="savings-meta">${meta}</div>` : ''}
      <div class="savings-actions">
        <button class="btn-small" onclick="editSavings(${s.id})">Izmeni</button>
        <button class="btn-small danger" onclick="deleteSavings(${s.id})">Obriši</button>
      </div>
    </div>`;
  }).join('');
}

$('openAddSavings').addEventListener('click', () => {
  resetModalState('modalSavings');
  $('savingsName').value   = '';
  $('savingsTarget').value = '';
  $('savingsDate').value   = '';
  $('savingsPerson').value = 'Đorđe';
  openModal('modalSavings');
});

function editSavings(id) {
  const s = _allSavings.find(x => x.id === id);
  if (!s) return;
  state.editingSavingsId = id;
  $('savingsName').value   = s.name;
  $('savingsTarget').value = s.target_amount;
  $('savingsDate').value   = s.target_date || '';
  $('savingsPerson').value = s.person;
  document.querySelector('#modalSavings .modal-header h2').textContent = 'Izmeni štednju';
  $('saveSavingsBtn').textContent = 'Ažuriraj';
  openModal('modalSavings');
}

async function deleteSavings(id) {
  if (!confirm('Obrisati cilj štednje?')) return;
  await api('/api/savings/' + id, { method: 'DELETE' });
  loadSavings();
}

$('saveSavingsBtn').addEventListener('click', async () => {
  const name   = $('savingsName').value.trim();
  const target = parseFloat($('savingsTarget').value);
  if (!name)              return alert('Unesi naziv štednje');
  if (!target || target <= 0) return alert('Unesi ciljni iznos');

  const body = {
    name,
    target_amount: target,
    target_date:   $('savingsDate').value || null,
    person:        $('savingsPerson').value,
  };

  if (state.editingSavingsId) {
    await api('/api/savings/' + state.editingSavingsId, { method: 'PATCH', body: JSON.stringify(body) });
  } else {
    await api('/api/savings', { method: 'POST', body: JSON.stringify(body) });
  }

  resetModalState('modalSavings');
  closeModal('modalSavings');
  loadSavings();
});

// ── Toast ──────────────────────────────────────────────
let _toastTimer = null;
function showToast(msg, duration = 2800) {
  let el = $('appToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'appToast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), duration);
}

// ── Internal Transfer ──────────────────────────────────
function openTransferModal() {
  $('transferAmount').value = '';
  $('transferError').style.display = 'none';
  $('transferFrom').value = 'Đorđe';
  $('transferTo').value   = 'Milica';
  openModal('internalTransferModal');
}

// Keep From/To mutually exclusive
$('transferFrom').addEventListener('change', () => {
  const from = $('transferFrom').value;
  $('transferTo').value = (from === 'Đorđe') ? 'Milica' : 'Đorđe';
});
$('transferTo').addEventListener('change', () => {
  const to = $('transferTo').value;
  $('transferFrom').value = (to === 'Đorđe') ? 'Milica' : 'Đorđe';
});

[$('openTransferBtn'), $('openTransferBtnCal')].forEach(btn =>
  btn?.addEventListener('click', openTransferModal)
);

$('transferCancelBtn').addEventListener('click', () => closeModal('internalTransferModal'));

$('transferSubmitBtn').addEventListener('click', executeTransfer);

async function executeTransfer() {
  const from   = $('transferFrom').value;
  const to     = $('transferTo').value;
  const amount = parseFloat($('transferAmount').value);
  const errEl  = $('transferError');

  errEl.style.display = 'none';

  if (from === to) {
    errEl.textContent = 'Pošiljalac i primalac ne mogu biti ista osoba.';
    errEl.style.display = 'block';
    return;
  }
  if (!amount || amount <= 0) {
    errEl.textContent = 'Unesi ispravan iznos.';
    errEl.style.display = 'block';
    return;
  }

  const btn = $('transferSubmitBtn');
  btn.textContent = 'Čuva...';
  btn.disabled = true;

  try {
    const resp = await fetch('/api/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from_person: from, to_person: to, amount }),
    });
    const data = await resp.json();

    if (data.ok) {
      closeModal('internalTransferModal');
      showToast('Transfer uspešan ✓');
      loadDashboard();
      loadTransactions();
      const active = document.querySelector('.nav-item.active');
      if (active?.dataset.page === 'calendar') loadCalendar();
    } else {
      errEl.textContent = data.error || 'Greška pri transferu.';
      errEl.style.display = 'block';
    }
  } catch (err) {
    errEl.textContent = 'Greška: ' + err.message;
    errEl.style.display = 'block';
  } finally {
    btn.textContent = 'Prebaci';
    btn.disabled = false;
  }
}

// ── Mobile sidebar ─────────────────────────────────────
(function initMobileNav() {
  const sidebar        = $('sidebar');
  const overlay        = $('sidebarOverlay');
  const hamburger      = $('hamburgerBtn');
  const mobileMonthEl  = $('mobileMonth');

  function openSidebar() {
    sidebar?.classList.add('mobile-open');
    overlay?.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeSidebar() {
    sidebar?.classList.remove('mobile-open');
    overlay?.classList.remove('open');
    document.body.style.overflow = '';
  }

  hamburger?.addEventListener('click', openSidebar);
  overlay?.addEventListener('click', closeSidebar);

  // Close sidebar when a nav item is tapped on mobile
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => {
      if (window.innerWidth <= 599) closeSidebar();
    });
  });

  // Mobile month picker — init value and wire change
  if (mobileMonthEl) {
    mobileMonthEl.value = state.month;
    mobileMonthEl.addEventListener('change', e => {
      state.month = e.target.value;
      $('globalMonth').value = e.target.value;
      state.selectedDay = null;
      const active = document.querySelector('.nav-item.active');
      if (active) refreshPage(active.dataset.page);
    });
  }
})();

// ── Init ───────────────────────────────────────────────
if ($('dashFrom')) $('dashFrom').value = state.month + '-01';
if ($('dashTo'))   $('dashTo').value   = today();
loadDashboard();
// Populate savings categories in TX modal even before the savings tab is visited
api('/api/savings').then(savings => {
  _allSavings = savings;
  _applySavingsCategories(savings);
});

// ── Default person from logged-in user ─────────────────
if (window.PERSON_NAME) {
  const txPerson = $('txPerson');
  if (txPerson) {
    [...txPerson.options].forEach(o => { o.selected = o.value === window.PERSON_NAME; });
  }
}

// ── Admin ───────────────────────────────────────────────
async function loadAdmin() {
  const [cats, users] = await Promise.all([
    api('/api/admin/categories'),
    api('/api/admin/users'),
  ]);
  renderAdminCategories(cats);
  renderAdminUsers(users);
}

function renderAdminCategories(cats) {
  const el = $('adminCatList');
  if (!el) return;
  if (!cats.length) { el.innerHTML = '<p style="color:#8FA3B8;font-size:12px;">Nema kategorija.</p>'; return; }
  el.innerHTML = cats.map(c => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid #EEF2F7;">
      <span style="font-size:12px;">${c.name}
        <span style="color:#8FA3B8;margin-left:6px;">${c.type === 'expense' ? 'Rashod' : 'Prihod'}</span>
      </span>
      <button class="btn-small" style="color:#C0392B;border-color:#C0392B;" onclick="adminDeleteCategory(${c.id})">✕</button>
    </div>`).join('');
}

function renderAdminUsers(users) {
  const el = $('adminUserList');
  if (!el) return;
  if (!users.length) { el.innerHTML = '<p style="color:#8FA3B8;font-size:12px;">Nema korisnika.</p>'; return; }
  el.innerHTML = users.filter(u => u.active).map(u => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid #EEF2F7;">
      <span style="font-size:12px;">${u.username}
        ${u.person_name ? `<span style="color:#4E8EA2;margin-left:4px;">(${u.person_name})</span>` : ''}
        <span style="color:#8FA3B8;margin-left:6px;">${u.role}</span>
      </span>
      <button class="btn-small" style="color:#C0392B;border-color:#C0392B;" onclick="adminDeleteUser(${u.id})">✕</button>
    </div>`).join('');
}

async function adminDeleteCategory(id) {
  if (!confirm('Obriši kategoriju?')) return;
  await api('/api/admin/categories/' + id, { method: 'DELETE' });
  loadAdmin();
}

async function adminDeleteUser(id) {
  if (!confirm('Deaktivirati korisnika?')) return;
  await api('/api/admin/users/' + id, { method: 'DELETE' });
  loadAdmin();
}

if ($('adminCatForm')) {
  $('adminCatForm').addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('adminCatName').value.trim();
    const type = $('adminCatType').value;
    if (!name) return;
    const res = await api('/api/admin/categories', { method: 'POST', body: JSON.stringify({ name, type }) });
    if (res.error) { alert(res.error); return; }
    $('adminCatName').value = '';
    loadAdmin();
  });
}

if ($('adminUserForm')) {
  $('adminUserForm').addEventListener('submit', async e => {
    e.preventDefault();
    const body = {
      username:    $('adminUserName').value.trim(),
      password:    $('adminUserPass').value,
      person_name: $('adminUserPerson').value.trim(),
      role:        $('adminUserRole').value,
    };
    if (!body.username || !body.password) { alert('Korisničko ime i lozinka su obavezni.'); return; }
    const res = await api('/api/admin/users', { method: 'POST', body: JSON.stringify(body) });
    if (res.error) { alert(res.error); return; }
    $('adminUserName').value = '';
    $('adminUserPass').value = '';
    $('adminUserPerson').value = '';
    loadAdmin();
  });
}
