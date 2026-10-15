'use strict';

const OIL_TYPES = ['G95', 'G91', 'E20', 'G95 Premium'];
const TYPE_CLASS = { G95: 't-g95', G91: 't-g91', E20: 't-e20', 'G95 Premium': 't-prem' };
const typeClass = (t) => TYPE_CLASS[t] || 't-other';
const KEYS = {
  setup: 'fl.setup', rows: 'fl.rows', pending: 'fl.pending', mRange: 'fl.mRange',
  demo: 'fl.demoRows', ptt: 'fl.ptt', loan: 'fl.loan', car: 'fl.car', hero: 'fl.hero', odo: 'fl.odo', carName: 'fl.carName',
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
  mRange: ['6', '12', 'all'].includes(store.get(KEYS.mRange, '12')) ? store.get(KEYS.mRange, '12') : '12',
  loan: store.get(KEYS.loan, null),
  car: store.get(KEYS.car, null), // { expenses, settings } จากชีต Expenses / Car settings
  carError: null,
  hero: store.get(KEYS.hero, 0),  // ตัวเลขใหญ่หน้าแรก: 0 ระยะที่เหลือ, 1 กม./ล., 2 ฿/กม.
  year: null,
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
  // ทำเครื่องหมายรอบที่กินน้ำมันกว่าปกติเกิน 15% (เทียบค่าเฉลี่ยทั้งหมด)
  const rated = all.filter((r) => r.rate != null);
  const base = rated.length ? rated.reduce((acc, r) => acc + r.rate, 0) / rated.length : 0;
  rated.forEach((r) => { r.low = rated.length >= 5 && r.rate < base * 0.85; });
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
    loadCar();
    if (!quiet) toast(t('t.synced'));
  } catch (err) {
    console.error(err);
    toast(err.message === 'unauthorized' ? t('t.badToken') : !navigator.onLine ? t('t.offline') : t('t.syncFailed'), 3500);
  } finally {
    state.loading = false;
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
  renderCompare(list);
  renderYear(list);
  renderCare(list);
  renderAlerts(list);
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

/* ---------- ตัวชี้วัด ---------- */
const DAY = 864e5;
const yearAgo = () => Date.now() - 365 * DAY;

// ช่วงระหว่างการเติมแต่ละครั้ง: ระยะทาง, ลิตรที่ใช้ (= ลิตรที่เติมครั้งถัดไป), ค่าน้ำมันของช่วงนั้น
function segments(list, from = 0) {
  const out = [];
  for (let i = 0; i < list.length - 1; i++) {
    const a = list[i], b = list[i + 1];
    if (!a.d || a.d.getTime() < from || !(b.liters > 0)) continue;
    const dist = b.mileage - a.mileage;
    if (dist <= 0) continue;
    out.push({ from: a, type: a.type, dist, liters: b.liters, cost: b.liters * a.oilPrice });
  }
  return out;
}
const sumBy = (arr, f) => arr.reduce((acc, x) => acc + f(x), 0);

// ระยะวิ่งเฉลี่ยต่อวัน (1 ปีล่าสุด)
function kmPerDay(list) {
  const recent = list.filter((r) => r.d && r.d.getTime() >= yearAgo());
  const a = recent.length >= 2 ? recent : list;
  if (a.length < 2) return null;
  const days = (a[a.length - 1].d - a[0].d) / DAY;
  return days > 0 ? (a[a.length - 1].mileage - a[0].mileage) / days : null;
}

const DEFAULT_TANK = 40; // ลิตร (Yaris ATIV)
const DEFAULT_CAR_NAME = 'Yaris ATIV';
// ชื่อรถ: เก็บในชีต Car settings (ใช้ได้ทุกเครื่อง) และในเครื่องเป็นค่าสำรอง
const carName = () => state.car?.settings?.carName || store.get(KEYS.carName, '') || DEFAULT_CAR_NAME;
const tankLiters = () => Number(state.car?.settings?.tankL) || DEFAULT_TANK;

// เลขไมล์ที่ผู้ใช้อัปเดตเองล่าสุด (เก็บในเครื่อง + ชีต Car settings) เลือกอันที่ใหม่กว่า
function odoReading() {
  const local = store.get(KEYS.odo, null);
  const st = state.car?.settings || {};
  const sheet = st.odoKm ? { km: Number(st.odoKm), date: st.odoDate } : null;
  const pick = [local, sheet].filter((x) => x && x.km > 0 && parseDate(x.date))
    .sort((a, b) => parseDate(b.date) - parseDate(a.date))[0];
  return pick ? { km: pick.km, d: parseDate(pick.date) } : null;
}

// ระยะต่อถังที่ขับจริง = ค่ากลางของระยะทางระหว่างการเติม (1 ปีล่าสุด) เพราะเติมเต็มถังทุกครั้ง
// แต่ปกติแวะเติมก่อนน้ำมันหมด จึงสมจริงกว่าความจุถัง × กม./ลิตร (ใช้เป็นค่าสำรองเมื่อข้อมูลน้อย)
function typicalTankKm(list) {
  const d = segments(list, yearAgo()).map((x) => x.dist).sort((a, b) => a - b);
  if (d.length < 5) return null;
  const mid = Math.floor(d.length / 2);
  return d.length % 2 ? d[mid] : (d[mid - 1] + d[mid]) / 2;
}

// ระยะที่วิ่งได้อีก = ระยะต่อถังที่ขับจริง − ระยะที่วิ่งไปแล้วหลังเติม
// ระยะที่วิ่งไปแล้ว = จากเลขไมล์ที่อัปเดตไว้ (ถ้ามีหลังเติมครั้งล่าสุด) + ค่าเฉลี่ยต่อวันสำหรับวันที่เหลือ
function estimate(list) {
  const last = list[list.length - 1];
  const seg = segments(list, yearAgo());
  const kml = seg.length ? sumBy(seg, (x) => x.dist) / sumBy(seg, (x) => x.liters) : average(list, list.filter((r) => r.rate != null));
  const costKm = seg.length ? sumBy(seg, (x) => x.cost) / sumBy(seg, (x) => x.dist) : null;
  if (!last || !last.d) return { kml, costKm };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.max(0, Math.round((today - last.d) / DAY));
  const perDay = kmPerDay(list) || 0;
  const reading = odoReading();
  const useReading = reading && reading.km >= last.mileage && reading.d >= last.d;
  const sinceReading = useReading ? Math.max(0, Math.round((today - reading.d) / DAY)) : 0;
  const odo = useReading ? reading.km + perDay * sinceReading : last.mileage + perDay * days;
  const driven = odo - last.mileage;
  const typical = typicalTankKm(list);
  const range = typical || (kml ? tankLiters() * kml : null);
  return {
    kml, costKm, days, perDay, last, odo, reading: useReading ? reading : null, sinceReading, typical,
    range, remaining: range != null ? Math.max(0, range - driven) : null,
  };
}

// หน้าแรก: ตัวเลขใหญ่ (แตะเพื่อสลับ) + สถานะ + คำอธิบายในเมนู
function renderHome(list) {
  $('.car-title').textContent = carName();
  const e = estimate(list);
  const avg = e.kml;
  const last = e.last;
  const ago = last ? (e.days <= 0 ? t('ago.today') : t('ago.days', { n: e.days })) : '';
  const modes = [
    e.remaining != null && e.remaining < 30
      // ประมาณแล้วน่าจะใช้น้ำมันถังล่าสุดหมดแล้ว
      ? { num: `~${fmtInt(e.range)}`, unit: t('unit.km'), status: t('hero.timeToFill'),
        sub: `${e.typical ? t('hero.perTankTypical') : t('hero.perTank', { l: tankLiters() })} · ${t('hero.lastFill', { ago })}` }
      : { num: e.remaining != null ? `~${fmtInt(e.remaining)}` : '–', unit: t('unit.km'),
        status: t('hero.remaining'),
        sub: !last ? '' : e.reading
          ? `${t('hero.fromOdo', { ago: e.sinceReading <= 0 ? t('ago.today') : t('ago.days', { n: e.sinceReading }) })} · ${t('hero.lastFill', { ago })}`
          : `${t('hero.lastFill', { ago })} · ${t('hero.perDay', { n: fmtInt(e.perDay) })}` },
    { num: avg ? fmt(avg, 1) : '–', unit: t('unit.kml'), status: t('hero.kml'), sub: last ? t('hero.lastFill', { ago }) : '' },
    { num: e.costKm ? fmt(e.costKm) : '–', unit: t('unit.bahtKm'), status: t('hero.costKm'), sub: t('hero.year') },
  ];
  const m = modes[state.hero] || modes[0];
  $('#heroNum').textContent = m.num;
  $('#heroUnit').textContent = m.unit;
  $('#heroStatus').innerHTML = `${esc(m.status)}<small>${esc(m.sub)}</small>`;
  $$('#heroDots i').forEach((d, i) => d.classList.toggle('on', i === state.hero));
  // ปุ่มเลขไมล์ด่วน
  if (e.odo) {
    const fresh = e.reading && e.sinceReading === 0;
    $('#odoValue').textContent = `${fresh ? '' : '~'}${fmtInt(e.odo)} ${t('unit.km')}`;
    $('#odoNote').textContent = e.reading ? t('odo.updated', { ago: e.sinceReading <= 0 ? t('ago.today') : t('ago.days', { n: e.sinceReading }) }) : t('odo.estimated');
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

$('#hero').addEventListener('click', () => {
  state.hero = (state.hero + 1) % 3;
  store.set(KEYS.hero, state.hero);
  const el = $('#hero');
  el.classList.remove('flip'); void el.offsetWidth; el.classList.add('flip');
  renderHome(entries());
});

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
  const seg = segments(list, state.range === 'all' ? 0 : Date.now() - Number(state.range) * DAY);
  $('#statCostKm').textContent = seg.length ? fmt(sumBy(seg, (x) => x.cost) / sumBy(seg, (x) => x.dist)) : '–';
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

/* ---------- ประวัติ (จัดกลุ่มตามเดือน + โหลดต่อเมื่อเลื่อนถึงท้าย) ---------- */
let historyItems = [];
let historyAll = [];
let historyAvg = null;
const PUMP_PATH = 'M4 3.5A1.5 1.5 0 0 1 5.5 2h8A1.5 1.5 0 0 1 15 3.5V20h.5a1 1 0 1 1 0 2h-12a1 1 0 1 1 0-2H4zM6.5 4.5v5h6v-5zM16.3 5.3a1 1 0 0 1 1.4 0l2.7 2.7c.4.4.6.9.6 1.4V17a2.5 2.5 0 0 1-5 0v-3.5h1.5V17a1 1 0 0 0 2 0v-5.5h-.6A1.6 1.6 0 0 1 17.3 10V8.4l-1-1a1 1 0 0 1 0-1.4z';
const WEEKDAYS = { th: ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'], en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] };

function monthHeader(r) {
  const k = monthKey(r.d);
  const items = historyAll.filter((x) => x.d && monthKey(x.d) === k);
  return `<li class="h-month"><b>${fmtMonthLong(r.d)}</b><span>${esc(t('m.fills', { n: items.length }))} · ฿${fmtInt(sumBy(items, (x) => x.price))}</span></li>`;
}

function historyRow(r, i, enterIdx) {
  const prev = historyAll[historyAll.indexOf(r) + 1]; // ครั้งก่อนหน้า (รายการเรียงใหม่→เก่า)
  const dist = prev ? r.mileage - prev.mileage : null;
  const diff = r.rate != null && historyAvg ? (r.rate - historyAvg) / historyAvg : null;
  const trend = diff == null ? '' : diff >= 0.03 ? 'up' : diff <= -0.03 ? 'down' : 'flat';
  return `
    <li class="fill-item ${typeClass(r.type)}${enterIdx != null ? ' enter' : ''}" data-i="${i}" role="button" tabindex="0"${enterIdx != null ? ` style="--i:${enterIdx}"` : ''}>
      <span class="fi-icon"><svg class="ic" viewBox="0 0 24 24"><path fill-rule="evenodd" d="${PUMP_PATH}"/></svg></span>
      <span class="fi-date"><b>${r.d ? r.d.getDate() : '–'}</b><small>${r.d ? WEEKDAYS[LANG][r.d.getDay()] : ''}</small></span>
      <span class="fi-main">
        <span class="fi-top"><span class="badge ${typeClass(r.type)}" style="margin:0">${esc(r.type)}</span>${r.pending ? `<span class="badge pending">${esc(t('pending'))}</span>` : ''}<b class="fi-amount">฿${fmtInt(r.price)}</b></span>
        <span class="fi-chips">
          <span>${fmt(r.liters, 1)} ${esc(t('unit.l'))}</span>
          ${dist != null ? `<span>+${fmtInt(dist)} ${esc(t('unit.km'))}</span>` : ''}
          <span class="rate ${trend}">${r.rate != null ? `${trend === 'up' ? '▲' : trend === 'down' ? '▼' : '•'} ${fmt(r.rate, 1)} ${esc(t('unit.kml.short'))}` : esc(t('history.waitNext'))}</span>
        </span>
      </span>
    </li>`;
}

// แสดงหลายรายการ พร้อมหัวเดือนเมื่อเดือนเปลี่ยน
function historyHtml(items, startIdx, animate) {
  let html = '';
  items.forEach((r, j) => {
    const i = startIdx + j;
    const before = historyAll[i - 1];
    if (r.d && (!before || !before.d || monthKey(before.d) !== monthKey(r.d))) html += monthHeader(r);
    html += historyRow(r, i, animate && j < 14 ? j : null);
  });
  return html;
}

function renderHistory(list, { reset = false } = {}) {
  const ul = $('#history');
  if (reset) {
    historyAll = [...list].reverse();
    const rated = list.filter((r) => r.rate != null && r.d && r.d.getTime() >= yearAgo());
    historyAvg = rated.length ? sumBy(rated, (r) => r.rate) / rated.length : null;
    state.shown = Math.max(PAGE_SIZE, Math.min(state.shown, historyAll.length));
    historyItems = historyAll.slice(0, state.shown);
    const animate = state.animate && !reduceMotion;
    ul.innerHTML = historyHtml(historyItems, 0, animate) || `<li><div class="h-sub">${esc(t('history.empty'))}</div></li>`;
    renderHistorySummary(list);
  }
  $('#loadMore').hidden = historyAll.length <= historyItems.length;
}

// สรุปด้านบนหน้าประวัติ + กราฟเส้นเล็ก (อัตรากินน้ำมัน 20 ครั้งล่าสุด)
function renderHistorySummary(list) {
  const el = $('#historySummary');
  if (!el) return;
  const pts = list.filter((r) => r.rate != null).slice(-20);
  let spark = '';
  if (pts.length >= 3) {
    const ys = pts.map((p) => p.rate), lo = Math.min(...ys), hi = Math.max(...ys);
    const X = (i) => (i / (pts.length - 1)) * 100, Y = (v) => 34 - ((v - lo) / (hi - lo || 1)) * 30;
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.rate).toFixed(1)}`).join('');
    spark = `<svg class="spark" viewBox="0 0 100 38" preserveAspectRatio="none"><path d="${d}L100,38L0,38Z" class="spark-area"/><path d="${d}" class="spark-line"/></svg>`;
  }
  el.innerHTML = `
    <div class="hs-stats">
      <div><b>${list.length}</b><span>${esc(t('yr.fills'))}</span></div>
      <div><b>${fmtInt(sumBy(list, (r) => r.liters))}</b><span>${esc(t('unit.liters'))}</span></div>
      <div><b>฿${fmtInt(sumBy(list, (r) => r.price))}</b><span>${esc(t('hs.total'))}</span></div>
    </div>
    ${spark ? `<div class="hs-spark"><span>${esc(t('hs.trend'))}</span>${spark}</div>` : ''}`;
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
    $('#history').insertAdjacentHTML('beforeend', historyHtml(next, start, !reduceMotion));
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
    const m = map.get(k) || { k, total: 0, count: 0, liters: 0, dist: 0 };
    m.total += r.price; m.count += 1; m.liters += r.liters;
    map.set(k, m);
  }
  // ระยะทางของเดือน = ช่วงที่เริ่มในเดือนนั้น
  for (const sg of segments(list)) {
    const m = map.get(monthKey(sg.from.d));
    if (m) m.dist += sg.dist;
  }
  const nowK = monthKey(new Date());
  const keys = [...map.keys()];
  if (!keys.length) return [];
  const months = [];
  // เติมเดือนที่ไม่ได้เติมน้ำมันเป็น 0 เพื่อให้กราฟต่อเนื่อง
  for (let k = Math.min(...keys); k <= Math.max(nowK, ...keys); k++) {
    months.push({ ...(map.get(k) || { k, total: 0, count: 0, liters: 0, dist: 0 }), d: keyToDate(k) });
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
  if (state.mRange !== 'all') shown = months.filter((m) => m.k > nowK - Number(state.mRange) && m.k <= nowK);
  renderMonthlyChart(shown, max);

  const withData = [...months].reverse().filter((m) => m.count || m.k === nowK);
  const top = Math.max(1, ...withData.map((m) => m.total));
  const anim = state.animate && !reduceMotion;
  $('#mList').innerHTML = withData.map((m, i) => `
    <li${anim && i < 12 ? ` class="enter" style="--i:${i}"` : ''}>
      <div class="h-main">${fmtMonthLong(m.d)}${m.k === nowK ? `<span class="badge">${esc(t('m.thisMonth'))}</span>` : ''}${max && m.k === max.k ? `<span class="badge t-prem">${esc(t('m.highest'))}</span>` : ''}</div>
      <div class="h-rate">฿${fmtInt(m.total)}</div>
      <div class="h-sub">${esc(t('m.fills', { n: m.count }))} · ${fmt(m.liters)} ${esc(t('unit.liters'))}${m.dist ? ` · ~${fmtInt(m.dist)} ${esc(t('unit.km'))}` : ''}</div>
      <div class="h-sub" style="text-align:right">${m.dist ? `฿${fmt(m.total / m.dist)}/${esc(t('unit.km'))}` : ''}</div>
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
  const down = all.filter((r) => r.down).reduce((s, r) => s + r.amount, 0);
  const pct = rows.length ? paid.length / rows.length : 0;
  const next = rows.find((r) => !r.paid);
  const lastRow = rows[rows.length - 1];
  const dueDay = state.loan.dueDay || 25;
  const nowK = monthKey(new Date());
  const anim = state.animate && !reduceMotion;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yLabel = (y) => (LANG === 'th' ? y + 543 : y);

  let dueDate = null, days = null;
  if (next) {
    dueDate = new Date(next.d.getFullYear(), next.d.getMonth(), dueDay);
    days = Math.round((dueDate - today) / DAY);
  }
  $('#mLoan').textContent = next
    ? t('menu.loan', { paid: paid.length, total: rows.length, date: fmtDate(dueDate) })
    : t('loan.done');

  const years = new Map();
  rows.forEach((r) => {
    const y = r.d.getFullYear();
    if (!years.has(y)) years.set(y, []);
    years.get(y).push(r);
  });
  let ci = 0;
  const schedule = [...years].map(([y, list]) => `
    <div class="ln-year">
      <span class="ln-year-label">${yLabel(y)}</span>
      <div class="ln-dots">${list.map((r) => {
        const cls = [r.paid ? 'paid' : '', r.down ? 'down' : '', monthKey(r.d) === nowK ? 'now' : '', anim ? 'enter' : ''].filter(Boolean).join(' ');
        return `<span class="ln-dot ${cls}" style="--i:${ci++}" title="${fmtMonth(r.d)}"><i>${r.paid ? '✓' : ''}</i><small>${r.down ? esc(t('loan.down')) : mon(r.d)}</small></span>`;
      }).join('')}</div>
    </div>`).join('');

  body.innerHTML = `
    <section class="ln-hero${anim ? ' enter' : ''}">
      <span class="ln-kicker">${esc(t('loan.remaining'))}</span>
      <b class="ln-amount">฿${fmtInt(total - paidAmt)}</b>
      <span class="ln-sub">${esc(t('loan.of', { n: rows.length }))} · ${esc(t('loan.paidN', { n: paid.length }))}</span>
      <div class="ln-track">
        <div class="ln-fill" style="--p:${anim ? 0 : pct}" data-p="${pct}"></div>
        <span class="ln-car" style="--p:${anim ? 0 : pct}" data-p="${pct}"><svg class="ic" viewBox="0 0 24 24"><path d="M5 11l1.6-4.2A2 2 0 0 1 8.5 5.5h7a2 2 0 0 1 1.9 1.3L19 11h.5A1.5 1.5 0 0 1 21 12.5V17a1 1 0 0 1-1 1h-1a2 2 0 0 1-4 0H9a2 2 0 0 1-4 0H4a1 1 0 0 1-1-1v-4.5A1.5 1.5 0 0 1 4.5 11zm2.2 0h9.6l-1.1-3a1 1 0 0 0-.9-.6H9.2a1 1 0 0 0-.9.6z"/></svg></span>
        <span class="ln-flag">🏁</span>
      </div>
      <div class="ln-ends"><span>${Math.round(pct * 100)}%</span><span>${lastRow ? esc(t('loan.finish', { m: fmtMonth(lastRow.d) })) : ''}</span></div>
    </section>

    ${next ? `
    <section class="ln-next">
      <div class="cal"><small>${mon(dueDate)}</small><b>${dueDate.getDate()}</b></div>
      <div class="ln-next-text">
        <span>${esc(t('loan.next'))} · ${esc(t('loan.nth', { n: paid.length + 1 }))}</span>
        <b>฿${fmtInt(next.amount)}</b>
      </div>
      <span class="ln-count${days <= 7 ? ' soon' : ''}">${esc(days <= 0 ? t('loan.dueToday') : t('loan.dueIn', { n: days }))}</span>
    </section>` : `<section class="ln-next done"><b>${esc(t('loan.done'))}</b></section>`}

    <section class="ln-stats">
      <div><span>${esc(t('loan.paidAmount'))}</span><b>฿${fmtInt(paidAmt)}</b></div>
      <div><span>${esc(t('loan.monthly'))}</span><b>฿${fmtInt(installment || 0)}</b></div>
      ${down ? `<div><span>${esc(t('loan.downAmount'))}</span><b>฿${fmtInt(down)}</b></div>` : ''}
    </section>

    <section class="card">
      <div class="card-head"><h2>${esc(t('loan.schedule'))}</h2></div>
      ${schedule}
      <p class="loan-note">${esc(t('loan.autoNote'))}</p>
    </section>`;
  if (anim) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      $$('[data-p]', body).forEach((el) => el.style.setProperty('--p', el.dataset.p));
    }));
  }
}

