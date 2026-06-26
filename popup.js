'use strict';

// ── Curated city presets (fixed UTC offsets — no DST handling) ───────────────
const PRESETS = [
  // Asia / Middle East
  { id: 'ist',  name: 'IST',  label: 'Mumbai',            offset:  330 },
  { id: 'pkt',  name: 'PKT',  label: 'Karachi',           offset:  300 },
  { id: 'gst',  name: 'GST',  label: 'Dubai',             offset:  240 },
  { id: 'bst',  name: 'BST',  label: 'Dhaka',             offset:  360 },
  { id: 'ict',  name: 'ICT',  label: 'Bangkok · Jakarta', offset:  420 },
  { id: 'sgt',  name: 'SGT',  label: 'Singapore',         offset:  480 },
  { id: 'hkt',  name: 'HKT',  label: 'Hong Kong',         offset:  480 },
  { id: 'jst',  name: 'JST',  label: 'Tokyo · Seoul',     offset:  540 },
  // Europe / UTC
  { id: 'utc',  name: 'UTC',  label: 'Universal',         offset:    0 },
  { id: 'gmt',  name: 'GMT',  label: 'London',            offset:    0 },
  { id: 'cet',  name: 'CET',  label: 'Paris · Berlin',    offset:   60 },
  { id: 'eet',  name: 'EET',  label: 'Helsinki · Athens', offset:  120 },
  { id: 'msk',  name: 'MSK',  label: 'Moscow',            offset:  180 },
  // Americas
  { id: 'est',  name: 'EST',  label: 'New York',          offset: -300 },
  { id: 'cst',  name: 'CST',  label: 'Chicago',           offset: -360 },
  { id: 'mst',  name: 'MST',  label: 'Denver',            offset: -420 },
  { id: 'pst',  name: 'PST',  label: 'Los Angeles',       offset: -480 },
  { id: 'akst', name: 'AKST', label: 'Anchorage',         offset: -540 },
  { id: 'hst',  name: 'HST',  label: 'Hawaii',            offset: -600 },
  { id: 'art',  name: 'ART',  label: 'Buenos Aires',      offset: -180 },
  { id: 'brt',  name: 'BRT',  label: 'São Paulo',         offset: -180 },
  // Pacific
  { id: 'aest', name: 'AEST', label: 'Sydney',            offset:  600 },
  { id: 'nzst', name: 'NZST', label: 'Auckland',          offset:  720 },
];
const PRESET_BY_ID = Object.fromEntries(PRESETS.map((p) => [p.id, p]));

const MAX_ZONES = 4;
const DEFAULT_ZONES = ['ist', 'utc', 'est'];

function formatOffset(mins) {
  if (mins === 0) return '±00:00';
  const sign = mins > 0 ? '+' : '−';
  const abs = Math.abs(mins);
  return sign + String(Math.floor(abs / 60)).padStart(2, '0') + ':' + String(abs % 60).padStart(2, '0');
}

// ── State ─────────────────────────────────────────────────────────────────────
let sliderMin = null;  // null = follow live wall clock; otherwise 0-1440 (minutes of day in the anchor zone)
let clockMode = 12;
let isDark    = true;
let zones     = DEFAULT_ZONES.slice();
let editing   = false;
let timerId   = null;

const STORAGE_KEYS = {
  theme: 'chrono.theme',
  mode:  'chrono.mode',
  zones: 'chrono.zones',
};

// chrome.storage is async; fall back to localStorage when running outside an extension.
const store = {
  get(keys) {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(keys, (res) => resolve(res || {}));
      } else {
        const out = {};
        keys.forEach((k) => {
          const v = localStorage.getItem(k);
          if (v !== null) {
            try { out[k] = JSON.parse(v); } catch { out[k] = v; }
          }
        });
        resolve(out);
      }
    });
  },
  set(obj) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set(obj);
    } else {
      Object.entries(obj).forEach(([k, v]) => localStorage.setItem(k, JSON.stringify(v)));
    }
  },
};

// ── Theme ─────────────────────────────────────────────────────────────────────
function applyTheme() {
  const cls = isDark ? 'dark' : 'light';
  document.body.className = cls;
  document.documentElement.className = cls;
  document.getElementById('themeBtn').textContent = isDark ? '☀ LIGHT' : '☾ DARK';
}

function toggleTheme() {
  isDark = !isDark;
  applyTheme();
  store.set({ [STORAGE_KEYS.theme]: isDark ? 'dark' : 'light' });
}

// ── Tactile notches under the slider ─────────────────────────────────────────
function buildNotches() {
  const track = document.getElementById('notchTrack');
  track.innerHTML = '';
  for (let i = 0; i < 24; i++) {
    const d = document.createElement('div');
    const cls = i % 6 === 0 ? 'lg' : i % 3 === 0 ? 'md' : 'sm';
    d.className = `notch ${cls}`;
    track.appendChild(d);
  }
}

