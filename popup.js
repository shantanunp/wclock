'use strict';

// ── Curated city presets (IANA timezone IDs, DST handled by Intl) ───────────
//
// `tz` is the IANA Time Zone Database identifier. The browser ships the full
// tzdata bundled with ICU, so all offset/DST math is purely local — no
// network. `nameDST` is the abbreviation used when daylight time is active;
// if omitted, the zone has no DST (or we just always use `name`).
const PRESETS = [
  // Asia / Middle East
  { id: 'ist',  name: 'IST',                    label: 'Mumbai',            tz: 'Asia/Kolkata'      },
  { id: 'pkt',  name: 'PKT',                    label: 'Karachi',           tz: 'Asia/Karachi'      },
  { id: 'gst',  name: 'GST',                    label: 'Dubai',             tz: 'Asia/Dubai'        },
  { id: 'bst',  name: 'BST',                    label: 'Dhaka',             tz: 'Asia/Dhaka'        },
  { id: 'ict',  name: 'ICT',                    label: 'Bangkok · Jakarta', tz: 'Asia/Bangkok'      },
  { id: 'sgt',  name: 'SGT',                    label: 'Singapore',         tz: 'Asia/Singapore'    },
  { id: 'hkt',  name: 'HKT',                    label: 'Hong Kong',         tz: 'Asia/Hong_Kong'    },
  { id: 'jst',  name: 'JST',                    label: 'Tokyo · Seoul',     tz: 'Asia/Tokyo'        },
  // Europe / UTC
  { id: 'utc',  name: 'UTC',                    label: 'Universal',         tz: 'UTC'               },
  { id: 'gmt',  name: 'GMT',  nameDST: 'BST',   label: 'London',            tz: 'Europe/London'     },
  { id: 'cet',  name: 'CET',  nameDST: 'CEST',  label: 'Paris · Berlin',    tz: 'Europe/Paris'      },
  { id: 'eet',  name: 'EET',  nameDST: 'EEST',  label: 'Helsinki · Athens', tz: 'Europe/Helsinki'   },
  { id: 'msk',  name: 'MSK',                    label: 'Moscow',            tz: 'Europe/Moscow'     },
  // Americas
  { id: 'est',  name: 'EST',  nameDST: 'EDT',   label: 'New York',          tz: 'America/New_York'  },
  { id: 'cst',  name: 'CST',  nameDST: 'CDT',   label: 'Chicago',           tz: 'America/Chicago'   },
  { id: 'mst',  name: 'MST',  nameDST: 'MDT',   label: 'Denver',            tz: 'America/Denver'    },
  { id: 'pst',  name: 'PST',  nameDST: 'PDT',   label: 'Los Angeles',       tz: 'America/Los_Angeles' },
  { id: 'akst', name: 'AKST', nameDST: 'AKDT',  label: 'Anchorage',         tz: 'America/Anchorage' },
  { id: 'hst',  name: 'HST',                    label: 'Hawaii',            tz: 'Pacific/Honolulu'  },
  { id: 'art',  name: 'ART',                    label: 'Buenos Aires',      tz: 'America/Argentina/Buenos_Aires' },
  { id: 'brt',  name: 'BRT',                    label: 'São Paulo',         tz: 'America/Sao_Paulo' },
  // Pacific
  { id: 'aest', name: 'AEST', nameDST: 'AEDT',  label: 'Sydney',            tz: 'Australia/Sydney'  },
  { id: 'nzst', name: 'NZST', nameDST: 'NZDT',  label: 'Auckland',          tz: 'Pacific/Auckland'  },
];
const PRESET_BY_ID = Object.fromEntries(PRESETS.map((p) => [p.id, p]));

const MAX_ZONES = 4;
const DEFAULT_ZONES = ['ist', 'utc', 'est'];

// ── DST-aware helpers (all offline — Intl uses bundled tzdata) ───────────────

// Computes the UTC offset of a zone at a given moment, in minutes (e.g. -240
// for America/New_York during EDT, -300 during EST). Robust across DST.
function offsetMinutesFor(tz, date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(date);
    const g = (t) => +parts.find((p) => p.type === t).value;
    const asUTC = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'));
    return Math.round((asUTC - date.getTime()) / 60000);
  } catch (_) {
    return 0;
  }
}

