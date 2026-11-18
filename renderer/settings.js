import { Cat2D, COATS } from './cat2d.js';
import { LANGUAGES, setLanguage, setPlatform, t, coatName, personalityName } from './i18n.js';

const MAX_CATS = 8;
const ARROWS = '<svg viewBox="0 0 8 10" fill="none" stroke="#fff" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 3.8 4 1.3l2.5 2.5M1.5 6.2 4 8.7l2.5-2.5"/></svg>';
const $ = (sel) => document.querySelector(sel);

const platform = new URLSearchParams(location.search).get('platform') ?? 'win';
document.body.classList.add(platform);
setPlatform(platform);
for (const a of document.querySelectorAll('.popup .arrows')) a.innerHTML = ARROWS;

// dim selection, switches and traffic lights when the window is in the background, like AppKit does
addEventListener('blur', () => document.body.classList.add('inactive'));
addEventListener('focus', () => document.body.classList.remove('inactive'));
for (const b of document.querySelectorAll('.lights [data-act]')) b.onclick = () => window.moewki.windowAction(b.dataset.act);
addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'w') window.moewki.windowAction('close');
});

// accent: the user's macOS accent colour, the standard macOS blue elsewhere
window.moewki.getAccent().then((c) => c && document.documentElement.style.setProperty('--accent', c));
window.moewki.onAccent((c) => c && document.documentElement.style.setProperty('--accent', c));

let settings = await window.moewki.getSettings();
let selected = null; // id of the highlighted cat in the list
const portraits = new Set();

// ---------- sidebar pages ----------
let page = 'cats';
try { page = localStorage.getItem('moewki.page') || page; } catch { /* storage unavailable */ }
function showPage(p) {
  page = p;
  for (const b of document.querySelectorAll('#nav button')) b.classList.toggle('on', b.dataset.page === p);
  for (const el of document.querySelectorAll('.page')) el.classList.toggle('on', el.dataset.page === p);
  $('#title').textContent = t(p);
  try { localStorage.setItem('moewki.page', p); } catch { /* storage unavailable */ }
}
for (const b of document.querySelectorAll('#nav button')) b.onclick = () => showPage(b.dataset.page);
$('#nav').addEventListener('keydown', (e) => {
  const pages = [...document.querySelectorAll('#nav button')].map((b) => b.dataset.page);
  const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
  if (!step) return;
  e.preventDefault();
  const next = pages[(pages.indexOf(page) + step + pages.length) % pages.length];
  showPage(next);
  document.querySelector(`#nav button[data-page="${next}"]`).focus();
});

// ---------- cat list ----------
function popup(options, value, onChange) {
  const wrap = document.createElement('span');
  wrap.className = 'popup';
  wrap.innerHTML = `<select></select><span class="arrows">${ARROWS}</span>`;
  const select = wrap.querySelector('select');
  for (const [v, label] of options) select.append(new Option(label, v, false, v === value));
  select.onchange = () => onChange(select.value);
  select.onmousedown = (e) => e.stopPropagation(); // don't change the row selection
  return wrap;
}

function portrait(coat) {
  const canvas = document.createElement('canvas');
  canvas.width = 40 * devicePixelRatio; canvas.height = 30 * devicePixelRatio;
  const cat = new Cat2D(coat);
  cat.animator.t = Math.random() * 10;
  portraits.add({ canvas, cat });
  return canvas;
}

function renderCats() {
  const list = $('#catList');
  for (const p of [...portraits]) if (list.contains(p.canvas)) portraits.delete(p);
  list.replaceChildren();
  if (!settings.cats.some((c) => c.id === selected)) selected = settings.cats.at(-1)?.id ?? null;

  if (!settings.cats.length) {
    const empty = document.createElement('div');
    empty.className = 'row';
    empty.innerHTML = `<span class="label" style="color: var(--text-2)">${t('noCats')}</span>`;
    list.append(empty);
  }
  const coats = Object.keys(COATS).map((k) => [k, coatName(k)]);
  const personalities = ['normal', 'lazy', 'hyper', 'timid'].map((k) => [k, personalityName(k)]);
  settings.cats.forEach((c, i) => {
    const row = document.createElement('div');
    row.className = 'row selectable' + (c.id === selected ? ' sel' : '');
    row.append(portrait(c.coat));

    const nameInput = document.createElement('input');
    nameInput.className = 'cat-name-input';
    nameInput.value = c.name || '';
    nameInput.placeholder = t('catN', i + 1);
    nameInput.title = t('catName');
    nameInput.onchange = () => save({ cats: settings.cats.map((k) => (k.id === c.id ? { ...k, name: nameInput.value.trim() } : k)) });
    nameInput.onmousedown = (e) => e.stopPropagation();

    row.append(
      nameInput,
      popup(coats, c.coat, (coat) => save({ cats: settings.cats.map((k) => (k.id === c.id ? { ...k, coat } : k)) })),
      popup(personalities, c.personality || 'normal', (personality) => save({ cats: settings.cats.map((k) => (k.id === c.id ? { ...k, personality } : k)) }))
    );
    row.onmousedown = () => { selected = c.id; renderCats(); };
    list.append(row);
  });
  $('#addCat').disabled = settings.cats.length >= MAX_CATS;
  $('#removeCat').disabled = !selected;
  $('#addCat').title = t('addTip');
  $('#removeCat').title = t('removeTip');
  $('#catNote').textContent = t(settings.cats.length >= MAX_CATS ? 'addFull' : 'addDesc', MAX_CATS);
}

