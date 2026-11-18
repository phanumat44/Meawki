import { Cat2D, COATS } from './cat2d.js';
import { LANGUAGES, setLanguage, setPlatform, t, coatName, personalityName, patternName } from './i18n.js';

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
  canvas.width = 54 * devicePixelRatio; canvas.height = 46 * devicePixelRatio;
  const cat = new Cat2D(coat);
  cat.animator.t = Math.random() * 10;
  portraits.add({ canvas, cat });
  return canvas;
}

function renderCats() {
  const list = $('#catList');
  for (const p of [...portraits]) if (list.contains(p.canvas)) portraits.delete(p);
  list.replaceChildren();

  if (!settings.cats.length) {
    const empty = document.createElement('div');
    empty.className = 'cat-card';
    empty.style.justifyContent = 'center';
    empty.innerHTML = `<span style="color: var(--text-2); font-size: 13px;">${t('noCats')}</span>`;
    list.append(empty);
  }

  const coats = [
    ...Object.keys(COATS).map((k) => [k, coatName(k)]),
    ['custom', t('customCoat')],
  ];
  const personalities = ['normal', 'lazy', 'hyper', 'timid'].map((k) => [k, personalityName(k)]);

  settings.cats.forEach((c, i) => {
    const card = document.createElement('div');
    card.className = 'cat-card';
    card.dataset.id = c.id;

    // Portrait / Avatar
    const portraitWrap = document.createElement('div');
    portraitWrap.className = 'cat-card-portrait';
    portraitWrap.append(portrait(c.coat));

    // Body container
    const body = document.createElement('div');
    body.className = 'cat-card-body';

    // Top: Name + Delete button
    const top = document.createElement('div');
    top.className = 'cat-card-top';

    const nameInput = document.createElement('input');
    nameInput.className = 'cat-name-input';
    nameInput.value = c.name || '';
    nameInput.placeholder = t('catN', i + 1);
    nameInput.title = t('catName');
    nameInput.maxLength = 24;
    nameInput.onchange = () => save({ cats: settings.cats.map((k) => (k.id === c.id ? { ...k, name: nameInput.value.trim() } : k)) });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'cat-btn-delete';
    deleteBtn.title = t('deleteCat');
    deleteBtn.disabled = settings.cats.length <= 1;
    deleteBtn.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h10M6 7v5M10 7v5M5 4l.5 9a1.5 1.5 0 0 0 1.5 1.5h2a1.5 1.5 0 0 0 1.5-1.5L11 4M6 4V2.5A1.5 1.5 0 0 1 7.5 1h1A1.5 1.5 0 0 1 10 2.5V4"/></svg>';
    deleteBtn.onclick = () => {
      save({ cats: settings.cats.filter((k) => k.id !== c.id) });
    };

    top.append(nameInput, deleteBtn);

    // Controls: Breed & Personality
    const controls = document.createElement('div');
    controls.className = 'cat-card-controls';

    // Breed selector
    const breedField = document.createElement('div');
    breedField.className = 'cat-field';
    const breedLabel = document.createElement('span');
    breedLabel.className = 'cat-field-label';
    breedLabel.textContent = t('catBreed') + ':';

    const isCustom = typeof c.coat === 'object' || c.coat === 'custom';
    const coatValue = isCustom ? 'custom' : c.coat;

    const coatWrap = popup(coats, coatValue, (coat) => {
      if (coat === 'custom') openCoatEditor(c);
      else save({ cats: settings.cats.map((k) => (k.id === c.id ? { ...k, coat } : k)) });
    });

    const editBtn = document.createElement('button');
    editBtn.className = 'cat-btn-paint';
    editBtn.innerHTML = '🎨 ' + t('editCoat');
    editBtn.title = t('coatEditor');
    editBtn.style.display = isCustom ? 'inline-flex' : 'none';
    editBtn.onclick = () => openCoatEditor(c);

    breedField.append(breedLabel, coatWrap, editBtn);

    // Personality selector
    const persField = document.createElement('div');
    persField.className = 'cat-field';
    const persLabel = document.createElement('span');
    persLabel.className = 'cat-field-label';
    persLabel.textContent = t('personalityLabel') + ':';

    const persWrap = popup(personalities, c.personality || 'normal', (personality) => {
      save({ cats: settings.cats.map((k) => (k.id === c.id ? { ...k, personality } : k)) });
    });

    persField.append(persLabel, persWrap);

    controls.append(breedField, persField);
    body.append(top, controls);
    card.append(portraitWrap, body);
    list.append(card);
  });

  const isFull = settings.cats.length >= MAX_CATS;
  $('#addCat').disabled = isFull;
  $('#addCatText').textContent = t('addNewCat');
  $('#addCatCount').textContent = t('catCountBadge', settings.cats.length, MAX_CATS);
  $('#catNote').textContent = t(isFull ? 'addFull' : 'addDesc', MAX_CATS);
}