// True if the zone is currently observing daylight saving time. Works for both
// hemispheres by comparing the year's min offset (= standard time) against now.
function isDST(tz, date = new Date()) {
  const y = date.getFullYear();
  const jan = offsetMinutesFor(tz, new Date(Date.UTC(y, 0, 15)));
  const jul = offsetMinutesFor(tz, new Date(Date.UTC(y, 6, 15)));
  if (jan === jul) return false;
  return offsetMinutesFor(tz, date) > Math.min(jan, jul);
}

// Preferred display abbreviation: nameDST during daylight time, else name.
function nameFor(preset, date = new Date()) {
  if (preset.nameDST && isDST(preset.tz, date)) return preset.nameDST;
  return preset.name;
}

function formatOffset(mins) {
  if (mins === 0) return '±00:00';
  const sign = mins > 0 ? '+' : '−';
  const abs = Math.abs(mins);
  return sign + String(Math.floor(abs / 60)).padStart(2, '0') + ':' + String(abs % 60).padStart(2, '0');
}

// ── Manual per-zone offset overrides ────────────────────────────────────────
//
// Safety valve for the gap between a real-world DST/offset change and the
// matching tzdata reaching the user's Chrome. `overrides[zoneId]` is a signed
// minute delta added on top of whatever Intl computes — e.g. +60 to force EDT
// behaviour on a stale Chrome that still thinks New York is in EST.
//
// Stored persistently. Clamped to ±240 minutes (4 hours) so a misclick can't
// silently put a card half a day off.
const ADJ_STEP_MIN   = 15;
const ADJ_CLAMP_MIN  = 240;

function overrideFor(id) {
  return overrides[id] || 0;
}

function effectiveOffsetFor(preset, date = new Date()) {
  return offsetMinutesFor(preset.tz, date) + overrideFor(preset.id);
}

function setOverride(id, mins) {
  const v = Math.max(-ADJ_CLAMP_MIN, Math.min(ADJ_CLAMP_MIN, mins | 0));
  if (v === 0) delete overrides[id];
  else overrides[id] = v;
  store.set({ [STORAGE_KEYS.overrides]: overrides });
}

function bumpOverride(id, deltaMins) {
  setOverride(id, overrideFor(id) + deltaMins);
}

function formatAdj(mins) {
  if (!mins) return '';
  const sign = mins > 0 ? '+' : '−';
  const abs  = Math.abs(mins);
  const h    = Math.floor(abs / 60);
  const m    = abs % 60;
  if (h && m) return `${sign}${h}h${m}m`;
  if (h)      return `${sign}${h}h`;
  return       `${sign}${m}m`;
}

// ── State ─────────────────────────────────────────────────────────────────────
let sliderMin = null;  // null = follow live wall clock; otherwise 0-1440 (minutes of day in the anchor zone)
let clockMode = 12;
let isDark    = true;
let zones     = DEFAULT_ZONES.slice();
let overrides = {};    // { zoneId: signed minutes offset adjustment }
let editing   = false;
let timerId   = null;

const STORAGE_KEYS = {
  theme:     'chrono.theme',
  mode:      'chrono.mode',
  zones:     'chrono.zones',
  overrides: 'chrono.overrides',
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
  // Analog clock hands are theme-coloured — repaint without waiting for the
  // next 1-second tick so the toggle feels instant.
  if (document.getElementById('headerClock')) updateHeader();
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

// ── Tiny analog clock in the header ──────────────────────────────────────────
// Draws a small clock face matching the digital time's height. Re-sizes the
// canvas backing store to current devicePixelRatio so it stays crisp on HiDPI
// displays even though the CSS size is fixed at 28×28.
function drawHeaderClock(totalMins) {
  const canvas = document.getElementById('headerClock');
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const cssSize = canvas.clientWidth || 28;
  const pxSize  = Math.max(1, Math.round(cssSize * dpr));
  if (canvas.width !== pxSize || canvas.height !== pxSize) {
    canvas.width = pxSize;
    canvas.height = pxSize;
  }

  const ctx = canvas.getContext('2d');
  const s = canvas.width;
  ctx.clearRect(0, 0, s, s);
  const cx = s / 2;
  const cy = s / 2;
  const r  = s * 0.44;

  // Theme-aware palette — matches the digital time's amber accent.
  const accent = isDark ? '#e8c84a' : '#7c4a00';
  const ring   = isDark ? 'rgba(232, 200, 74, 0.45)' : 'rgba(124, 74, 0, 0.55)';

  ctx.lineCap = 'round';

  // Bezel
  ctx.strokeStyle = ring;
  ctx.lineWidth   = Math.max(1, s * 0.055);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  // Continuous angles — hour hand creeps with the minute for a natural look.
  const h     = Math.floor(totalMins / 60) % 12;
  const m     = totalMins % 60;
  const hourA = ((h + m / 60) / 12) * Math.PI * 2 - Math.PI / 2;
  const minA  = (m / 60)            * Math.PI * 2 - Math.PI / 2;

  ctx.strokeStyle = accent;

  // Hour hand (shorter, thicker)
  ctx.lineWidth = Math.max(1.5, s * 0.085);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(hourA) * r * 0.50, cy + Math.sin(hourA) * r * 0.50);
  ctx.stroke();

  // Minute hand (longer, thinner)
  ctx.lineWidth = Math.max(1.2, s * 0.055);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(minA) * r * 0.82, cy + Math.sin(minA) * r * 0.82);
  ctx.stroke();

  // Center cap
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(1.2, s * 0.07), 0, Math.PI * 2);
  ctx.fill();
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