$('#addCat').onclick = () => {
  const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; // unique even for quick double clicks
  selected = id;
  save({ cats: [...settings.cats, { id, name: '', coat: 'orange', personality: 'normal' }] });
};
$('#removeCat').onclick = () => {
  const i = settings.cats.findIndex((c) => c.id === selected);
  const cats = settings.cats.filter((c) => c.id !== selected);
  selected = cats[Math.min(i, cats.length - 1)]?.id ?? null;
  save({ cats });
};

// ---------- other controls ----------
function renderControls() {
  for (const input of document.querySelectorAll('[data-key]')) input.checked = !!settings[input.dataset.key];
  for (const id of ['speed', 'size', 'volume']) {
    const input = $(`#${id}`);
    if (!input) continue;
    input.value = settings[id] ?? (id === 'volume' ? 0.8 : 1);
    input.style.setProperty('--p', `${((input.value - input.min) / (input.max - input.min)) * 100}%`);
  }
  $('#lang').value = uiLang();
}

function save(patch) {
  settings = { ...settings, ...patch };
  window.moewki.setSettings(patch);
  if ('cats' in patch) renderCats();
  applyLanguage();
  renderControls();
}

for (const input of document.querySelectorAll('[data-key]')) input.onchange = () => save({ [input.dataset.key]: input.checked });
for (const id of ['speed', 'size', 'volume']) $(`#${id}`)?.addEventListener('input', (e) => save({ [id]: +e.target.value }));
$('#recall').onclick = () => window.moewki.command('recall');
$('#nap').onclick = () => window.moewki.command('sleep');
for (const [code, name] of Object.entries(LANGUAGES)) $('#lang').append(new Option(name, code));
$('#lang').onchange = (e) => save({ lang: e.target.value });
window.moewki.onSettings((s) => {
  const catsChanged = JSON.stringify(s.cats) !== JSON.stringify(settings.cats);
  settings = s;
  if (catsChanged) renderCats();
  applyLanguage();
  renderControls();
});

// ---------- updates ----------
let update = await window.moewki.getUpdate();
window.moewki.getVersion().then((v) => {
  $('#appVersion').textContent = `Moewki ${v}`;
  const aboutVer = $('#aboutVer');
  if (aboutVer) aboutVer.textContent = `Version ${v}`;
});
function renderUpdate() {
  const u = update, btn = $('#updateBtn');
  const desc = {
    dev: t('upDev'), idle: t('upIdle'), checking: t('upChecking'), latest: t('upLatest'), error: t('upError'),
    downloading: t('upDownloading', u.version, u.progress), ready: t('upReady', u.version), available: t('upAvailable', u.version),
  }[u.status] ?? '';
  $('#updateDesc').textContent = desc;
  btn.textContent = u.status === 'ready' ? t('installBtn') : u.status === 'available' ? t('downloadBtn') : t('checkBtn');
  btn.classList.toggle('default', u.status === 'ready' || u.status === 'available');
  btn.disabled = ['dev', 'checking', 'downloading'].includes(u.status);
}
$('#updateBtn').onclick = () => (['ready', 'available'].includes(update.status) ? window.moewki.installUpdate() : window.moewki.checkForUpdate());
window.moewki.onUpdate((u) => { update = u; renderUpdate(); });

// ---------- reset & about ----------
$('#resetBtn').onclick = () => {
  if (confirm(t('resetConfirm'))) {
    window.moewki.resetSettings();
  }
};
$('#githubBtn').onclick = () => {
  window.moewki.openExternal('https://github.com/phanumat44/Meawki');
};

// ---------- language ----------
const uiLang = () => (settings.lang in LANGUAGES ? settings.lang : 'en');
let appliedLang = null;
function applyLanguage() {
  if (uiLang() === appliedLang) return;
  appliedLang = uiLang();
  setLanguage(appliedLang);
  document.documentElement.lang = appliedLang;
  for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
  $('#hiddenDesc').textContent = t('hiddenDesc', platform === 'mac' ? '⌃⌥H' : 'Ctrl+Alt+H');
  $('#title').textContent = t(page);
  renderCats();
  renderUpdate();
}

applyLanguage();
showPage(document.querySelector(`#nav button[data-page="${page}"]`) ? page : 'cats');
renderControls();

// small animated portraits in the cat list
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  for (const { canvas, cat } of portraits) {
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    cat.animator.update(dt, 'idle', { dir: 1 });
    ctx.scale(devicePixelRatio, devicePixelRatio);
    cat.draw(ctx, 21, 27, 0.24);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
