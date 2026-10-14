'use strict';

const OIL_TYPES = ['G95', 'G91', 'E20', 'G95 Premium'];
const KEYS = { setup: 'fl.setup', rows: 'fl.rows', pending: 'fl.pending', range: 'fl.range', demo: 'fl.demoRows' };
const PAGE_SIZE = 20;

// ข้อมูลตัวอย่าง (ใช้ตอนยังไม่ได้เชื่อม Sheet)
const DEMO_ROWS = [
  ['2024-09-28', 'G95', 35.25, 1180, 45], ['2024-10-09', 'G95', 35.65, 820, 260],
  ['2024-10-19', 'E20', 33.39, 830, 620], ['2024-10-27', 'E20', 33.69, 750, 881],
  ['2024-11-10', 'G95', 49.89, 1000, 1109], ['2024-11-23', 'G95', 35.95, 890, 1397],
  ['2024-11-30', 'G95', 36.35, 1010, 1855], ['2024-12-13', 'G95', 36.20, 825, 2166],
  ['2024-12-15', 'G95', 36.43, 1000, 2599], ['2024-12-30', 'G95', 36.42, 950, 3026],
  ['2025-01-10', 'G95', 36.16, 1020, 3501], ['2025-01-22', 'E20', 33.54, 900, 3904],
  ['2025-02-01', 'G95', 35.96, 1000, 4363], ['2025-02-06', 'E20', 33.40, 730, 4729],
  ['2025-02-08', 'E20', 33.40, 1000, 5222], ['2025-02-14', 'G95', 35.40, 950, 5706],
  ['2025-02-23', 'E20', 33.61, 850, 6153], ['2025-03-15', 'G95', 34.70, 940, 6513],
  ['2025-03-19', 'G95', 34.80, 950, 6930], ['2025-03-30', 'G95', 34.37, 940, 7366],
  ['2025-04-04', 'G95', 33.86, 920, 7809], ['2025-04-11', 'G95', 33.20, 860, 8160],
].map(([date, type, oilPrice, price, mileage]) => ({ date, type, oilPrice, price, mileage, liters: null }));

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  },
  del(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } },
};

const state = {
  setup: store.get(KEYS.setup, null),
  rows: [],
  pending: store.get(KEYS.pending, []),
  range: store.get(KEYS.range, 'all'),
  shown: PAGE_SIZE,
  loading: false,
};
state.rows = state.setup ? store.get(KEYS.rows, []) : store.get(KEYS.demo, DEMO_ROWS);

/* ---------- utils ---------- */
const num = (s) => {
  const n = parseFloat(String(s ?? '').replace(/[,\s฿]/g, ''));
  return Number.isFinite(n) ? n : NaN;
};
const fmt = (n, d = 2) => Number.isFinite(n) ? n.toLocaleString('th-TH', { minimumFractionDigits: d, maximumFractionDigits: d }) : '–';
const fmtInt = (n) => Number.isFinite(n) ? Math.round(n).toLocaleString('th-TH') : '–';
const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
function parseDate(s) {
  if (!s) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return new Date(+m[1], m[2] - 1, +m[3]);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s); // d/m/yyyy
  if (m) return new Date(+m[3], m[2] - 1, +m[1]);
  // Date.toString() จาก Apps Script เช่น "Sat Sep 28 2024 14:00:00 GMT+0700 (…)"
  m = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2}) (\d{4})\b/.exec(s);
  if (m) return new Date(+m[3], 'JanFebMarAprMayJunJulAugSepOctNovDec'.indexOf(m[1]) / 3, +m[2]);
  const d = new Date(s);
  return isNaN(d) ? null : d;
}
const fmtDate = (d) => d ? `${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${String(d.getFullYear() + 543).slice(-2)}` : '–';
const isoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(msg, ms = 2600) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.hidden = true; }, ms);
}

