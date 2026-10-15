'use strict';

const OIL_TYPES = ['G95', 'G91', 'E20', 'G95 Premium'];
const TYPE_CLASS = { G95: 't-g95', G91: 't-g91', E20: 't-e20', 'G95 Premium': 't-prem' };
const typeClass = (t) => TYPE_CLASS[t] || 't-other';
const KEYS = {
  setup: 'fl.setup', rows: 'fl.rows', pending: 'fl.pending', mRange: 'fl.mRange',
  demo: 'fl.demoRows', ptt: 'fl.ptt', loan: 'fl.loan',
};
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
  range: '365', // ค่าเริ่มต้นของกราฟ = 1 ปี
  mRange: store.get(KEYS.mRange, '12'),
  loan: store.get(KEYS.loan, null),
  loanError: null,
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
const locale = () => (LANG === 'th' ? 'th-TH' : 'en-US');
const fmt = (n, d = 2) => Number.isFinite(n) ? n.toLocaleString(locale(), { minimumFractionDigits: d, maximumFractionDigits: d }) : '–';
const fmtInt = (n) => Number.isFinite(n) ? Math.round(n).toLocaleString(locale()) : '–';
const mon = (d) => MONTHS[LANG][d.getMonth()];
const yearOf = (d, short = true) => {
  const y = LANG === 'th' ? d.getFullYear() + 543 : d.getFullYear();
  return short ? String(y).slice(-2) : String(y);
};
const fmtMonth = (d) => `${mon(d)} ${yearOf(d)}`;
const fmtMonthLong = (d) => `${mon(d)} ${yearOf(d, false)}`;
const fmtDate = (d) => d ? `${d.getDate()} ${mon(d)} ${yearOf(d)}` : '–';
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
const isoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function toast(msg, ms = 2600) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
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

