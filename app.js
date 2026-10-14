'use strict';

const OIL_TYPES = ['G95', 'G91', 'E20', 'G95 Premium'];
const TYPE_CLASS = { G95: 't-g95', G91: 't-g91', E20: 't-e20', 'G95 Premium': 't-prem' };
const typeClass = (t) => TYPE_CLASS[t] || 't-other';
const KEYS = { setup: 'fl.setup', rows: 'fl.rows', pending: 'fl.pending', range: 'fl.range', mRange: 'fl.mRange', tab: 'fl.tab', demo: 'fl.demoRows' };
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
  mRange: store.get(KEYS.mRange, '12'),
  tab: store.get(KEYS.tab, 0),
  shown: PAGE_SIZE,
  loading: false,
  animate: true, // เล่น animation กราฟในการ render ครั้งถัดไป
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
const fmtMonth = (d, long = false) => `${TH_MONTHS[d.getMonth()]} ${String(d.getFullYear() + 543).slice(long ? 0 : -2)}`;
const fmtDate = (d) => d ? `${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${String(d.getFullYear() + 543).slice(-2)}` : '–';
const isoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
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
    ...state.rows.map((r, i) => ({ ...r, pending: false, src: i })),
    ...(state.setup ? state.pending.map((r, i) => ({ ...r, pending: true, src: i })) : []),
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
  $('#carCard').classList.add('moving');
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
    $('#carCard').classList.remove('moving');
    state.animate = true;
    render();
  }
}

/* ---------- render ---------- */
function render({ keepHistory = false } = {}) {
  const list = entries();
  renderBanner();
  renderStats(list);
  renderCar(list);
  renderChart(list);
  if (!keepHistory) renderHistory(list, { reset: true });
  renderMonthly(list);
  state.animate = false;
}