/* ---------- data ---------- */
// รวมแถวจาก Sheet + แถวที่ยังรอส่ง แล้วคำนวณอัตรากินน้ำมันแบบเดียวกับสูตรใน Sheet:
// rate(n) = (Mileage(n+1) - Mileage(n)) / Liters(n+1)
function entries() {
  const all = [
    ...state.rows.map((r) => ({ ...r, pending: false })),
    ...(state.setup ? state.pending.map((r) => ({ ...r, pending: true })) : []),
  ].map((r) => ({
    ...r,
    d: parseDate(r.date),
    liters: Number.isFinite(r.liters) && r.liters > 0 ? r.liters : r.price / r.oilPrice,
  })).filter((r) => Number.isFinite(r.mileage));
  all.sort((a, b) => a.mileage - b.mileage);
  all.forEach((r, i) => {
    const next = all[i + 1];
    r.rate = next && next.liters > 0 ? (next.mileage - r.mileage) / next.liters : null;
  });
  return all;
}

function apiBase() {
  return state.setup ? state.setup.url : null;
}

async function apiGet() {
  const res = await fetch(`${apiBase()}?k=${encodeURIComponent(state.setup.k)}`, { cache: 'no-store' });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.rows;
}

async function apiPost(entry) {
  const res = await fetch(apiBase(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // text/plain เพื่อเลี่ยง CORS preflight
    body: JSON.stringify({ ...entry, k: state.setup.k }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.rows;
}

async function sync({ quiet = false } = {}) {
  if (!state.setup || state.loading) return;
  state.loading = true;
  $('#refreshBtn').classList.add('spinning');
  try {
    // ส่งรายการที่ค้างอยู่ก่อน
    while (state.pending.length) {
      const rows = await apiPost(state.pending[0]);
      state.pending.shift();
      store.set(KEYS.pending, state.pending);
      state.rows = rows;
    }
    state.rows = await apiGet();
    store.set(KEYS.rows, state.rows);
    if (!quiet) toast('อัปเดตข้อมูลแล้ว');
  } catch (err) {
    console.error(err);
    const offline = !navigator.onLine;
    toast(err.message === 'unauthorized' ? 'Token ไม่ถูกต้อง ตรวจสอบ Setup code อีกครั้ง'
      : offline ? 'ออฟไลน์อยู่ จะส่งข้อมูลเมื่อกลับมาออนไลน์' : 'เชื่อมต่อ Sheet ไม่สำเร็จ ลองใหม่อีกครั้ง', 3500);
  } finally {
    state.loading = false;
    $('#refreshBtn').classList.remove('spinning');
    render();
  }
}

/* ---------- render ---------- */
function render() {
  const list = entries();
  renderBanner();
  renderStats(list);
  renderChart(list);
  renderHistory(list);
}

function renderBanner() {
  const el = $('#banner');
  if (!state.setup) {
    el.innerHTML = 'โหมดตัวอย่าง: ข้อมูลยังไม่ได้เชื่อมกับ Google Sheet <button data-open="settings">ตั้งค่าการเชื่อมต่อ</button>';
    el.hidden = false;
  } else if (state.pending.length) {
    el.innerHTML = `มี ${state.pending.length} รายการรอส่งขึ้น Sheet <button id="retryBtn">ส่งเลย</button>`;
    el.hidden = false;
  } else {
    el.hidden = true;
  }
}

function inRange(list) {
  const withRate = list.filter((r) => r.rate != null && Number.isFinite(r.rate));
  if (state.range === '10') return withRate.slice(-10);
  if (state.range === '365') {
    const cutoff = Date.now() - 365 * 864e5;
    return withRate.filter((r) => r.d && r.d.getTime() >= cutoff);
  }
  return withRate;
}

// ค่าเฉลี่ยแบบถ่วงน้ำหนัก = ระยะทางรวม / ลิตรรวม ของช่วงที่เลือก
function average(list, pts) {
  let dist = 0, liters = 0;
  for (let i = 0; i < list.length - 1; i++) {
    if (pts.includes(list[i])) {
      dist += list[i + 1].mileage - list[i].mileage;
      liters += list[i + 1].liters;
    }
  }
  return liters ? dist / liters : null;
}

function renderStats(list) {
  const pts = inRange(list);
  const avg = average(list, pts);
  $('#statAvg').textContent = avg ? fmt(avg) : '–';
  const last = pts[pts.length - 1];
  $('#statLast').textContent = last ? fmt(last.rate) : '–';
  const now = new Date();
  const month = list.filter((r) => r.d && r.d.getMonth() === now.getMonth() && r.d.getFullYear() === now.getFullYear())
    .reduce((s, r) => s + r.price, 0);
  $('#statMonth').textContent = fmtInt(month);
}

function niceStep(v) {
  return v > 40 ? 10 : v > 10 ? 5 : v > 5 ? 2 : 1;
}

function renderChart(list) {
  const el = $('#chart');
  const pts = inRange(list);
  const W = el.clientWidth || 320, H = el.clientHeight || 240;
  const pad = { l: 34, r: 10, t: 34, b: 26 };
  const avg = average(list, pts);

  $$('#rangeSeg button').forEach((b) => b.classList.toggle('active', b.dataset.range === state.range));

  if (pts.length < 2) {
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}"><text class="empty" x="${W / 2}" y="${H / 2}" text-anchor="middle">ต้องมีข้อมูลอย่างน้อย 3 ครั้งเพื่อแสดงกราฟ</text></svg>`;
    return;
  }

  const xs = pts.map((p) => p.mileage), ys = pts.map((p) => p.rate);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yStep = niceStep(Math.max(...ys));
  const yMin = 0, yMax = Math.ceil((Math.max(...ys) * 1.03) / yStep) * yStep;
  const X = (v) => pad.l + ((v - xMin) / (xMax - xMin || 1)) * (W - pad.l - pad.r);
  const Y = (v) => pad.t + (1 - (v - yMin) / (yMax - yMin)) * (H - pad.t - pad.b);

  let grid = '';
  for (let v = yMin; v <= yMax; v += yStep) {
    grid += `<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${Y(v)}" y2="${Y(v)}"/>`
      + `<text class="axis-label" x="${pad.l - 6}" y="${Y(v) + 4}" text-anchor="end">${+v.toFixed(1)}</text>`;
  }
  const xTicks = Math.min(4, pts.length - 1);
  for (let i = 0; i <= xTicks; i++) {
    const v = xMin + ((xMax - xMin) * i) / xTicks;
    const anchor = i === 0 ? 'start' : i === xTicks ? 'end' : 'middle';
    grid += `<text class="axis-label" x="${X(v)}" y="${H - 6}" text-anchor="${anchor}">${fmtInt(v)}</text>`;
  }

  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.mileage).toFixed(1)},${Y(p.rate).toFixed(1)}`).join('');
  const area = `${line}L${X(xMax)},${Y(0)}L${X(xMin)},${Y(0)}Z`;
  const showDots = pts.length <= 40;
  const dots = showDots ? pts.map((p) => `<circle class="dot" cx="${X(p.mileage)}" cy="${Y(p.rate)}" r="3.5"/>`).join('') : '';
  const avgLine = avg ? `<line class="avg" x1="${pad.l}" x2="${W - pad.r}" y1="${Y(avg)}" y2="${Y(avg)}"/>` : '';

  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="กราฟอัตรากินน้ำมัน">
      ${grid}${avgLine}<path class="area" d="${area}"/><path class="line" d="${line}"/>${dots}
      <line class="cursor" y1="${pad.t}" y2="${H - pad.b}" visibility="hidden"/>
      <circle class="dot active" r="5" visibility="hidden"/>
    </svg><div class="tooltip" hidden></div>`;

  const svg = $('svg', el), tip = $('.tooltip', el);
  const cursor = $('.cursor', svg), marker = $('.dot.active', svg);
  const pick = (clientX) => {
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * W;
    let best = pts[0];
    for (const p of pts) if (Math.abs(X(p.mileage) - x) < Math.abs(X(best.mileage) - x)) best = p;
    const cx = X(best.mileage), cy = Y(best.rate);
    cursor.setAttribute('x1', cx); cursor.setAttribute('x2', cx); cursor.setAttribute('visibility', 'visible');
    marker.setAttribute('cx', cx); marker.setAttribute('cy', cy); marker.setAttribute('visibility', 'visible');
    tip.innerHTML = `<b>${fmt(best.rate)}</b> กม./ล. · ${esc(best.type)}<br>${fmtDate(best.d)} · ${fmtInt(best.mileage)} กม.`;
    tip.hidden = false;
    const px = (cx / W) * rect.width;
    const half = tip.offsetWidth / 2;
    tip.style.left = `${Math.min(Math.max(px, half), rect.width - half)}px`;
  };
  const hide = () => { tip.hidden = true; cursor.setAttribute('visibility', 'hidden'); marker.setAttribute('visibility', 'hidden'); };
  svg.addEventListener('pointerdown', (e) => pick(e.clientX));
  svg.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'mouse') pick(e.clientX); });
  svg.addEventListener('pointerleave', hide);
}