/* ---------- API (Google Apps Script) ---------- */
async function apiGet(action) {
  const q = new URLSearchParams({ k: state.setup.k });
  if (action) q.set('action', action);
  const res = await fetch(`${state.setup.url}?${q}`, { cache: 'no-store' });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

async function apiPost(entry) {
  const res = await fetch(state.setup.url, {
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
  $('#carStage').classList.add('moving');
  try {
    // ส่งรายการที่ค้างอยู่ก่อน
    while (state.pending.length) {
      const rows = await apiPost(state.pending[0]);
      state.pending.shift();
      store.set(KEYS.pending, state.pending);
      state.rows = rows;
    }
    state.rows = (await apiGet()).rows;
    store.set(KEYS.rows, state.rows);
    loadLoan();
    if (!quiet) toast(t('t.synced'));
  } catch (err) {
    console.error(err);
    toast(err.message === 'unauthorized' ? t('t.badToken') : !navigator.onLine ? t('t.offline') : t('t.syncFailed'), 3500);
  } finally {
    state.loading = false;
    $('#carStage').classList.remove('moving');
    state.animate = true;
    render();
  }
}

/* ---------- render ---------- */
function render({ keepHistory = false } = {}) {
  const list = entries();
  renderBanner();
  renderHome(list);
  renderStats(list);
  renderChart(list);
  if (!keepHistory) renderHistory(list, { reset: true });
  renderMonthly(list);
  renderLoan();
  state.animate = false;
}

function renderBanner() {
  const el = $('#banner');
  if (!state.setup) {
    el.innerHTML = `${esc(t('banner.demo'))} <button data-open="settings">${esc(t('banner.connect'))}</button>`;
    el.hidden = false;
  } else if (state.pending.length) {
    el.innerHTML = `${esc(t('banner.pending', { n: state.pending.length }))} <button id="retryBtn">${esc(t('banner.sendNow'))}</button>`;
    el.hidden = false;
  } else {
    el.hidden = true;
  }
}

// หน้าแรก: ตัวเลขใหญ่ + สถานะ + คำอธิบายในเมนู
function renderHome(list) {
  const yearPts = list.filter((r) => r.rate != null && r.d && r.d.getTime() >= Date.now() - 365 * 864e5);
  const avg = average(list, yearPts.length >= 2 ? yearPts : list.filter((r) => r.rate != null));
  $('#heroNum').textContent = avg ? fmt(avg, 1) : '–';
  const last = list[list.length - 1];
  if (last && last.d) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const days = Math.round((today - last.d) / 864e5);
    const ago = days <= 0 ? t('ago.today') : t('ago.days', { n: days });
    $('#heroStatus').innerHTML = `${esc(t('hero.lastFill', { ago }))}<small>${esc(t('car.odo', { n: fmtInt(last.mileage) }))}</small>`;
  } else {
    $('#heroStatus').textContent = '';
  }
  const withRate = list.filter((r) => r.rate != null);
  const lastRate = withRate[withRate.length - 1];
  $('#mEconomy').textContent = avg ? t('menu.economy', { avg: fmt(avg), last: lastRate ? fmt(lastRate.rate) : '–' }) : '';
  $('#mHistory').textContent = last ? `${fmtDate(last.d)} · ${last.type} · ฿${fmtInt(last.price)}` : t('history.empty');
  const months = monthlyData(list);
  const now = new Date(), nowK = monthKey(now);
  const cur = months.find((m) => m.k === nowK);
  const yearTotal = months.filter((m) => m.d.getFullYear() === now.getFullYear() && m.k <= nowK).reduce((s2, m) => s2 + m.total, 0);
  $('#mMonthly').textContent = t('menu.monthly', { now: fmtInt(cur ? cur.total : 0), avg: fmtInt(yearTotal / (now.getMonth() + 1)) });
}

function inRange(list) {
  const withRate = list.filter((r) => r.rate != null && Number.isFinite(r.rate));
  if (state.range === 'all') return withRate;
  const cutoff = Date.now() - Number(state.range) * 864e5;
  return withRate.filter((r) => r.d && r.d.getTime() >= cutoff);
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
  const withRate = list.filter((r) => r.rate != null);
  const last = withRate[withRate.length - 1];
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
  $('#legend').innerHTML = types.map((ty) => `<span class="${typeClass(ty)}">${esc(ty)}</span>`).join('');
  const W = el.clientWidth || 320, H = el.clientHeight || 240;
  const pad = { l: 34, r: 10, t: 34, b: 26 };
  const avg = average(list, pts);

  $$('#rangeSeg button').forEach((b) => b.classList.toggle('active', b.dataset.range === state.range));

  if (pts.length < 2) {
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}"><text class="empty" x="${W / 2}" y="${H / 2}" text-anchor="middle">${esc(t('chart.notEnough'))}</text></svg>`;
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

  const anim = state.animate && !reduceMotion;
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.mileage).toFixed(1)},${Y(p.rate).toFixed(1)}`).join('');
  const area = `${line}L${X(xMax)},${Y(0)}L${X(xMin)},${Y(0)}Z`;
  const dots = pts.length <= 40
    ? pts.map((p, i) => `<circle class="dot ${typeClass(p.type)}${anim ? ' pop' : ''}" style="--i:${i}" cx="${X(p.mileage)}" cy="${Y(p.rate)}" r="3.5"/>`).join('') : '';
  const avgLine = avg ? `<line class="avg" x1="${pad.l}" x2="${W - pad.r}" y1="${Y(avg)}" y2="${Y(avg)}"/>` : '';

  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('chart.rate'))}">
      ${grid}${avgLine}<path class="area${anim ? ' draw' : ''}" d="${area}"/><path class="line" d="${line}"/>${dots}
      <line class="cursor" y1="${pad.t}" y2="${H - pad.b}" visibility="hidden"/>
      <circle class="dot active" r="5" visibility="hidden"/>
    </svg><div class="tooltip" hidden></div>`;

  const svg = $('svg', el), tip = $('.tooltip', el);
  const cursor = $('.cursor', svg), marker = $('.dot.active', svg);
  if (anim) {
    const path = $('.line', svg);
    path.style.setProperty('--len', Math.ceil(path.getTotalLength()));
    path.classList.add('draw');
  }
  const pick = (clientX) => {
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * W;
    let best = pts[0];
    for (const p of pts) if (Math.abs(X(p.mileage) - x) < Math.abs(X(best.mileage) - x)) best = p;
    const cx = X(best.mileage), cy = Y(best.rate);
    cursor.setAttribute('x1', cx); cursor.setAttribute('x2', cx); cursor.setAttribute('visibility', 'visible');
    marker.setAttribute('cx', cx); marker.setAttribute('cy', cy); marker.setAttribute('visibility', 'visible');
    tip.innerHTML = `<b>${fmt(best.rate)}</b> ${esc(t('unit.kml.short'))} · ${esc(best.type)}<br>${fmtDate(best.d)} · ${fmtInt(best.mileage)} ${esc(t('unit.km'))}`;
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

/* ---------- ประวัติ (โหลดต่อเมื่อเลื่อนถึงท้าย) ---------- */
let historyItems = [];
let historyAll = [];
function historyRow(r, i, enterIdx) {
  return `
    <li data-i="${i}" role="button" tabindex="0"${enterIdx != null ? ` class="enter" style="--i:${enterIdx}"` : ''}>
      <div class="h-main">${fmtDate(r.d)}<span class="badge ${typeClass(r.type)}">${esc(r.type)}</span>${r.pending ? `<span class="badge pending">${esc(t('pending'))}</span>` : ''}</div>
      <div class="h-rate">${r.rate != null ? fmt(r.rate) : '–'}<small>${esc(r.rate != null ? t('unit.kml') : t('history.waitNext'))}</small></div>
      <div class="h-sub">${fmtInt(r.mileage)} ${esc(t('unit.km'))} · ${fmt(r.liters)} ${esc(t('unit.l'))} · ฿${fmt(r.oilPrice)}/${esc(t('unit.l'))}</div>
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
      || `<li><div class="h-sub">${esc(t('history.empty'))}</div></li>`;
  }
  $('#loadMore').hidden = historyAll.length <= historyItems.length;
}

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
  $('#mMaxLabel').textContent = max ? `${t('unit.baht')} · ${fmtMonth(max.d)}` : t('unit.baht');
  $('#mNow').textContent = fmtInt(cur ? cur.total : 0);
  $('#mNowLabel').textContent = `${t('unit.baht')} · ${fmtMonth(now)}`;
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
      <div class="h-main">${fmtMonthLong(m.d)}${m.k === nowK ? `<span class="badge">${esc(t('m.thisMonth'))}</span>` : ''}${max && m.k === max.k ? `<span class="badge t-prem">${esc(t('m.highest'))}</span>` : ''}</div>
      <div class="h-rate">฿${fmtInt(m.total)}</div>
      <div class="h-sub">${esc(t('m.fills', { n: m.count }))} · ${fmt(m.liters)} ${esc(t('unit.liters'))}</div>
      <div class="h-sub" style="text-align:right">${m.liters ? `฿${fmt(m.total / m.liters)}/${esc(t('unit.l'))}` : ''}</div>
      <div class="bar-mini"><i style="width:${(m.total / top) * 100}%"></i></div>
    </li>`).join('') || `<li><div class="h-sub">${esc(t('chart.empty'))}</div></li>`;
}

function renderMonthlyChart(months, maxMonth) {
  const el = $('#mChart');
  const W = el.clientWidth || 320, H = el.clientHeight || 240;
  const pad = { l: 42, r: 6, t: 34, b: 26 };
  if (!months.length || months.every((m) => !m.total)) {
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}"><text class="empty" x="${W / 2}" y="${H / 2}" text-anchor="middle">${esc(t('chart.empty'))}</text></svg>`;
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
      ? `<text class="axis-label" x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${mon(m.d)}${m.d.getMonth() === 0 || i === 0 ? yearOf(m.d) : ''}</text>` : '';
    return `<rect class="${cls}" data-i="${i}" x="${x}" y="${Y(0) - h}" width="${bw}" height="${h}" rx="${Math.min(4, bw / 3)}" style="--i:${i}"/>${label}`;
  }).join('');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('m.chart'))}">${grid}${bars}</svg><div class="tooltip" hidden></div>`;

  const svg = $('svg', el), tip = $('.tooltip', el);
  const pick = (clientX) => {
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * W;
    const i = Math.min(months.length - 1, Math.max(0, Math.floor((x - pad.l) / slot)));
    const m = months[i];
    $$('.bar', svg).forEach((b) => b.classList.toggle('sel', +b.dataset.i === i));
    tip.innerHTML = `<b>฿${fmtInt(m.total)}</b><br>${fmtMonthLong(m.d)} · ${esc(t('m.fills', { n: m.count }))}`;
    tip.hidden = false;
    const px = ((pad.l + slot * (i + 0.5)) / W) * rect.width, half = tip.offsetWidth / 2;
    tip.style.left = `${Math.min(Math.max(px, half), rect.width - half)}px`;
  };
  svg.addEventListener('pointerdown', (e) => pick(e.clientX));
  svg.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'mouse') pick(e.clientX); });
  svg.addEventListener('pointerleave', () => { tip.hidden = true; $$('.bar', svg).forEach((b) => b.classList.remove('sel')); });
}