/* ---------- 2. เทียบชนิดน้ำมัน ---------- */
function renderCompare(list) {
  const seg = segments(list);
  const types = OIL_TYPES.map((ty) => {
    const xs = seg.filter((x) => x.type === ty);
    if (xs.length < 2) return null;
    const dist = sumBy(xs, (x) => x.dist), liters = sumBy(xs, (x) => x.liters), cost = sumBy(xs, (x) => x.cost);
    return { ty, n: xs.length, kml: dist / liters, perL: cost / liters, perKm: cost / dist };
  }).filter(Boolean);
  const el = $('#typeCompare');
  if (!types.length) { el.innerHTML = `<p class="hint">${esc(t('chart.notEnough'))}</p>`; return; }
  const best = types.reduce((a, b) => (b.perKm < a.perKm ? b : a));
  const worst = Math.max(...types.map((x) => x.perKm));
  el.innerHTML = types.map((x) => `
    <div class="cmp-row ${typeClass(x.ty)}">
      <div class="cmp-head"><span class="badge ${typeClass(x.ty)}" style="margin:0">${esc(x.ty)}</span>
        ${x === best && types.length > 1 ? `<span class="cmp-best">${esc(t('cmp.best'))}</span>` : ''}
        <b>฿${fmt(x.perKm)}<small>/${esc(t('unit.km'))}</small></b></div>
      <div class="cmp-bar"><i style="width:${(x.perKm / worst) * 100}%"></i></div>
      <div class="h-sub">${fmt(x.kml)} ${esc(t('unit.kml'))} · ฿${fmt(x.perL)}/${esc(t('unit.l'))} · ${esc(t('cmp.n', { n: x.n }))}</div>
    </div>`).join('');
}

