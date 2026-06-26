"""Chrono Display — pywebview desktop wrapper.

Loads the existing popup.html/css/js unchanged and bridges the
chrome.storage.local calls to a local JSON prefs file.

Run:
    python desktop/main.py

Requirements:
    pip install pywebview

Tested on:
    Linux  — WebKit2GTK 4.1  (webkit2gtk4.1 + python3-gobject)
    Windows — WebView2 Runtime (pre-installed on Win 11 / Win 10 via update)
"""

from __future__ import annotations

import json
import pathlib
import threading
import webview

# ── Paths ────────────────────────────────────────────────────────────────────
# main.py lives in  <repo>/desktop/  so the popup files are one level up.
HERE       = pathlib.Path(__file__).parent
REPO_ROOT  = HERE.parent
POPUP_HTML = REPO_ROOT / 'popup.html'
PREFS_FILE = HERE / 'chrono_display.json'   # lives alongside main.py

# ── Storage bridge ───────────────────────────────────────────────────────────
# pywebview exposes an instance of this class to the JS side as
# window.pywebview.api.  The existing store object in popup.js calls
# pywebview.api.get(keys) / pywebview.api.set(obj) when the global is present.
#
# All methods must be thread-safe: pywebview calls them from a background
# thread. Using a threading.Lock around file I/O is the simplest approach.

_lock = threading.Lock()


class Bridge:
    """Key-value persistence backed by a JSON file in the user's home dir."""

    def _read(self) -> dict:
        try:
            return json.loads(PREFS_FILE.read_text(encoding='utf-8'))
        except (FileNotFoundError, json.JSONDecodeError):
            return {}

    def _write(self, data: dict) -> None:
        PREFS_FILE.write_text(
            json.dumps(data, indent=2, ensure_ascii=False),
            encoding='utf-8',
        )

    def get(self, keys: list[str]) -> dict:
        """Return a {key: value} dict for the requested keys that exist."""
        with _lock:
            data = self._read()
        return {k: data[k] for k in keys if k in data}

    def set(self, obj: dict) -> None:
        """Merge obj into the prefs file."""
        with _lock:
            data = self._read()
            data.update(obj)
            self._write(data)


# ── Window ───────────────────────────────────────────────────────────────────

def main() -> None:
    if not POPUP_HTML.exists():
        raise FileNotFoundError(
            f'popup.html not found at {POPUP_HTML}.\n'
            'Run this script from inside the wclock repo:\n'
            '    python desktop/main.py'
        )

    webview.create_window(
        title     = 'Chrono Display',
        url       = POPUP_HTML.as_uri(),   # file:///…/popup.html
        js_api    = Bridge(),
        width     = 840,                   # a little wider than the 800 px CSS layout
        height    = 680,                   # content is ~640 px + title bar + breathing room
        resizable = False,
        min_size  = (840, 680),
        background_color = '#12151e',      # matches dark-mode body — prevents white flash on load
    )

    # http_server=True makes pywebview spin up a localhost HTTP server and
    # serve the extension files from the repo root, so the page loads at
    # http://localhost:XXXX/popup.html instead of file:///…/popup.html.
    # This is required because:
    #   • localStorage throws SecurityError on null/opaque (file://) origins.
    #   • The Intl / canvas APIs work identically over localhost.
    # debug=True opens the WebKit inspector; flip to True while developing.
    webview.start(debug=False, http_server=True)


if __name__ == '__main__':
    main()
