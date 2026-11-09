# Fuel Logger — บันทึกทางเทคนิค

ใช้ตอนกลับมาทำต่อ จะได้ไม่ต้องไล่โค้ดใหม่

## ภาพรวม

```
iPhone (PWA)  ⇄  Google Apps Script (Web App)  ⇄  Google Sheet "Car Spending"
```

- **แอป:** HTML/CSS/JS ล้วน ไม่มี build step — `index.html`, `styles.css`, `app.js`, `theme.js`, `i18n.js`, `sw.js`
- **โฮสต์:** GitHub Pages ที่ https://gpicha3.github.io/fuel-logger/ (repo `gpicha3/fuel-logger`, public)
- **Backend:** `apps-script/Code.gs` (อยู่ใน `.gitignore` เพราะมี TOKEN — ห้าม push)

## ชีตใน Sheet

| ชีต | คอลัมน์ | หมายเหตุ |
|---|---|---|
| Fuel | A Date · B Oil type · C Oil prices · D Prices · E Liters · F Mileage · G Fuel consumption rate | E, G เป็นสูตร — Apps Script คัดลอกสูตรจากแถวก่อนหน้าตอนเพิ่มแถว |
| Car installment | A Month · B ยอด | สีพื้นเขียว = จ่ายแล้ว · งวดที่เลยวันที่ 25 จะถูกระบายเขียวอัตโนมัติ |
| Expenses | Date · Category · Amount · Mileage · Note | Category: Service, Repair, Wash, Toll, Parking, Other |
| Car settings | Key · Value | carName, tankL, serviceInterval, serviceMonths, lastServiceKm, lastServiceDate, taxDue, insuranceDue, actDue, odoKm, odoDate |

## Apps Script actions

- `GET` (ไม่มี action) → รายการเติมน้ำมัน
- `GET ?action=price` → ราคา PTT วันนี้ (SOAP ของ PTT, แคช 1 ชม.)
- `GET ?action=loan` → ข้อมูลผ่อน + ระบายสีงวดที่ถึงกำหนด
- `GET ?action=car` → ค่าใช้จ่ายอื่น + การตั้งค่า (สร้างชีตให้ถ้ายังไม่มี)
- `POST` (ไม่มี action) → เพิ่มรายการเติมน้ำมัน
- `POST action=delete | addExpense | deleteExpense | setSettings`

**อัปเดต Apps Script:** วางโค้ดทับ → Save → Deploy → Manage deployments → ✏️ → New version → Deploy
(ห้ามกด New deployment เพราะ URL จะเปลี่ยน) ถ้าใช้ service ใหม่ที่ต้องขอสิทธิ์ ให้ Run ฟังก์ชันนั้นใน editor ก่อน

## Deploy แอป

- push ขึ้น `main` = deploy ทันที (GitHub Pages)
- push ด้วยบัญชีส่วนตัวผ่าน SSH alias `github.com-personal`
- ใช้ `gh` กับบัญชี gpicha3 ผ่าน `GH_TOKEN=$(gh auth token --user gpicha3)` — อย่าใช้ `gh auth switch` (บัญชีหลักคือบัญชีบริษัท)
- **ทุกครั้งที่แก้ไฟล์แอป ให้เพิ่มเลขเวอร์ชัน `CACHE` ใน `sw.js`** ไม่อย่างนั้น iPhone อาจยังใช้ไฟล์เก่า
- ตกลงกันไว้: แก้เสร็จให้ commit ในเครื่องก่อน และ deploy เมื่อเจ้าของสั่งเท่านั้น

## ทดสอบในเครื่อง

```bash
python3 -m http.server 5174 --bind 0.0.0.0 -d "<โฟลเดอร์ fuel-logger>"
```

- Mac: http://localhost:5174 · iPhone (Wi-Fi เดียวกัน): http://<IP ของ Mac>:5174
- เป็น http จึงใช้ service worker ไม่ได้ และถ้าวาง Setup code การบันทึก/ลบจะเขียนลง Sheet จริง
- เรื่องแถบสถานะ/ความสูงจอ ต้องทดสอบจากแอปที่ Add to Home Screen เท่านั้น

## เรื่องที่เคยเจอ (iOS)

