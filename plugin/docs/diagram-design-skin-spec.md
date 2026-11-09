# Editorial diagram skin for Mermaid — implementation spec

Target: `workspace-file-preview/` Markdown preview, fenced `mermaid` blocks rendered by mermaid 12.2.0
with `theme: 'base'` + `themeVariables` (see `src/client-entry.js` `MERMAID_THEMES`, `MermaidView`).
Source of the design language: `github.com/cathrynlavery/diagram-design` @ `6a7f19fcc132b39b126bea90167679b46b14bcc4`
(MIT, © 2025 Cathryn Lavery). See `../ATTRIBUTION.md`.

Every number below is one of: **(M)** measured in a shipped file of the upstream repo, **(C)** computed by
`scripts/verify-contrast.py` (run against the upstream style guide) or by the same WCAG 2.x formula for rows that
script does not classify, **(V)** verified by rendering mermaid 12.2.0 locally and inspecting the emitted CSS/DOM,
or **(I)** inferred/derived here and marked as such. Nothing is quoted from memory.

Notation: `ink@0.12` = role `ink` at 12% alpha. `→` = "maps to".

---

## 0. Scope

In scope: design tokens, typography roles, geometry and chrome, per-grammar semantic treatments, the mermaid
`themeVariables`/`themeCSS` mapping, the post-render patch list, QA assertions.

Out of scope by instruction: upstream fonts, the upstream icon set, upstream HTML templates, upstream scripts,
upstream assets (5.7 MB of examples/screenshots). Upstream is an agent skill that hand-authors SVG; it never renders
Mermaid, so no upstream coordinate system, router, or layout algorithm is reused. What is ported is the *look* and the
*quality gates*, expressed in mermaid's vocabulary.

---

## 1. Design intent

The skin must read as **editorial paper, not application chrome**. Four decisions carry that, and nothing else does:
(1) a warm-neutral ground and a near-black ink ramp instead of the default lavender/blue fills, so the figure looks
printed rather than themed; (2) exactly **one** chromatic voice (burnt tangerine) used as a focal mark on at most two
elements, with every other distinction carried by shape, stroke weight and a three-step ink ramp — this is what stops
the diagram reading as a colour-coded dashboard; (3) a strict **three-voice type hierarchy** (serif title, grotesque
sans for names, monospace only for technical values) at deliberately small sizes with generous space, which is the
signature editorial move: the label is quieter than the box, and the box is quieter than the page; (4) **flat** geometry
— hairline borders, 6/8 px radii, no shadows, no gradients, no 3-D barrels, an 8×6 px arrowhead — so the drawing looks
drafted rather than rendered by a default chart library. Concretely, the visible delta from mermaid's default base
theme is: node fill `#fff4dd` (cream) → `#ffffff` on `#f5f5f5` paper, node border `hsl(40.6,60%,83%)` → `#2d3142`,
cluster fill `hsl(220.6,100%,98.3%)` (lavender) → `#ececec`, edge label background `hsl(280,100%,93%)` (lilac) →
`#f5f5f5`, text `"trebuchet ms",verdana,arial` 16 px → a system grotesque stack at 12 px, a 8×8 filled arrowhead →
8×6, and the removal of the `look: 'neo'` drop shadow and gradient strokes that mermaid 12 applies by default **(V)**.

---

## 2. Tokens

All ratios **(C)**: `scripts/verify-contrast.py` for the 20 rows it classifies; the same formula (WCAG 2.x relative
luminance, translucent values composited over `paper` first) for `paper-2`, `rule`, `rule-solid`, `accent-tint` and
`series-*`, which it classifies as decorative and does not measure.

### 2.1 Core roles

| Role | Light | Dark | Ratio vs its background (light / dark) | Use |
|---|---|---|---|---|
| `paper` | `#f5f5f5` | `#2d3142` | — (background anchor) | Page ground, opaque label masks, edge-label background |
| `paper-2` | `#ececec` | `#393e53` | 1.08 / 1.22 vs `paper` (surface step, decorative) | Cluster/zone fill alternative, card surfaces, note fill |
| `ink` | `#2d3142` | `#f5f5f5` | **11.82 / 11.82** | Node names, node borders, primary strokes, default text |
| `ink-strong` | `#111111` | `#111111` | **17.32** vs light paper; **4.64** on the 0.85 `accent` fill it actually labels / **6.12** dark | Labels printed on a dense accent fill only |
| `muted` | `#4f5d75` | `#bfc0c0` | **6.11 / 7.07** | Sublabels, default arrows, lifelines, secondary text |
| `soft` | `#5a6580` | `#949eb2` | **5.34 / 4.78** | Zone/eyebrow labels, boundary labels, arrow labels |
| `rule` | `rgba(45,49,66,0.12)` → composite `#dddde0` | `rgba(245,245,245,0.12)` → `#45495a` | 1.24 / 1.43 (hairline, decorative) | Hairline borders, legends, dividers |
| `rule-solid` | `#bfc0c0` | `rgba(191,192,192,0.25)` → `#525562` | 1.67 / 1.73 (decorative) | Stronger borders, baselines, inactive marks |
| `accent` | `#bf4520` | `#f08a59` | **4.71 / 5.21** | The single focal mark: focal node stroke/tint, headline edge, one marker |
| `accent-tint` | `rgba(191,69,32,0.08)` → `#f1e7e4` | `rgba(240,138,89,0.10)` → `#403a44` | 1.12 / 1.17 (fill, decorative) | Fill under `accent` strokes only |
| `link` | `#2e5aa8` | `#739fdf` | **6.13 / 4.76** | HTTP/API/external edges only — a semantic register, never decoration |

### 2.2 Series palette (opt-in, multi-series charts only)

| Role | Light | Dark | Stroke ratio vs `paper` (light / dark) | Fill (opacity) | Ink-on-fill ratio (light / dark) |
|---|---|---|---|---|---|
| `series-1` sage | `#7c8f6f` | `#9caf8f` | 3.20 / 5.49 | 0.18 / 0.22 | 9.90 / 7.91 |
| `series-2` dusty blue | `#5e7a9b` | `#82a0c0` | 4.07 / 4.75 | 0.18 / 0.22 | 9.60 / 8.23 |
| `series-3` mustard | `#b8915a` | `#d3ad7a` | **2.66** / 6.15 | 0.18 / 0.22 | 10.12 / 7.68 |
| `series-4` rust brown | `#9c6b50` | `#b88670` | 4.16 / 4.10 | 0.18 / 0.22 | 9.55 / 8.64 |
| `series-5` slate | `#6e6479` | `#8d8298` | 5.12 / 3.55 | 0.18 / 0.22 | 9.36 / 8.91 |

Two computed findings to respect, not to fix by hope:
- `series-3` **light** as a *stroke* is 2.66:1, under the repo's own 3:1 bar for essential non-text marks. Use it only as
  a **fill** (1.17:1, decorative) or pair it with a labelled series name so colour is never the only carrier. In dark it
  is fine (6.15:1).
- `accent` as **text on an `accent-tint` surface** is **4.23:1 light / 4.45:1 dark** — both under 4.5. Therefore: on a
  focal node the *label* is `ink` (10.60 / 10.09 on the tint) and `accent` is spent on the **stroke and the tag**, or on
  text that sits on `paper`. Never set a paragraph in `accent` on a tint.

### 2.3 Inversion rule

Any `rgba(45,49,66, X)` in light becomes `rgba(245,245,245, X)` in dark: same alpha, RGB flipped **(M)**. `accent`
is the only role that shifts hue as well as value — `#bf4520` (hue 14°, L 44%) → `#f08a59` (hue 19°, L 65%) **(C)**. The
two accents stay in one hue family (14–19°); `link` sits at 216–218°, which is why it reads as a separate register and
must stay rare.

### 2.4 Contrast contract (the rule the token table is judged by)

| Use | Minimum vs its actual background |
|---|---|
| Regular text, including `soft`, `link`, `accent` used as text | 4.5:1 |
| Large text (24 px+, or 18.7 px+ at weight 600+) | 3:1 |
| Essential non-text marks: lines, arrows, borders, focus rings, data points | 3:1 against the adjacent colour |
| Decorative rules and translucent tints | no minimum, but never the only carrier of meaning |

