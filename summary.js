// สรุปสำหรับ Hub (gpicha3.github.io) ตาม contract getSummary()
// ใช้สูตรตัวเดียวกับแอปจาก core.js และอ่านการตั้งค่าเดิมใน localStorage (อ่านอย่างเดียว ไม่เขียนทับ key ของแอป)
import './core.js';

const C = globalThis.FuelCore;
const BASE = new URL('./', import.meta.url).pathname; // /fuel-logger/
const KEYS = { setup: 'fl.setup', rows: 'fl.rows', pending: 'fl.pending', car: 'fl.car', loan: 'fl.loan', odo: 'fl.odo' };
const read = (k, fallback) => {
  try { const v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
};

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const fmtInt = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('th-TH') : '–');
const fmtDate = (d) => (d ? `${d.getDate()} ${TH_MONTHS[d.getMonth()]}` : '–');
const iso = (d) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null);
const inDays = (n) => (n < 0 ? `เลยกำหนด ${-n} วัน` : n === 0 ? 'วันนี้' : n === 1 ? 'พรุ่งนี้' : `อีก ${n} วัน`);
// ระดับตามจำนวนวันที่เหลือ: เลยกำหนดหรือ ≤ 3 วัน = urgent, ≤ 14 วัน = soon
const levelOf = (days) => (days == null ? 'info' : days <= 3 ? 'urgent' : days <= 14 ? 'soon' : 'info');

const REM_TEXT = { service: 'เช็กระยะ', taxDue: 'ต่อภาษีรถ', insuranceDue: 'ต่อประกันรถ', actDue: 'ต่อ พ.ร.บ.' };

export const app = 'fuel-logger';

export async function getSummary() {
  const setup = read(KEYS.setup, null);
  if (!setup) return { app, title: 'Fuel Logger', needsSetup: true, stats: [], alerts: [] };

  // ดึงข้อมูลล่าสุดแบบขนาน ถ้าส่วนรถ/ผ่อนรถโหลดไม่ได้ ใช้ค่าที่แอปเก็บไว้ในเครื่องแทน
  const [fuel, carRes, loanRes] = await Promise.allSettled([C.apiGet(setup), C.apiGet(setup, 'car'), C.apiGet(setup, 'loan')]);
  if (fuel.status === 'rejected') throw fuel.reason;
  const rows = fuel.value.rows || [];
  const car = carRes.status === 'fulfilled' && carRes.value.car
    ? { expenses: carRes.value.expenses, settings: carRes.value.settings } : read(KEYS.car, null);
  const loan = loanRes.status === 'fulfilled' && Array.isArray(loanRes.value.rows) && loanRes.value.dueDay
    ? loanRes.value : read(KEYS.loan, null);

  const list = C.entries(rows, read(KEYS.pending, []));
  const ctx = { car, odoLocal: read(KEYS.odo, null), t: (k) => k, fmtDate, fmtInt };
  const e = C.estimate(list, ctx);

  const stats = [
    { label: 'ยังวิ่งได้', value: e.remaining != null ? fmtInt(e.remaining) : '–', unit: 'กม.' },
    { label: 'อัตราเฉลี่ย', value: e.kml ? e.kml.toFixed(1) : '–', unit: 'กม./ล.' },
    { label: 'ต้นทุน', value: e.costKm ? e.costKm.toFixed(2) : '–', unit: '฿/กม.' },
  ];

  const alerts = [];
  const today = new Date(); today.setHours(0, 0, 0, 0);

  if (loan) {
    const s = C.loanStatus(loan, today);
    if (s.next && s.days <= 30) {
      alerts.push({ level: levelOf(s.days), text: `ค่างวดรถ ฿${fmtInt(s.installment)} · ${inDays(s.days)}`,
        dueDate: iso(s.dueDate), link: `${BASE}#loan` });
    }
  }

  // ใช้เกณฑ์ "ใกล้ถึง" (urgent) ของแอปเอง แล้วแบ่งระดับตามวันที่เหลือ
  for (const r of C.reminders(list, ctx)) {
    if (!r.urgent || !r.due) continue;
    const name = REM_TEXT[r.key] || r.key;
    let text, days = r.leftDays;
    if (r.key === 'service' && r.byKm) {
      text = r.leftKm <= 0 ? `${name} · เลยมา ${fmtInt(-r.leftKm)} กม.` : `${name} · อีก ${fmtInt(r.leftKm)} กม.`;
      days = r.leftKm <= 0 ? -1 : r.kmDays;
    } else {
      text = `${r.appt ? 'นัดเช็กระยะ' : name} · ${inDays(r.leftDays)}`;
    }
    const due = days != null ? new Date(today.getTime() + days * C.DAY) : r.date;
    alerts.push({ level: r.overdue ? 'urgent' : levelOf(days), text, dueDate: iso(due), link: `${BASE}#care` });
  }

  // น้ำมันเหลือน้อย (เหลือไม่ถึง 15% ของระยะต่อถัง)
  if (e.remaining != null && e.range && e.remaining < e.range * 0.15) {
    alerts.push({ level: 'soon', text: `น้ำมันใกล้หมด · เหลือราว ${fmtInt(e.remaining)} กม.`, dueDate: iso(today), link: `${BASE}#add` });
  }

  return {
    app, title: 'Fuel Logger', stats, alerts,
    brief: [
      e.remaining != null ? `น้ำมันพอวิ่งอีก ~${fmtInt(e.remaining)} กม.` : null,
      e.kml ? `อัตราเฉลี่ย ${e.kml.toFixed(1)} กม./ล. · ${e.costKm ? e.costKm.toFixed(2) : '–'} ฿/กม.` : null,
    ].filter(Boolean),
  };
}