// ── 12h → 24h conversion scale ───────────────────────────────────────────────
const H24 = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0];
const L24 = ['12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24'];
const L12 = ['12p', '1p', '2p', '3p', '4p', '5p', '6p', '7p', '8p', '9p', '10p', '11p', '12a'];

function buildScale() {
  const row = document.getElementById('scaleRow');
  row.innerHTML = '';
  H24.forEach((h, i) => {
    const d = document.createElement('div');
    d.className = 'scale-tick';
    d.dataset.h = String(h);

    const n24 = document.createElement('div');
    n24.className = 'sn24';
    n24.textContent = L24[i];

    const bar = document.createElement('div');
    bar.className = 'sbar';

    const n12 = document.createElement('div');
    n12.className = 'sn12';
    n12.textContent = L12[i];

    d.appendChild(n24);
    d.appendChild(bar);
    d.appendChild(n12);
    row.appendChild(d);
  });
}

function updateScale(h24) {
  const target = ((h24 % 24) + 24) % 24;
  document.querySelectorAll('.scale-tick').forEach((t) =>
    t.classList.toggle('active', parseInt(t.dataset.h, 10) === target),
  );
}

// ── Live wall-clock helper ───────────────────────────────────────────────────
function getLiveNow() {
  const n = new Date();
  return { h: n.getHours(), m: n.getMinutes(), s: n.getSeconds() };
}

// ── Time formatting ──────────────────────────────────────────────────────────
function fmt(totalMins) {
  let h = Math.floor(totalMins / 60) % 24;
  if (h < 0) h += 24;
  const m = String(totalMins % 60).padStart(2, '0');
  if (clockMode === 24) {
    return { t: String(h).padStart(2, '0') + ':' + m, a: '' };
  }
  return { t: String(h % 12 || 12).padStart(2, '0') + ':' + m, a: h >= 12 ? 'PM' : 'AM' };
}

// Header always shows live local (browser) time — independent of zones list.
function updateHeader(t) {
  const totalMin = t.h * 60 + t.m;
  const { t: timeStr, a: ampm } = fmt(totalMin);
  document.getElementById('headerTime').textContent = timeStr;
  document.getElementById('headerAmpm').textContent = ampm;
}

// ── Zone cards (dynamic) ─────────────────────────────────────────────────────
function renderZoneCards() {
  const root = document.getElementById('timezonesEl');
  root.innerHTML = '';
  // Make the grid responsive to count so 3 cards don't get oddly stretched if
  // a 4-col template was hardcoded.
  root.style.gridTemplateColumns = `repeat(${zones.length}, 1fr)`;

  zones.forEach((id, idx) => {
    const p = PRESET_BY_ID[id];
    if (!p) return;
    const card = document.createElement('div');
    card.className = 'tz-card' + (idx === 0 ? ' active' : '');
    card.dataset.id = id;
    card.innerHTML = `
      <div class="tz-name">${p.name}</div>
      <div class="tz-time">
        <span class="tz-time-val">--:--</span><span class="tz-ampm"></span>
      </div>
      <div class="tz-sub">${formatOffset(p.offset)}</div>
    `;
    root.appendChild(card);
  });
}

function updateZones(utcMins) {
  const cards = document.querySelectorAll('#timezonesEl .tz-card');
  cards.forEach((card) => {
    const p = PRESET_BY_ID[card.dataset.id];
    if (!p) return;
    const mins = ((utcMins + p.offset) % 1440 + 1440) % 1440;
    const { t, a } = fmt(mins);
    card.querySelector('.tz-time-val').textContent = t;
    card.querySelector('.tz-ampm').textContent = a;
  });
}

// ── Slider ───────────────────────────────────────────────────────────────────
function onSlider(v) {
  sliderMin = parseInt(v, 10);
  setFill();
  applyMinute(sliderMin);
  document.getElementById('resetBtn').hidden = false;
}

function resetSliderToLive() {
  sliderMin = null;
  document.getElementById('resetBtn').hidden = true;
}

function setFill() {
  const s = document.getElementById('timeSlider');
  s.style.setProperty('--fill', (parseInt(s.value, 10) / 1440 * 100) + '%');
}

// Returns the offset (in minutes) of the anchor zone — the first zone in the
// list. Defaults to UTC if the list is somehow empty.
function anchorOffset() {
  const anchor = PRESET_BY_ID[zones[0]];
  return anchor ? anchor.offset : 0;
}

function applyMinute(totalMin) {
  const min = ((totalMin % 1440) + 1440) % 1440;
  const hh = Math.floor(min / 60);
  const mm = min % 60;
  document.getElementById('sliderVal').textContent =
    String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  // Slider value is "minutes of day in the anchor zone" → convert back to UTC.
  const utc = ((min - anchorOffset()) % 1440 + 1440) % 1440;
  updateZones(utc);
  updateScale(hh);
}