Known deviations in the shipped skin, computed here, to be inherited knowingly rather than "fixed" silently:
- Lifeline strokes at `ink@0.22` measure **1.50:1 light / 1.94:1 dark** — below the 3:1 non-text bar. Acceptable *only*
  because each lifeline is anchored to a labelled actor box; never let a lifeline be the sole carrier.
- `ink@0.30` strokes (external/cloud treatment) measure **1.77:1 light / 2.46:1 dark** — same argument: the box border is
  redundant with the label.
- `soft` on a 4%-ink frame measures 5.16:1 light / **4.26:1 dark** — so in dark mode use `muted` (6.67:1 on that surface)
  for zone labels, and keep `soft` for labels that sit on `paper` (4.78:1).

---

## 3. The 1-accent rule, as an algorithm

`accent` is an editorial mark, not a status colour. Implement exactly this:

```
input: diagram source (mermaid text), rendered SVG
1. chosen = []                                    # ordered list, max length 2
2. if the source declares no preference:
     candidates = nodes with degree >= 2, excluding root/start/end shapes
     chosen = first 1 candidate  (ties: the node declared first in source)
     if the diagram has a single obvious terminal (an end node with no outgoing edge),
        and it carries the "happy path" meaning, it may be appended as chosen[1]
3. NEVER chosen: start/end terminators, cluster/zone frames, more than one node in
   the same rank-pair, a node whose removal the reader would not notice.
4. apply to chosen node:
     shape fill   := accent-tint        (light rgba(191,69,32,0.08), dark rgba(240,138,89,0.10))
     shape stroke := accent, width 1.4  # the only 1.4 stroke in the diagram
     label colour := ink                # NOT accent: accent-on-tint is 4.23:1, ink is 10.60:1
     the small mono tag inside the box, if any, := accent
5. apply to the edges that touch chosen:
     stroke := accent, width 1.4; marker fill := accent
     (light marker #bf4520, dark #f08a59) — replacing muted 1.2 / muted marker
6. everything else: fill ∈ {white, paper-2, ink@0.05, muted@0.10}, stroke ∈ {ink, muted, soft},
   width ∈ {0.8, 1.0, 1.2}, marker muted.
7. assert: count(node.fill == accent-tint) <= 2
           count(stroke hex with hue in [10,25] deg and chroma > 0.2) <= 2 nodes + their incident edges
```

What must **not** happen:
- a second chromatic family anywhere (a rainbow, a purple/cyan pair, a "warning" red that is not `accent`),
- `accent` used as a *class* of node ("all errors are coral") — it would become a status legend,
- `accent` on a cluster/zone frame or on a legend swatch plus two nodes,
- `accent` fill with `accent` text on top (contrast 4.23:1),
- more than two accent-tinted fills even in a 24-node `faithful` diagram: node count never buys accent count **(M)**,
- coral on both branches of an `alt` fragment **(M)**.

---

## 4. Typography

### 4.1 Roles

Sizes are the upstream "standard" ramp for a 960–1000 px viewBox **(M)**; mermaid renders at 1:1 CSS px, and the
preview only ever scales *down* (`fitScale = min(1, …)` in `client-entry.js`), so these are also the on-screen maxima.

| Role | Family stack (see 4.2) | Size | Weight | Letter-spacing | Case | Colour |
|---|---|---|---|---|---|---|
| Title (page H1; mermaid has no title unless `---\ntitle:`) | serif | 28 px (doc-inline) / 32 px print | 400 | −0.02em | sentence | `ink` |
| Node label | sans | **12 px** (14 px for state/entity headings) | 600 | 0 | sentence, verbatim | `ink` |
| Sublabel (port, version, field type) | mono | **9 px** | 400 | 0 | verbatim, never upper-cased | `muted` |
| Eyebrow / zone label | mono | **7–8 px** | 500 | **0.14em** | UPPERCASE | `soft` |
| Type tag inside a box ("API", "STATE", "ENTITY") | mono | **7–8 px** | 500 | **0.08em** | UPPERCASE | stroke role @0.8, or `accent` on a focal node |
| Edge / arrow label | mono | **8 px** | 400 | **0.06em** | UPPERCASE | `soft` (or `accent`/`link` when the edge is) |
| Sequence message | mono | **8 px** | 400 | 0.08em | UPPERCASE | `muted`; `link` for request, `accent` for the one headline return |
| ER attribute row | mono | **10 px** | 400 | 0 | verbatim | `ink` (name/keys) / `muted` (type) |
| ER / UML entity name | sans | **14 px** | 600 | 0 | sentence | `ink` |
| Callout / aside *(unused in mermaid)* | serif italic | 14 px | 400 | 0 | sentence | `muted` |

Measured anchors for those sizes: node name `font-size="12" font-weight="600"` in `assets/example-architecture.html`;
sublabel `9`; eyebrow `7` with `letter-spacing="0.08em"` (box tag) and `0.14em` (zone label); arrow label `8` with
`0.08em`; state/entity heading `14` in `example-state.html` / `example-er.html`; ER attribute rows `10`; legend
eyebrow `8` with `0.18em` **(M)**.

### 4.2 Stacks (system-only; upstream fonts are NOT redistributed)

Upstream ships a Google Fonts link for Instrument Serif / Geist / Geist Mono **(M)**. We bundle none of them. Preserve the
*role contrast* — three voices, serif ≠ sans ≠ mono — with system faces. Substitution is **(I)**.

| Voice | Stack |
|---|---|
| serif (title, asides) | `ui-serif, "Iowan Old Style", "Palatino Linotype", Palatino, Hoefler Text, Georgia, "Times New Roman", serif` |
| sans (names, everything human-readable) | `ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif` |
| mono (technical values only) | `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace` |

`ui-serif` first because on macOS/Linux it resolves to a real text serif and on Windows falls to Georgia; the named
faces follow for the platforms where the generic keyword is weak.

### 4.3 CJK appendix (this workspace's diagrams are frequently Chinese)

CJK must never go through the mono voice and never through the uppercase/tracked registers. The upstream rule is
explicit and is the model: a CJK label in an eyebrow/arrow-label slot "becomes 12 px sans at weight 500 with no tracking
and no uppercase transform, and its mask rect grows to match" **(M)**.

Extend the sans stack (order matters — Simplified before Traditional only where the product is Simplified):

| Script | Appended fallbacks |
|---|---|
| Simplified Chinese (default here) | `"PingFang SC", "Noto Sans SC", "Noto Sans CJK SC", "Source Han Sans SC", "Microsoft YaHei", "Hiragino Sans GB", sans-serif` |
| Traditional Chinese | `"PingFang TC", "Noto Sans TC", "Noto Sans CJK TC", "Microsoft JhengHei", sans-serif` |
| Japanese | `"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", "Meiryo", sans-serif` |
| Korean | `"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif` |
| CJK serif (titles) | `"Songti SC", "Noto Serif SC", "Source Han Serif SC", "SimSun", serif` (TC: `"Songti TC", "Noto Serif TC"`) |

Rules that follow:
1. **Mono for CJK is a trap.** There is no monospaced CJK face on macOS/Windows that keeps 1 em advance; `ui-monospace`
   falls back per-glyph and the label breaks into mixed advances. A CJK label in a mono slot is rendered in the **sans**
   stack at **12 px / 500 / letter-spacing 0 / no uppercase**. Its mask grows to 16 px tall.
2. **Floor is 12 px.** Han packs more strokes per em than Latin; below 12 px it turns to mud. If a Chinese name does not
   fit at 12 px, cut the name — do not shrink the type **(M)**.
3. **No uppercase, no tracking on CJK.** `text-transform: uppercase` is a no-op on Han but still corrupts mixed labels
   ("API 网关" → "API 网关" is fine, but `letter-spacing` is not: it detaches glyphs), so the CJK register sets both to
   zero.
4. **Sublabels stay Latin.** Ports, protocols, field types, versions are Latin; keep them in mono and do not translate.
5. **No shrink-to-fit.** Never apply per-label `textLength`/`lengthAdjust` or a smaller font to force a Chinese label
   into a fixed width; wrap or shorten instead.
6. Width budget: **every full-width glyph costs 1 em**, every other character its face's Latin advance (≈0.60 em sans,
   ≈0.62 em mono), combining marks 0. Full-width punctuation `（）「」，。：` also costs 1 em — this is the term most
   often dropped **(M)**.