function renderHistory(list) {
  const items = [...list].reverse();
  const shown = items.slice(0, state.shown);
  $('#history').innerHTML = shown.map((r) => `
    <li>
      <div class="h-main">${fmtDate(r.d)}<span class="badge">${esc(r.type)}</span>${r.pending ? '<span class="badge pending">รอส่ง</span>' : ''}</div>
      <div class="h-rate">${r.rate != null ? fmt(r.rate) : '–'}<small>${r.rate != null ? 'กม./ลิตร' : 'รอเติมครั้งถัดไป'}</small></div>
      <div class="h-sub">${fmtInt(r.mileage)} กม. · ${fmt(r.liters)} ล. · ฿${fmt(r.oilPrice)}/ล.</div>
      <div class="h-sub" style="text-align:right">฿${fmtInt(r.price)}</div>
    </li>`).join('') || '<li><div class="h-sub">ยังไม่มีข้อมูล</div></li>';
  $('#moreBtn').hidden = items.length <= state.shown;
}

/* ---------- views ---------- */
function open(id) {
  $$('.sheet').forEach((s) => { s.hidden = s.id !== id; });
  if (id === 'form') initForm();
  if (id === 'settings') initSettings();
}
function closeSheets() { $$('.sheet').forEach((s) => { s.hidden = true; }); }