function renderCar(list) {
  const last = list[list.length - 1];
  $('#carOdo').textContent = last ? `เลขไมล์ ${fmtInt(last.mileage)}` : '–';
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
  const types = [...new Set(pts.map((p) => p.type))];
  $('#legend').innerHTML = pts.length <= 40
    ? types.map((t) => `<span class="${typeClass(t)}">${esc(t)}</span>`).join('') : '';
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
  const dots = showDots ? pts.map((p) => `<circle class="dot ${typeClass(p.type)}" cx="${X(p.mileage)}" cy="${Y(p.rate)}" r="3.5"/>`).join('') : '';
  const avgLine = avg ? `<line class="avg" x1="${pad.l}" x2="${W - pad.r}" y1="${Y(avg)}" y2="${Y(avg)}"/>` : '';

  const anim = state.animate && !reduceMotion;
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="กราฟอัตรากินน้ำมัน">
      ${grid}${avgLine}<path class="area${anim ? ' draw' : ''}" d="${area}"/><path class="line" d="${line}"/>${anim ? dots.replaceAll('class="dot ', 'class="dot pop ') : dots}
      <line class="cursor" y1="${pad.t}" y2="${H - pad.b}" visibility="hidden"/>
      <circle class="dot active" r="5" visibility="hidden"/>
    </svg><div class="tooltip" hidden></div>`;

  const svg = $('svg', el), tip = $('.tooltip', el);
  const cursor = $('.cursor', svg), marker = $('.dot.active', svg);
  if (anim) {
    const path = $('.line', svg);
    path.style.setProperty('--len', Math.ceil(path.getTotalLength()));
    path.classList.add('draw');
    $$('.dot.pop', svg).forEach((d, i) => d.style.setProperty('--i', i));
  }
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

let historyItems = [];
let historyAll = [];
function historyRow(r, i, enterIdx) {
  return `
    <li data-i="${i}" role="button" tabindex="0"${enterIdx != null ? ` class="enter" style="--i:${enterIdx}"` : ''}>
      <div class="h-main">${fmtDate(r.d)}<span class="badge ${typeClass(r.type)}">${esc(r.type)}</span>${r.pending ? '<span class="badge pending">รอส่ง</span>' : ''}</div>
      <div class="h-rate">${r.rate != null ? fmt(r.rate) : '–'}<small>${r.rate != null ? 'กม./ลิตร' : 'รอเติมครั้งถัดไป'}</small></div>
      <div class="h-sub">${fmtInt(r.mileage)} กม. · ${fmt(r.liters)} ล. · ฿${fmt(r.oilPrice)}/ล.</div>
      <div class="h-sub" style="text-align:right">฿${fmtInt(r.price)}</div>
    </li>`;
}

function renderHistory(list, { reset = false } = {}) {
  const ul = $('#history');
  if (reset) {
    historyAll = [...list].reverse();
    state.shown = Math.max(PAGE_SIZE, Math.min(state.shown, historyAll.length));
    historyItems = historyAll.slice(0, state.shown);
    const animate = state.animate && !reduceMotion;
    ul.innerHTML = historyItems.map((r, i) => historyRow(r, i, animate && i < 12 ? i : null)).join('')
      || '<li><div class="h-sub">ยังไม่มีข้อมูล</div></li>';
  }
  $('#loadMore').hidden = historyAll.length <= historyItems.length;
}

// โหลดหน้าถัดไปเมื่อเลื่อนลงถึงท้ายรายการ
let loadingMore = false;
function loadMoreHistory() {
  if (loadingMore || historyItems.length >= historyAll.length) return;
  loadingMore = true;
  setTimeout(() => {
    const start = historyItems.length;
    const next = historyAll.slice(start, start + PAGE_SIZE);
    historyItems = historyItems.concat(next);
    state.shown = historyItems.length;
    $('#history').insertAdjacentHTML('beforeend', next.map((r, i) => historyRow(r, start + i, reduceMotion ? null : i)).join(''));
    $('#loadMore').hidden = historyAll.length <= historyItems.length;
    loadingMore = false;
  }, 350);
}

/* ---------- views ---------- */
let openSheet = null;

function open(id) {
  if (openSheet) return;
  const sheet = $(`#${id}`);
  if (id === 'form') {
    initForm();
    const r = $('#addBtn').getBoundingClientRect();
    sheet.style.setProperty('--x', `${r.left + r.width / 2}px`);
    sheet.style.setProperty('--y', `${r.top + r.height / 2}px`);
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    sheet.style.setProperty('--rmax', `${Math.ceil(Math.hypot(Math.max(cx, innerWidth - cx), Math.max(cy, innerHeight - cy)))}px`);
    $('#addBtn').classList.add('open');
  }
  if (id === 'settings') initSettings();
  sheet.scrollTop = 0;
  sheet.classList.remove('closing');
  sheet.hidden = false;
  sheet.classList.add('opening');
  if (sheet.classList.contains('sheet-push')) $('.shell').classList.add('pushed');
  openSheet = sheet;
}

function closeSheets() {
  const sheet = openSheet;
  if (!sheet) return;
  openSheet = null;
  document.activeElement?.blur?.();
  $('#addBtn').classList.remove('open');
  const shell = $('.shell');
  if (shell.classList.contains('pushed')) { shell.classList.remove('pushed'); shell.classList.add('unpushed'); }
  sheet.classList.remove('opening');
  sheet.classList.add('closing');
  const done = () => {
    sheet.hidden = true;
    sheet.classList.remove('closing');
    shell.classList.remove('unpushed');
  };
  if (reduceMotion) done(); else setTimeout(done, sheet.classList.contains('sheet-push') ? 320 : 380);
}

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
  $('#typeChips').innerHTML = OIL_TYPES.map((t) => `<button type="button" class="chip ${typeClass(t)}" data-type="${esc(t)}">${esc(t)}</button>`).join('');
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

/* ---------- detail / delete ---------- */
let detailItem = null;

function openDetail(item) {
  detailItem = item;
  const rows = [
    ['วันที่', fmtDate(item.d)],
    ['ชนิดน้ำมัน', `<span class="badge ${typeClass(item.type)}" style="margin:0">${esc(item.type)}</span>`],
    ['เลขไมล์', `${fmtInt(item.mileage)} กม.`],
    ['ราคาต่อลิตร', `฿${fmt(item.oilPrice)}`],
    ['ยอดเงิน', `฿${fmt(item.price)}`],
    ['ปริมาณ', `${fmt(item.liters)} ลิตร`],
    ['อัตรากินน้ำมัน', item.rate != null ? `${fmt(item.rate)} กม./ลิตร` : 'รอเติมครั้งถัดไป'],
  ];
  if (item.pending) rows.push(['สถานะ', '<span class="badge pending" style="margin:0">รอส่งขึ้น Sheet</span>']);
  $('#detailBody').innerHTML = rows.map(([k, v]) => `<div class="row"><span>${k}</span><span>${v}</span></div>`).join('');
  $('#deleteBtn').disabled = false;
  open('detail');
}

