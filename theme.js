'use strict';
// โหลดใน <head> เพื่อใส่ธีมก่อนหน้าเว็บแสดงผล (ไม่มีจอกะพริบ)
const ACCENTS = {
  purple: { name: 'ม่วง', light: '#7a1fe8', dark: '#a76bff' },
  blue: { name: 'น้ำเงิน', light: '#1d5fd6', dark: '#5b9bff' },
  teal: { name: 'เขียวน้ำทะเล', light: '#0b7f86', dark: '#3cc6cc' },
  green: { name: 'เขียว', light: '#1d8348', dark: '#4ccf7f' },
  orange: { name: 'ส้ม', light: '#d2560b', dark: '#ff9a4d' },
  red: { name: 'แดง', light: '#c62f3a', dark: '#ff6b74' },
  pink: { name: 'ชมพู', light: '#c8246e', dark: '#ff6aa8' },
  graphite: { name: 'กราไฟต์', light: '#3d4451', dark: '#aab3c2' },
};
const THEME_KEY = 'fl.theme';

function loadTheme() {
  try { return { mode: 'auto', accent: 'purple', ...JSON.parse(localStorage.getItem(THEME_KEY) || '{}') }; }
  catch { return { mode: 'auto', accent: 'purple' }; }
}

// สีที่ผู้ใช้เลือกเองจากวงล้อ: ใช้ hue/saturation เดียวกัน แต่ปรับความสว่างตามโหมด
function customAccent(h, sat) {
  return { name: 'custom', light: `hsl(${h} ${sat}% 42%)`, dark: `hsl(${h} ${Math.min(sat, 90)}% 68%)` };
}

function accentOf(theme) {
  if (theme.accent === 'custom') return customAccent(theme.h ?? 270, theme.s ?? 75);
  return ACCENTS[theme.accent] || ACCENTS.purple;
}

function applyTheme(theme) {
  const root = document.documentElement;
  const accent = accentOf(theme);
  if (theme.mode === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme.mode);
  root.style.setProperty('--accent-l', accent.light);
  root.style.setProperty('--accent-d', accent.dark);

  // สีแถบสถานะ/พื้นหลังของระบบให้ตรงกับธีม
  const dark = theme.mode === 'dark' || (theme.mode === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  let meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (!meta) {
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = dark ? '#1c1c1e' : '#eeeef1'; // ให้ตรงกับสีพื้นหลังด้านบนของแอป
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