$('#addCat').onclick = () => {
  if (settings.cats.length >= MAX_CATS) return;
  const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  save({ cats: [...settings.cats, { id, name: '', coat: 'orange', personality: 'normal' }] });
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

// ---------- laser & modal ----------
window.moewki.getLaser?.().then((on) => { if ($('#laserSwitch')) $('#laserSwitch').checked = !!on; });
window.moewki.onLaser?.((on) => { if ($('#laserSwitch')) $('#laserSwitch').checked = !!on; });
if ($('#laserSwitch')) $('#laserSwitch').onchange = (e) => window.moewki.setLaser(e.target.checked);

let editingCat = null;
let customPreviewCat = null;

function updateCoatPreview() {
  const canvas = $('#coatPreviewCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const coatObj = {
    base: $('#coatBase').value,
    dark: $('#coatDark').value,
    belly: $('#coatBelly').value,
    eye: $('#coatEye').value,
    pattern: $('#coatPattern').value,
  };
  customPreviewCat = new Cat2D(coatObj);
  customPreviewCat.draw(ctx, canvas.width / 2, canvas.height * 0.82, 0.45);
}

function openCoatEditor(cat) {
  editingCat = cat;
  const currentCoat = (cat.coat && typeof cat.coat === 'object') ? cat.coat : (COATS[cat.coat] ?? COATS.orange);
  $('#coatBase').value = currentCoat.base || '#f5a35a';
  $('#coatDark').value = currentCoat.dark || '#d9782f';
  $('#coatBelly').value = currentCoat.belly || '#fff3e2';
  $('#coatEye').value = currentCoat.eye || '#6b8f2a';
  $('#coatPattern').value = currentCoat.pattern || 'tabby';
  $('#coatModal').style.display = 'flex';
  updateCoatPreview();
}

const patterns = ['tabby', 'calico', 'points', 'tuxedo', 'solid'];
for (const p of patterns) $('#coatPattern').append(new Option(patternName(p), p));

for (const id of ['coatBase', 'coatDark', 'coatBelly', 'coatEye', 'coatPattern']) {
  $(`#${id}`)?.addEventListener('input', updateCoatPreview);
  $(`#${id}`)?.addEventListener('change', updateCoatPreview);
}

for (const chip of document.querySelectorAll('.chip[data-preset]')) {
  chip.onclick = () => {
    const preset = COATS[chip.dataset.preset];
    if (!preset) return;
    $('#coatBase').value = preset.base;
    $('#coatDark').value = preset.dark;
    $('#coatBelly').value = preset.belly;
    $('#coatEye').value = preset.eye;
    $('#coatPattern').value = preset.pattern;
    updateCoatPreview();
  };
}

$('#saveCoatBtn').onclick = () => {
  if (!editingCat) return;
  const newCoat = {
    base: $('#coatBase').value,
    dark: $('#coatDark').value,
    belly: $('#coatBelly').value,
    eye: $('#coatEye').value,
    pattern: $('#coatPattern').value,
  };
  $('#coatModal').style.display = 'none';
  save({ cats: settings.cats.map((k) => (k.id === editingCat.id ? { ...k, coat: newCoat } : k)) });
  editingCat = null;
};

$('#cancelCoatBtn').onclick = () => {
  $('#coatModal').style.display = 'none';
  editingCat = null;
};

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
    cat.draw(ctx, 27, 40, 0.30);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