/* ---------- 4. สรุปรายปี (แบบ Year in review) ---------- */

function renderYear(list) {
  const years = [...new Set(list.filter((r) => r.d).map((r) => r.d.getFullYear()))].sort((a, b) => b - a);
  const seg = $('#yearSeg');
  if (!years.length) {
    seg.innerHTML = '';
    $('#yearBody').innerHTML = `<p class="empty-state">${esc(t('chart.empty'))}</p>`;
    $('#mYear').textContent = '';
    return;
  }
  if (!years.includes(state.year)) state.year = years[0];
  const yLabel = (y) => (LANG === 'th' ? y + 543 : y);
  seg.innerHTML = years.slice(0, 5).map((y) => `<button type="button" data-year="${y}" class="${y === state.year ? 'active' : ''}">${yLabel(y)}</button>`).join('');
  const y = state.year;
  const inYear = list.filter((r) => r.d && r.d.getFullYear() === y);
  const before = list.filter((r) => r.d && r.d.getFullYear() < y);
  const startKm = before.length ? before[before.length - 1].mileage : inYear[0].mileage;
  const dist = inYear[inYear.length - 1].mileage - startKm;
  const fuel = sumBy(inYear, (r) => r.price);
  const liters = sumBy(inYear, (r) => r.liters);
  const segs = segments(list).filter((x) => x.from.d.getFullYear() === y);
  const kml = segs.length ? sumBy(segs, (x) => x.dist) / sumBy(segs, (x) => x.liters) : null;
  const costKm = dist > 0 ? fuel / dist : null;
  const other = (state.car?.expenses || []).filter((x) => x.date.startsWith(String(y))).reduce((acc, x) => acc + x.amount, 0);
  const byMonth = Array.from({ length: 12 }, (_, m) => sumBy(inYear.filter((r) => r.d.getMonth() === m), (r) => r.price));
  const topM = byMonth.indexOf(Math.max(...byMonth));
  const typeCount = {};
  inYear.forEach((r) => { typeCount[r.type] = (typeCount[r.type] || 0) + 1; });
  const mix = Object.entries(typeCount).sort((a, b) => b[1] - a[1]);
  const anim = state.animate && !reduceMotion;
  const tank = tankLiters();
  const tanks = liters / tank;

  // เลขไมล์แบบหน้าปัด: แต่ละหลักเป็นแถบ 0–9 ที่หมุนไปยังตัวเลขจริง
  const odoDigits = String(Math.max(0, Math.round(dist))).padStart(6, '0').split('');
  const firstReal = odoDigits.findIndex((c) => c !== '0');
  const odometer = `<div class="odo-meter">${odoDigits.map((c, i) => `
      <span class="odo-digit${i < firstReal || firstReal < 0 ? ' lead' : ''}${i === odoDigits.length - 1 ? ' last' : ''}">
        <span class="odo-strip" style="--d:${anim ? 0 : c};--i:${i}" data-d="${c}">${'0123456789'.split('').map((n) => `<b>${n}</b>`).join('')}</span>
      </span>`).join('')}<span class="odo-unit">${esc(t('unit.km'))}</span></div>`;
  // หยดน้ำมันเติมตามจำนวนถัง (เศษของถังสุดท้าย)
  const dropFill = 100 - Math.min(100, ((tanks % 1) || 1) * 100);
  const drop = `<svg class="yr-drop" viewBox="0 0 40 52"><defs><clipPath id="dropClip"><path d="M20 2C12 14 4 24 4 33a16 16 0 0 0 32 0C36 24 28 14 20 2z"/></clipPath></defs>
      <path class="drop-bg" d="M20 2C12 14 4 24 4 33a16 16 0 0 0 32 0C36 24 28 14 20 2z"/>
      <rect class="drop-fill" clip-path="url(#dropClip)" x="0" y="${(dropFill / 100) * 52}" width="40" height="52"/></svg>`;
  // หน้าปัดอัตรากินน้ำมัน (0–25 กม./ล.)
  const g = Math.min(1, (kml || 0) / 25), ang = Math.PI * (1 - g);
  const gauge = `<svg class="yr-gauge" viewBox="0 0 120 70"><path class="g-track" d="M10 62a50 50 0 0 1 100 0"/>
      <path class="g-bar" d="M10 62a50 50 0 0 1 100 0" pathLength="100" stroke-dasharray="${(g * 100).toFixed(1)} 100"/>
      <line class="g-needle" x1="60" y1="62" x2="${(60 + 40 * Math.cos(ang)).toFixed(1)}" y2="${(62 - 40 * Math.sin(ang)).toFixed(1)}"/><circle class="g-hub" cx="60" cy="62" r="5"/></svg>`;
  const maxM = Math.max(1, ...byMonth);
  const bars = `<div class="yr-bars">${byMonth.map((v, m) => `<i class="${m === topM && v ? 'top' : ''}" style="--h:${Math.max(v ? 6 : 2, (v / maxM) * 100)}%;--i:${m}" title="${MONTHS[LANG][m]}"></i>`).join('')}</div>`;
  const mixBar = `<div class="yr-mix">${mix.map(([ty, n]) => `<i class="${typeClass(ty)}" style="flex:${n}"></i>`).join('')}</div>
    <div class="yr-mix-legend">${mix.map(([ty, n]) => `<span class="${typeClass(ty)}">${esc(ty)} ${Math.round((n / inYear.length) * 100)}%</span>`).join('')}</div>`;

  $('#yearBody').innerHTML = `
    <div class="yr-hero${anim ? ' enter' : ''}">
      <span class="yr-kicker">${esc(t('yr.kicker', { car: carName() }))}</span>
      <b class="yr-year">${yLabel(y)}</b>
    </div>
    <div class="bento${anim ? ' animate' : ''}">
      <section class="b-tile b-wide b-odo" style="--i:0">
        <span class="b-label">${esc(t('yr.distance'))}</span>
        ${odometer}
        <span class="b-note">${fmtInt(startKm)} → ${fmtInt(inYear[inYear.length - 1].mileage)} ${esc(t('unit.km'))}</span>
      </section>
      <section class="b-tile" style="--i:1">
        <span class="b-label">${esc(t('yr.fills'))}</span>
        <b class="b-big">${inYear.length}<small> ${esc(t('yr.times'))}</small></b>
        <span class="b-note">${esc(t('yr.everyDays', { n: fmt(inYear.length > 1 ? (inYear[inYear.length - 1].d - inYear[0].d) / DAY / (inYear.length - 1) : 0, 0) }))}</span>
      </section>
      <section class="b-tile b-drop" style="--i:2">
        <span class="b-label">${esc(t('yr.liters'))}</span>
        <b class="b-big">${fmt(liters, 0)}<small> ${esc(t('unit.liters'))}</small></b>
        <span class="b-note">${esc(t('yr.tanks', { n: fmt(tanks, 1), l: tank }))}</span>
        ${drop}
      </section>
      <section class="b-tile b-wide" style="--i:3">
        <div class="b-row"><span class="b-label">${esc(t('yr.fuel'))}</span><span class="b-label">${esc(t('yr.topMonth'))} · ${byMonth[topM] ? `${MONTHS[LANG][topM]} ฿${fmtInt(byMonth[topM])}` : '–'}</span></div>
        <b class="b-big">฿${fmtInt(fuel)}</b>
        ${bars}
        <div class="yr-bars-x">${MONTHS[LANG].map((m) => `<span>${m.slice(0, LANG === 'th' ? 2 : 1)}</span>`).join('')}</div>
      </section>
      <section class="b-tile b-gauge" style="--i:4">
        <span class="b-label">${esc(t('yr.kml'))}</span>
        ${gauge}
        <b class="b-mid">${kml ? fmt(kml, 1) : '–'}<small> ${esc(t('unit.kml.short'))}</small></b>
      </section>
      <section class="b-tile" style="--i:5">
        <span class="b-label">${esc(t('yr.costKm'))}</span>
        <b class="b-big">${costKm ? `฿${fmt(costKm)}` : '–'}</b>
        <span class="b-note">${esc(t('yr.perKmAll', { n: dist ? fmt((fuel + other) / dist) : '–' }))}</span>
      </section>
      <section class="b-tile b-wide" style="--i:6">
        <span class="b-label">${esc(t('yr.favType'))}</span>
        ${mixBar}
      </section>
      <section class="b-tile b-wide b-total" style="--i:7">
        <div class="b-row"><span class="b-label">${esc(t('yr.total'))}</span><span class="b-label">${esc(t('yr.other'))} ฿${fmtInt(other)}</span></div>
        <b class="b-big">฿${fmtInt(fuel + other)}</b>
        <span class="b-note">${esc(t('yr.perMonth', { n: fmtInt((fuel + other) / (y === new Date().getFullYear() ? new Date().getMonth() + 1 : 12)) }))}</span>
      </section>
    </div>`;
  if (anim) {
    const roll = () => $$('.odo-strip', $('#yearBody')).forEach((el) => el.style.setProperty('--d', el.dataset.d));
    // ถ้าหน้าไม่ได้แสดงอยู่ requestAnimationFrame จะไม่ทำงาน จึงใส่ค่าจริงทันที
    if (document.visibilityState === 'hidden') roll();
    else requestAnimationFrame(() => requestAnimationFrame(roll));
  }
  const cy = new Date().getFullYear();
  const cur = list.filter((r) => r.d && r.d.getFullYear() === cy);
  $('#mYear').textContent = cur.length ? t('menu.year', { y: yLabel(cy), n: fmtInt(sumBy(cur, (r) => r.price)) }) : '';
}
$('#yearSeg').addEventListener('click', (e) => {
  const b = e.target.closest('[data-year]');
  if (!b) return;
  state.year = +b.dataset.year;
  state.animate = true; renderYear(entries()); state.animate = false;
});

