# Chrono Display

A live multi-timezone clock widget Chrome extension. Built from the `clock-widget-v4` mockup.

![icon](icons/icon128.png)

## Features

- **Live analog clock** with smooth, glowing hands (always tracks wall-clock time).
- **Three timezone cards** — IST, UTC, CT — with an active highlight on IST.
- **12h ↔ 24h conversion scale** showing the current hour mapped across both formats.
- **Time-shift slider** to preview what time it is in each zone at any hour 00–23; double-click the slider to resync to live.
- **Light / dark theme toggle**, remembered across popup opens via `chrome.storage.local`.
- **12H / 24H mode toggle**, also persisted.

## Install (developer mode)

1. Open `chrome://extensions` (works in any Chromium browser: Chrome, Edge, Brave, Arc, …).
2. Toggle **Developer mode** in the top-right.
3. Click **Load unpacked** and select this folder (`wclock/`).
4. Pin the Chrono Display action in the toolbar and click it to open the widget.

## File layout

```
wclock/
├── manifest.json          MV3 manifest
├── popup.html             Popup markup (no inline JS — MV3 CSP compliant)
├── popup.css              Extracted styles (dark + light themes)
├── popup.js               Clock loop, slider, mode/theme, chrome.storage
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── scripts/
    └── make_icons.py      Regenerates the icon set with Pillow
```

## Regenerating icons

```bash
python3 scripts/make_icons.py
```

Requires Pillow (`pip install Pillow`).

## Notes on MV3 compliance

The original mockup used inline `<script>` and `onclick="…"` handlers, both of
which violate Manifest V3's default extension CSP. The popup was refactored to:

- Move all JS into `popup.js` (loaded via `<script src>`).
- Replace inline event handlers with `addEventListener` calls.
- Persist user prefs via `chrome.storage.local` (with a graceful `localStorage`
  fallback so `popup.html` still works when opened as a plain file for testing).
- Pause the `requestAnimationFrame` loop while the popup is hidden.

The `permissions` field only requests `"storage"`; no host permissions are
needed since all timezone math is done locally.

## Customising timezones

Open the popup, click `⚙ EDIT` next to the timezone cards, and use the editor
to add, remove, reorder, or swap zones (up to four). The first card is the
*anchor* (★) — the time slider tracks the time-of-day in that zone, and every
other card is computed from it.

The available cities live in the `PRESETS` array at the top of `popup.js`. Each
entry uses an [IANA Time Zone Database](https://www.iana.org/time-zones)
identifier, so daylight saving transitions are handled automatically and
offline via `Intl.DateTimeFormat` (the browser ships the tzdata as part of
ICU — no network calls, no manual offset math):

```js
const PRESETS = [
  { id: 'ist', name: 'IST',                  label: 'Mumbai',   tz: 'Asia/Kolkata'     },
  { id: 'utc', name: 'UTC',                  label: 'Universal', tz: 'UTC'             },
  { id: 'est', name: 'EST', nameDST: 'EDT',  label: 'New York', tz: 'America/New_York' },
  // …
];
```

`name` is the standard-time abbreviation; `nameDST` (optional) is shown
whenever the zone is currently observing DST — so a New York card switches
from `EST −05:00` to `EDT −04:00` automatically across the spring/fall
transitions, and a Sydney card behaves correctly in the southern hemisphere
(AEDT in Dec–Apr, AEST in May–Oct).

To add a new city, append an entry with a fresh `id` and a valid IANA `tz`.
The editor dropdown picks it up automatically.
