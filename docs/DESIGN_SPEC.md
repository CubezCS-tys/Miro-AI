# Miro-AI UI Design Spec: "Notebook"

This document defines the visual design language for the `zain-ui` redesign. It is the
source of truth for tokens, components, and rules. The redesign is visual polish only:
no server or API behavior changes, every feature and test is preserved.

## 1. Principles

1. **Strict monochrome.** The interface is black, white, and grey. No blue, violet, cyan,
   green, or red lives in the chrome, nodes, borders, text, or selection.
2. **Colour belongs to the user's content, never the UI.** The only colour on screen is:
   - sticky-note and shape fills the user explicitly chooses, and
   - the amber citation highlight (`<mark>`) drawn over a verified source quote.
   That is the whole palette of colour. Everything else is greyscale.
3. **Squared corners.** Border-radius is 0 (round only for dots and colour swatches).
4. **Solid borders, hard shadows.** Cards carry a 1.5px solid border and a hard offset
   drop-shadow (`4-5px 4-5px 0`). This is the "notebook sticker" signature. No blur,
   no glow, no gradient.
5. **Hand-drawn icons.** Every glyph is from a hand-drawn pack (see section 5). The icons
   are the one source of warmth and personality; the chrome stays quiet so they read.
6. **Type does the work.** Geist for UI, Geist Mono for labels, metadata, chips, and kind
   tags. High contrast, generous hit targets, no decoration.
7. **The canvas is the product.** Chrome floats at the edges; the board is the first and
   dominant screen.

## 2. Themes and tokens

Two themes share one set of variable names. `:root` is light; `:root[data-theme="dark"]`
overrides. Theme is chosen by a no-flash inline script (localStorage, then system
preference, then dark) and toggled from the top bar.

### Light

| token | value | role |
|---|---|---|
| `--bg` | `#fbfbf9` | canvas |
| `--surface` | `#ffffff` | card / panel face |
| `--surface-2` | `#f1f0ec` | inset / hover fill |
| `--fg` | `#111110` | primary text, borders, ink |
| `--muted` | `#3a3a37` | secondary text |
| `--faint` | `#9a9a93` | tertiary text, placeholders |
| `--line` | `#111110` | solid border |
| `--line-strong` | `#111110` | dividers, rings |
| `--dot` | `rgba(17,17,16,0.13)` | canvas grid dots |
| `--shadow-color` | `#111110` | hard offset shadow |
| `--accent` | `var(--fg)` | primary buttons, selection (ink, not colour) |
| `--accent-fg` | `var(--bg)` | text on an ink button |
| `--highlight` | `#f6cf4d` | citation `<mark>` only |

### Dark

| token | value | role |
|---|---|---|
| `--bg` | `#0e0e10` | canvas |
| `--surface` | `#17171a` | card / panel face |
| `--surface-2` | `#202024` | inset / hover fill |
| `--fg` | `#f3f3f1` | primary text, borders, ink |
| `--muted` | `#b1b1ac` | secondary text |
| `--faint` | `#6f6f69` | tertiary text, placeholders |
| `--line` | `rgba(243,243,241,0.6)` | solid border |
| `--line-strong` | `rgba(243,243,241,0.6)` | dividers, rings |
| `--dot` | `rgba(255,255,255,0.10)` | canvas grid dots |
| `--shadow-color` | `#000000` | hard offset shadow |
| `--accent` | `var(--fg)` | primary buttons, selection |
| `--accent-fg` | `var(--bg)` | text on an ink button |
| `--highlight` | `#f6cf4d` | citation `<mark>` only |

The semantic names left over from the first pass (`--citation`, `--success`, `--warning`,
`--contradiction`) all resolve to `--fg` so any leftover usage renders monochrome.

### Shape

- `--shadow-node: 4px 4px 0 0 var(--shadow-color)`
- `--shadow-panel: 5px 5px 0 0 var(--shadow-color)`
- Radius scale (`--radius-sm..3xl`) overridden to `0`; `--radius-full` stays round.

## 3. Surfaces

- `.glass` (legacy name, kept to limit churn): `background: var(--surface)`, `1.5px solid
  var(--line)`, no blur, no shadow. Used by bars (top bar, tool rail, selection toolbar)
  and as the base for panels.
- `.node-surface`: `var(--surface)` + `1.5px solid var(--line)` + `--shadow-node`.
- Floating panels (command palette, research frontier, document library, tutor, node
  detail, AI prompt) add `--shadow-panel`.