/* ---------- 6–8. ดูแลรถ: เช็กระยะ, ภาษี/ประกัน/พ.ร.บ., ค่าใช้จ่ายอื่น ---------- */
const ICON = {"wrench": "M21.7 6.3a1 1 0 0 0-1.6-.3l-2.7 2.7-2.1-.5-.5-2.1 2.7-2.7a1 1 0 0 0-.3-1.6 6 6 0 0 0-7.9 7.6L2.6 16.1a2.5 2.5 0 0 0 3.5 3.5l6.7-6.7a6 6 0 0 0 7.6-7.9z", "doc": "M6 2h8l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM13 3.5V8h4.5zM8 12v1.5h8V12zM8 16v1.5h6V16z", "shield": "M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5z", "idcard": "M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM7 8v2h10V8zM7 12v2h10v-2zM7 16v2h6v-2z", "gear": "M19.90 12.00 L22.15 12.96 L21.75 15.00 L19.30 15.02 L18.57 16.39 L17.59 17.59 L18.50 19.86 L16.77 21.01 L15.02 19.30 L13.54 19.75 L12.00 19.90 L11.04 22.15 L9.00 21.75 L8.98 19.30 L7.61 18.57 L6.41 17.59 L4.14 18.50 L2.99 16.77 L4.70 15.02 L4.25 13.54 L4.10 12.00 L1.85 11.04 L2.25 9.00 L4.70 8.98 L5.43 7.61 L6.41 6.41 L5.50 4.14 L7.23 2.99 L8.98 4.70 L10.46 4.25 L12.00 4.10 L12.96 1.85 L15.00 2.25 L15.02 4.70 L16.39 5.43 L17.59 6.41 L19.86 5.50 L21.01 7.23 L19.30 8.98 L19.75 10.46Z M15.2 12 a3.2 3.2 0 1 0 -6.4 0 a3.2 3.2 0 1 0 6.4 0z", "drop": "M12 2.5c-3.5 5-7 8.8-7 12.5a7 7 0 0 0 14 0c0-3.7-3.5-7.5-7-12.5z", "toll": "M3 21V8a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v13zM10 9.5h11.5v3H10zM2 21h8v1.5H2z", "parking": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9 7v10h2.2v-3.4h2.3a3.3 3.3 0 0 0 0-6.6zM11.2 9h2.1a1.3 1.3 0 0 1 0 2.6h-2.1z", "dots": "M5 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM19 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z", "fuel": "M4 3.5A1.5 1.5 0 0 1 5.5 2h8A1.5 1.5 0 0 1 15 3.5V20h.5a1 1 0 1 1 0 2h-12a1 1 0 1 1 0-2H4zM6.5 4.5v5h6v-5zM16.3 5.3a1 1 0 0 1 1.4 0l2.7 2.7c.4.4.6.9.6 1.4V17a2.5 2.5 0 0 1-5 0v-3.5h1.5V17a1 1 0 0 0 2 0v-5.5h-.6A1.6 1.6 0 0 1 17.3 10V8.4l-1-1a1 1 0 0 1 0-1.4z", "plus": "M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7z"};
const svgIc = (k) => `<svg class="ic" viewBox="0 0 24 24"><path fill-rule="evenodd" d="${ICON[k]}"/></svg>`;
const EXP_CATS = ['Service', 'Repair', 'Wash', 'Toll', 'Parking', 'Other'];
const CAT_STYLE = {
  Service: ['wrench', '#ff9f0a'], Repair: ['gear', '#ff453a'], Wash: ['drop', '#0a84ff'],
  Toll: ['toll', '#30d158'], Parking: ['parking', '#5e5ce6'], Other: ['dots', '#8e8e93'],
};
const REM_STYLE = { service: ['wrench', '#ff9f0a'], taxDue: ['doc', '#0a84ff'], insuranceDue: ['shield', '#30d158'], actDue: ['idcard', '#bf5af2'] };
const RENEWALS = [['taxDue', 'rem.tax'], ['insuranceDue', 'rem.insurance'], ['actDue', 'rem.act']];
const DEFAULT_INTERVAL = 10000;
const DEFAULT_MONTHS = 6;
const toIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

async function loadCar() {
  if (!state.setup) return;
  try {
    const data = await apiGet('car');
    if (!data.car) throw new Error('needUpdate');
    state.car = { expenses: data.expenses, settings: data.settings };
    state.carError = null;
    store.set(KEYS.car, state.car);
  } catch (err) {
    console.error(err);
    state.carError = err.message === 'needUpdate' ? 'needUpdate' : 'failed';
  }
  const list = entries();
  renderCare(list);
  renderAlerts(list);
  renderYear(list);
}

async function carPost(body) {
  const res = await fetch(state.setup.url, {
    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...body, k: state.setup.k }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  state.car = { expenses: data.expenses, settings: data.settings };
  store.set(KEYS.car, state.car);
}

// สถานะการแจ้งเตือนทั้งหมด (ใช้ทั้งหน้าดูแลรถและหน้าแรก)
function reminders(list) {
  const out = [];
  if (!state.car) return out;
  const st = state.car.settings || {};
  const e = estimate(list);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const interval = Number(st.serviceInterval) || DEFAULT_INTERVAL;
  const months = Number(st.serviceMonths) || DEFAULT_MONTHS;
  const perDay = e.perDay || 0;
  // เลขไมล์โดยประมาณ ณ วันหนึ่ง (ใช้กับนัดล่วงหน้าที่ยังไม่รู้เลขไมล์)
  const odoAt = (d) => (e.odo || 0) + perDay * Math.round((d - today) / DAY);
  const services = state.car.expenses.filter((x) => x.category === 'Service' && parseDate(x.date))
    .map((x) => ({ d: parseDate(x.date), km: x.mileage }))
    .sort((a, b) => a.d - b.d);
  const upcoming = services.find((x) => x.d > today);              // นัดเช็กระยะที่ยังไม่ถึง (ใกล้ที่สุด)
  const done = services.filter((x) => x.d <= today).at(-1);        // เช็กครั้งล่าสุดที่ผ่านมาแล้ว
  const manual = st.lastServiceDate || st.lastServiceKm
    ? { d: parseDate(st.lastServiceDate), km: Number(st.lastServiceKm) || null } : null;
  // ฐานสำหรับคำนวณรอบถัดไป: นัดที่กำลังจะถึง > ครั้งล่าสุด > ค่าที่ตั้งเอง (เลือกอันที่ใหม่กว่า)
  let base = upcoming || done;
  if (!upcoming && manual && (!done || (manual.d && manual.d > done.d) || (!manual.d && manual.km > (done.km || 0)))) base = manual;
  if (base) {
    const baseKm = base.km || (base.d ? odoAt(base.d) : null);
    const nextKm = baseKm ? baseKm + interval : null;
    const nextDate = base.d ? new Date(base.d.getFullYear(), base.d.getMonth() + months, base.d.getDate()) : null;
    const leftKm = nextKm != null ? nextKm - (e.odo || 0) : null;
    const leftDays = nextDate ? Math.round((nextDate - today) / DAY) : null;
    // แล้วแต่อะไรถึงก่อน: แปลงระยะเป็นวันด้วยระยะวิ่งเฉลี่ยต่อวัน
    const kmDays = leftKm != null && perDay > 0 ? leftKm / perDay : Infinity;
    const byKm = leftKm != null && (leftDays == null || kmDays < leftDays);
    const parts = [nextKm != null ? t('rem.atKmShort', { km: fmtInt(nextKm) }) : '', nextDate ? fmtDate(nextDate) : ''].filter(Boolean);
    if (upcoming) {
      const days = Math.round((upcoming.d - today) / DAY);
      out.push({ key: 'service', label: t('rem.serviceAppt'), value: `${fmtDate(upcoming.d)} · ${t('rem.thenNext', { next: parts.join(t('rem.or')) })}`,
        due: days === 0 ? t('rem.today') : t('rem.leftDays', { n: days }), urgent: days <= 7,
        big: String(Math.max(0, days)), unit: t('unit.days'), pct: 1 - Math.min(1, days / 30) });
    } else {
      const due = byKm
        ? (leftKm <= 0 ? t('rem.overdueKm', { n: fmtInt(-leftKm) }) : t('rem.leftKm', { n: fmtInt(leftKm) }))
        : (leftDays < 0 ? t('rem.overdueDays', { n: -leftDays }) : leftDays === 0 ? t('rem.today') : t('rem.leftDays', { n: leftDays }));
      const pctKm = leftKm != null ? 1 - leftKm / interval : 0;
      const pctDays = leftDays != null ? 1 - leftDays / (months * 30.4) : 0;
      out.push({ key: 'service', label: t('rem.service'), value: t('rem.nextAt', { when: parts.join(t('rem.or')) }),
        due, urgent: (leftKm != null && leftKm < 1000) || (leftDays != null && leftDays <= 30),
        big: byKm ? fmtInt(Math.abs(leftKm)) : String(Math.abs(leftDays)), unit: byKm ? t('unit.km') : t('unit.days'),
        overdue: byKm ? leftKm <= 0 : leftDays < 0, pct: Math.max(pctKm, pctDays) });
    }
  } else {
    out.push({ key: 'service', label: t('rem.service'), value: t('rem.notSet'), due: '', urgent: false });
  }
  for (const [k, labelKey] of RENEWALS) {
    const d = parseDate(st[k]);
    if (!d) { out.push({ key: k, label: t(labelKey), value: t('rem.notSet'), due: '', urgent: false }); continue; }
    const days = Math.round((d - today) / DAY);
    out.push({ key: k, label: t(labelKey), value: fmtDate(d), urgent: days <= 30, renew: days <= 30,
      big: String(Math.abs(days)), unit: t('unit.days'), overdue: days < 0, pct: 1 - Math.min(1, Math.max(0, days) / 365),
      due: days < 0 ? t('rem.overdueDays', { n: -days }) : days === 0 ? t('rem.today') : t('rem.leftDays', { n: days }) });
  }
  return out;
}

function renderCare(list) {
  const body = $('#careBody');
  if (!state.setup) { body.innerHTML = `<p class="empty-state">${esc(t('loan.notConnected'))}</p>`; $('#mCare').textContent = ''; return; }
  if (!state.car) {
    body.innerHTML = `<p class="empty-state">${esc(state.carError === 'needUpdate' ? t('care.needUpdate') : t('loan.loading'))}</p>`;
    $('#mCare').textContent = state.carError === 'needUpdate' ? t('care.needUpdateShort') : '';
    return;
  }
  const rem = reminders(list);
  const urgent = rem.filter((r) => r.urgent);
  const firstDue = rem.find((r) => r.due);
  $('#mCare').textContent = urgent.length ? urgent.map((r) => `${r.label} ${r.due}`).join(' · ')
    : firstDue ? `${firstDue.label} ${firstDue.due}` : t('care.sub');

  const y = new Date().getFullYear();
  const exps = [...state.car.expenses].sort((a, b) => (a.date < b.date ? 1 : -1));
  const yearExp = exps.filter((x) => x.date.startsWith(String(y)));
  const fuelYear = sumBy(list.filter((r) => r.d && r.d.getFullYear() === y), (r) => r.price);
  const parts = [['__fuel', fuelYear, 'var(--accent)'], ...EXP_CATS.map((c) => [c, sumBy(yearExp.filter((x) => x.category === c), (x) => x.amount), CAT_STYLE[c][1]])].filter(([, v]) => v > 0);
  const grand = sumBy(parts, ([, v]) => v);
  const anim = state.animate && !reduceMotion;

  const tile = (r, i) => {
    const [ik, color] = REM_STYLE[r.key] || ['doc', '#8e8e93'];
    const pct = Math.max(0, Math.min(1, r.pct || 0));
    return `
      <div class="rem-tile${r.urgent ? ' urgent' : ''}${r.big == null ? ' unset' : ''}${anim ? ' enter' : ''}" style="--c:${color};--i:${i}">
        <div class="rt-head"><span class="set-ic">${svgIc(ik)}</span><b>${esc(r.label)}</b></div>
        ${r.big != null ? `<div class="rt-big">${r.overdue ? '−' : ''}${esc(r.big)}<small> ${esc(r.unit)}</small></div>` : `<div class="rt-big none">–</div>`}
        <div class="rt-sub">${esc(r.big != null ? (r.overdue ? r.due : r.value) : t('rem.notSet'))}</div>
        <div class="rt-bar"><i style="width:${pct * 100}%"></i></div>
        ${r.renew ? `<button class="rt-renew" data-renew="${r.key}">${esc(t('rem.renewed'))}</button>` : ''}
      </div>`;
  };

  body.innerHTML = `
    <div class="care-head"><h2>${esc(t('care.reminders'))}</h2><button class="text-link" data-open="careSettings">${esc(t('rem.edit'))}</button></div>
    <div class="rem-grid">${rem.map(tile).join('')}</div>

    <section class="cost-card">
      <div class="cost-top"><span>${esc(t('care.costYear', { y: LANG === 'th' ? y + 543 : y }))}</span><b>฿${fmtInt(grand)}</b></div>
      <div class="cost-bar">${parts.map(([, v, c]) => `<i style="flex:${v};background:${c}"></i>`).join('')}</div>
      <div class="cost-legend">${parts.map(([k, v, c]) => `<span style="--c:${c}"><em>${esc(k === '__fuel' ? t('care.fuel') : t(`cat.${k}`))}</em><b>฿${fmtInt(v)}</b></span>`).join('')}</div>
    </section>

    <div class="care-head"><h2>${esc(t('care.expenses'))}</h2>
      <button class="add-pill" data-open="expenseForm">${svgIc('plus')}<span>${esc(t('care.add'))}</span></button></div>
    <ul class="fill-list" id="expList">${exps.map((x, i) => {
      const [ik, color] = CAT_STYLE[x.category] || CAT_STYLE.Other;
      const d = parseDate(x.date);
      return `
      <li class="fill-item exp-item${anim && i < 12 ? ' enter' : ''}" data-exp="${x.row}" style="--t:${color};--i:${i}">
        <span class="fi-icon">${svgIc(ik)}</span>
        <span class="fi-date"><b>${d ? d.getDate() : '–'}</b><small>${d ? mon(d) : ''}</small></span>
        <span class="fi-main">
          <span class="fi-top"><b class="exp-cat">${esc(t(`cat.${x.category}`))}</b><b class="fi-amount">฿${fmtInt(x.amount)}</b></span>
          <span class="fi-chips">${x.mileage ? `<span>${fmtInt(x.mileage)} ${esc(t('unit.km'))}</span>` : ''}${x.note ? `<span>${esc(x.note)}</span>` : ''}${d && d > new Date() ? `<span class="rate up">${esc(t('care.upcoming'))}</span>` : ''}</span>
        </span>
      </li>`;
    }).join('') || `<li class="empty-state">${esc(t('care.empty'))}</li>`}</ul>`;
}

$('#careBody').addEventListener('click', async (e) => {
  const renew = e.target.closest('[data-renew]');
  if (renew) {
    const k = renew.dataset.renew;
    const d = parseDate(state.car.settings[k]);
    if (!d) return;
    const next = new Date(d.getFullYear() + 1, d.getMonth(), d.getDate());
    try { await carPost({ action: 'setSettings', settings: { [k]: toIso(next) } }); toast(t('t.saved')); }
    catch { toast(t('t.syncFailed')); }
    render({ keepHistory: true });
    return;
  }
  const li = e.target.closest('li[data-exp]');
  if (!li) return;
  const x = state.car.expenses.find((ex) => ex.row === +li.dataset.exp);
  if (!x || !confirm(t('exp.confirmDelete', { cat: t(`cat.${x.category}`), amount: fmtInt(x.amount) }))) return;
  try { await carPost({ action: 'deleteExpense', row: x.row, amount: x.amount }); toast(t('t.deletedSheet')); }
  catch (err) { toast(err.message === 'mismatch' ? t('t.changed') : t('t.deleteFailed')); loadCar(); }
  render({ keepHistory: true });
});

// ฟอร์มค่าใช้จ่ายอื่น
const expForm = $('#expForm');
let expCat = 'Service';
function initExpenseForm() {
  expForm.reset();
  expForm.date.value = isoToday();
  const e = estimate(entries());
  expForm.mileage.placeholder = e.odo ? fmtInt(e.odo) : '';
  $('#catChips').innerHTML = EXP_CATS.map((c) => `<button type="button" class="chip" data-cat="${c}">${esc(t(`cat.${c}`))}</button>`).join('');
  setExpCat('Service');
  setTimeout(() => expForm.amount.focus(), 450);
}
function setExpCat(c) {
  expCat = c;
  $$('#catChips .chip').forEach((b) => b.classList.toggle('active', b.dataset.cat === c));
  $('#expMileageHint').textContent = c === 'Service' ? t('exp.mileageService') : t('exp.mileageOptional');
  updateExpForm();
}
function updateExpForm() {
  const amount = num(expForm.amount.value), km = num(expForm.mileage.value);
  $('#expSaveBtn').disabled = !(expForm.date.value && Number.isFinite(amount) && amount >= 0 && (!expForm.mileage.value || km > 0));
}
$('#catChips').addEventListener('click', (e) => { const b = e.target.closest('[data-cat]'); if (b) setExpCat(b.dataset.cat); });
expForm.addEventListener('input', updateExpForm);
expForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!state.setup) { toast(t('t.notConnected')); return; }
  const km = num(expForm.mileage.value);
  const body = { action: 'addExpense', date: expForm.date.value, category: expCat, amount: num(expForm.amount.value),
    mileage: Number.isFinite(km) ? km : null, note: expForm.note.value.trim() };
  closeTop();
  toast(t('t.saving'));
  try { await carPost(body); toast(t('t.saved')); }
  catch (err) { console.error(err); toast(t('t.syncFailed'), 3500); }
  state.animate = isOpen('care');
  render({ keepHistory: true });
});

