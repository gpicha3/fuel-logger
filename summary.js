// สรุปสำหรับ Hub (gpicha3.github.io) ตาม contract getSummary()
// ใช้สูตรตัวเดียวกับแอปจาก core.js และอ่านการตั้งค่าเดิมใน localStorage (อ่านอย่างเดียว ไม่เขียนทับ key ของแอป)
import './core.js';

const C = globalThis.FuelCore;
const BASE = new URL('./', import.meta.url).pathname; // /fuel-logger/
const KEYS = { setup: 'fl.setup', rows: 'fl.rows', pending: 'fl.pending', car: 'fl.car', odo: 'fl.odo' };
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

  // ดึงข้อมูลล่าสุดแบบขนาน ถ้าส่วนรถโหลดไม่ได้ ใช้ค่าที่แอปเก็บไว้ในเครื่องแทน
  // งวดผ่อนรถไม่ส่งขึ้น hub เพราะ finance-app เป็นแหล่งเดียวของรายการเงิน/งวดผ่อน (ในแอปนี้ยังแสดงเหมือนเดิม)
  const [fuel, carRes] = await Promise.allSettled([C.apiGet(setup), C.apiGet(setup, 'car')]);
  if (fuel.status === 'rejected') throw fuel.reason;
  const rows = fuel.value.rows || [];
  const car = carRes.status === 'fulfilled' && carRes.value.car
    ? { expenses: carRes.value.expenses, settings: carRes.value.settings } : read(KEYS.car, null);

  const list = C.entries(rows, read(KEYS.pending, []));
  const ctx = { car, odoLocal: read(KEYS.odo, null), t: (k) => k, fmtDate, fmtInt };
  const e = C.estimate(list, ctx);

  // ระยะที่เหลือ (ปัดเป็น กม.) <= 0 = วิ่งเกินระยะต่อถังปกติแล้ว → ถึงเวลาเติมน้ำมัน
  const empty = e.remaining != null && Math.round(e.remaining) <= 0;
  const stats = [
    { label: empty ? 'ถึงเวลาเติมน้ำมันแล้ว' : 'ยังวิ่งได้', value: e.remaining != null ? fmtInt(e.remaining) : '–', unit: 'กม.' },
    { label: 'อัตราเฉลี่ย', value: e.kml ? e.kml.toFixed(1) : '–', unit: 'กม./ล.' },
    { label: 'ต้นทุน', value: e.costKm ? e.costKm.toFixed(2) : '–', unit: '฿/กม.' },
  ];

  const alerts = [];
  const today = new Date(); today.setHours(0, 0, 0, 0);

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
    alerts.push({ level: 'soon', text: empty ? 'ถึงเวลาเติมน้ำมันแล้ว' : `น้ำมันใกล้หมด · เหลือราว ${fmtInt(e.remaining)} กม.`, dueDate: iso(today), link: `${BASE}#add` });
  }

  // ข้อมูลดิบ (ตัวเลข/สถานะ) ให้ hub แต่งประโยคพูดเอง — แอปนี้ไม่ส่งประโยค
  // reminders: type = service (เช็กระยะ) | appt (นัดเช็กระยะ) | tax | insurance | act · days < 0 = เลยกำหนด
  //            เช็กระยะตามกิโล: byKm + leftKm (<= 0 = เลยแล้ว) + near (ใกล้ถึงตามเกณฑ์ของแอป)
  const lastRated = [...list].reverse().find((r) => r.rate != null);
  const RENEW_TYPE = { taxDue: 'tax', insuranceDue: 'insurance', actDue: 'act' };
  const reminders = [];
  for (const r of C.reminders(list, ctx)) {
    if (r.key === 'service' && r.appt) reminders.push({ type: 'appt', days: r.leftDays });
    else if (r.key === 'service' && r.byKm) reminders.push({ type: 'service', byKm: true, leftKm: Math.round(r.leftKm), near: !!r.urgent, days: r.kmDays });
    else if (r.key === 'service' && r.leftDays != null) reminders.push({ type: 'service', days: r.leftDays });
    else if (RENEW_TYPE[r.key] && r.leftDays != null) reminders.push({ type: RENEW_TYPE[r.key], days: r.leftDays });
  }
  const facts = {
    fuelLow: e.remaining != null && !!e.range && e.remaining < e.range * 0.15,
    kmPerL: lastRated?.rate ?? e.kml ?? null,
    reminders,
  };
  // ชื่อรถ (ตั้งในแอป) ใช้เป็นหัวการ์ดใน hub
  const title = car?.settings?.carName || read('fl.carName', '') || 'Yaris ATIV Premium';

  return {
    app, title, stats, alerts, facts,
    brief: [
      // ตอนถึงเวลาเติม แจ้งเตือนบอกไว้แล้ว ไม่ต้องมีบรรทัดระยะซ้ำ
      e.remaining == null || empty ? null : `น้ำมันพอวิ่งอีก ~${fmtInt(e.remaining)} กม.`,
      e.kml ? `อัตราเฉลี่ย ${e.kml.toFixed(1)} กม./ล. · ${e.costKm ? e.costKm.toFixed(2) : '–'} ฿/กม.` : null,
    ].filter(Boolean),
  };
}
