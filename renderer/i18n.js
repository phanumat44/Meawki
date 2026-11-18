// UI strings for the settings window. The tray menu has its own small table in main.js.
export const LANGUAGES = { th: 'ไทย', en: 'English' }; // each shown in its own language

const STRINGS = {
  th: {
    settings: 'การตั้งค่า',
    cats: 'แมว', behaviour: 'พฤติกรรม', display: 'การแสดงผล', actions: 'คำสั่ง',
    hop: 'กระโดดข้ามหน้าต่าง', hopDesc: 'แมวกระโดดจากขอบหน้าต่างหนึ่งไปอีกหน้าต่างหนึ่ง',
    sleepOnWindows: 'นอนบนหน้าต่าง', sleepOnWindowsDesc: 'ให้แมวนอนบนขอบหน้าต่างได้ ไม่ใช่แค่บนแถบงาน',
    offscreen: 'ออกนอกหน้าจอ', offscreenDesc: 'แมวเดินออกไปนอกจอเป็นครั้งคราว แล้วกลับมาเอง',
    taskbar: 'เดินบนแถบงาน', taskbarDesc: 'ปิดไว้แล้วแมวจะอยู่บนหน้าต่างเป็นหลัก',
    language: 'ภาษา', languageDesc: 'ภาษาของหน้าต่างนี้และเมนูในถาดระบบ',
    speed: 'ความเร็ว', speedDesc: 'ความเร็วของการเคลื่อนไหวทั้งหมด',
    size: 'ขนาดแมว',
    recall: 'เรียกแมวกลับมา', recallDesc: 'แมวทุกตัวจะหล่นลงมาจากด้านบนของจอ', recallBtn: 'เรียก',
    nap: 'ให้แมวนอน', napDesc: 'แมวที่อยู่บนจอจะหาที่นอนทันที', napBtn: 'นอน',
    on: 'เปิด', off: 'ปิด',
    noCats: 'ยังไม่มีแมวบนจอ',
    catN: (n) => `แมวตัวที่ ${n}`,
    removeCat: 'นำแมวตัวนี้ออก',
    addCat: 'เพิ่มแมว', addBtn: 'เพิ่ม',
    addDesc: (max) => `เลี้ยงได้สูงสุด ${max} ตัว`,
    addFull: (max) => `มีแมวครบ ${max} ตัวแล้ว`,
    coats: { orange: 'ส้ม', calico: 'สามสี', grey: 'เทาลาย', black: 'ดำ', white: 'ขาว', siamese: 'วิเชียรมาศ', tuxedo: 'ทักซิโด้' },
    general: 'ทั่วไป', breed: 'สายพันธุ์',
    addTip: 'เพิ่มแมว', removeTip: 'นำแมวที่เลือกออก',
    slow: 'ช้า', fast: 'เร็ว', small: 'เล็ก', large: 'ใหญ่',
    // macOS names things differently: Dock instead of taskbar, menu bar instead of tray
    sleepOnWindowsDescMac: 'ให้แมวนอนบนขอบหน้าต่างได้ ไม่ใช่แค่บน Dock',
    taskbarMac: 'เดินบน Dock',
    languageDescMac: 'ภาษาของหน้าต่างนี้และเมนูในแถบเมนู',
  },
  en: {
    settings: 'Settings',
    cats: 'Cats', behaviour: 'Behavior', display: 'Display', actions: 'Actions',
    hop: 'Window hopping', hopDesc: 'Cats jump from the top of one window to another',
    sleepOnWindows: 'Sleep on windows', sleepOnWindowsDesc: 'Let cats nap on window tops, not only on the taskbar',
    offscreen: 'Leave the screen', offscreenDesc: 'Cats wander off-screen now and then, and come back on their own',
    taskbar: 'Walk on the taskbar', taskbarDesc: 'When off, cats stay mostly on windows',
    language: 'Language', languageDesc: 'Used for this window and the tray menu',
    speed: 'Speed', speedDesc: 'How fast all movement plays',
    size: 'Cat size',
    recall: 'Call cats back', recallDesc: 'Every cat drops in from the top of the screen', recallBtn: 'Call back',
    nap: 'Nap time', napDesc: 'Cats on screen find a spot and lie down', napBtn: 'Nap',
    on: 'On', off: 'Off',
    noCats: 'No cats on screen yet',
    catN: (n) => `Cat ${n}`,
    removeCat: 'Remove this cat',
    addCat: 'Add a cat', addBtn: 'Add',
    addDesc: (max) => `Up to ${max} cats`,
    addFull: (max) => `You have the maximum of ${max} cats`,
    coats: { orange: 'Orange tabby', calico: 'Calico', grey: 'Grey tabby', black: 'Black', white: 'White', siamese: 'Siamese', tuxedo: 'Tuxedo' },
    general: 'General', breed: 'Breed',
    addTip: 'Add a cat', removeTip: 'Remove the selected cat',
    slow: 'Slow', fast: 'Fast', small: 'Small', large: 'Large',
    sleepOnWindowsDescMac: 'Let cats nap on window tops, not only on the Dock',
    taskbarMac: 'Walk on the Dock',
    languageDescMac: 'Used for this window and the menu bar menu',
  },
};

let current = 'th';
let mac = false;
export function setLanguage(lang) { current = STRINGS[lang] ? lang : 'en'; }
export function setPlatform(platform) { mac = platform === 'mac'; }
export function t(key, ...args) {
  const v = (mac ? STRINGS[current][`${key}Mac`] : undefined) ?? STRINGS[current][key] ?? STRINGS.en[key] ?? key;
  return typeof v === 'function' ? v(...args) : v;
}
export const coatName = (key) => STRINGS[current].coats[key] ?? key;
