→ https://strava-x.com ←

### Local design tuning

Run `npm run dev` and open a map. DialKit appears in the bottom-right corner with controls for panel radius, sidebar header padding, panel surfaces, and typography. Collapse the panel by clicking its title. Typography ranges stay within the activity list's fixed row height.

Adjustments and versions persist in this browser under `dialkit:strava-x-design-v1`. **Reset to app defaults** restores the baseline. **Copy parameters** copies values you can paste into a development task to apply permanently; tuning does not modify source files automatically. The panel follows the app's light/dark theme.

Set `NEXT_PUBLIC_DESIGN_TUNING=false` in `.env.local` and restart the dev server to disable it. Production builds exclude the editor and do not load saved tuning values. The existing map-style controls remain separate; this first panel tunes the interface only.