- Stickies and shapes keep their user colour fill and also take the hard shadow.

## 4. Typography

- **Geist Sans**: UI text, node labels, headings. Tight tracking on large headings
  (`-0.02em` to `-0.025em`).
- **Geist Mono**: wordmark, status line, kind tags (`PROCESS`), page chips (`p3`), source
  location (`p3, chars 120-153`), the `VERIFIED` tag. Uppercase with `0.14-0.16em` tracking
  for tags.

## 5. Iconography

- **Pack:** Khushmeen Doodle Icons (hand-drawn, 400+). Free for personal and commercial
  use, **no attribution required**. Vendored from `github.com/svatsa159/react-doodle-icons`.
- **Why this pack:** it is the one hand-drawn UI set with a no-attribution commercial
  licence. Flaticon and Noun Project free tiers require visible attribution; Streamline
  Freehand is paid.
- **Files:** `frontend/public/doodle/*.svg`, recoloured to `currentColor` with a CSS `mask`
  so a single SVG themes for light and dark. Note: CSS `mask` only loads over http(s), which
  is how Next serves `/public`. It does not load over `file://`.
- **Component:** `components/icons.tsx` exports a `DoodleIcon` plus named wrappers
  (`FileUpIcon`, `TextIcon`, `ConceptIcon`, ...) that keep the previous call sites unchanged.
- **Mapping (UI name -> doodle file):** upload->file-pdf, text->pencil, concept->bulb,
  sticky->note, rect->rectangle, ellipse->shape, diamond->diamond, code->file-code,
  new->doc-add, docs->folder, lens->filter, sun->sun, moon->night, command->search,
  generate->magic-wand, close->cross, trash->delete, copy->copy, check->tick,
  zoom-in/out->zoom, fit->maximize, prev/next->chevrons.
- Licence text is recorded in `frontend/public/doodle/LICENSE.txt`.

## 6. Components

- **Top bar:** docked, full-width-ish, `.glass`. Mono wordmark, board switcher, new-board
  and documents icon buttons, lens select, status line (`24 DOCS . GEMINI . DETAIL`), theme
  toggle, command-palette button. Icon buttons invert (ink fill, bg glyph) on hover.
- **Tool rail:** left, vertical, `.glass`. Doodle icons for add-document (active state =
  ink fill), text, concept, sticky, rect, ellipse, diamond, code. Hairline dividers.
- **Nodes:** `.node-surface`. Concept node = mono kind dot + mono kind tag + page chip +
  bold label. Selected = ink ring. Document, code, table, chart, note follow the same card.
- **Stickies / shapes:** user colour fill, 1.5px border, hard shadow, ink text.
- **AI prompt:** bottom-centre panel, `--shadow-panel`. Magic-wand glyph, ink `Generate`
  button. Responsive width.
- **Side panels** (detail, frontier, library, tutor) and **command palette:** `.glass` +
  `--shadow-panel`, squared, mono. Verified tag is a filled ink chip; needs-review is an
  outlined chip.
- **Edges:** monochrome. Differentiate by line style, not colour: supports = solid, default
  = thin grey, contradicts = thick dashed.
- **Arena / present routes:** same tokens; arena grid stacks to one column on mobile.

## 7. Responsive

- Tool rail and panels never overlap the top bar (offsets below it).
- Minimap and zoom controls hide under 640px (pinch-zoom on touch).
- Prompt bar, detail panel, frontier, library, tutor clamp to `calc(100vw - margin)`.
- Selection toolbar sits below the prompt on mobile, top-centre on desktop.

## 8. Accessibility

- Contrast is high by construction (near-black on near-white, and the inverse).
- Every icon-only control has a `title` and `aria-label`.
- Focus styles use the ink ring; hit targets are >= 28px.

## 9. Out of scope / preserved

- No change to `lib/api.ts`, the backend, data flow, or any feature.
- Smoke-test text and roles are preserved verbatim (`p3`, `p3, chars 120-153`, `verified`,
  `Open`, `Page 3 excerpt`, the `<mark>` highlight, `Research frontier`, `Accept nodes`,
  `Expand frontier`, `Graph Tutor Arena`, the answer placeholder, `Submit answer`,
  `Review pack ready`, `Miro-AI presentation`).
- The first-pass "liquid glass + blue accent" idea was dropped on direction from the owner.