$('#history').addEventListener('click', (e) => {
  const li = e.target.closest('li[data-i]');
  if (li) openDetail(historyItems[+li.dataset.i]);
});

$('#deleteBtn').addEventListener('click', async () => {
  const item = detailItem;
  if (!item) return;
  if (!confirm(`ลบรายการ ${fmtDate(item.d)} · ${fmtInt(item.mileage)} กม. · ฿${fmtInt(item.price)} ?`)) return;

  // ยังไม่ได้เชื่อม Sheet (โหมดตัวอย่าง) หรือยังรอส่ง → ลบในเครื่องอย่างเดียว
  if (!state.setup || item.pending) {
    if (item.pending) { state.pending.splice(item.src, 1); store.set(KEYS.pending, state.pending); }
    else { state.rows.splice(item.src, 1); store.set(KEYS.demo, state.rows); }
    closeSheets(); render(); toast('ลบแล้ว');
    return;
  }
  if (!item.row) {
    toast('ต้องอัปเดต Apps Script เป็นเวอร์ชันใหม่ก่อนจึงจะลบได้', 4000);
    return;
  }
  const btn = $('#deleteBtn');
  btn.disabled = true;
  btn.textContent = 'กำลังลบ…';
  try {
    const rows = await apiPost({ action: 'delete', row: item.row, mileage: item.mileage, price: item.price });
    state.rows = rows;
    store.set(KEYS.rows, rows);
    closeSheets(); render(); toast('ลบออกจาก Sheet แล้ว ✓');
  } catch (err) {
    console.error(err);
    toast(err.message === 'mismatch' || err.message === 'not found'
      ? 'ข้อมูลใน Sheet เปลี่ยนไปแล้ว กำลังรีเฟรช ลองลบอีกครั้ง'
      : 'ลบไม่สำเร็จ ลองใหม่อีกครั้ง', 3500);
    if (err.message === 'mismatch' || err.message === 'not found') { closeSheets(); sync({ quiet: true }); }
  } finally {
    btn.disabled = false;
    btn.textContent = 'ลบรายการนี้';
  }
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

function renderThemeControls() {
  const theme = loadTheme();
  $$('#themeSeg button').forEach((b) => b.classList.toggle('active', b.dataset.themeMode === theme.mode));
  $('#swatches').innerHTML = Object.entries(ACCENTS).map(([id, a]) => `
    <button type="button" class="swatch${id === theme.accent ? ' active' : ''}" data-accent="${id}" aria-label="${a.name}"
      style="--sw-l: ${a.light}; --sw-d: ${a.dark}"><svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg></button>`).join('');
}

$('#themeSeg').addEventListener('click', (e) => {
  const b = e.target.closest('[data-theme-mode]');
  if (!b) return;
  saveTheme({ ...loadTheme(), mode: b.dataset.themeMode });
  renderThemeControls();
  render();
});
$('#swatches').addEventListener('click', (e) => {
  const b = e.target.closest('[data-accent]');
  if (!b) return;
  saveTheme({ ...loadTheme(), accent: b.dataset.accent });
  renderThemeControls();
});

function initSettings() {
  renderThemeControls();
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

/* ---------- สรุปรายเดือน ---------- */
const monthKey = (d) => d.getFullYear() * 12 + d.getMonth();
const keyToDate = (k) => new Date(Math.floor(k / 12), k % 12, 1);

function monthlyData(list) {
  const map = new Map();
  for (const r of list) {
    if (!r.d) continue;
    const k = monthKey(r.d);
    const m = map.get(k) || { k, total: 0, count: 0, liters: 0 };
    m.total += r.price; m.count += 1; m.liters += r.liters;
    map.set(k, m);
  }
  const nowK = monthKey(new Date());
  const keys = [...map.keys()];
  if (!keys.length) return [];
  const months = [];
  // เติมเดือนที่ไม่ได้เติมน้ำมันเป็น 0 เพื่อให้กราฟต่อเนื่อง
  for (let k = Math.min(...keys); k <= Math.max(nowK, ...keys); k++) {
    months.push({ ...(map.get(k) || { k, total: 0, count: 0, liters: 0 }), d: keyToDate(k) });
  }
  return months;
}

function moneyStep(max) {
  for (const s of [100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000]) if (max / s <= 5) return s;
  return 50000;
}

function renderMonthly(list) {
  const months = monthlyData(list);
  const now = new Date(), nowK = monthKey(now);
  const cur = months.find((m) => m.k === nowK);
  const max = months.reduce((a, m) => (m.total > (a?.total ?? 0) ? m : a), null);
  const yearMonths = months.filter((m) => m.d.getFullYear() === now.getFullYear() && m.k <= nowK);
  const yearTotal = yearMonths.reduce((s, m) => s + m.total, 0);
  // เฉลี่ยต่อเดือนของปีนี้ = ยอดรวมตั้งแต่ ม.ค. ÷ จำนวนเดือนที่ผ่านมา (รวมเดือนนี้)
  const avg = yearTotal / (now.getMonth() + 1);

  $('#mMax').textContent = max ? fmtInt(max.total) : '–';
  $('#mMaxLabel').textContent = max ? `บาท · ${fmtMonth(max.d)}` : 'บาท';
  $('#mNow').textContent = fmtInt(cur ? cur.total : 0);
  $('#mNowLabel').textContent = `บาท · ${fmtMonth(now)}`;
  $('#mAvg').textContent = yearTotal ? fmtInt(avg) : '–';
  $$('#mRangeSeg button').forEach((b) => b.classList.toggle('active', b.dataset.range === state.mRange));

  let shown = months;
  if (state.mRange === '12') shown = months.filter((m) => m.k > nowK - 12 && m.k <= nowK);
  if (state.mRange === 'year') shown = months.filter((m) => m.d.getFullYear() === now.getFullYear() && m.k <= nowK);
  renderMonthlyChart(shown, max);

  const withData = [...months].reverse().filter((m) => m.count || m.k === nowK);
  const top = Math.max(1, ...withData.map((m) => m.total));
  const anim = state.animate && !reduceMotion;
  $('#mList').innerHTML = withData.map((m, i) => `
    <li${anim && i < 12 ? ` class="enter" style="--i:${i}"` : ''}>
      <div class="h-main">${TH_MONTHS[m.d.getMonth()]} ${m.d.getFullYear() + 543}${m.k === nowK ? '<span class="badge">เดือนนี้</span>' : ''}${max && m.k === max.k ? '<span class="badge t-prem">สูงสุด</span>' : ''}</div>
      <div class="h-rate">฿${fmtInt(m.total)}</div>
      <div class="h-sub">เติม ${m.count} ครั้ง · ${fmt(m.liters)} ลิตร</div>
      <div class="h-sub" style="text-align:right">${m.liters ? `฿${fmt(m.total / m.liters)}/ล.` : ''}</div>
      <div class="bar-mini"><i style="width:${(m.total / top) * 100}%"></i></div>
    </li>`).join('') || '<li><div class="h-sub">ยังไม่มีข้อมูล</div></li>';
}

function renderMonthlyChart(months, maxMonth) {
  const el = $('#mChart');
  const W = el.clientWidth || 320, H = el.clientHeight || 240;
  const pad = { l: 42, r: 6, t: 34, b: 26 };
  if (!months.length) {
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}"><text class="empty" x="${W / 2}" y="${H / 2}" text-anchor="middle">ยังไม่มีข้อมูล</text></svg>`;
    return;
  }
  const peak = Math.max(...months.map((m) => m.total), 1);
  const step = moneyStep(peak);
  const yMax = Math.ceil((peak * 1.05) / step) * step;
  const Y = (v) => pad.t + (1 - v / yMax) * (H - pad.t - pad.b);
  const slot = (W - pad.l - pad.r) / months.length;
  const bw = Math.max(3, Math.min(28, slot * 0.62));
  const nowK = monthKey(new Date());

  let grid = '';
  for (let v = 0; v <= yMax; v += step) {
    grid += `<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${Y(v)}" y2="${Y(v)}"/>`
      + `<text class="axis-label" x="${pad.l - 6}" y="${Y(v) + 4}" text-anchor="end">${v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : v}</text>`;
  }
  const every = Math.ceil(months.length / 6);
  const anim = state.animate && !reduceMotion;
  const bars = months.map((m, i) => {
    const x = pad.l + slot * i + (slot - bw) / 2;
    const h = Math.max(m.total ? 2 : 0, Y(0) - Y(m.total));
    const cls = ['bar', m.k === nowK && 'now', maxMonth && m.k === maxMonth.k && 'max', anim && 'grow'].filter(Boolean).join(' ');
    const label = (months.length - 1 - i) % every === 0
      ? `<text class="axis-label" x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${TH_MONTHS[m.d.getMonth()]}${m.d.getMonth() === 0 || i === 0 ? String(m.d.getFullYear() + 543).slice(-2) : ''}</text>` : '';
    return `<rect class="${cls}" data-i="${i}" x="${x}" y="${Y(0) - h}" width="${bw}" height="${h}" rx="${Math.min(4, bw / 3)}" style="--i:${i}"/>${label}`;
  }).join('');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="กราฟค่าน้ำมันรายเดือน">${grid}${bars}</svg><div class="tooltip" hidden></div>`;

  const svg = $('svg', el), tip = $('.tooltip', el);
  const pick = (clientX) => {
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * W;
    const i = Math.min(months.length - 1, Math.max(0, Math.floor((x - pad.l) / slot)));
    const m = months[i];
    $$('.bar', svg).forEach((b) => b.classList.toggle('sel', +b.dataset.i === i));
    tip.innerHTML = `<b>฿${fmtInt(m.total)}</b><br>${TH_MONTHS[m.d.getMonth()]} ${m.d.getFullYear() + 543} · เติม ${m.count} ครั้ง`;
    tip.hidden = false;
    const px = ((pad.l + slot * (i + 0.5)) / W) * rect.width, half = tip.offsetWidth / 2;
    tip.style.left = `${Math.min(Math.max(px, half), rect.width - half)}px`;
  };
  svg.addEventListener('pointerdown', (e) => pick(e.clientX));
  svg.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'mouse') pick(e.clientX); });
  svg.addEventListener('pointerleave', () => { tip.hidden = true; $$('.bar', svg).forEach((b) => b.classList.remove('sel')); });
}

/* ---------- แท็บ + ปัดซ้าย/ขวา ---------- */
const pages = $$('.page');

function setTab(i, animate = true) {
  i = Math.max(0, Math.min(pages.length - 1, i));
  const changed = i !== state.tab;
  state.tab = i;
  store.set(KEYS.tab, i);
  const track = $('#track');
  track.classList.toggle('dragging', !animate);
  track.style.transform = `translateX(${-i * 100}%)`;
  if (!animate) requestAnimationFrame(() => track.classList.remove('dragging'));
  const btns = $$('#tabbar button');
  btns.forEach((b, j) => b.classList.toggle('active', j === i));
  const ind = $('#tabIndicator');
  ind.style.width = `${btns[i].offsetWidth}px`;
  ind.style.transform = `translateX(${btns[i].offsetLeft}px)`;
  const title = $('#pageTitle');
  title.textContent = pages[i].dataset.title;
  if (changed && animate) { title.classList.remove('swap'); void title.offsetWidth; title.classList.add('swap'); }
  if (changed && i === 1) { state.animate = true; renderMonthly(entries()); state.animate = false; }
}
$('#tabbar').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (b) setTab(+b.dataset.tab);
});

/* ---------- gesture: ปัดเปลี่ยนแท็บ / ดึงลงเพื่อรีเฟรช ---------- */
const PULL_TRIGGER = 70;
let g = null;

$('#viewport').addEventListener('touchstart', (e) => {
  if (openSheet || e.touches.length > 1) return;
  const t = e.touches[0];
  const page = pages[state.tab];
  g = {
    x: t.clientX, y: t.clientY, t: performance.now(), mode: null, dx: 0, pull: 0,
    atTop: page.scrollTop <= 0, inner: $('.page-inner', page), noSwipe: !!e.target.closest('.chart, .segmented'),
  };
}, { passive: true });

$('#viewport').addEventListener('touchmove', (e) => {
  if (!g) return;
  const t = e.touches[0];
  const dx = t.clientX - g.x, dy = t.clientY - g.y;
  if (!g.mode) {
    if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2 && !g.noSwipe) g.mode = 'swipe';
    else if (dy > 8 && g.atTop && dy > Math.abs(dx)) g.mode = 'pull';
    else if (Math.abs(dy) > 8 || Math.abs(dx) > 10) g.mode = 'none';
    if (g.mode === 'swipe') $('#track').classList.add('dragging');
    if (g.mode === 'pull') g.inner.classList.add('pulling');
  }
  if (g.mode === 'swipe') {
    e.preventDefault();
    const w = $('#viewport').clientWidth;
    const edge = (state.tab === 0 && dx > 0) || (state.tab === pages.length - 1 && dx < 0);
    g.dx = edge ? dx * 0.3 : dx;
    $('#track').style.transform = `translateX(${-state.tab * w + g.dx}px)`;
  } else if (g.mode === 'pull') {
    e.preventDefault();
    g.pull = Math.min(130, dy * 0.5);
    g.inner.style.transform = `translateY(${g.pull}px)`;
    const ptr = $('#ptr');
    const p = Math.min(1, g.pull / PULL_TRIGGER);
    ptr.style.opacity = p;
    ptr.style.transform = `translateY(${g.pull * 0.6 - 20}px) scale(${0.6 + p * 0.4})`;
    $('svg', ptr).style.transform = `rotate(${g.pull * 4}deg)`;
    ptr.classList.toggle('ready', g.pull >= PULL_TRIGGER);
  }
}, { passive: false });

const endGesture = () => {
  if (!g) return;
  const cur = g;
  g = null;
  if (cur.mode === 'swipe') {
    $('#track').classList.remove('dragging');
    const w = $('#viewport').clientWidth;
    const v = cur.dx / Math.max(1, performance.now() - cur.t);
    let next = state.tab;
    if (cur.dx < -w * 0.22 || v < -0.5) next++;
    if (cur.dx > w * 0.22 || v > 0.5) next--;
    setTab(next);
  } else if (cur.mode === 'pull') {
    cur.inner.classList.remove('pulling');
    if (cur.pull >= PULL_TRIGGER) refreshFromPull(cur.inner);
    else resetPull(cur.inner);
  }
};
$('#viewport').addEventListener('touchend', endGesture);
$('#viewport').addEventListener('touchcancel', endGesture);

function resetPull(inner) {
  inner.style.transform = '';
  const ptr = $('#ptr');
  ptr.classList.remove('loading', 'ready');
  ptr.style.opacity = '';
  ptr.style.transform = '';
  $('svg', ptr).style.transform = '';
}

async function refreshFromPull(inner) {
  const ptr = $('#ptr');
  inner.style.transform = 'translateY(56px)';
  ptr.style.transform = 'translateY(14px) scale(1)';
  ptr.style.opacity = 1;
  $('svg', ptr).style.transform = '';
  ptr.classList.add('loading');
  if (state.setup) await sync();
  else { await new Promise((r) => setTimeout(r, 600)); toast('ยังไม่ได้เชื่อมต่อ Sheet'); }
  resetPull(inner);
}

/* ---------- wiring ---------- */
$('#addBtn').addEventListener('click', () => (openSheet ? closeSheets() : open('form')));
$('#settingsBtn').addEventListener('click', () => open('settings'));
$('#rangeSeg').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  state.range = b.dataset.range;
  store.set(KEYS.range, state.range);
  state.animate = true;
  render({ keepHistory: true });
});
$('#mRangeSeg').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  state.mRange = b.dataset.range;
  store.set(KEYS.mRange, state.mRange);
  state.animate = true;
  renderMonthly(entries());
  state.animate = false;
});
new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) loadMoreHistory(); },
  { root: $('#pageFuel'), rootMargin: '0px 0px 120px 0px' }).observe($('#loadMore'));
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) closeSheets();
  const opener = e.target.closest('[data-open]');
  if (opener) open(opener.dataset.open);
  if (e.target.closest('#retryBtn')) sync();
});
window.addEventListener('online', () => state.pending.length && sync({ quiet: true }));
let resizeT;
window.addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => { render({ keepHistory: true }); setTab(state.tab, false); }, 150);
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.setup) sync({ quiet: true });
});

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(console.error);
}

setTab(state.tab, false);
render();
$('#carCard').classList.add('intro');
if (state.setup) sync({ quiet: true });
