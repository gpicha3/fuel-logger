'use strict';
// โหลดใน <head> เพื่อใส่ธีมก่อนหน้าเว็บแสดงผล (ไม่มีจอกะพริบ)
// ชุดสีพาสเทล: p = พาสเทล (ปุ่มรอง/การ์ดเด่น), deep = สีเข้ม (ปุ่มหลัก/แถบ/ชื่อรุ่น), ink = ตัวอักษรบนพื้นพาสเทล
// โหมดสว่างพื้นหลังเป็นสี p จาง ๆ / โหมดมืดพื้นดำ ปุ่มใช้สีทึบ (คำนวณใน styles.css)
const ACCENTS = {
  sage: { name: 'เสจ', p: '#c9e0cd', deep: '#1f4d2c', ink: '#16351f' },
  mint: { name: 'มิ้นต์', p: '#a9e8dc', deep: '#1f7a6b', ink: '#0e3a33' },
  sky: { name: 'ฟ้า', p: '#bcd6f5', deep: '#2f5fa8', ink: '#142a4d' },
  lavender: { name: 'ลาเวนเดอร์', p: '#d6c9f5', deep: '#5b45a8', ink: '#2a1f52' },
  peach: { name: 'พีช', p: '#f8cdb0', deep: '#b45a24', ink: '#4a230c' },
  pink: { name: 'ชมพู', p: '#f5c6d8', deep: '#a8386a', ink: '#4a1430' },
  butter: { name: 'เนย', p: '#f2e3a2', deep: '#8a6a10', ink: '#3d2f05' },
  gray: { name: 'เทา', p: '#d6d9df', deep: '#3d4451', ink: '#1b1e24' },
};
// สีหลักแบบเดิม (ก่อนเปลี่ยนเป็นชุดพาสเทล) → ชุดสีใหม่ที่ใกล้ที่สุด
const LEGACY_ACCENTS = {
  purple: 'lavender', blue: 'sky', teal: 'mint', green: 'sage', orange: 'peach', red: 'pink',
  graphite: 'gray', black: 'gray', white: 'gray', custom: 'sage',
};
const THEME_KEY = 'fl.theme';

function accentId(theme) {
  if (ACCENTS[theme.accent]) return theme.accent;
  return LEGACY_ACCENTS[theme.accent] || 'sage';
}

function loadTheme() {
  let theme;
  try { theme = { mode: 'auto', accent: 'sage', ...JSON.parse(localStorage.getItem(THEME_KEY) || '{}') }; }
  catch { theme = { mode: 'auto', accent: 'sage' }; }
  theme.accent = accentId(theme);
  return theme;
}

const accentOf = (theme) => ACCENTS[accentId(theme)];

// ผสมสี hex สองสี (ใช้กับ meta theme-color ซึ่งใช้ color-mix ไม่ได้)
function mixHex(a, b, w) {
  const c = (h, i) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2].map((i) => Math.round(c(a, i) * w + c(b, i) * (1 - w)).toString(16).padStart(2, '0')).join('')}`;
}

function applyTheme(theme) {
  const root = document.documentElement;
  const accent = accentOf(theme);
  if (theme.mode === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme.mode);
  root.style.setProperty('--p', accent.p);
  root.style.setProperty('--p-deep', accent.deep);
  root.style.setProperty('--p-ink', accent.ink);

  // สีแถบสถานะ/พื้นหลังของระบบให้ตรงกับธีม
  const dark = theme.mode === 'dark' || (theme.mode === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  let meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (!meta) {
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = dark ? '#0a0a0b' : mixHex(accent.p, '#ffffff', 0.24); // ตรงกับ --bg ใน styles.css
  // แถบสถานะ iOS: โหมดมืดให้พื้นหลังแอปต่อขึ้นไปใต้แถบ (ตัวอักษรขาว) / โหมดสว่างใช้แถบปกติ (ตัวอักษรดำ)
  // iOS อ่านค่านี้ตอนเปิดแอป จึงมีผลเมื่อเปิดแอปใหม่
  const sb = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (sb) sb.content = dark ? 'black-translucent' : 'default';
  root.classList.toggle('is-dark', dark);
}

function saveTheme(theme) {
  try { localStorage.setItem(THEME_KEY, JSON.stringify(theme)); } catch { /* storage unavailable */ }
  applyTheme(theme);
}

applyTheme(loadTheme());
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(loadTheme()));