// Refresh whatever the slider is currently showing — used after zones change.
function refreshFromSlider() {
  if (sliderMin !== null) {
    applyMinute(sliderMin);
  } else {
    const now = new Date();
    applyMinute(now.getHours() * 60 + now.getMinutes());
  }
}

// ── Mode (12 / 24) ───────────────────────────────────────────────────────────
function setMode(m) {
  clockMode = m;
  document.getElementById('btn12').classList.toggle('on', m === 12);
  document.getElementById('btn24').classList.toggle('on', m === 24);
  updateHeader(getLiveNow());
  refreshFromSlider();
  store.set({ [STORAGE_KEYS.mode]: m });
}

// ── Zone editor (add / remove / reorder) ─────────────────────────────────────
function renderEditor() {
  const editor = document.getElementById('zoneEditor');
  editor.innerHTML = '';

  // Header row
  const head = document.createElement('div');
  head.className = 'editor-head';
  head.innerHTML = `
    <span class="editor-title">Edit zones</span>
    <span class="editor-meta">${zones.length} / ${MAX_ZONES}</span>
    <button class="editor-done" id="zoneEditorDone" type="button">✓ DONE</button>
  `;
  editor.appendChild(head);

  // Row per current zone
  const list = document.createElement('div');
  list.className = 'editor-list';
  zones.forEach((id, idx) => {
    const p = PRESET_BY_ID[id];
    if (!p) return;
    const row = document.createElement('div');
    row.className = 'editor-row';
    row.innerHTML = `
      <span class="editor-row-anchor">${idx === 0 ? '★' : '·'}</span>
      <span class="editor-row-name">${p.name}</span>
      <span class="editor-row-label">${p.label}</span>
      <span class="editor-row-offset">${formatOffset(p.offset)}</span>
      <span class="editor-row-actions">
        <button class="editor-mini" data-act="up"   data-idx="${idx}" ${idx === 0 ? 'disabled' : ''} title="Move up">↑</button>
        <button class="editor-mini" data-act="down" data-idx="${idx}" ${idx === zones.length - 1 ? 'disabled' : ''} title="Move down">↓</button>
        <button class="editor-mini editor-mini-danger" data-act="rm" data-idx="${idx}" ${zones.length === 1 ? 'disabled' : ''} title="Remove">✕</button>
      </span>
    `;
    list.appendChild(row);
  });
  editor.appendChild(list);

  // Add-city row (disabled when at max)
  const remaining = PRESETS.filter((p) => !zones.includes(p.id));
  const addRow = document.createElement('div');
  addRow.className = 'editor-add';
  if (zones.length >= MAX_ZONES) {
    addRow.innerHTML = `<span class="editor-add-note">Maximum of ${MAX_ZONES} zones reached.</span>`;
  } else if (remaining.length === 0) {
    addRow.innerHTML = `<span class="editor-add-note">All preset cities already added.</span>`;
  } else {
    const opts = remaining.map((p) =>
      `<option value="${p.id}">${p.name} · ${p.label} (${formatOffset(p.offset)})</option>`).join('');
    addRow.innerHTML = `
      <label class="editor-add-label">Add city</label>
      <select class="editor-select" id="zoneAddSelect">
        <option value="">— choose a city —</option>
        ${opts}
      </select>
      <button class="editor-add-btn" id="zoneAddBtn" type="button">+ ADD</button>
    `;
  }
  editor.appendChild(addRow);

  // Hint
  const hint = document.createElement('div');
  hint.className = 'editor-hint';
  hint.textContent = '★ marks the anchor zone — the slider tracks time-of-day in this zone.';
  editor.appendChild(hint);

  // Wire up
  document.getElementById('zoneEditorDone').addEventListener('click', exitEditMode);
  list.querySelectorAll('button.editor-mini').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx, 10);
      const act = btn.dataset.act;
      if (act === 'up' && idx > 0) {
        [zones[idx - 1], zones[idx]] = [zones[idx], zones[idx - 1]];
      } else if (act === 'down' && idx < zones.length - 1) {
        [zones[idx + 1], zones[idx]] = [zones[idx], zones[idx + 1]];
      } else if (act === 'rm' && zones.length > 1) {
        zones.splice(idx, 1);
      } else return;
      saveZones();
      renderEditor();
    });
  });
  const addBtn = document.getElementById('zoneAddBtn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const sel = document.getElementById('zoneAddSelect');
      const id = sel.value;
      if (!id || zones.includes(id) || zones.length >= MAX_ZONES) return;
      zones.push(id);
      saveZones();
      renderEditor();
    });
  }
}

function saveZones() {
  store.set({ [STORAGE_KEYS.zones]: zones });
}

