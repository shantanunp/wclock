"""Generate Chrono Display extension icons.

Renders an amber-tile analog clock at 16, 48, and 128 px PNG. The bright
amber background is chosen so the toolbar icon stays visible on BOTH light
and dark Chrome themes (the previous all-navy design vanished against the
dark toolbar). Dark navy face + amber hands reads at all sizes including
16 px.

Run with:
    python3 scripts/make_icons.py
"""
from __future__ import annotations

import math
import os
from PIL import Image, ImageDraw

# Palette — high-contrast amber tile + dark navy face.
TILE_BG    = (245, 192, 67, 255)    # #f5c043 — saturated amber, pops on dark AND light toolbars
TILE_EDGE  = (160, 110, 0, 255)     # darker amber outline for definition on light backgrounds
FACE_OUTER = (11, 13, 18, 255)      # #0b0d12 — deep navy face for max contrast against the tile
FACE_INNER = (24, 28, 40, 255)      # #181c28
RING       = (245, 192, 67, 255)    # amber ring around face (echoes the tile)
TICK_Q     = (245, 192, 67, 255)    # amber quarter-hour ticks
TICK_M     = (90, 100, 130, 255)    # muted gray minor ticks (subtle)
HAND_H     = (245, 192, 67, 255)    # amber hour hand
HAND_M     = (220, 226, 240, 255)   # near-white minute hand
CAP        = (245, 192, 67, 255)
CAP_I      = (11, 13, 18, 255)


def make_icon(size: int) -> Image.Image:
    """Render the icon at 4x resolution and downsample for crisp anti-aliasing.

    Size-aware design:
      • 16 px (toolbar): the amber tile must dominate, otherwise the dark
        clock face blends into Chrome's dark toolbar. We use a tiny face
        and only the hour hand, with NO inner navy fill — just the dark
        markings sit on the amber. This reads as "yellow clock badge"
        from across the screen.
      • 48 / 128 px (extensions page, Web Store): full design with both
        hands, hour ticks, and the recessed dark face.
    """
    scale = 4
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img, "RGBA")

    cx = cy = s / 2
    tiny = size < 32

    # Rounded square amber tile — fills nearly the whole frame so it dominates
    # the toolbar slot. Thin outline gives definition on light themes.
    pad = s * 0.04
    radius = s * 0.22
    d.rounded_rectangle(
        [pad, pad, s - pad, s - pad],
        radius=radius,
        fill=TILE_BG,
        outline=TILE_EDGE,
        width=max(2, int(s * 0.010)),
    )

    # Face: small at 16 px so the amber stays dominant. At 16 px we draw an
    # outline-only face (no dark fill) — the dark stroke on amber reads
    # cleanly without swallowing the tile.
    r = s * (0.30 if tiny else 0.38)
    if tiny:
        d.ellipse(
            [cx - r, cy - r, cx + r, cy + r],
            outline=FACE_OUTER,
            width=max(3, int(s * 0.030)),
        )
    else:
        d.ellipse(
            [cx - r, cy - r, cx + r, cy + r],
            fill=FACE_OUTER,
            outline=RING,
            width=max(2, int(s * 0.018)),
        )
        inner_r = r * 0.92
        d.ellipse(
            [cx - inner_r, cy - inner_r, cx + inner_r, cy + inner_r], fill=FACE_INNER
        )

    # Hour ticks. Skip everything at tiny sizes; show full set at 48/128.
    if not tiny:
        for i in range(12):
            is_q = i % 3 == 0
            a = (i / 12) * math.tau - math.pi / 2
            r1 = r * 0.88
            r2 = r * (0.66 if is_q else 0.80)
            x1 = cx + math.cos(a) * r1
            y1 = cy + math.sin(a) * r1
            x2 = cx + math.cos(a) * r2
            y2 = cy + math.sin(a) * r2
            d.line(
                [x1, y1, x2, y2],
                fill=TICK_Q if is_q else TICK_M,
                width=max(2, int(s * (0.028 if is_q else 0.012))),
            )

    # Hands at the classic 10:10 watch-advertising pose.
    hour_a   = (10 / 12 + 10 / 720) * math.tau - math.pi / 2
    minute_a = (10 / 60) * math.tau - math.pi / 2

    def hand(angle: float, length_frac: float, width_frac: float, color):
        length = r * length_frac
        x2 = cx + math.cos(angle) * length
        y2 = cy + math.sin(angle) * length
        x1 = cx - math.cos(angle) * length * 0.12
        y1 = cy - math.sin(angle) * length * 0.12
        d.line([x1, y1, x2, y2], fill=color, width=max(3, int(s * width_frac)))

    if tiny:
        # Single bold dark hand on amber — high contrast, reads at 16 px.
        hand(hour_a, 0.78, 0.075, FACE_OUTER)
    else:
        hand(hour_a,   0.52, 0.060, HAND_H)
        hand(minute_a, 0.78, 0.035, HAND_M)

    # Center cap
    cap_r = max(3, s * (0.045 if tiny else 0.055))
    d.ellipse(
        [cx - cap_r, cy - cap_r, cx + cap_r, cy + cap_r],
        fill=FACE_OUTER if tiny else CAP,
    )
    if not tiny:
        inner_cap_r = cap_r * 0.4
        d.ellipse(
            [cx - inner_cap_r, cy - inner_cap_r, cx + inner_cap_r, cy + inner_cap_r],
            fill=CAP_I,
        )

    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    out_dir = os.path.join(os.path.dirname(__file__), "..", "icons")
    os.makedirs(out_dir, exist_ok=True)
    for size in (16, 48, 128):
        path = os.path.join(out_dir, f"icon{size}.png")
        make_icon(size).save(path, "PNG", optimize=True)
        print(f"wrote {path}")


if __name__ == "__main__":
    main()