/* ---------- ผ่อนรถ ---------- */
async function loadLoan() {
  if (!state.setup) return;
  try {
    const data = await apiGet('loan');
    if (!Array.isArray(data.rows) || !data.dueDay) throw new Error('needUpdate');
    state.loan = data;
    state.loanError = null;
    store.set(KEYS.loan, data);
  } catch (err) {
    console.error(err);
    // Apps Script รุ่นเก่าไม่รู้จัก action=loan จะส่งรายการเติมน้ำมันกลับมาแทน
    state.loanError = err.message === 'needUpdate' || err.message === 'no loan sheet' ? 'needUpdate' : 'failed';
  }
  if (isOpen('loan')) state.animate = true;
  renderLoan();
  state.animate = false;
}

function renderLoan() {
  const body = $('#loanBody');
  $('#mLoan').textContent = '';
  if (!state.setup) { body.innerHTML = `<p class="empty-state">${esc(t('loan.notConnected'))}</p>`; return; }
  if (!state.loan) {
    body.innerHTML = `<p class="empty-state">${esc(state.loanError === 'needUpdate' ? t('loan.needUpdate') : t('loan.loading'))}</p>`;
    return;
  }
  const all = state.loan.rows.map((r) => ({ ...r, d: new Date(+r.ym.slice(0, 4), +r.ym.slice(5, 7) - 1, 1) }));
  // ยอดที่ซ้ำมากที่สุด = ค่างวด; แถวที่ยอดต่างออกไป (เช่นเงินดาวน์) ไม่นับเป็นงวด แต่รวมในยอดเงิน
  const counts = new Map();
  all.forEach((r) => counts.set(r.amount, (counts.get(r.amount) || 0) + 1));
  const installment = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  all.forEach((r) => { r.down = r.amount !== installment; });
  const rows = all.filter((r) => !r.down);
  const paid = rows.filter((r) => r.paid);
  const total = all.reduce((s, r) => s + r.amount, 0);
  const paidAmt = all.filter((r) => r.paid).reduce((s, r) => s + r.amount, 0);
  const pct = rows.length ? paid.length / rows.length : 0;
  const next = rows.find((r) => !r.paid);
  const dueDay = state.loan.dueDay || 25;
  const nowK = monthKey(new Date());
  const anim = state.animate && !reduceMotion;

  let nextHtml = `<div class="next-due"><div><div class="v">${esc(t('loan.done'))}</div></div></div>`;
  if (next) {
    const due = new Date(next.d.getFullYear(), next.d.getMonth(), dueDay);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const days = Math.round((due - today) / 864e5);
    nextHtml = `<div class="next-due">
        <div><div class="k">${esc(t('loan.next'))}</div><div class="v">${fmtDate(due)} · ฿${fmtInt(next.amount)}</div></div>
        <div class="in">${esc(days <= 0 ? t('loan.dueToday') : t('loan.dueIn', { n: days }))}</div>
      </div>`;
  }

  $('#mLoan').textContent = next
    ? t('menu.loan', { paid: paid.length, total: rows.length, date: fmtDate(new Date(next.d.getFullYear(), next.d.getMonth(), dueDay)) })
    : t('loan.done');
  const C = 2 * Math.PI * 54;
  const years = new Map();
  all.forEach((r) => {
    const y = r.d.getFullYear();
    if (!years.has(y)) years.set(y, []);
    years.get(y).push(r);
  });
  let ci = 0;
  const grid = [...years].map(([y, list]) => `
    <div class="loan-year">
      <h3>${LANG === 'th' ? y + 543 : y}</h3>
      <div class="loan-grid">${list.map((r) => `<div class="loan-cell${r.paid ? ' paid' : ''}${r.down ? ' down' : ''}${monthKey(r.d) === nowK ? ' now' : ''}${anim ? ' enter' : ''}" style="--i:${ci++}">${r.down ? esc(t('loan.down')) : mon(r.d)}</div>`).join('')}</div>
    </div>`).join('');

  body.innerHTML = `
    <section class="stats">
      <div class="stat"><span class="stat-label">${esc(t('loan.paid'))}</span><span class="stat-value">${paid.length}/${rows.length}</span><span class="stat-unit">${esc(t('loan.installments'))}</span></div>
      <div class="stat"><span class="stat-label">${esc(t('loan.paidAmount'))}</span><span class="stat-value">${fmtInt(paidAmt)}</span><span class="stat-unit">${esc(t('unit.baht'))}</span></div>
      <div class="stat"><span class="stat-label">${esc(t('loan.remaining'))}</span><span class="stat-value">${fmtInt(total - paidAmt)}</span><span class="stat-unit">${esc(t('unit.baht'))}</span></div>
    </section>
    <section class="card">
      <div class="card-head"><h2>${esc(t('loan.progress'))}</h2></div>
      <div class="loan-hero">
        <div class="ring">
          <svg viewBox="0 0 120 120"><circle class="track-c" cx="60" cy="60" r="54" stroke-width="12" fill="none"/>
            <circle class="bar-c" cx="60" cy="60" r="54" stroke-width="12" fill="none" stroke-dasharray="${C}" stroke-dashoffset="${anim ? C : C * (1 - pct)}" data-target="${C * (1 - pct)}"/></svg>
          <div class="ring-label"><b>${Math.round(pct * 100)}%</b><small>${esc(t('loan.of', { n: rows.length }))}</small></div>
        </div>
        <div class="loan-facts">
          <div><div class="k">${esc(t('loan.paidAmount'))}</div><div class="v">฿${fmtInt(paidAmt)}</div></div>
          <div><div class="k">${esc(t('loan.remaining'))}</div><div class="v">฿${fmtInt(total - paidAmt)}</div></div>
        </div>
      </div>
      ${nextHtml}
    </section>
    <section class="card">
      <div class="card-head"><h2>${esc(t('loan.schedule'))}</h2></div>
      ${grid}
      <p class="loan-note">${esc(t('loan.autoNote'))}</p>
    </section>`;
  if (anim) {
    const bar = $('.bar-c', body);
    requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.strokeDashoffset = bar.dataset.target; }));
  }
}

