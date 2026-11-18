# Moewki 🐱

แมวที่อาศัยอยู่บนเดสก์ท็อป Windows และ macOS: เดินบน taskbar / Dock, กระโดดข้ามหน้าต่าง, นอนบนหน้าต่าง, เดินออกนอกจอแล้วกลับมาใหม่ — เลี้ยงได้หลายตัว หลายสายพันธุ์

```bash
npm install
npm start          # run
npm run debug      # show ledges + state log + devtools
npx electron . --settings     # open the settings window on start
```

- **ตั้งค่า**: คลิกไอคอนแมวใน tray (หรือคลิกขวา → Settings…) — เพิ่ม/ลบแมว, เลือกสายพันธุ์, เปิด/ปิดพฤติกรรม, ความเร็ว, ขนาด, ภาษา
- **ลากแมว**: คลิกค้างแล้วลาก (โยนได้)
- **คลิกเดียว**: ลูบหัว → purr ♥ (บางทีแมวก็ไม่สนใจ…)
- **ซ่อนแมว**: กด `Ctrl+Alt+H` (macOS: `⌃⌥H`) หรือติ๊ก "ซ่อนแมว" ในเมนู tray — กดอีกครั้งเพื่อให้กลับมา
- **ปิด**: คลิกขวาที่ไอคอนใน tray → Quit, หรือกด `Ctrl+Alt+Q` (macOS: `⌘⌥Q`)

ในหน้าตั้งค่า → ทั่วไป:
- **เปิด Moewki เมื่อเข้าสู่ระบบ** (ปิดไว้เป็นค่าเริ่มต้น) — ระหว่างพัฒนาจะลงทะเบียน `electron.exe` พร้อมโฟลเดอร์นี้
- **ซ่อนเมื่อใช้งานเต็มจอ** — ตอนดูวิดีโอเต็มจอ เล่นเกม หรือนำเสนองาน แมวจะหายไปแล้วกลับมาเอง
- **ซ่อนจากการแชร์หน้าจอ** — แมวไม่ติดไปใน Zoom/Teams/Meet, ภาพหน้าจอ และการอัดหน้าจอ (ถ้าอยากแคปภาพแมวให้ปิดตัวเลือกนี้ก่อน)

เปิด Moewki ซ้ำจะไม่ได้แมวชุดที่สอง แต่จะเปิดหน้าตั้งค่าของตัวที่รันอยู่แทน

## macOS

ติดตั้ง dependency บนเครื่อง Mac เอง (โฟลเดอร์ `node_modules` จาก Windows ใช้บน Mac ไม่ได้):

```bash
rm -rf node_modules && npm install && npm start
```

- Moewki เป็นแอปบนแถบเมนู (menu bar) ไม่มีไอคอนใน Dock: คลิกรูปแมวบนแถบเมนูเพื่อเปิดเมนู → การตั้งค่า…
- ตำแหน่งหน้าต่างอ่านจาก CoreGraphics (`macapi.js`) ไม่ต้องขอสิทธิ์อะไร แมวเดินบนขอบบนของ Dock แทนแถบงาน
- หน้าต่างตั้งค่าใช้ปุ่มสัญญาณไฟและพื้นหลังโปร่งแสงของ macOS จริง ส่วนบน Windows หน้าเว็บวาดปุ่มสัญญาณไฟเอง

สายพันธุ์: ส้ม, สามสี, เทาลาย, ดำ, ขาว, วิเชียรมาศ, ทักซิโด้ — เพิ่มเองได้ใน `COATS` ของ `renderer/cat2d.js`

## Cat behaviour

แมวต้องอยู่ในท่าที่ถูกต้องก่อนทำอะไร: นอนอยู่ → ตื่น → ยืดตัว → ลุก; นั่งอยู่ → ลุกก่อน.
ก่อนเดินกลับทางจะหันตัวก่อน, ก่อนกระโดดจะจ้องเป้าหมาย (ยิ่งไกลยิ่งจ้องนาน) แล้วย่อตัวส่ายก้น — บางทีก็เปลี่ยนใจไม่โดด.
ก่อนนอนจะหมุนตัวสองรอบ นวดแป้ง แล้วนั่งลง; ตื่นมาจะหาวแล้วยืดตัว. ถ้าหน้าต่างที่นอนอยู่ขยับจะสะดุ้งตื่น (บางทีขู่ขนพอง), ลากหน้าต่างเร็วเกินไปแมวจะร่วง.

อิริยาบถอื่นๆ: เลียอุ้งเท้า, หมอบแบบก้อนขนมปัง (loaf), หาว, ก้มดมพื้น, ชะโงกมองลงจากขอบหน้าต่าง, วิ่งพล่าน (zoomies).
- **เมาส์**: แมวหันมองเคอร์เซอร์ที่ขยับใกล้ๆ ถ้าขยับบนขอบเดียวกันจะย่อตัวส่ายก้นแล้วตะครุบ
- **แมวหลายตัว**: เดินเข้าไปเอาจมูกชนกัน ♥ — หรือบางทีก็ขู่ใส่กัน แล้วอีกตัววิ่งหนี
- **อุ้มแล้ววาง**: แมวจะขู่ หรือเลียขนทำเป็นไม่มีอะไรเกิดขึ้น

## How it works

| file | role |
|---|---|
| `winapi.js` | Win32 `EnumWindows` + DWM frame bounds via koffi, in z-order |
| `macapi.js` | macOS `CGWindowListCopyWindowInfo` via koffi, same output shape |
| `main.js` | click-through always-on-top overlay on the primary display, window polling at ~30 Hz, tray, settings (saved to `%APPDATA%/moewki/settings.json`) |
| `renderer/brain.js` | window tops → walkable ledges (minus parts covered by windows above); behaviour state machine with postures |
| `renderer/pose.js` | pose for every behaviour mode (joint angles), blended frame to frame |
| `renderer/cat2d.js` | draws the cartoon cat from the pose with Canvas 2D, with coat patterns |
| `renderer/settings.html` | settings window, macOS System Settings style on both platforms |
| `renderer/i18n.js` | Thai / English strings (with macOS wording: Dock, menu bar) |
| `scripts/build-icon.js` | `npm run icon`: renders `assets/icon-src/*.svg` to `icon.ico`, `icon.png` and the macOS `trayTemplate.png` |

Maximized windows (top edge at the screen top) are not ledges, but they still block the windows behind them.
