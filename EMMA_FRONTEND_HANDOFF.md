# Emma — Frontend Handoff

Toyesh applied a brand-polish + executive-summary pass on the frontend. This doc covers what changed, what was deliberately left for you, and the design constraints to respect if you take it further.

## What changed

| Sub-step | File(s) | Why |
|---|---|---|
| 4.1 Brand tokens | `frontend/app/globals.css` | Replaced the generic `--foreground/--background` pair with full brand palette (navy/cream/rose) + status colors. All components now reference these CSS variables, so a single edit re-themes the app. |
| 4.2 Inter font | `frontend/app/layout.tsx` | Swapped Geist for Inter via `next/font/google` to mirror consultenco.nl's geometric sans. Cream body bg, ink foreground baked in here. |
| 4.3 Shared Header | `frontend/components/Header.tsx` | Extracted the inline `<header>` blocks from all 3 pages. Adds a breadcrumb (Overview / Report / Advisory) and a connected pill when Exact Online auth is live. |
| 4.4 StatusBadge | `frontend/components/StatusBadge.tsx` | One source of truth for blocker/fail/warn/pass colors + labels. Used everywhere. |
| 4.5 ScoreGauge | `frontend/components/ScoreGauge.tsx` | SVG circular gauge with animated fill and a threshold tick at 60%. Color flips between navy (ready) and rose-deep (blocked). |
| 4.6 KpiTile | `frontend/components/KpiTile.tsx` | Single tile for the ratio grid. Optional caveat line for unreliable values. Staggered fade-in. |
| 4.7 CheckCard | `frontend/components/CheckCard.tsx` | Extracted from `report/page.tsx`. Loads source lines on demand via `lib/api`. Uses StatusBadge. |
| 4.8 Format helpers | `frontend/lib/format.ts` | `formatEur` (negatives in parens — accountant convention), `formatCompactEur` (€1.1M for executive tiles), `formatPct`, `formatDays`. Locale `nl-NL`. |
| 4.9 API wrapper | `frontend/lib/api.ts` | `fetchAuthStatus`, `runReadiness`, `fetchSources`. Replaces the inline `fetch` calls and dedupes `API_URL`. |
| 4.10 Executive summary | `frontend/app/page.tsx` | New two-mode page. First visit: pre-run controls (data source + dates + Run). Post-run: score gauge + ratios grid + top-3 issues + 2 CTAs + collapsible re-run drawer. The Re-Run drawer lets the demo re-run live without leaving the page. |
| 4.11 Report refresh | `frontend/app/report/page.tsx` | Now composition over 5 shared components. Score summary uses the new gauge. |
| 4.12 Advisory refresh | `frontend/app/advisory/page.tsx` | New brand colors for FACT/ASSUMPTION/ADVICE badges, brand-colored guided-diagnosis cards, kept the raw-text JSON fallback. |
| 4.13 Wordmark SVG | `frontend/public/consult-co-logo.svg` | Stylized "Consult&Co" wordmark with the rose ampersand. Placeholder — see "left for you" below. |
| 4.14 Animations | `frontend/app/globals.css` keyframes | `fade-in-up` and `gauge-fill`, both with `prefers-reduced-motion: reduce` honored. No framer-motion dependency added. |

## Brand tokens (for your reference)

```css
--color-brand-navy:       #0E1A3A   /* primary, headers, score gauge fill */
--color-brand-navy-soft:  #1A2A52   /* hover state for navy CTAs */
--color-brand-cream:      #FAF6EE   /* page background */
--color-brand-cream-deep: #F1EADC   /* subtle surface contrast */
--color-brand-rose:       #E8A8AE   /* accent, ampersand, blocker fill */
--color-brand-rose-deep:  #C97F86   /* blocker text, threshold tick, rose text */
--color-brand-ink:        #14181F   /* body text */
--color-brand-muted:      #6B7280   /* secondary text, labels */
--color-brand-line:       #E5DFD2   /* borders */

--color-status-blocker:   #C97F86   /* rose-deep */
--color-status-fail:      #B45309   /* warm amber */
--color-status-warn:      #B45309   /* same amber, distinguished by weight */
--color-status-pass:      #0E1A3A   /* navy */
```

