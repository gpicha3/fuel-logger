'use strict';
// สูตรคำนวณที่ใช้ร่วมกันระหว่างแอป (app.js) และ Hub (summary.js)
// ไม่แตะ DOM และไม่อ่าน state ของแอปเอง ทุกอย่างที่ต้องใช้ส่งเข้ามาเป็นพารามิเตอร์
(function (root) {
  const DAY = 864e5;
  const yearAgo = () => Date.now() - 365 * DAY;
  const sumBy = (arr, f) => arr.reduce((acc, x) => acc + f(x), 0);

  const DEFAULT_TANK = 40; // ลิตร (Yaris ATIV)
  const DEFAULT_INTERVAL = 10000;
  const DEFAULT_MONTHS = 6;
  const RENEWALS = [['taxDue', 'rem.tax'], ['insuranceDue', 'rem.insurance'], ['actDue', 'rem.act']];

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

  // รวมแถวจาก Sheet + แถวที่ยังรอส่ง แล้วคำนวณอัตรากินน้ำมันแบบเดียวกับสูตรใน Sheet:
  // rate(n) = (Mileage(n+1) - Mileage(n)) / Liters(n+1)
  function entries(rows, pending) {
    const all = [
      ...rows.map((r, i) => ({ ...r, pending: false, src: i })),
      ...pending.map((r, i) => ({ ...r, pending: true, src: i })),
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

  // ระยะวิ่งเฉลี่ยต่อวัน (1 ปีล่าสุด)
  function kmPerDay(list) {
    const recent = list.filter((r) => r.d && r.d.getTime() >= yearAgo());
    const a = recent.length >= 2 ? recent : list;
    if (a.length < 2) return null;
    const days = (a[a.length - 1].d - a[0].d) / DAY;
    return days > 0 ? (a[a.length - 1].mileage - a[0].mileage) / days : null;
  }

  const tankLiters = (car) => Number(car?.settings?.tankL) || DEFAULT_TANK;

  // เลขไมล์ที่ผู้ใช้อัปเดตเองล่าสุด (เก็บในเครื่อง + ชีต Car settings) เลือกอันที่ใหม่กว่า
  function odoReading(car, local) {
    const st = car?.settings || {};
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
  // ctx = { car, odoLocal }
  function estimate(list, ctx) {
    const last = list[list.length - 1];
    const seg = segments(list, yearAgo());
    const kml = seg.length ? sumBy(seg, (x) => x.dist) / sumBy(seg, (x) => x.liters) : average(list, list.filter((r) => r.rate != null));
    const costKm = seg.length ? sumBy(seg, (x) => x.cost) / sumBy(seg, (x) => x.dist) : null;
    if (!last || !last.d) return { kml, costKm };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const days = Math.max(0, Math.round((today - last.d) / DAY));
    const perDay = kmPerDay(list) || 0;
    const reading = odoReading(ctx.car, ctx.odoLocal);
    const useReading = reading && reading.km >= last.mileage && reading.d >= last.d;
    const sinceReading = useReading ? Math.max(0, Math.round((today - reading.d) / DAY)) : 0;
    const odo = useReading ? reading.km + perDay * sinceReading : last.mileage + perDay * days;
    const driven = odo - last.mileage;
    const typical = typicalTankKm(list);
    const range = typical || (kml ? tankLiters(ctx.car) * kml : null);
    return {
      kml, costKm, days, perDay, last, odo, reading: useReading ? reading : null, sinceReading, typical,
      range, remaining: range != null ? Math.max(0, range - driven) : null,
    };
  }

  // สถานะการแจ้งเตือนทั้งหมด (ใช้ทั้งหน้าดูแลรถ หน้าแรก และ Hub)
  // ctx = { car, odoLocal, t, fmtDate, fmtInt }
  // นอกจากข้อความแล้ว แต่ละรายการมี date / leftDays / leftKm ให้ Hub เรียงและสร้างข้อความเองได้
  function reminders(list, ctx) {
    const { t, fmtDate, fmtInt } = ctx;
    const out = [];
    if (!ctx.car) return out;
    const st = ctx.car.settings || {};
    const e = estimate(list, ctx);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const interval = Number(st.serviceInterval) || DEFAULT_INTERVAL;
    const months = Number(st.serviceMonths) || DEFAULT_MONTHS;
    const perDay = e.perDay || 0;
    // เลขไมล์โดยประมาณ ณ วันหนึ่ง (ใช้กับนัดล่วงหน้าที่ยังไม่รู้เลขไมล์)
    const odoAt = (d) => (e.odo || 0) + perDay * Math.round((d - today) / DAY);
    const services = ctx.car.expenses.filter((x) => x.category === 'Service' && parseDate(x.date))
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
          big: String(Math.max(0, days)), unit: t('unit.days'), pct: 1 - Math.min(1, days / 30),
          appt: true, date: upcoming.d, leftDays: days, leftKm: null });
      } else {
        const due = byKm
          ? (leftKm <= 0 ? t('rem.overdueKm', { n: fmtInt(-leftKm) }) : t('rem.leftKm', { n: fmtInt(leftKm) }))
          : (leftDays < 0 ? t('rem.overdueDays', { n: -leftDays }) : leftDays === 0 ? t('rem.today') : t('rem.leftDays', { n: leftDays }));
        const pctKm = leftKm != null ? 1 - leftKm / interval : 0;
        const pctDays = leftDays != null ? 1 - leftDays / (months * 30.4) : 0;
        out.push({ key: 'service', label: t('rem.service'), value: t('rem.nextAt', { when: parts.join(t('rem.or')) }),
          due, urgent: (leftKm != null && leftKm < 1000) || (leftDays != null && leftDays <= 30),
          big: byKm ? fmtInt(Math.abs(leftKm)) : String(Math.abs(leftDays)), unit: byKm ? t('unit.km') : t('unit.days'),
          overdue: byKm ? leftKm <= 0 : leftDays < 0, pct: Math.max(pctKm, pctDays),
          byKm, date: nextDate, leftDays, leftKm, kmDays: Number.isFinite(kmDays) ? Math.round(kmDays) : null });
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
        due: days < 0 ? t('rem.overdueDays', { n: -days }) : days === 0 ? t('rem.today') : t('rem.leftDays', { n: days }),
        date: d, leftDays: days });
    }
    return out;
  }

  // สถานะผ่อนรถจากชีต Loan: งวดถัดไป วันครบกำหนด และยอดคงเหลือ
  function loanStatus(loan, today) {
    const all = loan.rows.map((r) => ({ ...r, d: new Date(+r.ym.slice(0, 4), +r.ym.slice(5, 7) - 1, 1) }));
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
    const dueDay = loan.dueDay || 25;
    let dueDate = null, days = null;
    if (next) {
      dueDate = new Date(next.d.getFullYear(), next.d.getMonth(), dueDay);
      days = Math.round((dueDate - today) / DAY);
    }
    return { all, installment, rows, paid, total, paidAmt, down, pct, next, lastRow, dueDay, dueDate, days };
  }

  // เรียก Google Apps Script (GET) ด้วย setup = { url, k }
  async function apiGet(setup, action) {
    const q = new URLSearchParams({ k: setup.k });
    if (action) q.set('action', action);
    const res = await fetch(`${setup.url}?${q}`, { cache: 'no-store' });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  root.FuelCore = {
    DAY, DEFAULT_TANK, DEFAULT_INTERVAL, DEFAULT_MONTHS, RENEWALS,
    yearAgo, sumBy, parseDate, entries, segments, average, kmPerDay, tankLiters,
    odoReading, typicalTankKm, estimate, reminders, loanStatus, apiGet,
  };
})(globalThis);