// Header follows the ANCHOR zone (first card) so it stays semantically in sync
// with the slider and the highlighted card. The user's actual browser-local
// time is irrelevant for the widget's reference frame.
function updateHeader(now = new Date()) {
  const anchor   = PRESET_BY_ID[zones[0]];
  const utcMins  = now.getUTCHours() * 60 + now.getUTCMinutes();
  const aOff     = anchorOffset();
  const aMins    = ((utcMins + aOff) % 1440 + 1440) % 1440;
  const { t: timeStr, a: ampm } = fmt(aMins);
  document.getElementById('headerTime').textContent = timeStr;
  document.getElementById('headerAmpm').textContent = ampm;
  drawHeaderClock(aMins);

  const tzEl = document.getElementById('headerTz');
  if (tzEl && anchor) tzEl.textContent = nameFor(anchor, now);

  // Mirror the per-card ADJ badge in the header when the anchor has an
  // active manual override — keeps the "trust this displayed time" signal
  // consistent everywhere.
  const adjEl = document.getElementById('headerAdj');
  if (adjEl) {
    const adj = anchor ? overrideFor(anchor.id) : 0;
    if (adj) {
      adjEl.textContent = 'ADJ ' + formatAdj(adj);
      adjEl.hidden = false;
    } else {
      adjEl.textContent = '';
      adjEl.hidden = true;
    }
  }
}

// ── Zone cards (dynamic) ─────────────────────────────────────────────────────
function renderZoneCards() {
  const root = document.getElementById('timezonesEl');
  root.innerHTML = '';
  // Make the grid responsive to count so 3 cards don't get oddly stretched if
  // a 4-col template was hardcoded.
  root.style.gridTemplateColumns = `repeat(${zones.length}, 1fr)`;

  const now = new Date();
  zones.forEach((id, idx) => {
    const p = PRESET_BY_ID[id];
    if (!p) return;
    const card = document.createElement('div');
    card.className = 'tz-card' + (idx === 0 ? ' active' : '');
    card.dataset.id = id;
    card.innerHTML = `
      <div class="tz-name">
        <span class="tz-name-text">${nameFor(p, now)}</span>
        <span class="tz-adj-badge" hidden></span>
      </div>
      <div class="tz-time">
        <span class="tz-time-val">--:--</span><span class="tz-ampm"></span>
      </div>
      <div class="tz-sub">${formatOffset(effectiveOffsetFor(p, now))}</div>
    `;
    root.appendChild(card);
  });
}

