// ── Import page ────────────────────────────────────────────────────────────────

let _importParsed = [];
let _importInited = false;
let selectedPerson = 'Đorđe';
let selectedBank   = 'raiffeisen_rsd';

function initImportPage() {
  if (_importInited) return;
  _importInited = true;

  const zone      = $('importDropzone');
  const fileInput = $('importFileInput');
  const parseBtn  = $('importParseBtn');

  // Build person + bank selectors, inserted before the parse button
  const selectorRow = document.createElement('div');
  selectorRow.id = 'importSelectorRow';
  selectorRow.style.cssText = 'display:none;margin-top:16px;gap:12px;flex-direction:row;align-items:center;';

  const personLabel = document.createElement('label');
  personLabel.style.cssText = 'font-size:13px;color:var(--text2);display:flex;flex-direction:column;gap:4px;';
  personLabel.textContent = 'Osoba';
  const personSel = document.createElement('select');
  personSel.id = 'importPersonSel';
  personSel.className = 'form-select';
  ['Đorđe', 'Milica'].forEach(name => {
    const o = document.createElement('option');
    o.value = o.textContent = name;
    personSel.appendChild(o);
  });
  personSel.value = selectedPerson;
  personSel.addEventListener('change', () => { selectedPerson = personSel.value; });
  personLabel.appendChild(personSel);

  const bankLabel = document.createElement('label');
  bankLabel.style.cssText = 'font-size:13px;color:var(--text2);display:flex;flex-direction:column;gap:4px;';
  bankLabel.textContent = 'Banka';
  const bankSel = document.createElement('select');
  bankSel.id = 'importBankSel';
  bankSel.className = 'form-select';
  [
    { value: 'raiffeisen_rsd', label: 'Raiffeisen RSD' },
    { value: 'intesa',         label: 'Intesa banka'   },
  ].forEach(({ value, label }) => {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = label;
    bankSel.appendChild(o);
  });
  bankSel.addEventListener('change', () => { selectedBank = bankSel.value; });
  bankLabel.appendChild(bankSel);

  selectorRow.appendChild(personLabel);
  selectorRow.appendChild(bankLabel);
  parseBtn.parentNode.insertBefore(selectorRow, parseBtn);

  zone.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', () => {
    const f = fileInput.files[0];
    if (!f) return;
    $('importDropzoneText').textContent = f.name;
    selectorRow.style.display = 'flex';
    parseBtn.style.display = 'inline-block';
  });

  zone.addEventListener('dragover', e => {
    e.preventDefault();
    zone.classList.add('dragover');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    const f = e.dataTransfer.files[0];
    if (!f) return;
    try {
      const dt = new DataTransfer();
      dt.items.add(f);
      fileInput.files = dt.files;
    } catch (_) {}
    $('importDropzoneText').textContent = f.name;
    selectorRow.style.display = 'flex';
    parseBtn.style.display = 'inline-block';
  });

  parseBtn.addEventListener('click', runParse);

  $('importCheckAll').addEventListener('change', e => {
    document.querySelectorAll('.imp-chk').forEach(cb => { cb.checked = e.target.checked; });
    updateImportBtn();
  });

  $('importSaveBtn').addEventListener('click', runSave);
}

async function runParse() {
  const file = $('importFileInput').files[0];
  if (!file) return;

  const btn = $('importParseBtn');
  btn.textContent = 'Analizira...';
  btn.disabled = true;

  try {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('person', selectedPerson);
    fd.append('bank', selectedBank);
    const resp = await fetch('/api/import/parse', { method: 'POST', body: fd });
    const data = await resp.json();

    if (data.error) { alert('Greška: ' + data.error); return; }

    _importParsed = data;
    renderImportTable(data);
    $('importResults').style.display = 'block';
    $('importSuccess').style.display = 'none';
    updateImportBtn();
  } catch (err) {
    alert('Greška pri parsiranju: ' + err.message);
  } finally {
    btn.textContent = 'Analiziraj izvod';
    btn.disabled = false;
  }
}

function buildCatOptions(selected) {
  const exp = window.EXPENSE_CATEGORIES || [];
  const inc = window.INCOME_CATEGORIES  || [];
  let html = '<optgroup label="Rashodi">';
  exp.forEach(c => { html += `<option${c === selected ? ' selected' : ''}>${c}</option>`; });
  html += '</optgroup><optgroup label="Prihodi">';
  inc.forEach(c => { html += `<option${c === selected ? ' selected' : ''}>${c}</option>`; });
  html += '</optgroup>';
  return html;
}

function renderImportTable(txs) {
  const tbody = $('importTbody');

  if (!txs.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state" style="padding:28px 0">Nisu pronađene transakcije u PDF fajlu</td></tr>';
    return;
  }

  tbody.innerHTML = txs.map((tx, i) => `
    <tr>
      <td><input type="checkbox" class="imp-chk" data-idx="${i}" checked></td>
      <td>${tx.date}</td>
      <td class="imp-desc">${tx.description || '—'}</td>
      <td class="tx-amount ${tx.type}" style="font-size:13px">${tx.type === 'income' ? '+' : '−'}${fmt(tx.amount)}</td>
      <td style="color:${tx.type === 'income' ? '#1A7A4A' : '#C0392B'};font-size:11px">
        ${tx.type === 'income' ? 'Prihod' : 'Rashod'}
      </td>
      <td><select class="imp-cat" data-idx="${i}">${buildCatOptions(tx.category)}</select></td>
      <td style="color:var(--text3)">${tx.person}</td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.imp-chk').forEach(cb =>
    cb.addEventListener('change', updateImportBtn)
  );
  tbody.querySelectorAll('.imp-cat').forEach(sel =>
    sel.addEventListener('change', e => {
      _importParsed[+e.target.dataset.idx].category = e.target.value;
    })
  );
}

function updateImportBtn() {
  const checked = document.querySelectorAll('.imp-chk:checked').length;
  const total   = document.querySelectorAll('.imp-chk').length;
  const btn     = $('importSaveBtn');
  btn.textContent = `Uvezi označene (${checked})`;
  btn.disabled    = checked === 0;

  const checkAll = $('importCheckAll');
  if (checkAll) {
    checkAll.checked       = checked === total && total > 0;
    checkAll.indeterminate = checked > 0 && checked < total;
  }
}

async function runSave() {
  const checks = document.querySelectorAll('.imp-chk:checked');
  const toSave = Array.from(checks).map(cb => {
    const idx = +cb.dataset.idx;
    const sel = document.querySelector(`.imp-cat[data-idx="${idx}"]`);
    return { ..._importParsed[idx], category: sel ? sel.value : _importParsed[idx].category };
  });
  if (!toSave.length) return;

  const btn = $('importSaveBtn');
  btn.textContent = 'Čuva...';
  btn.disabled = true;

  try {
    const resp = await fetch('/api/import/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toSave),
    });
    const data = await resp.json();

    if (data.ok) {
      $('importResults').style.display = 'none';
      $('importSuccess').style.display = 'block';
      $('importSuccessCount').textContent = `Uvezeno ${data.count} transakcija.`;
    } else {
      alert('Greška pri čuvanju');
      btn.disabled = false;
    }
  } catch (err) {
    alert('Greška: ' + err.message);
    btn.disabled = false;
  }
}

function goToCalendar() {
  document.querySelector('.nav-item[data-page="calendar"]')?.click();
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelector('.nav-item[data-page="import"]')
    ?.addEventListener('click', initImportPage);
});