// ฟอร์มตั้งค่าการแจ้งเตือน
const remForm = $('#remForm');
function initRemForm() {
  const st = state.car?.settings || {};
  remForm.serviceInterval.value = st.serviceInterval || DEFAULT_INTERVAL;
  remForm.tankL.value = st.tankL || DEFAULT_TANK;
  remForm.serviceMonths.value = st.serviceMonths || DEFAULT_MONTHS;
  remForm.lastServiceDate.value = st.lastServiceDate || '';
  remForm.lastServiceKm.value = st.lastServiceKm || '';
  for (const [k] of RENEWALS) remForm[k].value = st[k] || '';
}
remForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!state.setup) { toast(t('t.notConnected')); return; }
  const lastKm = num(remForm.lastServiceKm.value);
  const settings = {
    serviceInterval: String(num(remForm.serviceInterval.value) || DEFAULT_INTERVAL),
    tankL: String(num(remForm.tankL.value) || DEFAULT_TANK),
    serviceMonths: String(num(remForm.serviceMonths.value) || DEFAULT_MONTHS),
    lastServiceDate: remForm.lastServiceDate.value || '',
    lastServiceKm: Number.isFinite(lastKm) ? String(lastKm) : '',
  };
  for (const [k] of RENEWALS) settings[k] = remForm[k].value || '';
  closeTop();
  try { await carPost({ action: 'setSettings', settings }); toast(t('t.saved')); }
  catch (err) { console.error(err); toast(t('t.syncFailed'), 3500); }
  render({ keepHistory: true });
});