function updateZones(utcMins) {
  const now = new Date();
  const cards = document.querySelectorAll('#timezonesEl .tz-card');
  cards.forEach((card) => {
    const p = PRESET_BY_ID[card.dataset.id];
    if (!p) return;
    // Recompute per tick so DST transitions take effect even while popup is open.
    const off  = effectiveOffsetFor(p, now);
    const mins = ((utcMins + off) % 1440 + 1440) % 1440;
    const { t, a } = fmt(mins);
    card.querySelector('.tz-time-val').textContent = t;
    card.querySelector('.tz-ampm').textContent     = a;
    card.querySelector('.tz-name-text').textContent = nameFor(p, now);
    card.querySelector('.tz-sub').textContent      = formatOffset(off);

    const badge = card.querySelector('.tz-adj-badge');
    const adj   = overrideFor(p.id);
    if (adj) {
      badge.textContent = 'ADJ ' + formatAdj(adj);
      badge.hidden = false;
      card.classList.add('has-adj');
    } else {
      badge.hidden = true;
      card.classList.remove('has-adj');
    }
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

// Returns the current effective offset (in minutes) of the anchor zone — the
// first zone in the list. Includes any manual override on that zone.
// Defaults to UTC if the list is somehow empty.
function anchorOffset() {
  const anchor = PRESET_BY_ID[zones[0]];
  return anchor ? effectiveOffsetFor(anchor) : 0;
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
    // Live mode: slider reflects time-of-day in the anchor zone, derived from
    // UTC (not the user's local clock — they may live in a different zone).
    const now      = new Date();
    const utcMins  = now.getUTCHours() * 60 + now.getUTCMinutes();
    const anchorMm = ((utcMins + anchorOffset()) % 1440 + 1440) % 1440;
    applyMinute(anchorMm);
  }
}

// ── Mode (12 / 24) ───────────────────────────────────────────────────────────
function setMode(m) {
  clockMode = m;
  document.getElementById('btn12').classList.toggle('on', m === 12);
  document.getElementById('btn24').classList.toggle('on', m === 24);
  updateHeader();
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
  const now  = new Date();
  const list = document.createElement('div');
  list.className = 'editor-list';
  zones.forEach((id, idx) => {
    const p = PRESET_BY_ID[id];
    if (!p) return;
    const adj    = overrideFor(id);
    const effOff = effectiveOffsetFor(p, now);
    const adjBadge = adj
      ? `<span class="editor-adj-badge">${formatAdj(adj)}</span>` : '';
    const adjLabel = adj
      ? `Manual nudge <strong>${formatAdj(adj)}</strong>`
      : `Manual nudge`;
    const row = document.createElement('div');
    row.className = 'editor-row' + (adj ? ' has-adj' : '');
    row.innerHTML = `
      <div class="editor-row-main">
        <span class="editor-row-anchor">${idx === 0 ? '★' : '·'}</span>
        <span class="editor-row-name">${nameFor(p, now)}</span>
        <span class="editor-row-label">${p.label}</span>
        <span class="editor-row-offset">${formatOffset(effOff)} ${adjBadge}</span>
        <span class="editor-row-actions">
          <button class="editor-mini" data-act="up"   data-idx="${idx}" ${idx === 0 ? 'disabled' : ''} title="Move up">↑</button>
          <button class="editor-mini" data-act="down" data-idx="${idx}" ${idx === zones.length - 1 ? 'disabled' : ''} title="Move down">↓</button>
          <button class="editor-mini editor-mini-danger" data-act="rm" data-idx="${idx}" ${zones.length === 1 ? 'disabled' : ''} title="Remove">✕</button>
        </span>
      </div>
      <div class="editor-row-adj">
        <span class="editor-row-adj-label">${adjLabel}</span>
        <span class="editor-row-adj-stepper">
          <button class="editor-mini editor-adj"       data-act="adj-" data-idx="${idx}" ${adj <= -ADJ_CLAMP_MIN ? 'disabled' : ''} title="Nudge −${ADJ_STEP_MIN} min">−${ADJ_STEP_MIN}m</button>
          <button class="editor-mini editor-adj"       data-act="adj+" data-idx="${idx}" ${adj >=  ADJ_CLAMP_MIN ? 'disabled' : ''} title="Nudge +${ADJ_STEP_MIN} min">+${ADJ_STEP_MIN}m</button>
          <button class="editor-mini editor-adj-reset" data-act="adj0" data-idx="${idx}" ${adj === 0 ? 'disabled' : ''} title="Clear adjustment">↺</button>
        </span>
      </div>
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
      `<option value="${p.id}">${nameFor(p, now)} · ${p.label} (${formatOffset(offsetMinutesFor(p.tz, now))})</option>`).join('');
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
  hint.innerHTML = '★ marks the anchor zone — the slider tracks time-of-day in this zone.<br>' +
    `Use <strong>−${ADJ_STEP_MIN}m / +${ADJ_STEP_MIN}m</strong> to manually nudge a zone if your browser's timezone database is out of date (e.g. a country shifted DST and Chrome hasn't updated yet). Cleared with ↺.`;
  editor.appendChild(hint);

  // Wire up
  document.getElementById('zoneEditorDone').addEventListener('click', exitEditMode);
  list.querySelectorAll('button.editor-mini').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx, 10);
      const act = btn.dataset.act;
      const id  = zones[idx];
      if (act === 'up' && idx > 0) {
        [zones[idx - 1], zones[idx]] = [zones[idx], zones[idx - 1]];
        saveZones();
      } else if (act === 'down' && idx < zones.length - 1) {
        [zones[idx + 1], zones[idx]] = [zones[idx], zones[idx + 1]];
        saveZones();
      } else if (act === 'rm' && zones.length > 1) {
        zones.splice(idx, 1);
        saveZones();
      } else if (act === 'adj-') {
        bumpOverride(id, -ADJ_STEP_MIN);
      } else if (act === 'adj+') {
        bumpOverride(id,  ADJ_STEP_MIN);
      } else if (act === 'adj0') {
        setOverride(id, 0);
      } else return;
      renderEditor();
      // Snap the header/slider to the new anchor state without waiting for
      // the 1-second tick — keeps the editor feeling reactive.
      updateHeader();
      if (sliderMin === null) refreshFromSlider();
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
  updateHeader();
}

function toggleEditMode() {
  if (editing) exitEditMode();
  else enterEditMode();
}

// ── 1-second tick loop ───────────────────────────────────────────────────────
function tick() {
  const now = new Date();
  updateHeader(now);

  if (sliderMin === null) {
    // Drive everything from UTC so the user's local zone is irrelevant — the
    // slider tracks the ANCHOR zone (first card), each zone card derives its
    // own DST-aware offset, and we don't accidentally double-shift.
    const utcMins = now.getUTCHours() * 60 + now.getUTCMinutes();
    const anchorMm = ((utcMins + anchorOffset()) % 1440 + 1440) % 1440;
    const ah = Math.floor(anchorMm / 60);
    const am = anchorMm % 60;

    document.getElementById('timeSlider').value = anchorMm;
    setFill();
    document.getElementById('sliderVal').textContent =
      String(ah).padStart(2, '0') + ':' + String(am).padStart(2, '0');

    updateZones(utcMins);
    updateScale(ah);
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
  const saved = await store.get([
    STORAGE_KEYS.theme,
    STORAGE_KEYS.mode,
    STORAGE_KEYS.zones,
    STORAGE_KEYS.overrides,
  ]);
  if (saved[STORAGE_KEYS.theme] === 'light') isDark = false;
  if (saved[STORAGE_KEYS.mode] === 24) clockMode = 24;
  if (Array.isArray(saved[STORAGE_KEYS.zones])) {
    const cleaned = saved[STORAGE_KEYS.zones]
      .filter((id) => PRESET_BY_ID[id])
      .slice(0, MAX_ZONES);
    if (cleaned.length > 0) zones = cleaned;
  }
  if (saved[STORAGE_KEYS.overrides] && typeof saved[STORAGE_KEYS.overrides] === 'object') {
    // Defensive sanitisation: only keep entries for known presets, clamp the
    // value, and drop zeros.
    for (const [id, raw] of Object.entries(saved[STORAGE_KEYS.overrides])) {
      if (!PRESET_BY_ID[id]) continue;
      const v = Math.max(-ADJ_CLAMP_MIN, Math.min(ADJ_CLAMP_MIN, parseInt(raw, 10) || 0));
      if (v !== 0) overrides[id] = v;
    }
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

  // Velocity-aware pointer drag — three explicit tiers:
  //
  //   ┌──────────┬──────────────────┬─────────────────┬──────────────────┐
  //   │ Tier     │ Pointer velocity │ Multiplier      │ Feel             │
  //   ├──────────┼──────────────────┼─────────────────┼──────────────────┤
  //   │ Slowest  │ 0 – 1000 px/s    │ HEAVY    = 0.5  │ minute-by-minute │
  //   │ Fast     │ 1000 – 1600 px/s │ MEDIUM   = 1.5  │ brisk scrub      │
  //   │ Fastest  │ 1600+ px/s       │ FASTEST  = 4.0  │ flick-covers-day │
  //   └──────────┴──────────────────┴─────────────────┴──────────────────┘
  //
  // The slowest tier intentionally takes the lion's share of the velocity
  // range (~ 0 – 50 % of a typical fast flick) so the precise scrub feel
  // dominates and you have to *deliberately* accelerate to engage faster
  // modes. EMA smoothing on the velocity prevents flickering between tiers.
  const HEAVY     = 0.5;      // multiplier in the slowest tier (~2 px / minute)
  const MEDIUM    = 1.5;      // multiplier in the fast tier   (~0.67 px / minute)
  const FASTEST   = 4.0;      // multiplier in the fastest tier (~0.25 px / minute)
  const V_FAST    = 1.00;     // px / ms — at or above this, leave HEAVY for MEDIUM
  const V_FASTEST = 1.60;     // px / ms — at or above this, leave MEDIUM for FASTEST
  const SMOOTH    = 0.35;     // EMA weight for new velocity samples (0=none, 1=instant)

  let dragging    = false;
  let dragLastX   = 0;
  let dragLastT   = 0;
  let dragVel     = 0;        // smoothed |dx/dt| in px/ms
  let dragFracMin = 0;        // sub-minute remainder, kept across moves for precision

  function multiplierFor(v) {
    if (v < V_FAST)    return HEAVY;
    if (v < V_FASTEST) return MEDIUM;
    return FASTEST;
  }

  // Drag state is centralised in beginDrag/endDrag so every safety-net event
  // (pointerup, pointercancel, lostpointercapture, window blur, tab hidden)
  // funnels through the same reset path. This is what fixes the "cursor
  // stays as grabbing and slider keeps following the mouse after I let go"
  // class of bugs — under Chrome extension popups, pointerup can be eaten
  // when the popup loses focus mid-drag, so we never rely on it alone.
  let activePointerId = null;

  function beginDrag(e, startX) {
    dragging        = true;
    activePointerId = e.pointerId;
    dragLastX       = startX;
    dragLastT       = e.timeStamp;
    dragVel         = 0;
    dragFracMin     = 0;
    overlay.classList.add('dragging');
    try { overlay.setPointerCapture(e.pointerId); } catch (_) {}
  }

  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    overlay.classList.remove('dragging');
    const pid = (e && e.pointerId !== undefined) ? e.pointerId : activePointerId;
    if (pid !== null) {
      try { overlay.releasePointerCapture(pid); } catch (_) {}
    }
    activePointerId = null;
  }

  // pointerdown does two things:
  //  1. Jumps the slider to the clicked position (native-style click-to-jump).
  //  2. Anchors the velocity tracker so the very first move event has a
  //     sensible dt and dx.
  overlay.addEventListener('pointerdown', (e) => {
    // Ignore secondary buttons (middle/right click) and any second finger.
    if (e.button !== undefined && e.button !== 0) return;
    if (dragging) return;

    const rect   = overlay.getBoundingClientRect();
    const ratio  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const jumped = Math.round(ratio * 1440);
    slider.value = jumped;
    onSlider(jumped);

    beginDrag(e, e.clientX);
    slider.focus();
    e.preventDefault();
  });

  overlay.addEventListener('pointermove', (e) => {
    if (!dragging || e.pointerId !== activePointerId) return;
    e.preventDefault();

    const now = e.timeStamp;
    const dt  = Math.max(1, now - dragLastT);     // guard against div/0
    const dx  = e.clientX - dragLastX;
    dragLastX = e.clientX;
    dragLastT = now;

    // Smoothed velocity (px per ms). EMA so a brief pause mid-flick doesn't
    // immediately collapse the multiplier back to HEAVY.
    const instantV = Math.abs(dx) / dt;
    dragVel = dragVel * (1 - SMOOTH) + instantV * SMOOTH;

    // Accumulate sub-minute change, then apply whole minutes to the slider
    // and carry the remainder. This is what makes slow scrubbing genuinely
    // tick-by-tick — fractional pixels don't get rounded away each event.
    dragFracMin += dx * multiplierFor(dragVel);
    const whole = Math.trunc(dragFracMin);
    if (whole !== 0) {
      const cur  = parseInt(slider.value, 10);
      const next = Math.max(0, Math.min(1440, cur + whole));
      if (next !== cur) {
        slider.value = next;
        onSlider(next);
      }
      dragFracMin -= whole;
    }
  });

  // Six different events can imply "drag is over". We funnel all of them to
  // endDrag — overkill is the point: a stuck-drag bug is much worse than
  // running endDrag twice (it's a no-op once `dragging` is false).
  overlay.addEventListener('pointerup',          endDrag);
  overlay.addEventListener('pointercancel',      endDrag);
  overlay.addEventListener('lostpointercapture', endDrag);
  // Popup focus loss (clicking outside, opening DevTools, switching tabs)
  // can swallow pointerup before it reaches the overlay.
  window.addEventListener('blur',                endDrag);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) endDrag();
  });

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