/* ---------- หน้าซ้อน (stack): หน้าย่อย / ฟอร์ม / ตั้งค่า ---------- */
const stack = [];
const isOpen = (id) => stack.some((sh) => sh.id === id);
const topSheet = () => stack[stack.length - 1] || null;

// หน้าที่ต้อง render ใหม่ตอนเปิด (ให้กราฟได้ขนาดจริงและเล่น animation)
const ON_OPEN = {
  form: () => initForm(),
  settings: () => initSettings(),
  economy: () => { state.animate = true; renderChart(entries()); state.animate = false; },
  historyPage: () => { state.animate = true; renderHistory(entries(), { reset: true }); state.animate = false; },
  monthly: () => { state.animate = true; renderMonthly(entries()); state.animate = false; },
  loan: () => { state.animate = true; renderLoan(); state.animate = false; },
  prices: () => renderPrices(),
};

function open(id) {
  const sheet = $(`#${id}`);
  if (!sheet || isOpen(id)) return;
  const below = topSheet();
  sheet.scrollTop = 0;
  sheet.classList.remove('closing', 'covered', 'uncovered');
  sheet.hidden = false;
  sheet.style.zIndex = 10 + stack.length * 2;
  ON_OPEN[id]?.();
  sheet.classList.add('opening');
  if (sheet.classList.contains('sheet-push')) {
    const el = below || $('.shell');
    el.classList.remove('unpushed', 'uncovered');
    el.classList.add(below ? 'covered' : 'pushed');
  }
  if (sheet.classList.contains('sheet-bottom')) {
    const bd = $('#backdrop');
    bd.style.zIndex = 9 + stack.length * 2;
    bd.classList.remove('closing');
    bd.hidden = false;
  }
  stack.push(sheet);
}

