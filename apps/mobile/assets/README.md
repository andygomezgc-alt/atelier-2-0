# Mobile Assets

Required PNG assets for Expo / EAS Submit. **These binaries are missing** and must be added before submitting to the stores.

| File | Size (px) | Purpose | Referenced in `app.json` |
| --- | --- | --- | --- |
| `icon.png` | 1024x1024 | App icon (iOS + fallback) | `expo.icon` |
| `splash.png` | 1284x2778 (or 2048x2048 contain) | Splash screen image | `expo.splash.image` |
| `adaptive-icon.png` | 1024x1024 (foreground, transparent bg, safe zone 66%) | Android adaptive icon foreground | `expo.android.adaptiveIcon.foregroundImage` |

## Notes

- All files must be **PNG** with no alpha for `icon.png` (Apple rejects icons with transparency).
- `adaptive-icon.png` should have transparent background; the Android system composites it over `adaptiveIcon.backgroundColor` (`#f9f7f2`).
- `splash.png` is rendered with `resizeMode: "contain"` over `splash.backgroundColor` (`#f9f7f2`).
- Brand color: `#f9f7f2` (cream).

## Blocking

Until these binaries are committed, the references in `app.json` will fail at build time. Either:

1. Add the three PNGs to this directory (paths already wired in `app.json`), or
2. Temporarily remove the `icon`, `splash.image`, and `android.adaptiveIcon.foregroundImage` keys from `app.json` to unblock local dev (but EAS Submit will still reject).