7. Classify **per label**, not per diagram: an ASCII edge label in a Chinese diagram keeps the 8 px mono uppercase
   treatment. Implementation: every label element gets `class="dd-mono"` or `class="dd-cjk"` (§8, step 12).

---

## 5. Geometry & chrome

All structural geometry sits on a **4 px grid**: origins, widths, heights, gaps, paddings. Off-grid by design: type
sizes, radii, data-derived coordinates, baselines, `0.5` offsets that keep 1 px strokes crisp, stroke widths, opacities,
and the 22×22 dot pattern **(M)**.

### 5.1 Shape and stroke

| Element | Radius | Stroke | Fill |
|---|---|---|---|
| Node box, step / action | `rx=6` | 1.0 | `#ffffff` (light) / `ink@0.04` (dark) |
| Node box, state / UML class / ER entity | `rx=8` states, `rx=6` class/ER | 1.0 | `#ffffff` / `ink@0.04` |
| Start/end terminator (flowchart oval) | `rx=20` | 1.0 | `ink@0.03` |
| Store / state (ex-cylinder) | `rx=6` (**flat, never a 3-D barrel**) | 1.0 `muted` | `ink@0.05` |
| External / cloud / async | `rx=6` | 1.0 `ink@0.30` (dashed `4,3` for optional) | `ink@0.03` |
| Input / actor box | `rx=6` | 1.0 `soft` | `muted@0.10` |
| Focal node | `rx=6` (8 if state/entity) | **1.4** `accent` | `accent-tint` |
| Type tag inside a box | `rx=2` (**a rectangle, not a pill**) | 0.8, stroke role @0.4–0.5 | transparent |
| Zone / cluster frame | `rx=8` | **0.8** `ink@0.10` | `ink@0.02` |
| Zone label mask | `rx=2`, h=12 | none | `paper` |
| Label mask behind an edge label | `rx=2`, h=12 | none | `paper` (opaque) |
| Sequence actor box | `rx=6` (mermaid emits `rx=3` → patch) | 1.0 | per actor role |
| Activation bar | none | 0.8 `muted` | `ink@0.06` |
| Fragment frame | `rx=4` | 1.0 `ink@0.22` | `ink@0.02` (`ink@0.04` dark) |
| Legend swatch | `rx=2`, 14×10 | 1.0 | role |

Stroke scale **(M across examples)**: hairline `0.8` (zone frames, tags, activation bars) · default `1.0` (node borders,
ER relationship lines) · arrow `1.2` (all edges) · accent arrow **`1.4`** · accent node border **`1.4`**. Note the
conflict: `style-guide.md` declares `stroke-strong = 1.2` and nothing at 1.4, while every shipped example draws the focal
stroke at `1.4` **(M)**. Follow the examples; treat 1.4 as the "focal" width and 1.2 as "emphasised".

### 5.2 Arrow marker

```svg
<marker id="arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
  <polygon points="0 0, 8 3, 0 6" fill="{muted}"/>
</marker>
```

8×6 px, filled triangle, `refX=7` so the tip lands on the geometry, three instances (`arrow` muted, `arrow-accent`,
`arrow-link`) **(M)**. The dash pattern is `5,4` for optional / passive / return / async; `4,3` for "transit behind a
non-endpoint box"; `3,3` for lifelines. Mermaid 12 emits `viewBox="0 0 10 10"`, `markerWidth=8 markerHeight=8` and a
symmetric 10×10 triangle with `refX=5` **(V)** — patch to the 8×6 / `refX=7` shape.

### 5.3 Padding and spacing

| Measure | Value | Source |
|---|---|---|
| Node padding | in-box tag at `x+8, y+8` (12 high); name baseline at `top+36` in a 64-high box, sublabel baseline at `top+52` | (M) |
| In-box tag offset | `x+8, y+8`, 12 high | (M) |
| Gap between ranks | 32–48 px; 24 px is the floor | (M) allowed gaps 20/24/32/40/48 |
| Gap between nodes in a rank | 24–32 px | (M) |
| Node width ladder | 80, 96, 112, 120, 128, 140, 144, 160, 180, 200, 240, 320 | (M) |
| Node height | 48 (standard) / 56 (sequence actor) / 64 (node with sublabel) / 80 (state) | (M) |
| Zone label margin | zone top = first node top − 32; label mask at `zone_y+4`, ≥16 px above the first enclosed node | (M) |
| Edge-label gap | **6–10 px** between the mask edge and its own stroke (measured 6 below, 8 above) | (M) |
| Label mask size | width = text + 12–16, height 12, `rx=2` | (M) |
| Legend | horizontal strip at the bottom, hairline separator 0.8, +60 px of viewBox height | (M) |
| Dot pattern | `22×22`, `circle cx=1 cy=1 r=0.9`, `ink@0.10`, overlay rect at `opacity=0.55` | (M) |

### 5.4 Chrome prohibitions (with the numbers that make them checkable)

- **No shadows.** `filter` must not appear on any painted element; no `drop-shadow`, no `feDropShadow`. Mermaid 12's
  default `look: 'neo'` adds `filter:drop-shadow(1px 2px 2px rgba(185,185,185,1))` to every node **(V)** — this is the
  single largest deviation from the skin and must be switched off, not "toned down".
- **No gradients.** No `<linearGradient>`, no `stroke="url(#…-gradient)"`. Mermaid 12 emits a 2-stop gradient per diagram
  when `useGradient` is on **(V)**.
- **No 3-D barrels.** A store/DB is a flat `rx=6` box with a `muted` border and an `ink@0.05` fill. Mermaid renders
  `[(…)]` as a cylinder `path` with an elliptical lid **(V)** — flatten it (§8, step 9).
- **Not everything is a pill.** Pills (`rx >= 20`) are reserved for flowchart terminators only. Tags are `rx=2`, boxes
  `rx=6/8`, zone frames `rx=8`. Upstream bans `rounded-2xl`-style radii outright ("max radius 6–10 px or none") **(M)**.
- **No diagonal connectors** where mermaid lets you avoid them; the upstream router rule (orthogonal elbows, `r=8`) is a
  *routing* rule mermaid cannot express (§10). Do not imitate it with fake geometry.
- **No legend inside the plot area**, no vertical `writing-mode` text, no bidirectional arrow where one direction is
  obvious **(M)**.

---

## 6. Per-grammar treatment

The mapping source is `references/import-mermaid.md` for the four grammars it supports (flowchart/graph,
sequenceDiagram, stateDiagram-v2, erDiagram) plus the matching `type-*.md`. **Upstream has no import mapping for
`classDiagram` or `gantt`** (its extractor parses only those four grammars); the rows below for those two are derived
from `type-uml-class.md` / `type-gantt.md` and are marked **(I)**.

### 6.1 Construct to treatment matrix