function closeTop() {
  const sheet = stack.pop();
  if (!sheet) return;
  document.activeElement?.blur?.();
  const below = topSheet();
  if (sheet.classList.contains('sheet-push')) {
    const el = below || $('.shell');
    if (el.classList.contains('covered') || el.classList.contains('pushed')) {
      el.classList.remove('covered', 'pushed');
      el.classList.add(below ? 'uncovered' : 'unpushed');
      setTimeout(() => el.classList.remove('uncovered', 'unpushed'), 330);
    }
  }
  if (sheet.classList.contains('sheet-bottom')) {
    const bd = $('#backdrop');
    bd.classList.add('closing');
    setTimeout(() => { bd.hidden = true; bd.classList.remove('closing'); }, 250);
  }
  sheet.classList.remove('opening');
  sheet.classList.add('closing');
  const done = () => { sheet.hidden = true; sheet.classList.remove('closing'); sheet.style.transform = ''; };
  if (reduceMotion) done(); else setTimeout(done, 320);
  // รถวิ่งกลับเข้ามาหลังปิดฟอร์ม
  if (sheet.id === 'form') {
    const stage = $('#carStage');
    stage.classList.remove('driving');
    stage.classList.add('returning');
    setTimeout(() => stage.classList.remove('returning'), 900);
  }
}

function closeSheets() { while (stack.length) closeTop(); }

// ราคาน้ำมัน PTT วันนี้
async function renderPrices() {
  const list = $('#pricesList');
  if (!state.setup) { $('#pricesDate').textContent = t('loan.notConnected'); list.innerHTML = ''; return; }
  if (!ptt) { $('#pricesDate').textContent = t('form.pttLoading'); list.innerHTML = ''; }
  await loadPtt();
  if (!ptt || !ptt.prices) { $('#pricesDate').textContent = t('prices.unavailable'); return; }
  $('#pricesDate').textContent = t('prices.effective', { date: fmtDate(parseDate(ptt.date)) });
  list.innerHTML = OIL_TYPES.filter((ty) => ptt.prices[ty]).map((ty) => `
    <div class="row"><span><span class="badge ${typeClass(ty)}" style="margin:0">${esc(ty)}</span></span><span>฿${fmt(ptt.prices[ty])}</span></div>`).join('');
}

// แตะรถ → รถวิ่งออก แล้วฟอร์มเลื่อนขึ้นมา
async function startFill() {
  if (stack.length) return;
  const stage = $('#carStage');
  if (!reduceMotion) {
    stage.classList.remove('intro', 'returning');
    stage.classList.add('driving');
    await wait(380);
  }
  open('form');
}
$('#carStage').addEventListener('click', startFill);
$('#qAdd').addEventListener('click', startFill);
$('#qPrice').addEventListener('click', () => open('prices'));
$('#qSync').addEventListener('click', async () => {
  if (!state.setup) { toast(t('t.notConnected')); return; }
  const b = $('#qSync');
  b.classList.add('busy');
  await sync();
  b.classList.remove('busy');
});

/* ---------- form ---------- */
const form = $('#entryForm');
let selectedType = null;

function lastEntry() { const l = entries(); return l[l.length - 1]; }
function lastPriceFor(type) {
  const l = entries().filter((r) => r.type === type);
  return l.length ? l[l.length - 1].oilPrice : null;
}

// ราคา PTT วันนี้ (แคชไว้ในเครื่อง 1 ชั่วโมง)
let ptt = store.get(KEYS.ptt, null);
async function loadPtt() {
  if (!state.setup) return null;
  if (ptt && Date.now() - ptt.at < 3600e3) return ptt;
  try {
    const data = await apiGet('price');
    if (!data.prices) return null;
    ptt = { ...data, at: Date.now() };
    store.set(KEYS.ptt, ptt);
    return ptt;
  } catch (err) {
    console.error(err);
    return null;
  }
}
const pttPrice = (type) => ptt && ptt.prices && ptt.prices[type];

function initForm() {
  form.reset();
  const last = lastEntry();
  form.date.value = isoToday();
  selectedType = last ? last.type : OIL_TYPES[0];
  $('#typeChips').innerHTML = OIL_TYPES.map((ty) => `<button type="button" class="chip ${typeClass(ty)}" data-type="${esc(ty)}">${esc(ty)}</button>`).join('');
  setType(selectedType);
  if (state.setup && !(ptt && Date.now() - ptt.at < 3600e3)) {
    $('#priceHint').textContent = t('form.pttLoading');
    loadPtt().then(() => { if (topSheet()?.id === 'form') setType(selectedType); });
  }
  setTimeout(() => form.mileage.focus(), 450);
}