/* ---------- form ---------- */
const form = $('#entryForm');
let selectedType = null;

function lastEntry() { const l = entries(); return l[l.length - 1]; }
function lastPriceFor(type) {
  const l = entries().filter((r) => r.type === type);
  return l.length ? l[l.length - 1].oilPrice : null;
}

function initForm() {
  form.reset();
  const last = lastEntry();
  form.date.value = isoToday();
  selectedType = last ? last.type : OIL_TYPES[0];
  $('#typeChips').innerHTML = OIL_TYPES.map((t) => `<button type="button" class="chip" data-type="${esc(t)}">${esc(t)}</button>`).join('');
  setType(selectedType);
  updateForm();
  setTimeout(() => form.mileage.focus(), 250);
}

function setType(type) {
  selectedType = type;
  $$('.chip').forEach((c) => c.classList.toggle('active', c.dataset.type === type));
  const p = lastPriceFor(type);
  form.oilPrice.placeholder = p ? fmt(p) : '0.00';
  if (p && !form.oilPrice.dataset.touched) form.oilPrice.value = p.toFixed(2);
  updateForm();
}

function readForm() {
  return {
    date: form.date.value,
    type: selectedType,
    mileage: num(form.mileage.value),
    oilPrice: num(form.oilPrice.value),
    price: num(form.price.value),
  };
}

function updateForm() {
  const v = readForm();
  const last = lastEntry();
  const hint = $('#mileageHint');
  hint.className = 'hint';
  if (last) {
    hint.textContent = `ครั้งก่อน ${fmtInt(last.mileage)} กม. (${fmtDate(last.d)})`;
    if (Number.isFinite(v.mileage) && v.mileage <= last.mileage) {
      hint.textContent = `เลขไมล์ต้องมากกว่าครั้งก่อน (${fmtInt(last.mileage)} กม.)`;
      hint.className = 'hint bad';
    }
  } else {
    hint.textContent = '';
  }

  const valid = v.date && v.type && Number.isFinite(v.mileage) && v.mileage >= 0 && (!last || v.mileage > last.mileage)
    && v.oilPrice > 0 && v.price > 0;
  $('#saveBtn').disabled = !valid;

  const liters = v.price / v.oilPrice;
  let html = '';
  if (Number.isFinite(liters) && liters > 0) {
    html += `<span class="muted">ปริมาณที่เติม</span><b>${fmt(liters)} ลิตร</b>`;
    if (last && Number.isFinite(v.mileage) && v.mileage > last.mileage) {
      const dist = v.mileage - last.mileage;
      html += `<span class="muted">ระยะทางจากครั้งก่อน</span><b>${fmtInt(dist)} กม.</b>`;
      html += `<span class="muted">อัตรากินน้ำมัน (รอบก่อน)</span><b>${fmt(dist / liters)} กม./ล.</b>`;
    }
  }
  $('#preview').innerHTML = html;
}