| Mermaid construct | Treatment | Fill | Stroke | Radius / size | Label |
|---|---|---|---|---|---|
| `A[Text]` rect, step/action | Node box | `#fff` / `ink@0.04` | `ink` 1.0 | `rx=6` | sans 12/600 `ink` |
| `B{Text}` rhombus, decision | **Keep the rhombus** — shape carries type, colour does not | `#fff` | `ink` 1.0 | mermaid polygon, unchanged | sans 12/600, wrap at ~18 chars |
| `C((Text))` / `([Text])`, start/end | Terminator | `ink@0.03` | `ink@0.30` 1.0, or `accent` if focal | `rx=20` | sans 12/600 |
| `D[(Text)]` cylinder, store | **Flatten to a flat store box.** Never a 3-D barrel | `ink@0.05` | `muted` 1.0 | `rx=6` | sans 12/600 + mono 9 `muted` sublabel |
| `E>Text]` / `F{{Text}}` | Step; hexagon only when it is genuinely a decision entry | `#fff` | `ink` 1.0 | mermaid default | sans 12/600 |
| `subgraph X … end` | **Zone frame**, drawn behind everything | `ink@0.02` | `ink@0.10` **0.8** | `rx=8` | mono 8/500 `soft`, `0.14em`, uppercase, on a `paper` mask at `y+4`; `subGraphTitleMargin.top=4` |
| `Note over` / `note right of` | Sticky paper note | `paper-2` | `rule-solid` 0.8 | `rx=4` | mono 8–9 `muted`, sentence case, never uppercase |
| `participant A as Name` | Column head | per actor role (`muted@0.10` + `soft`) | 1.0 | `rx=6`, 144–160 × 56 | sans 12/600 + mono 9 `muted` sublabel |
| Lifeline | Dashed hairline | — | `ink@0.22` 1.0, dash `3,3` | — | — |
| `activate A` | Narrow bar on the lifeline | `ink@0.06` | `muted` **0.8** | width **8** (mermaid default 10) | — |
| `A->>B: msg` call | Solid message, filled marker | — | `muted` 1.2 (`link` for HTTP) | — | mono 8 `muted`, uppercase, `0.08em`, on a `paper` mask |
| `B-->>A: msg` return | **Dashed** + **filled** marker, never open | — | `muted` 1.2, dash `5,4` | — | same |
| `A-)B` / `A--). B` async | Dashed + **open** arrowhead (the hollow head is the async signal) | — | `muted` 1.2, dash `5,4` | marker `polyline 0 0, 8 3, 0 6`, unfilled | same |
| Headline success message (≤1–2) | The one accent message | — | `accent` **1.4** | accent-filled marker | mono 8 `accent`, uppercase |
| `alt` / `opt` / `loop` | Frame spanning only the participating lifelines, operator tab top-left | `ink@0.02` (`ink@0.04` dark) | `ink@0.22` 1.0 | `rx=4`; tab 40×16 `rx=2` `paper` | tab mono 8 `muted` `0.12em` UPPERCASE (`ALT`/`OPT`/`LOOP`); guard mono 8 `[cond]`; `else` divider `ink@0.20` dashed `4,3` |
| Self-loop (sequence) | U-shaped loop, label to the **right** of the loop | — | `muted` 1.2 | 36 wide × 32 tall (measured) | mono 8 `muted` |
| `state X` / `X --> Y: event` | State box + labelled transition | `#fff` | `ink` 1.0; transition `muted` 1.2 | **`rx=8`** | sans 14/600 name; transition mono 8 `muted` as `event [guard] / action` |
| `[*] --> X` start | Filled ink dot | `ink` | — | `r=6` | — |
| `X --> [*]` end | Ringed dot | inner `ink` | outer `ink` 2.0 | outer `r=8`, inner `r=5` | — |
| `state X { … }` composite | Nested zone + divider | `ink@0.02` | `ink@0.10` 0.8 | `rx=8`; divider `ink@0.12` 1.0 | zone eyebrow mono 8 `soft` |
| `erDiagram` entity `A { … }` | **Two-section box**: header + field list | `#fff` | `ink` 1.0 | `rx=6`; header **40 px** tall | header tag mono 8 `0.14em` UPPERCASE (`ENTITY`), name sans **14/600** |
| Entity header band | Tint + squared-off bottom corners | `ink@0.04` (focal `accent@0.10`) | — | top `rx=6` rect 40 high + an 8-px rect at `y+32` | — |
| Header/body separator | Full-width hairline at `y = top+40` | — | `ink@0.22` (focal `accent@0.40`) 1.0 | — | — |
| ER field row | `#` PK prefix, `→` FK prefix, name left / type right | row pitch **20 px**, first baseline `top+60` | — | insets 16 / 20 px | mono **10** `ink`; type mono 10 `muted` |
| `A \|\|--o{ B : rel` | Line between boxes + cardinality at **each** end | — | `muted` 1.0 | mermaid crow-foot markers, 10–12 px off the box edge | cardinality mono 10/600 `muted` on a 12×12 `rx=2` mask; relation word mono 8 `0.12em` UPPERCASE on a 14-high mask |
| Join / associative table | Entity box with a dashed border | `ink@0.04` | `muted` 1.0 `4,3` | `rx=6` | tag reads `JOIN` |
| `classDiagram` class box | Three compartments, content-height, never equal-height | `#fff` | `ink` 1.0 | `rx=6`; full-width hairlines `ink@0.22` | name sans 12/600 centered; `«interface»` mono 8 above; abstract name *italic* |
| Class member row | Single string `+ name: Type` (not ER's two-column form) | — | — | 14–16 px row pitch | mono 9 `ink`; visibility `+` `-` `#` |
| `A <\|-- B` inheritance | Solid + **hollow triangle** at the target | `paper` fill | `muted` 1.2 | triangle ~12×10 | — |
| `<\|..` realization | Dashed `5,4` + hollow triangle | `paper` | `muted` 1.2 | — | — |
| `*--` composition | Solid + **filled diamond** at the owner | `ink` | `muted` 1.2 | ~12×8 | — |
| `o--` aggregation | Solid + **hollow diamond** at the owner | `paper` | `muted` 1.2 | ~12×8 | — |
| `-->` association / `..>` dependency | Solid / dashed `4,3` + plain open arrowhead | — | `muted` 1.2 | — | multiplicity both ends, mono 8, on a mask |
| `gantt` task bar | Row 40 px, bar 24 px | `muted@0.15` (one focal bar `accent@0.12`) | `muted` 1.0 (focal `accent`) | `rx=4`; label column 180 px | name sans 11/600; axis mono 8 |
| `gantt` section | Zone rect behind the rows | `ink@0.02` | `ink@0.10` 0.8 | `rx=8` | section mono 7 `0.14em` UPPERCASE `soft` |
| Legend (any grammar) | Horizontal bottom strip only | — | separator `ink@0.10` 0.8 | +60 px viewBox height | eyebrow mono 8 `0.18em`; items sans 8.5 `muted` |

### 6.2 Grammar-specific rules

**flowchart** — shape carries type, never fill; a decision has ≤3 exits and every exit is labelled; coral goes on the
happy path *or* on the single most consequential decision, never on every decision; a merge point is a filled `r=4` dot **(M)**.

**sequence** — time flows downward, never upward; activation bars always close; ≤5 lifelines, ≤12 messages, ≤1 fragment
(2 only if both are single-region `opt`/`loop`), ≤2 `alt` regions, nesting depth 1 **(M)**. `par`/`critical`/`break`/`ref`
are out of scope upstream, and mermaid's `rect` highlight is discarded as styling — do **not** tint the band **(M)**.

**state** — a transition label is `event [guard] / action`, omitting what you do not need; more than `states × 2`
transitions means it is two machines; "from any state" is one annotation, not N arrows **(M)**. Mermaid 12 lays state
diagrams out with ELK by default (`state.layout = "elk"`) **(V)** — the skin does not fight it, only the shapes.

**er** — the story is entities and cardinality: cardinality at each end, the same notation at both ends, the relationship
word on the line, natural height by content (never pads boxes to equal height) **(M)**. A physical schema with SQL types
and column-to-column FKs is a *different* upstream type; needing it is not a licence to invent decoration here.

**class** (I) — operations are the distinguishing content: never list getters/setters, cap 5 members per compartment, and
the marker vocabulary (hollow triangle / filled diamond / hollow diamond / open arrow) carries the meaning, so all six
relationship kinds belong in the legend even when unused.

**gantt** (I) — one focal bar only; never put dates in the bar label (they belong on the axis); no dependency arrows.

---

## 7. Mermaid `themeVariables` / `themeCSS` mapping

Verified against the installed bundle (`mermaid@12.2.0`; the base-theme variable list is `dist/themes/theme-base.d.ts`,
270 keys at runtime) by rendering each grammar and diffing the emitted `<style>` block **(V)**. The "reaches" column
names the selector each variable actually landed on — the only reliable statement of what a variable does.

**Expressibility:** **T** = pure `themeVariables` · **C** = `themeCSS` (mermaid prefixes every rule with the diagram's
root id automatically, verified) · **P** = post-render DOM patch · **X** = not expressible.

### 7.1 Global

| Mermaid variable | Token | Verified reach in 12.2.0 | How |
|---|---|---|---|
| `background` | `paper` | paints **no** background rect; only `.stateGroup .composit` and `circle.state-end` | **P** — insert a full-bleed `paper` rect |
| `fontFamily` | sans stack (§4.2) | `#id{font-family}`, `svg{font-family}` | T |
| `fontSize` | `12px` | `#id{font-size}` | T |
| `radius` | `6` | state `rect.label-container{rx=9}` — **no effect on flowchart rects** | T for state/class, **P/C** for flowchart |
| `strokeWidth` | `1` | `.node rect{stroke-width:2px}`, `.actor{stroke-width:2}`, class `.node rect` | T |
| `dropShadow` | `"none"` | rewrites the neo rules to `filter:none` | T (must be set; see §7.4) |
| `useGradient` | `false` | removes the 2-stop `<linearGradient>` | T |

### 7.2 Per-role

| Variable | Token | Verified reach | How |
|---|---|---|---|
| `primaryColor` | `#ffffff` (node fill) | `.node rect,…{fill}` — derives `mainBkg` when `mainBkg` is unset | T |
| `mainBkg` | `#ffffff` | `.node rect` fill; `.entityBox` fill; `.stateLabel .box`; class `.node rect` | T |
| `primaryBorderColor` | `ink` | `.node rect,…{stroke}` | T |
| `nodeBorder` | `ink` | `.node rect` stroke; `.entityBox` stroke; class `.divider`; state `.node rect` | T |
| `primaryTextColor` | `ink` | `#id{fill}`; `.label{color}`; `.flowchartTitleText` — derives `nodeTextColor` | T |
| `nodeTextColor` | `ink` | `.label text{fill}`; `.label{color}` — **the node-label colour** | T |
| `textColor` | `ink` | root `fill`; er `.edgeLabel .label text`; `g.stateGroup text` | T |
| `lineColor` | `muted` | `.marker{fill,stroke}`; `.flowchart-link{stroke}`; `.root .anchor path`; `.relationshipLine`; `.transition`; `.relation` | T |
| `secondaryColor` | `paper-2` | no direct selector in these five grammars | T (reserved) |
| `tertiaryColor` | `paper` | `.error-icon`; `div.mermaidTooltip` | T |
| `clusterBkg` | `paper` or `paper-2` | `.cluster rect{fill}` | T |
| `clusterBorder` | `rule-solid` | `.cluster rect{stroke}`; `.collapsed-indicator` | T |
| `titleColor` | `soft` | `.cluster-label text/span`; `.cluster text/span` — **the zone-label colour** | T |
| `edgeLabelBackground` | `paper` | `.edgeLabel`, `.edgeLabel p`, `.edgeLabel rect`, `.labelBkg` | T |
| `noteBkgColor` | `paper-2` | `.note`; `rect.note[data-look=neo]`; `.statediagram-note rect` | T |
| `noteTextColor` | `muted` | `.noteText`; `.statediagram-note text/.nodeLabel` | T |
| `noteBorderColor` | `rule-solid` | `.note`; `.statediagram-note rect` | T |
| `actorBkg` | per actor role | `.actor` fill; `.actor-man circle` | T |
| `actorBorder` | `soft` / `ink` | `.actor` stroke | T |
| `actorTextColor` | `ink` | `text.actor > tspan` | T |
| `actorLineColor` | `ink@0.22` | `.actor-line` stroke | T |
| `signalColor` | `muted` | `.messageLine0/1` stroke; `[id$="-arrowhead"] path`; `[id$="-sequencenumber"]` | T |
| `signalTextColor` | `ink` | `.messageText` | T |
| `labelBoxBkgColor` | `paper` | `.labelBox` (fragment operator tab) | T |
| `labelBoxBorderColor` | `rule-solid` | `.labelBox`; `.loopLine` stroke **and** fill | T |
| `labelTextColor` | `soft` | `.labelText` (operator text) | T |
| `loopTextColor` | `soft` | `.loopText`; `.sectionTitle` | T |
| `activationBkgColor` | `ink@0.06` | `.activation0/1/2` fill | T |
| `activationBorderColor` | `muted` | `.activation0/1/2` stroke | T |
| `sequenceNumberColor` | `soft` | `.sequenceNumber` | T |
| `transitionColor` | `muted` | `.transition` stroke; `defs [id$="-barbEnd"]` | T |
| `transitionLabelColor` | `soft` | state `.edgeLabel .label text` | T |
| `stateLabelColor` | `ink` | `.stateLabel text`; `g.stateGroup .state-title`; `.nodeLabel` | T |
| `stateBkg` | `#ffffff` | state `.node rect{fill}` | T |
| `labelBackgroundColor` | `paper` | state `.edgeLabel .label rect{fill}` | T |
| `compositeBackground` | `ink@0.02` | `.statediagram-cluster .inner`; `.end-state-inner` | T |
| `compositeTitleBackground` | `paper` | `.statediagram-cluster rect` | T |
| `compositeBorder` | `ink@0.10` | composite frame stroke | T |
| `altBackground` | `paper-2` | `.statediagram-cluster-alt .inner`; `.divider` | T |
| `classText` | `ink` | `.nodeLabel`, `.edgeLabel`, `.label text` | T |
| `rowOdd` / `rowEven` / `attributeBackgroundColorOdd` / `attributeBackgroundColorEven` | `paper` / `paper-2` | **no effect on ER rows in 12.2.0** — the declaration lands nowhere; row fill is an inline `hsl()` attribute | **C** — `.row-rect-odd path{fill:#f5f5f5}`, `.row-rect-even path{fill:#ececec}` |
| `sectionBkgColor` / `altSectionBkgColor` | `paper-2` / `paper` | `.section0`, `.section1/.section3` | T (gantt) |
| `taskBkgColor` / `taskBorderColor` / `taskTextColor` | `muted@0.15` / `muted` / `ink` | `.task0-3`, `.taskText0-3` | T (gantt) |
| `gridColor` / `todayLineColor` | `rule` / `muted` | `.grid .tick`, `.today` | T (gantt) |
| `doneTaskBkgColor` / `critBkgColor` | `muted@0.10` / `accent@0.12` | `.done*`, `.crit*` | T (gantt) |

### 7.3 What themeVariables cannot express

| Intent | Why not | Fix |
|---|---|---|
| Flowchart node `rx=6`, terminator `rx=20` | `radius` never reaches flowchart rects (verified) | **C** `g.node rect.label-container{rx:6px}` + **P** for the attribute |
| Node border 0.8 hairline vs 1.0 default | one global `strokeWidth` | **C** per-selector `stroke-width` |
| Edge stroke 1.2, accent 1.4 | `.edge-thickness-normal{stroke-width:1px}` and `.edge-thickness-thick{3.5px}` are hard-coded | **C** `.edge-thickness-normal{stroke-width:1.2px}`; **P** per edge for accent |
| Arrowhead 8×6 with `refX=7` | marker geometry is emitted as attributes | **P** (§8 step 8) |
| Opaque edge-label mask | `.edgeLabel rect{opacity:0.5}` is hard-coded (verified) | **C** `.edgeLabel rect{opacity:1}` |
| Mono / uppercase / tracked edge labels | labels are HTML (`foreignObject > div > span`) with one family from `fontFamily` | **C** + **P** per-label script classification (§8 step 12) |
| CJK register (12 px sans, no tracking) on selected labels | themeVariables are per-diagram, not per-label | **P** class `dd-cjk` |
| Zone label `soft` + `0.14em` + 8 px | `titleColor` gives colour only | **C** `.cluster-label span` |
| Flat store instead of cylinder | shape is a `path` with an elliptical lid | **P** (§8 step 9) |
| Sequence actor `rx=6`, activation width 8 | actor `rx="3"` is inline, `activationWidth` is config | **P** / diagram config |
| The focal (accent) node and its edges | mermaid has no focal concept | **P** (§8 step 10) |
| Paper / dot ground, accessible `<title>` and `<desc>` | mermaid paints no background and emits no title | **P** (§8 steps 6, 14) |
| ER row banding | not wired to any variable (verified) | **C** `.row-rect-odd path`, `.row-rect-even path` |

### 7.4 Two mermaid-12 traps that live in config, not in CSS

1. **`look: "neo"` is the default per diagram type.** The global `look` is `classic` (verified through
   `mermaidAPI.getConfig()`), but `flowchart`, `sequence`, `state`, `er` and `class` each default `look: "neo"` **(V)**,
   which paints `filter:drop-shadow(1px 2px 2px rgba(185,185,185,1))` on nodes and gradient strokes. Set
   `look: "classic"` **inside every diagram config object**, not only at the top level:

   ```js
   mermaid.initialize({
     theme: "base", themeVariables, themeCSS, look: "classic",
     flowchart: { look: "classic", curve: "linear", padding: 8, nodeSpacing: 48, rankSpacing: 40,
                  subGraphTitleMargin: { top: 4, bottom: 4 } },
     sequence:  { look: "classic", activationWidth: 8, actorMargin: 48, messageMargin: 28,
                  actorFontSize: 12, messageFontSize: 10, noteFontSize: 10, mirrorActors: false },
     state:     { look: "classic" },
     er:        { look: "classic", entityPadding: 12, minEntityWidth: 120 },
     class:     { look: "classic" }
   });
   ```

   `mirrorActors: false` is part of the skin: a mirrored bottom actor row doubles exactly the table-like furniture the
   editorial look removes (upstream draws actors once, at the top). Every key above exists in 12.2.0's default config
   **(V)**.

2. **`themeCSS` is auto-scoped, and its hex values are normalised.** Each selector written in `themeCSS` is prefixed
   with `#<rendered-id>` by mermaid itself **(V)** — so write plain selectors (`.node rect{…}`), never pre-prefixed
   ones, and expect no leakage between diagrams. Hex values come out as `rgb()` **(V)**, so QA must compare computed
   colours, never strings.

---

## 8. Post-render patch list

Runs once per render on the SVG **string** returned by `mermaid.render(...)`, before it reaches
`dangerouslySetInnerHTML` in `src/client-entry.js` (the `setSvg(result.svg)` call). Implement it by parsing with
`new DOMParser().parseFromString(svg, "image/svg+xml")`, mutating the DOM and serialising with `XMLSerializer` —
regex surgery over `foreignObject` payloads is not safe. Every step is **idempotent**: guarded by the marker attribute
from step 1, and written as "set", never "toggle".

| # | Operation | Selector in real mermaid 12.2.0 output (verified) | Notes |
|---|---|---|---|
| 1 | Bail if `root.hasAttribute("data-dd-skin")`; then set `data-dd-skin="1"`, `data-dd-mode`, `data-dd-grammar` (from `aria-roledescription`) | `svg.flowchart`, `svg.statediagram`, `svg.erDiagram`, `svg[aria-roledescription="sequence"]`, `svg[aria-roledescription="classDiagram"]`, `svg[aria-roledescription="gantt"]` | sequence and class carry **no** class attribute — key off `aria-roledescription` |
| 2 | Remove every `<filter>` subtree, then any `<defs>` left empty | `filter[id$="-drop-shadow"]`, `filter[id$="-drop-shadow-small"]` | emitted even under `look: classic` **(V)** |
| 3 | Remove `<linearGradient>` | `linearGradient[id$="-gradient"]` | emitted when `useGradient` is truthy |
| 4 | Remove any surviving shadow or gradient reference | `[filter]`, `[style*="drop-shadow"]`, `[stroke^="url("]`, `[fill^="url("]` | belt-and-braces after steps 2–3 |
| 5 | Strip the neo marker if present | `[data-look="neo"]` → remove the attribute | no-op once `look: "classic"` is set |
| 6 | Insert the paper ground as the **first** child; dot pattern only when opted in | new `rect width="100%" height="100%"`; optional `defs > pattern[id$="-dots"]` (22 × 22, `circle r=0.9`, `ink@0.10`) plus an overlay rect at `opacity=0.55` | the preview is product chrome, so the pattern defaults **off** — upstream says the texture is opt-in and wrong inside product pages |
| 7 | Normalise radii on **rect** shapes; leave paths and circles alone | flowchart `g.node rect.label-container` → `6`; state `g.node.statediagram-state rect` → `8`; ER `g.node .outer-path` and class `g.classGroup rect` → `6`; sequence `rect.actor` → `6` | mermaid emits **no `rx`** on flowchart rects and `rx="3"` on sequence actors **(V)**. The `([text])` terminator and the `[(text)]` cylinder are **paths**, not rects — the stadium is already the right terminator shape, so do not try to give it `rx`; a labelled `((text))` is a real `<circle>`, so keep it a circle rather than collapsing it to a `r=6` dot (the dot form is for unlabelled merge points and for state start, not for a labelled box) |
| 8 | Normalise the flow marker to 8 × 6 | `marker.flowchart-v2[id$="-pointEnd"]`, `[id$="-pointStart"]` | set `viewBox="0 0 8 6"`, `refX=7` / `refY=3`, `markerWidth=8` / `markerHeight=6`, child `path d="M 0 0 L 8 3 L 0 6 z"`. Mermaid ships `0 0 10 10`, `refX=5`, 8 × 8 **(V)** |
| 9 | Flatten cylinders into store boxes | `g.node path` whose `d` contains **two `l0,` wall segments** (the barrel sides) — in 12.2.0 the cylinder emits `M0,<r> a<rx>,<ry> 0,0,0 <w>,0 a<rx>,<ry> 0,0,0 -<w>,0 l0,<h> a… l0,-<h>`. The `([text])` stadium draws arcs but **no `l0,` segment**, which is how the two are told apart | replace with a `rect rx=6` from the path bbox, `fill=ink@0.05`, `stroke=muted` 1.0, reparent the `g.label`; degrade gracefully (keep the path, restyle fill/stroke) if the bbox is unusable |
| 10 | Apply the 1-accent rule (§3) | nodes `g.nodes > g.node[id]` (no `data-id` on nodes — parse `<svgId>-flowchart-<nodeId>-<n>`); edges `path.flowchart-link[data-id]`, `path.transition[data-id]`, `path.relationshipLine[data-id]` | choose the focal set by **parsing the mermaid source**, not the SVG: `data-id` values such as `L_A_B_0` are ambiguous when node ids contain `_` |
| 11 | Normalise stroke widths | `path.flowchart-link`, `path.transition`, `path.relationshipLine`, `path.relation`, `line.messageLine0/1` → `1.2`; focal edges → `1.4`; `line.actor-line` → `1` + `stroke-dasharray="3 3"`; `rect.activation0/1/2` → width `8`, `stroke-width 0.8` | the CSS rule `.edge-thickness-normal{1px}` exists but mermaid also inlines `stroke-width` on sequence messages, so set both |
| 12 | Classify every label into its register | `g.label span.nodeLabel`, `g.edgeLabel span.edgeLabel`, `div.labelBkg`, `g.cluster-label span`, `text.messageText`, `text.noteText`, `g.label.attribute-name .nodeLabel` | ASCII → `class="dd-mono"` (mono, 8 px, `letter-spacing .06em`, uppercase); CJK (`/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/`) → `class="dd-cjk"` (sans, 12 px, weight 500, `letter-spacing: normal`, `text-transform: none`). Node **names** are never mono and never upper-cased |
| 13 | Style the zone label | `g.cluster-label` (positioned by `transform="translate(x,y)"`) | mono, 8 px, `letter-spacing .14em`, `fill soft` (`muted` in dark), uppercase when ASCII; `subGraphTitleMargin.top=4` lifts it clear of the first node |
| 14 | Restore the accessible-figure contract | root `svg` | insert `<title id="…-title">` (first child, ≤60 chars) and `<desc id="…-desc">` (one sentence about content, not geometry), set `role="img"` and `aria-labelledby`; reuse the render id so ids stay unique per diagram |
| 15 | Strip leftovers | empty `<defs></defs>`, root `style="max-width: …px;"` | sizing stays with the preview's own stage measure |
| 16 | Freeze the theme | root `<style>` | keep mermaid's scoped `<style>` (it is already id-scoped, so it is safe) **or** lift the resolved values into the plugin stylesheet and delete it — never leave both with conflicting rules |

Ordering constraints: 2–5 before 7 (a shadowed and a shadow-free shape must not both be measured); 6 before 10 (the
accent stroke has to sit on a known ground); 12 after 11; 14 last so patched classes never collide with new ids.

Two things this list deliberately does **not** do: it does not re-route edges (mermaid's dagre/ELK router owns
geometry — the upstream orthogonal-elbow rule cannot be expressed, see §10), and it does not move text (mermaid centres
every label; fighting that per element produces the "hand-placed but wrong" look the upstream examples avoid).

---

## 9. QA assertions

Written to run in plain Node with `jsdom` on the patched SVG string (`DOMParser` + `querySelectorAll`) plus one pass
over the token module. No browser, no screenshot, no visual diff. `resolve(el)` = walk up for a `fill`/`color` and
normalise hex/`rgb()`/`rgba()`/named colours to RGBA; `bgOf(el)` = nearest ancestor with an opaque background, else
`paper`.

| # | Assertion | Check |
|---|---|---|
| 1 | Patched exactly once | root `[data-dd-skin]` count === 1, and re-running the patch on its own output is a no-op (`serialize(patch(serialize(patch(svg)))) === serialize(patch(svg))`) |
| 2 | No shadows | `querySelectorAll("filter").length === 0`; `querySelectorAll("[filter]").length === 0`; no `style` attribute contains `drop-shadow` |
| 3 | No gradients | `querySelectorAll("linearGradient, radialGradient").length === 0`; no `fill`/`stroke` starting `url(` |
| 4 | No 3-D store | no `g.node path` whose `d` contains two `l0,` wall segments (zero cylinders survive; the stadium terminator, which has arcs but no `l0,`, is allowed) |
| 5 | Node radii | every `g.nodes g.node rect.label-container` has `rx === 6` and `rx === ry`; every `g.node.statediagram-state rect` has `rx === 8`; every `rect.actor` has `rx === 6`; no rect has `rx` outside {2, 4, 6, 8, 20} |
| 6 | Stroke scale | every computed `stroke-width` ∈ {0.8, 1, 1.2, 1.4, 2} with 2 allowed only on `circle.state-end` / end-state rings; no `3.5px` (`edge-thickness-thick` must be unused) |
| 7 | Marker geometry | each `marker[id$="-pointEnd"]` has `viewBox="0 0 8 6"`, `refX=7`, `refY=3`, `markerWidth=8`, `markerHeight=6` |
| 8 | Accent budget | count of node shapes whose fill resolves to the accent-tint value ≤ 2; count of distinct chromatic hues among all node fills (chroma > 0.15) ≤ 1 family |
| 9 | Accent anatomy | every accent-tinted node also has `stroke` = `accent` at 1.4, and its label colour resolves to `ink`, never `accent` (accent-on-tint is 4.23:1 light / 4.45:1 dark, both below 4.5) |
| 10 | Text contrast | for every label-bearing element (`span`, `text`, `p` inside `foreignObject`), `contrast(resolve(el), bgOf(el)) ≥ 4.5`; for ≥18.7 px at weight ≥600 the bar drops to 3.0 |
| 11 | Font-size floors | node label ≥ 12 px; sublabel ≥ 9 px; edge / zone / tag labels ≥ 8 px; **no** element below 8 px; nothing in a node label below 12 px |
| 12 | Label registers | every label element has `class.contains("dd-mono")` or `class.contains("dd-cjk")`; `dd-mono` ⇒ `font-family` contains `mono` and `text-transform: uppercase` and `letter-spacing > 0`; `dd-cjk` ⇒ family contains `PingFang SC` or `Noto Sans SC` or `YaHei`, `font-size ≥ 12`, `letter-spacing` is `normal` or `0`, `text-transform: none` |
| 13 | CJK detection parity | for each label, the predicted class from its text matches the emitted class: `/^[\x20-\x7E]+$/` ⇒ `dd-mono`, otherwise `dd-cjk` |
| 14 | Opaque masks | every `.edgeLabel rect` has computed `opacity === 1`; every `.labelBkg` / `.edgeLabel p` has an opaque background (`alpha === 1`) |
| 15 | Zone label styling | every `g.cluster-label` has `font-size` 8, `letter-spacing` ≈ 0.14em, fill equal to `soft` (light) / `muted` (dark) |
| 16 | Paper ground | first element child of `svg` is a `rect` with `width`/`height` = `100%` and fill = `paper`; no `background: transparent` survives in the `<style>` |
| 17 | Palette lint | every literal colour in the SVG is a member of the token set (16 roles, both modes, plus `#ffffff` node fill and the composited tints); zero unknown hex values |
| 18 | Accessibility | `<title>` is non-empty, ≤60 chars and the first child; `<desc>` non-empty; `aria-labelledby` resolves to both ids; `role === "img"` |
| 19 | No vertical text | `querySelectorAll("[writing-mode]").length === 0` |
| 20 | Legend placement | if a legend exists, it is the last group and its `y` is greater than every node `y` (no legend inside the plot area) |
| 21 | Token module | 16 roles present, each with a light and a dark value; for each role with a text use, `contrast(role, paper) ≥ 4.5` in both modes; `verify-contrast.py` parity for the 11 classified roles (20 rows) |
| 22 | Dark-mode inversion | for every `rgba(45,49,66,x)` in light output there is an `rgba(245,245,245,x)` counterpart with identical `x`; `accent` swaps `#bf4520` → `#f08a59` |
| 23 | Budget (advisory, warn not fail) | node count ≤ 9, edge count ≤ 12, fragments ≤ 1, `alt` regions ≤ 2, ER entities ≤ 8, sequence lifelines ≤ 5 |

Assertions 1–4, 6–9, 16–19, 21–22 are pure string/DOM checks and can run in the existing `node --test` suite with jsdom,
which the package already depends on (`jsdom ^30`). Assertion 10 needs a tiny colour resolver (~40 lines) but no engine.

---

## 10. Anti-patterns: what the mermaid default does, stated as implementable rules

| Default behaviour in mermaid 12.2.0 (verified) | Rule for this skin |
|---|---|
| `font-family: "trebuchet ms", verdana, arial, sans-serif; font-size: 16px` | Never inherit the root family into a label. Three voices only, sizes 8–14 px (§4). 16 px text is a document, not a figure. |
| Node fill `#fff4dd` (cream), border `hsl(40.59,60%,83.33%)` | Node fill is `#ffffff` in light and `ink@0.04` in dark; the border is `ink` at 1.0. A node is a box on paper, not a sticky note. |
| Cluster fill `hsl(220.59,100%,98.33%)` (lavender), border `hsl(220.59,60%,88.33%)` | Cluster = `ink@0.02` wash with an `ink@0.10` hairline. A zone must be fainter than every node inside it. |
| Edge label background `hsl(280,100%,93%)` at `opacity: 0.5` | `paper`, `opacity: 1`. A mask that lets the line through is not a mask; and a lilac chip is a fourth colour voice. |
| Edge stroke `#0b0b0b` at 1 px; `.arrowheadPath` fill `#0a0a0a` | `muted` 1.2, marker `muted`; `link` only for HTTP/API; `accent` only on the focal path. Pure black competes with `ink` text. |
| Arrowhead 10 × 10 triangle, `markerWidth 8 markerHeight 8`, `refX 5` | 8 × 6 with `refX 7`. The default head is too blunt and eats 5 px of the stroke. |
| `look: "neo"` adds `filter:drop-shadow(1px 2px 2px rgba(185,185,185,1))` and gradient strokes | Flat only: no filter, no gradient, no `<filter>` defs left behind. Shadows are out; borders are in. |
| Cylinders (`[(…)]`) render as a 3-D barrel with an elliptical lid | Flat store box: `rx=6`, `ink@0.05` fill, `muted` 1.0 border. Perspective in a schematic is decoration. |
| Every node the same rounded rect, same radius from one global value | Radius is semantic: 2 tag, 6 box, 8 zone/state, 20 terminator. A single radius for everything is the default look. |
| No `rx` at all on flowchart rects (square corners) | Explicit `rx=6`; square corners read as a wireframe, not an editorial figure. |
| Labels centred on the line they describe, background optional | A label sits **off** its stroke with a 6–10 px gap and an opaque mask. A label that hides its own arrow is a hard fail. |
| One font family for names, sublabels, edge labels and titles | Mono is for technical values only (ports, protocols, versions, field types). Names are sans. Titles are serif. Never a blanket "dev" mono. |
| Accent-by-class thinking ("errors red, success green") | One accent, ≤2 elements, chosen by consequence not by category (§3). A second hue family means the figure has no focal point. |
| Bold colour on branches (`style A fill:#f9f`) as the way to distinguish paths | Distinguish by shape, stroke weight and label text; keep the palette to one chromatic voice. |
| Colours carrying the only difference between two kinds of container (admin band vs traffic box) | Shapes must differ too: greyscale has to tell them apart (upstream makes this normative for containment). |
| Mirrored actor row at the bottom of a sequence diagram | `mirrorActors: false`. The duplicate row is furniture, and furniture is what the editorial look deletes. |
| `curve: "basis"` smoothing on every edge | `curve: "linear"` for the calmest available line; the upstream orthogonal-router rule cannot be reproduced, so do not fake it with wobble. |
| No `role`, no `<title>`, no `<desc>` on the rendered figure | Emit the accessible-figure contract (§8 step 14). A diagram without a name is unreadable to assistive technology and unquotable in review. |

---

## Appendix A — where each number comes from

| Value | Source |
|---|---|
| Token hex values, inversion rule, contrast contract, typography roles, node treatments | `references/style-guide.md` §Tokens / §Contrast contract / §Inversion rule / §Series palette / §Typography / §Stroke, radius, spacing / §Node type to treatment |
| Contrast ratios (11 roles, 20 rows) | `scripts/verify-contrast.py` run against `references/style-guide.md`; output reproduced in §2.1 |
| Contrast ratios for `paper-2`, `rule`, `rule-solid`, `accent-tint`, `series-1..5` | same WCAG 2.x formula and compositing rule as that script, applied here (the script classifies them decorative and skips them) |
| 4 px grid, node width/gap/padding ladders, complexity budgets | `references/layout-budget.md` §4px grid, §Complexity budget |
| viewBox presets, type ramp per size class, safe areas, detail ladder | `references/output-spec.md` §2, §3, §4, §6 |
| Connector rules, marker markup, label-mask gap, legend, accessible-SVG contract, dot pattern, node-box markup | `SKILL.md` §6 + `references/primitives-core.md` |
| Focal rule, taste gate, anti-pattern list, deletion philosophy | `SKILL.md` §1, §4, §9 |
| Mermaid construct mapping (shapes, subgraphs, cylinder, notes, actors, activations, fragments, ER cardinality), dials, degrade ladder | `references/import-mermaid.md` plus the matching `type-*.md` |
| `rx=6` box, `rx=2` tag, 12/600 name, 9 mono sublabel, 8 px arrow label, `ink@0.02` zone with `ink@0.10` 0.8 stroke, 8×6 marker, 0.55 dot overlay, 1.4 accent stroke, node 128–160 × 64 | `assets/example-architecture.html` (raw SVG) |
| Actor 144–160 × 56 `rx=6`; lifeline `ink@0.22` dash `3,3`; activation 8 wide `ink@0.06` + `muted` 0.8; messages 1.2; dash `5,4`; self-loop 36 × 32; sequence message 8 px mono `0.08em` | `assets/example-sequence.html` |
| State `rx=8` 160 × 80, name 14/600, start dot `r=6`, end ring `r=8` / `r=5`, transition 8 px mono `0.08em` | `assets/example-state.html` |
| ER header 40 px, `ink@0.04` header band, separator `ink@0.22`, entity name 14/600, field rows 10 px mono at pitch 20, cardinality 10/600, relation word 8 px `0.12em` | `assets/example-er.html` |
| Flowchart `rx=20` terminators 160 × 48, diamond 200 × 96, legend 8 px `0.18em` | `assets/example-flowchart.html` |
| Nesting insets 32 px horizontal / 36 px vertical | `assets/example-nested.html` (920 → 856 → 792 … ; heights 380 → 308 → 236) |
| Gantt row 40 px, bar 24 px `rx=4`, label column 180 px | `references/type-gantt.md` |
| Mermaid 12.2.0 class names, marker geometry, default theme colours, per-type `look: neo`, `themeCSS` scoping, ER row fills, `radius` reach | rendered locally with the installed `mermaid@12.2.0` and inspected (see §7, §8) |

## Appendix B — conflicts in the source, and what it does not answer

### B.1 Internal conflicts in the upstream repo (resolved here, choice stated)

| Conflict | Sources | Resolution in this spec |
|---|---|---|
| Zone label colour | `type-architecture.md` requires `soft` and never `ink` at an opacity (“on a light warm paper it falls near 2.2:1”) — versus `example-architecture.html`, which paints it `rgba(45,49,66,0.40)` | Follow the **rule**: `soft` (5.34:1 light), `muted` in dark. The shipped example predates the rule. |
| Focal stroke width | `style-guide.md` declares `stroke-strong = 1.2` and nothing at 1.4; every example draws the focal border and arrow at **1.4** | Follow the **examples**: 1.2 for emphasis, 1.4 for focal. |
| ER cardinality size | `type-er.md` says the `arrow-label` role, 8 px — versus `example-er.html`, 10 px at weight 600 | Follow the **example** (10/600): cardinality is a value, not an annotation. |
| State node name size | `type-state.md` says the `node-name` role (12 px) — versus `example-state.html`, 14 px | 12 px for 48–64 px boxes, 14 px for 80 px state/entity headings (which matches the “group or entity heading 14” exception in `output-spec.md`). |
| Dot pattern density | `primitives-core.md`: `r=0.9`, overlay `opacity=0.6` — `type-process.md`: `r=0.8`, 0.55 — examples: `r=0.9`, 0.55 | Use `22×22, r=0.9, ink@0.10, opacity 0.55` (the measured majority). |
| `accent-tint` in dark | `style-guide.md`: `rgba(240,138,89,0.10)` — `example-architecture-dark.html`: `0.08` | Use 0.10 (the token). |
| Lifeline / external stroke contrast | `style-guide.md` requires 3:1 for essential non-text marks; actual `ink@0.22` is 1.50:1 and `ink@0.30` is 1.77:1 | Keep the values (they are redundant with the labelled boxes) and record the deviation in §2.4 rather than silently changing the look. |

### B.2 What the repo does not answer (gap, and the workaround used)

| Gap | Consequence | Workaround |
|---|---|---|
| **No renderer.** Upstream hand-authors SVG and explicitly refuses to render Mermaid (“extract, do not render”; “rendering Mermaid to SVG first … crosses an unnecessary execution boundary”). | There is no upstream mapping from a renderer concept (marker attribute, CSS class, layout pass) to the skin. | Every mermaid-side statement in §7 and §8 was derived by rendering the installed bundle and inspecting its output, not from the repo. |
| **No `classDiagram` / `gantt` import mapping.** The extractor parses only flowchart, sequence, state and ER. | Those two grammars have no upstream semantic mapping. | Derived from `type-uml-class.md` / `type-gantt.md`, marked (I) in §6. |
| **No dark values for mermaid-only slots** (ER row banding, cluster fill in dark, mermaid tooltip). | Part of the rendered surface has no stated dark value. | Inversion rule (§2.3) applied mechanically; ER banding set to `paper` / `paper-2` (I). |
| **No CJK metrics beyond the 12 px floor and the register-switch rule.** No Chinese advance table. | A CJK node label can overflow its box. | Conservative budget of 1 em per full-width glyph (§4.3) plus mermaid wrapping and `minNodeWidth`; over-long CJK names are shortened by the author, never squeezed with `textLength` (I). |
| **No treatment for mermaid shapes the repo lacks**: `A>text]` asymmetric, `{{hexagon}}`, `[[subroutine]]`, `((circle))`, `[/parallelogram/]`. | No stated fill or stroke. | Map to the nearest documented role (step / decision / terminator) and never invent a fill (§6.1, I). |
| **Sequence `par` / `critical` / `break` / `ref` are explicitly out of scope upstream** (“second PR if needed”). | Mermaid renders them; the skin has no frame treatment. | Reuse the `alt` frame treatment verbatim and keep the one-fragment cap (I). |
| **No page-level typography for a preview panel.** The repo assumes a standalone HTML page with a Google Fonts link. | No stack that survives “no network, no bundled fonts”. | System stacks in §4.2, marked (I): the serif/sans/mono role contrast is preserved, the faces are not. |
| **No motion, no interaction.** Upstream bans animation except an opt-in reveal. | The preview has zoom controls only. | Nothing to port; no animation is added. |

### B.3 Explicit non-goals for the implementer

Do not attempt to reproduce the orthogonal elbow router, hand-placed text baselines, the 22×22 dot ground inside the
preview chrome (opt-in only), the summary-card / header / footer page furniture, the icon set, or the typographic
watermark numerals. Each belongs to the upstream HTML artefact, not to a Mermaid skin.