function setType(type) {
  selectedType = type;
  $$('.chip').forEach((c) => c.classList.toggle('active', c.dataset.type === type));
  const pp = pttPrice(type);
  const p = pp || lastPriceFor(type);
  form.oilPrice.placeholder = p ? fmt(p) : '0.00';
  if (p && !form.oilPrice.dataset.touched) form.oilPrice.value = p.toFixed(2);
  $('#priceHint').textContent = pp ? t('form.pttPrice', { p: fmt(pp), date: fmtDate(parseDate(ptt.date)) }) : '';
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
    hint.textContent = t('form.prev', { km: fmtInt(last.mileage), date: fmtDate(last.d) });
    if (Number.isFinite(v.mileage) && v.mileage <= last.mileage) {
      hint.textContent = t('form.mustBeHigher', { km: fmtInt(last.mileage) });
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
    html += `<span class="muted">${esc(t('form.liters'))}</span><b>${fmt(liters)} ${esc(t('unit.liters'))}</b>`;
    if (last && Number.isFinite(v.mileage) && v.mileage > last.mileage) {
      const dist = v.mileage - last.mileage;
      html += `<span class="muted">${esc(t('form.distance'))}</span><b>${fmtInt(dist)} ${esc(t('unit.km'))}</b>`;
      html += `<span class="muted">${esc(t('form.rate'))}</span><b>${fmt(dist / liters)} ${esc(t('unit.kml.short'))}</b>`;
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
  closeTop();
  if (!state.setup) {
    state.rows = [...state.rows, entry];
    store.set(KEYS.demo, state.rows);
    state.animate = true;
    render();
    toast(t('t.savedDemo'));
    return;
  }
  state.pending.push(entry);
  store.set(KEYS.pending, state.pending);
  render();
  toast(t('t.saving'));
  await sync({ quiet: true });
  if (!state.pending.length) toast(t('t.saved'));
});

/* ---------- detail / delete ---------- */
let detailItem = null;

function openDetail(item) {
  detailItem = item;
  const rows = [
    [t('detail.date'), fmtDate(item.d)],
    [t('detail.type'), `<span class="badge ${typeClass(item.type)}" style="margin:0">${esc(item.type)}</span>`],
    [t('detail.mileage'), `${fmtInt(item.mileage)} ${esc(t('unit.km'))}`],
    [t('detail.oilPrice'), `฿${fmt(item.oilPrice)}`],
    [t('detail.price'), `฿${fmt(item.price)}`],
    [t('detail.liters'), `${fmt(item.liters)} ${esc(t('unit.liters'))}`],
    [t('detail.rate'), item.rate != null ? `${fmt(item.rate)} ${esc(t('unit.kml'))}` : esc(t('history.waitNext'))],
  ];
  if (item.pending) rows.push([t('detail.status'), `<span class="badge pending" style="margin:0">${esc(t('detail.pendingStatus'))}</span>`]);
  $('#detailBody').innerHTML = rows.map(([k, v]) => `<div class="row"><span>${esc(k)}</span><span>${v}</span></div>`).join('');
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
  if (!confirm(t('detail.confirm', { date: fmtDate(item.d), km: fmtInt(item.mileage), price: fmtInt(item.price) }))) return;

  // ยังไม่ได้เชื่อม Sheet (โหมดตัวอย่าง) หรือยังรอส่ง → ลบในเครื่องอย่างเดียว
  if (!state.setup || item.pending) {
    if (item.pending) { state.pending.splice(item.src, 1); store.set(KEYS.pending, state.pending); }
    else { state.rows.splice(item.src, 1); store.set(KEYS.demo, state.rows); }
    closeTop(); render(); toast(t('t.deleted'));
    return;
  }
  if (!item.row) {
    toast(t('t.needUpdate'), 4000);
    return;
  }
  const btn = $('#deleteBtn');
  btn.disabled = true;
  btn.textContent = t('detail.deleting');
  try {
    const rows = await apiPost({ action: 'delete', row: item.row, mileage: item.mileage, price: item.price });
    state.rows = rows;
    store.set(KEYS.rows, rows);
    closeTop(); render(); toast(t('t.deletedSheet'));
  } catch (err) {
    console.error(err);
    const changed = err.message === 'mismatch' || err.message === 'not found';
    toast(changed ? t('t.changed') : t('t.deleteFailed'), 3500);
    if (changed) { closeTop(); sync({ quiet: true }); }
  } finally {
    btn.disabled = false;
    btn.textContent = t('detail.delete');
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
      style="--sw-l: ${a.light}; --sw-d: ${a.dark}"><svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg></button>`).join('')
    + `<button type="button" class="swatch custom${theme.accent === 'custom' ? ' active' : ''}" data-accent="custom" aria-label="${esc(t('s.custom'))}"><svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg></button>`;
  $$('#langSeg button').forEach((b) => b.classList.toggle('active', b.dataset.lang === LANG));
}

// วงล้อเลือกสีเอง
function updateHuePicker() {
  const theme = loadTheme();
  const h = theme.h ?? 270, s = theme.s ?? 75;
  const ring = $('#hueRing');
  ring.style.setProperty('--sat', `${s}%`);
  const size = ring.clientWidth || 210;
  const r = (size / 2) * 0.915; // กึ่งกลางความหนาของวงล้อ (ขอบใน 83%)
  const rad = ((h - 90) * Math.PI) / 180;
  const knob = $('#hueKnob');
  knob.style.left = `${size / 2 + r * Math.cos(rad)}px`;
  knob.style.top = `${size / 2 + r * Math.sin(rad)}px`;
  knob.style.background = `hsl(${h} ${s}% 50%)`;
  $('#huePreview').style.background = 'var(--accent)';
  $('#satRange').value = s;
}

function setCustomHue(clientX, clientY) {
  const rect = $('#hueRing').getBoundingClientRect();
  const dx = clientX - (rect.left + rect.width / 2), dy = clientY - (rect.top + rect.height / 2);
  const h = Math.round(((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360) % 360);
  saveTheme({ ...loadTheme(), accent: 'custom', h });
  updateHuePicker();
  renderThemeControls();
}

$('#hueRing').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  const ring = e.currentTarget;
  ring.setPointerCapture(e.pointerId);
  setCustomHue(e.clientX, e.clientY);
  const move = (ev) => setCustomHue(ev.clientX, ev.clientY);
  const up = () => {
    ring.removeEventListener('pointermove', move);
    ring.removeEventListener('pointerup', up);
    ring.removeEventListener('pointercancel', up);
    render({ keepHistory: true });
  };
  ring.addEventListener('pointermove', move);
  ring.addEventListener('pointerup', up);
  ring.addEventListener('pointercancel', up);
});
$('#satRange').addEventListener('input', (e) => {
  saveTheme({ ...loadTheme(), accent: 'custom', s: +e.target.value });
  updateHuePicker();
  renderThemeControls();
});

$('#themeSeg').addEventListener('click', (e) => {
  const b = e.target.closest('[data-theme-mode]');
  if (!b) return;
  saveTheme({ ...loadTheme(), mode: b.dataset.themeMode });
  renderThemeControls();
  render({ keepHistory: true });
});
$('#swatches').addEventListener('click', (e) => {
  const b = e.target.closest('[data-accent]');
  if (!b) return;
  const id = b.dataset.accent;
  saveTheme({ ...loadTheme(), accent: id });
  $('#huePicker').hidden = id !== 'custom';
  if (id === 'custom') updateHuePicker();
  renderThemeControls();
  render({ keepHistory: true });
});
$('#langSeg').addEventListener('click', (e) => {
  const b = e.target.closest('[data-lang]');
  if (!b || b.dataset.lang === LANG) return;
  setLang(b.dataset.lang);
  renderThemeControls();
  renderConnection();
  render();
});

function renderConnection(editing = false) {
  const connected = !!state.setup;
  $('#connCard').hidden = !connected || editing;
  $('#setupEditor').hidden = connected && !editing;
  $('#cancelEditBtn').hidden = !connected;
  if (connected) {
    $('#connTitle').textContent = t('s.connected');
    const id = state.setup.url.split('/s/')[1]?.split('/')[0] || '';
    $('#connUrl').textContent = `script.google.com/…/${id.slice(0, 6)}…${id.slice(-4)}/exec`;
  }
  $('#setupInput').value = editing && connected ? `${state.setup.url}?k=${state.setup.k}` : '';
  $('#settingsStatus').textContent = connected ? '' : t('s.notConnected');
  $('#settingsStatus').className = 'hint';
}

function initSettings() {
  renderThemeControls();
  $('#huePicker').hidden = loadTheme().accent !== 'custom';
  renderConnection();
  if (!$('#huePicker').hidden) requestAnimationFrame(updateHuePicker);
}

$('#editLinkBtn').addEventListener('click', () => { renderConnection(true); $('#setupInput').focus(); });
$('#cancelEditBtn').addEventListener('click', () => renderConnection());

$('#saveSetupBtn').addEventListener('click', async () => {
  const setup = parseSetup($('#setupInput').value);
  const status = $('#settingsStatus');
  if (!setup) {
    status.textContent = t('s.badFormat');
    status.className = 'hint bad';
    return;
  }
  status.textContent = t('s.testing');
  status.className = 'hint';
  const prev = state.setup;
  state.setup = setup;
  try {
    const { rows } = await apiGet();
    state.rows = rows;
    store.set(KEYS.setup, setup);
    store.set(KEYS.rows, rows);
    closeSheets();
    state.animate = true;
    render();
    loadLoan();
    toast(t('t.connected', { n: rows.length }));
  } catch (err) {
    state.setup = prev;
    status.textContent = err.message === 'unauthorized' ? t('s.badToken') : t('s.failed', { e: err.message });
    status.className = 'hint bad';
  }
});

$('#clearSetupBtn').addEventListener('click', () => {
  if (!confirm(t('s.confirmDisconnect'))) return;
  [KEYS.setup, KEYS.rows, KEYS.pending, KEYS.loan, KEYS.ptt].forEach((k) => store.del(k));
  state.setup = null; state.pending = []; state.loan = null; ptt = null;
  state.rows = store.get(KEYS.demo, DEMO_ROWS);
  closeSheets();
  render();
});

/* ---------- gesture: ดึงลงเพื่อรีเฟรช (หน้าแรก) / ปัดจากขอบซ้ายเพื่อย้อนกลับ ---------- */
const PULL_TRIGGER = 70;
let g = null;

$('#homeScroll').addEventListener('touchstart', (e) => {
  if (stack.length || e.touches.length > 1) return;
  const tc = e.touches[0];
  g = { y: tc.clientY, x: tc.clientX, mode: null, pull: 0, atTop: $('#homeScroll').scrollTop <= 0, inner: $('#homeInner') };
}, { passive: true });

$('#homeScroll').addEventListener('touchmove', (e) => {
  if (!g) return;
  const tc = e.touches[0];
  const dx = tc.clientX - g.x, dy = tc.clientY - g.y;
  if (!g.mode) {
    if (dy > 8 && g.atTop && dy > Math.abs(dx)) { g.mode = 'pull'; g.inner.classList.add('pulling'); }
    else if (Math.abs(dy) > 8 || Math.abs(dx) > 10) g.mode = 'none';
  }
  if (g.mode !== 'pull') return;
  e.preventDefault();
  g.pull = Math.min(130, dy * 0.5);
  g.inner.style.transform = `translateY(${g.pull}px)`;
  const ptrEl = $('#ptr');
  const p = Math.min(1, g.pull / PULL_TRIGGER);
  ptrEl.style.opacity = p;
  ptrEl.style.transform = `translateY(${g.pull * 0.6 - 20}px) scale(${0.6 + p * 0.4})`;
  $('svg', ptrEl).style.transform = `rotate(${g.pull * 4}deg)`;
  ptrEl.classList.toggle('ready', g.pull >= PULL_TRIGGER);
}, { passive: false });

const endPull = () => {
  if (!g) return;
  const cur = g;
  g = null;
  if (cur.mode !== 'pull') return;
  cur.inner.classList.remove('pulling');
  if (cur.pull >= PULL_TRIGGER) refreshFromPull(cur.inner);
  else resetPull(cur.inner);
};
$('#homeScroll').addEventListener('touchend', endPull);
$('#homeScroll').addEventListener('touchcancel', endPull);

// ปัดจากขอบซ้ายเพื่อย้อนกลับ (เหมือนแอป iOS)
let edge = null;
document.addEventListener('touchstart', (e) => {
  const sheet = topSheet();
  const tc = e.touches[0];
  if (!sheet || !sheet.classList.contains('sheet-push') || tc.clientX > 24) return;
  edge = { sheet, x: tc.clientX, t: performance.now(), dx: 0 };
}, { passive: true });
document.addEventListener('touchmove', (e) => {
  if (!edge) return;
  edge.dx = Math.max(0, e.touches[0].clientX - edge.x);
  edge.sheet.style.transition = 'none';
  edge.sheet.style.transform = `translateX(${edge.dx}px)`;
  e.preventDefault();
}, { passive: false });
document.addEventListener('touchend', () => {
  if (!edge) return;
  const { sheet, dx, t: t0 } = edge;
  edge = null;
  sheet.style.transition = 'transform .25s var(--ease-out)';
  if (dx > innerWidth * 0.33 || dx / Math.max(1, performance.now() - t0) > 0.6) {
    sheet.style.transform = 'translateX(100%)';
    setTimeout(() => { sheet.style.transition = ''; closeTop(); }, 200);
  } else {
    sheet.style.transform = '';
    setTimeout(() => { sheet.style.transition = ''; }, 260);
  }
});

function resetPull(inner) {
  inner.style.transform = '';
  const ptrEl = $('#ptr');
  ptrEl.classList.remove('loading', 'ready');
  ptrEl.style.opacity = '';
  ptrEl.style.transform = '';
  $('svg', ptrEl).style.transform = '';
}

async function refreshFromPull(inner) {
  const ptrEl = $('#ptr');
  inner.style.transform = 'translateY(56px)';
  ptrEl.style.transform = 'translateY(14px) scale(1)';
  ptrEl.style.opacity = 1;
  $('svg', ptrEl).style.transform = '';
  ptrEl.classList.add('loading');
  if (state.setup) await sync();
  else { await wait(600); toast(t('t.notConnected')); }
  resetPull(inner);
}

/* ---------- wiring ---------- */
$('#settingsBtn').addEventListener('click', () => open('settings'));
$('#backdrop').addEventListener('click', () => closeTop());
$('#rangeSeg').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  state.range = b.dataset.range;
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
new IntersectionObserver((es) => { if (es.some((en) => en.isIntersecting)) loadMoreHistory(); },
  { root: $('#historyPage'), rootMargin: '0px 0px 120px 0px' }).observe($('#loadMore'));

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) closeTop();
  const opener = e.target.closest('[data-open]');
  if (opener) open(opener.dataset.open);
  if (e.target.closest('#retryBtn')) sync();
});
window.addEventListener('online', () => state.pending.length && sync({ quiet: true }));
let resizeT;
window.addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => render({ keepHistory: true }), 150);
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.setup) sync({ quiet: true });
});

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(console.error);
}

applyStaticI18n();
render();
$('#carStage').classList.add('intro');
if (state.setup) sync({ quiet: true });