form.addEventListener('input', (e) => {
  if (e.target.name === 'oilPrice') e.target.dataset.touched = '1';
  updateForm();
});
$('#typeChips').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (chip) setType(chip.dataset.type);
});
form.addEventListener('reset', () => { delete form.oilPrice.dataset.touched; });

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const v = readForm();
  const entry = { date: v.date, type: v.type, mileage: v.mileage, oilPrice: v.oilPrice, price: v.price, liters: null };
  closeSheets();
  if (!state.setup) {
    state.rows = [...state.rows, entry];
    store.set(KEYS.demo, state.rows);
    render();
    toast('บันทึกในโหมดตัวอย่าง (ยังไม่ได้ส่งขึ้น Sheet)');
    return;
  }
  state.pending.push(entry);
  store.set(KEYS.pending, state.pending);
  render();
  toast('กำลังบันทึกลง Sheet…');
  await sync({ quiet: true });
  if (!state.pending.length) toast('บันทึกลง Sheet แล้ว ✓');
});

/* ---------- settings ---------- */
function parseSetup(text) {
  const s = text.trim();
  let u;
  try { u = new URL(s); } catch { return null; }
  const k = u.searchParams.get('k');
  if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(u.href) || !k) return null;
  return { url: `${u.origin}${u.pathname}`, k };
}

function initSettings() {
  $('#setupInput').value = state.setup ? `${state.setup.url}?k=${state.setup.k}` : '';
  $('#settingsStatus').textContent = state.setup ? 'เชื่อมต่อกับ Google Sheet อยู่' : 'ยังไม่ได้เชื่อมต่อ (ใช้ข้อมูลตัวอย่าง)';
  $('#settingsStatus').className = 'hint';
}

$('#saveSetupBtn').addEventListener('click', async () => {
  const setup = parseSetup($('#setupInput').value);
  const status = $('#settingsStatus');
  if (!setup) {
    status.textContent = 'รูปแบบไม่ถูกต้อง ต้องเป็นลิงก์ script.google.com ที่ลงท้ายด้วย ?k=TOKEN';
    status.className = 'hint bad';
    return;
  }
  status.textContent = 'กำลังทดสอบการเชื่อมต่อ…';
  status.className = 'hint';
  const prev = state.setup;
  state.setup = setup;
  try {
    const rows = await apiGet();
    state.rows = rows;
    store.set(KEYS.setup, setup);
    store.set(KEYS.rows, rows);
    closeSheets();
    render();
    toast(`เชื่อมต่อสำเร็จ พบ ${rows.length} รายการ`);
  } catch (err) {
    state.setup = prev;
    status.textContent = err.message === 'unauthorized' ? 'Token ไม่ถูกต้อง' : `เชื่อมต่อไม่สำเร็จ: ${err.message}`;
    status.className = 'hint bad';
  }
});

$('#clearSetupBtn').addEventListener('click', () => {
  if (!confirm('ล้างการเชื่อมต่อ? ข้อมูลใน Sheet จะไม่ถูกลบ')) return;
  store.del(KEYS.setup); store.del(KEYS.rows); store.del(KEYS.pending);
  state.setup = null; state.pending = [];
  state.rows = store.get(KEYS.demo, DEMO_ROWS);
  closeSheets();
  render();
});

/* ---------- wiring ---------- */
$('#addBtn').addEventListener('click', () => open('form'));
$('#settingsBtn').addEventListener('click', () => open('settings'));
$('#refreshBtn').addEventListener('click', () => (state.setup ? sync() : toast('ยังไม่ได้เชื่อมต่อ Sheet')));
$('#moreBtn').addEventListener('click', () => { state.shown += PAGE_SIZE; render(); });
$('#rangeSeg').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  state.range = b.dataset.range;
  store.set(KEYS.range, state.range);
  render();
});
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) closeSheets();
  const opener = e.target.closest('[data-open]');
  if (opener) open(opener.dataset.open);
  if (e.target.closest('#retryBtn')) sync();
});
window.addEventListener('online', () => state.pending.length && sync({ quiet: true }));
let resizeT;
window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(render, 150); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.setup) sync({ quiet: true });
});

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(console.error);
}

render();
if (state.setup) sync({ quiet: true });