function enterEditMode() {
  editing = true;
  document.getElementById('timezonesEl').hidden = true;
  document.getElementById('zoneEditor').hidden = false;
  document.getElementById('zoneEditBtn').textContent = '✕ CLOSE';
  renderEditor();
}

function exitEditMode() {
  editing = false;
  document.getElementById('timezonesEl').hidden = false;
  document.getElementById('zoneEditor').hidden = true;
  document.getElementById('zoneEditBtn').textContent = '⚙ EDIT';
  renderZoneCards();
  refreshFromSlider();
}

function toggleEditMode() {
  if (editing) exitEditMode();
  else enterEditMode();
}

// ── 1-second tick loop ───────────────────────────────────────────────────────
function tick() {
  const t = getLiveNow();
  updateHeader(t);

  if (sliderMin === null) {
    const totalMin = t.h * 60 + t.m;
    document.getElementById('timeSlider').value = totalMin;
    setFill();
    document.getElementById('sliderVal').textContent =
      String(t.h).padStart(2, '0') + ':' + String(t.m).padStart(2, '0');
    // Convert the user's local time-of-day to UTC via the anchor's offset.
    // (Assumes the user's local zone == anchor zone, which is typical.)
    const utc = ((totalMin - anchorOffset()) % 1440 + 1440) % 1440;
    updateZones(utc);
    updateScale(t.h);
  }

  timerId = setTimeout(tick, 1000);
}

function stopLoop() {
  if (timerId !== null) {
    clearTimeout(timerId);
    timerId = null;
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  const saved = await store.get([STORAGE_KEYS.theme, STORAGE_KEYS.mode, STORAGE_KEYS.zones]);
  if (saved[STORAGE_KEYS.theme] === 'light') isDark = false;
  if (saved[STORAGE_KEYS.mode] === 24) clockMode = 24;
  if (Array.isArray(saved[STORAGE_KEYS.zones])) {
    const cleaned = saved[STORAGE_KEYS.zones]
      .filter((id) => PRESET_BY_ID[id])
      .slice(0, MAX_ZONES);
    if (cleaned.length > 0) zones = cleaned;
  }

  buildNotches();
  buildScale();
  renderZoneCards();

  document.getElementById('themeBtn').addEventListener('click', toggleTheme);
  document.getElementById('btn12').addEventListener('click', () => setMode(12));
  document.getElementById('btn24').addEventListener('click', () => setMode(24));
  document.getElementById('zoneEditBtn').addEventListener('click', toggleEditMode);

  const slider  = document.getElementById('timeSlider');
  const overlay = document.getElementById('sliderOverlay');

  // Keyboard (arrow keys / Home / End) still routes through the native input.
  slider.addEventListener('input', (e) => onSlider(e.target.value));

  // Custom pointer drag with a heaviness factor — feels weightier than native.
  // HEAVY < 1 = heavier than native (more drag distance per minute).
  // 0.5  ≈ 2 px per minute  (≈4× heavier than native at 800px popup width)
  // 0.75 ≈ 1.3 px per minute (≈2.6× heavier)
  // 1.0  ≈ 1 px per minute   (≈2× heavier)
  const HEAVY = 0.5;
  let dragging = false;
  let dragStartX = 0;
  let dragStartValue = 0;

  // pointerdown does two things:
  //  1. Jumps the slider to the clicked position (native-style click-to-jump).
  //  2. Anchors the heavy-drag from that new position.
  overlay.addEventListener('pointerdown', (e) => {
    const rect = overlay.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const jumped = Math.round(ratio * 1440);
    slider.value = jumped;
    onSlider(jumped);

    dragging = true;
    dragStartX = e.clientX;
    dragStartValue = jumped;
    try { overlay.setPointerCapture(e.pointerId); } catch (_) {}
    slider.focus();
    e.preventDefault();
  });

  overlay.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    e.preventDefault();
    const dx = e.clientX - dragStartX;
    const next = Math.max(0, Math.min(1440, Math.round(dragStartValue + dx * HEAVY)));
    if (next !== parseInt(slider.value, 10)) {
      slider.value = next;
      onSlider(next);
    }
  });

  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    try { overlay.releasePointerCapture(e.pointerId); } catch (_) {}
  };
  overlay.addEventListener('pointerup',     endDrag);
  overlay.addEventListener('pointercancel', endDrag);

  overlay.addEventListener('dblclick', resetSliderToLive);
  document.getElementById('resetBtn').addEventListener('click', resetSliderToLive);

  applyTheme();
  document.getElementById('btn12').classList.toggle('on', clockMode === 12);
  document.getElementById('btn24').classList.toggle('on', clockMode === 24);

  setFill();
  tick();
}

// Pause the timer when the popup is hidden; resume on reopen.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopLoop();
  } else if (timerId === null) {
    tick();
  }
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