/* ---------- 5. การแจ้งเตือนบนหน้าแรก ---------- */
function renderAlerts(list) {
  const items = [];
  const rated = list.filter((r) => r.rate != null);
  const lastRated = rated[rated.length - 1];
  if (lastRated && lastRated.low) {
    const base = sumBy(rated, (r) => r.rate) / rated.length;
    items.push({ ic: null, text: t('alert.low', { pct: Math.round((1 - lastRated.rate / base) * 100) }), open: 'economy' });
  }
  for (const r of reminders(list)) if (r.urgent && r.due) items.push({ ic: (REM_STYLE[r.key] || ['doc'])[0], text: `${r.label} · ${r.due}`, open: 'care' });
  $('#alerts').innerHTML = items.map((a) => `<button class="alert" data-open="${a.open}"><span class="alert-ic">${a.ic ? svgIc(a.ic) : '!'}</span><span>${esc(a.text)}</span></button>`).join('');
}


/* ---------- อัปเดตเลขไมล์ด่วน ---------- */
function initOdo() {
  const list = entries();
  const e = estimate(list);
  const inp = $('#odoInput');
  inp.value = '';
  inp.placeholder = e.odo ? String(Math.round(e.odo)) : '';
  $('#odoHint').textContent = e.last ? t('odo.hint', { km: fmtInt(e.last.mileage), date: fmtDate(e.last.d) }) : '';
  $('#odoHint').className = 'hint';
  $('#odoSave').disabled = true;
  setTimeout(() => inp.focus(), 350);
}
$('#odoInput').addEventListener('input', () => {
  const km = num($('#odoInput').value);
  const last = entries().at(-1);
  const ok = km > 0 && (!last || km >= last.mileage);
  $('#odoSave').disabled = !ok;
  if (km > 0 && last && km < last.mileage) {
    $('#odoHint').textContent = t('odo.tooLow', { km: fmtInt(last.mileage) });
    $('#odoHint').className = 'hint bad';
  } else if (last) {
    $('#odoHint').textContent = t('odo.hint', { km: fmtInt(last.mileage), date: fmtDate(last.d) });
    $('#odoHint').className = 'hint';
  }
});
$('#odoForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const km = num($('#odoInput').value);
  if (!(km > 0)) return;
  const reading = { km, date: isoToday() };
  store.set(KEYS.odo, reading);
  closeTop();
  render({ keepHistory: true });
  toast(t('odo.saved'));
  // เก็บลงชีตด้วย (ถ้า Apps Script รองรับ) เพื่อให้ใช้ได้ทุกเครื่อง
  if (state.setup && state.car) {
    try { await carPost({ action: 'setSettings', settings: { odoKm: String(km), odoDate: reading.date } }); }
    catch (err) { console.error(err); }
  }
});
$('#odoBtn').addEventListener('click', () => open('odoSheet'));

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
  yearPage: () => { state.animate = true; renderYear(entries()); state.animate = false; },
  care: () => { state.animate = true; renderCare(entries()); state.animate = false; },
  expenseForm: () => initExpenseForm(),
  careSettings: () => initRemForm(),
  odoSheet: () => initOdo(),
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
function startFill() {
  if (!stack.length) open('form');
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
  $('#typeChips').innerHTML = OIL_TYPES.map((ty) => `<button type="button" class="type-pill ${typeClass(ty)}" role="radio" data-type="${esc(ty)}"><i></i>${esc(ty)}</button>`).join('');
  setType(selectedType);
  if (state.setup && !(ptt && Date.now() - ptt.at < 3600e3)) {
    $('#priceHint').textContent = t('form.pttLoading');
    loadPtt().then(() => { if (topSheet()?.id === 'form') setType(selectedType); });
  }
  fitAmount();
  setTimeout(() => form.price.focus(), 450);
}

