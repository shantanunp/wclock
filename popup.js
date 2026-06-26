'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
let sliderMin = null;  // null = follow live wall clock; otherwise 0-1439 (minutes of day, IST)
let clockMode = 12;
let isDark    = true;
let timerId   = null;

const TZ = { ist: 330, utc: 0, ct: -300 }; // minutes offset from UTC
const offsetLabel = { ist: '+05:30', utc: '±00:00', ct: '−05:00' };

const STORAGE_KEYS = { theme: 'chrono.theme', mode: 'chrono.mode' };

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
// Returns { t: "HH:MM", a: "AM" | "PM" | "" } honouring the current 12/24 mode.
function fmt(totalMins) {
  let h = Math.floor(totalMins / 60) % 24;
  if (h < 0) h += 24;
  const m = String(totalMins % 60).padStart(2, '0');
  if (clockMode === 24) {
    return { t: String(h).padStart(2, '0') + ':' + m, a: '' };
  }
  return { t: String(h % 12 || 12).padStart(2, '0') + ':' + m, a: h >= 12 ? 'PM' : 'AM' };
}

// Header always shows live IST (independent of the time-shift slider).
function updateHeader(t) {
  const totalMin = t.h * 60 + t.m;
  const { t: timeStr, a: ampm } = fmt(totalMin);
  document.getElementById('headerTime').textContent = timeStr;
  document.getElementById('headerAmpm').textContent = ampm;
}

// TZ cards: time + inline AM/PM, with the UTC offset always shown on the sub line.
function updateZones(utcMins) {
  ['ist', 'utc', 'ct'].forEach((z) => {
    const mins = ((utcMins + TZ[z]) % 1440 + 1440) % 1440;
    const { t, a } = fmt(mins);
    document.getElementById('t-' + z).textContent = t;
    document.getElementById('ampm-' + z).textContent = a;
    document.getElementById('a-' + z).textContent = offsetLabel[z];
  });
}

// ── Slider ───────────────────────────────────────────────────────────────────
function onSlider(v) {
  sliderMin = parseInt(v, 10);
  setFill();
  applyMinute(sliderMin);
  document.getElementById('resetHint').classList.add('visible');
}

function setFill() {
  const s = document.getElementById('timeSlider');
  s.style.setProperty('--fill', (parseInt(s.value, 10) / 1440 * 100) + '%');
}

function applyMinute(totalMin) {
  const min = ((totalMin % 1440) + 1440) % 1440;
  const hh = Math.floor(min / 60);
  const mm = min % 60;
  document.getElementById('sliderVal').textContent =
    String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  // Treat slider value as IST time-of-day; convert to UTC minutes for the zones.
  const utc = ((min - TZ.ist) % 1440 + 1440) % 1440;
  updateZones(utc);
  updateScale(hh);
}

// ── Mode (12 / 24) ───────────────────────────────────────────────────────────
function setMode(m) {
  clockMode = m;
  document.getElementById('btn12').classList.toggle('on', m === 12);
  document.getElementById('btn24').classList.toggle('on', m === 24);

  // Re-render header and zones with the new mode.
  updateHeader(getLiveNow());
  let min;
  if (sliderMin !== null) {
    min = sliderMin;
  } else {
    const now = new Date();
    min = now.getHours() * 60 + now.getMinutes();
  }
  applyMinute(min);
  store.set({ [STORAGE_KEYS.mode]: m });
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
    const utc = ((totalMin - TZ.ist) % 1440 + 1440) % 1440;
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
  // Restore persisted prefs
  const saved = await store.get([STORAGE_KEYS.theme, STORAGE_KEYS.mode]);
  if (saved[STORAGE_KEYS.theme] === 'light') isDark = false;
  if (saved[STORAGE_KEYS.mode] === 24) clockMode = 24;

  buildNotches();
  buildScale();

  document.getElementById('themeBtn').addEventListener('click', toggleTheme);
  document.getElementById('btn12').addEventListener('click', () => setMode(12));
  document.getElementById('btn24').addEventListener('click', () => setMode(24));

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

  overlay.addEventListener('dblclick', () => {
    sliderMin = null;
    document.getElementById('resetHint').classList.remove('visible');
  });

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