- **แถบสถานะ:** `theme.js` ตั้ง `apple-mobile-web-app-status-bar-style` เป็น black-translucent (มืด) / default (สว่าง) — iOS อ่านค่าตอนเปิดแอปเท่านั้น
- **แถบว่างด้านล่าง:** iOS บอกความสูงแอปสั้นกว่าจอ → ใช้ `100lvh` กับ `.shell` และ `.sheet` แก้แล้ว
- **ไอคอนแอป:** iOS จำไว้ตอนติดตั้ง ถ้าเปลี่ยนต้องลบแอปแล้ว Add to Home Screen ใหม่ (ต้องวาง Setup code ใหม่)
- **ข้อมูลในเครื่อง:** แอปบนหน้าจอโฮมเก็บข้อมูลแยกจาก Safari
- **ช่องกรอกต้องใช้ฟอนต์ ≥ 16px** ไม่อย่างนั้น iOS ซูมเองตอนแตะ

## ดีไซน์ (ปรับใหม่ 9 พ.ย. 2026)

- **แนวคิด:** ดูทีเดียวรู้ภาพรวม แสดงเท่าที่จำเป็น แถบเมนูลอยด้านล่าง 4 แท็บ (หน้าหลัก · ประวัติ · สถิติ · รถ) + ปุ่ม + เพิ่มรายการ
- **แท็บ:** หน้าย่อยเดิม (อัตรากินน้ำมัน, ประวัติ, รายเดือน, รายปี, ดูแลรถ, ผ่อนรถ) ย้ายมาอยู่ใน `<section class="view">` ของแท็บ ลิงก์ `data-open` เก่าส่งต่อไปแท็บผ่าน `TAB_OF` ใน `app.js` ตั้งค่า/ฟอร์ม/รายละเอียดยังเป็นแผ่นซ้อน (`stack`)
- **หน้าหลัก:** ยี่ห้อ + ชื่อรุ่น (คำสุดท้ายของชื่อตัวบาง) · การ์ดสเปก 3 ใบ (เลขไมล์แตะเพื่ออัปเดต) · รูปรถ · ตัวเลขใหญ่แตะสลับ 3 แบบ · การ์ดเฉลี่ย + ราคาน้ำมัน (แตะดูราคาทุกชนิด) · แถบเตือน
- **ปุ่ม +:** เปิดแผ่นเติมน้ำมัน มีตัวสลับไปแผ่นค่าใช้จ่ายอื่น (`data-switch`) · ซิงก์ใช้ดึงลงเพื่อรีเฟรช
- **สี:** ชุดพาสเทล 8 ชุดใน `theme.js` (`ACCENTS`: p พาสเทล, deep เข้ม, ink ตัวอักษรบนพาสเทล) สีหลักแบบเดิมแปลงผ่าน `LEGACY_ACCENTS` · โหมดสว่างพื้นหลังเป็นพาสเทลจาง ปุ่มหลักสีเข้ม ปุ่มรองพาสเทล · โหมดมืดพื้นดำ ปุ่มพาสเทลทึบ · ตัดวงล้อเลือกสีเองออก
- แตะรถ = ไฟหน้ากะพริบ (ไม่เปิดฟอร์มแล้ว) · โหมดมืดไฟหน้าติดเอง
- แบบร่างหน้าตาฟีเจอร์แผนที่ปั๊ม (ยังไม่ทำ): หมุดปั๊มที่เคยเติม แสดง กม./ล. เฉลี่ย ราคาที่จ่ายเทียบ PTT และจำนวนครั้ง เก็บพิกัดตอนบันทึก

## รูปรถ

- `img/car.png` รูปทางการของ Toyota (พื้นโปร่งใส) ขยาย 2 เท่า + เพิ่มความคม แล้ว **กลับด้าน** ให้หน้ารถหันขวา และลบป้ายทะเบียนหน้า (เติมลายกระจังแทน) กว้าง 1400px
- รูปวางล้นขอบจอซ้าย (`.car` กว้าง 112% ของพื้นที่) เงาใต้ล้อเป็น CSS (`.car-stage::after`)
- ตำแหน่งไฟหน้าใน `styles.css` (`.head-r`, `.head-l`) เป็น % ของรูป ถ้าเปลี่ยนรูปต้องวัดใหม่