## What was deliberately left for you

These were scoped out of the pre-demo polish window — pick them up when you have time:

1. **Real Consult&Co logo SVG** — the current `frontend/public/consult-co-logo.svg` is a stylized text recreation. There's also a `consult-co-logo.webp` in `public/` (a real raster logo that was previously misnamed `.svg`). Either grab the proper SVG from your designer or use the WebP — just update the `<img src>` in `components/Header.tsx`.
2. **Empty-state illustration** — first-visit pre-run state currently has no hero image. A small line illustration (matching consultenco.nl's site style) would help the page feel less utilitarian.
3. **Advisory typography pass** — the FACT/ASSUMPTION/ADVICE cards work but could use better hierarchy (larger statement, smaller meta). I tried to stay conservative.
4. **Guided-diagnosis markdown rendering** — `advisory/page.tsx` parses the LLM's JSON `{guidance: [...]}` shape, but the `fix_step` text is plain. If Claude returns markdown in those fields, render it (e.g., `react-markdown`) instead of treating as plain text.
5. **Dark-mode brand palette** — `globals.css` has a `prefers-color-scheme: dark` block but it's untouched. A real dark version needs the inverted brand (cream → navy bg, navy → cream text) and re-tuned status colors.
6. **Card hover micro-animations** — currently entrance fade only. A subtle lift / shadow on hover for check cards would feel more premium.
7. **Mobile polish** — header collapses to wordmark only on small screens, but the score-gauge + status panel could stack better. KPI tiles already responsive.
8. **Source-line table density** — works but the column widths aren't great with long Dutch descriptions. A truncation tooltip or expandable row would help.

## Design constraints to respect

If you decide to push further on the look, please keep these:

- **No emoji** anywhere in the UI. The tone is professional advisory, not consumer SaaS.
- **No gradient backgrounds.** Solid surfaces only. Consult&Co's marketing site is restrained.
- **No AI-generated illustrations.** If you need an illustration, hand-draw or hire — generic AI art will read as hackathon-y.
- **Restrained motion.** Anything over 800ms feels slow. Anything snappy (under 200ms) feels broken. The current 400ms tile / 700ms gauge values are deliberate.
- **`prefers-reduced-motion` always honored.** Don't add animations without a `motion-safe:` Tailwind prefix or a `@media (prefers-reduced-motion: reduce)` opt-out.
- **`nl-NL` locale for numbers.** `formatEur` already handles this. Don't switch to en-US.
- **Negative amounts in parens** (accountant convention), not minus-prefix. `formatEur` enforces this.
- **One source of truth for status colors.** Use `<StatusBadge>` or the `--color-status-*` variables. Don't reintroduce inline Tailwind classes for status colors.

## Files NOT changed (left as-is)

- `frontend/app/types.ts` — already matches backend Pydantic models exactly.
- `frontend/next.config.ts`, `frontend/tsconfig.json`, `frontend/eslint.config.mjs` — no edits.
- `frontend/postcss.config.mjs` — kept the Tailwind v4 setup.
- `backend_FastAPI_emma/schemas.py` — backend contract unchanged.

## Verification

```bash
cd frontend
npm install
npm run build           # should be 0 errors, 0 type errors
npm run dev             # open http://localhost:3000

# With backend running:
# 1. Hit / — see pre-run controls if no result in localStorage
# 2. Click Run — should navigate to /report on first run
# 3. Return to / — should now show executive summary with gauge + tiles + top issues
# 4. Click "Re-run with different period" — drawer opens inline, no navigation
# 5. Click "View advisory" — guided-diagnosis cards in brand colors
```