function setType(type) {
  selectedType = type;
  $$('#typeChips .type-pill').forEach((c) => { const on = c.dataset.type === type; c.classList.toggle('active', on); c.setAttribute('aria-checked', on); });
  const pp = pttPrice(type);
  const p = pp || lastPriceFor(type);
  form.oilPrice.placeholder = p ? fmt(p) : '0.00';
  if (p && !form.oilPrice.dataset.touched) form.oilPrice.value = p.toFixed(2);
  $('#priceHint').textContent = pp ? t('form.pttShort', { date: fmtDate(parseDate(ptt.date)) }) : '';
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
  const okL = Number.isFinite(liters) && liters > 0;
  const dist = last && Number.isFinite(v.mileage) && v.mileage > last.mileage ? v.mileage - last.mileage : null;
  const cell = (val, unit, label) => `<div class="live-cell${val === '–' ? ' dim' : ''}"><b>${val}</b><small>${esc(unit)}</small><span>${esc(label)}</span></div>`;
  $('#preview').innerHTML = cell(okL ? fmt(liters) : '–', t('unit.liters'), t('form.liters'))
    + cell(dist != null ? fmtInt(dist) : '–', t('unit.km'), t('form.distance'))
    + cell(okL && dist != null ? fmt(dist / liters) : '–', t('unit.kml.short'), t('form.rate'));
}

// ช่องยอดเงินตัวใหญ่: ความกว้างตามจำนวนตัวอักษร ให้ ฿ ชิดตัวเลข
function fitAmount() {
  const el = form.price;
  el.style.width = `${Math.max(1, (el.value || el.placeholder).length) + 0.6}ch`;
}
form.addEventListener('input', (e) => {
  if (e.target.name === 'oilPrice') e.target.dataset.touched = '1';
  if (e.target.name === 'price') fitAmount();
  updateForm();
});
$('#typeChips').addEventListener('click', (e) => {
  const chip = e.target.closest('.type-pill');
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
  $('#connActions').hidden = !connected || editing;
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

const APP_VERSION = '2026.10.15';
function initSettings() {
  renderThemeControls();
  $('#appVersion').textContent = APP_VERSION;
  $('#carNameInput').value = carName();
  $('#huePicker').hidden = loadTheme().accent !== 'custom';
  renderConnection();
  if (!$('#huePicker').hidden) requestAnimationFrame(updateHuePicker);
}

$('#carNameInput').addEventListener('change', async (e) => {
  const name = e.target.value.trim() || DEFAULT_CAR_NAME;
  e.target.value = name;
  store.set(KEYS.carName, name);
  if (state.car) state.car.settings = { ...state.car.settings, carName: name };
  renderHome(entries());
  toast(t('t.saved'));
  if (state.setup && state.car) {
    try { await carPost({ action: 'setSettings', settings: { carName: name } }); } catch (err) { console.error(err); }
  }
});

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
if (state.setup) sync({ quiet: true });
