# Attribution and reuse scope

This plugin's Mermaid skin derives from an MIT-licensed source. This file records the licence, the exact upstream
revision, the upstream third-party notices, the trademark position, and — precisely — which values and rules were
reused and which were not.

## Upstream work

| Field | Value |
|---|---|
| Project | Diagram Design (`diagram-design`), an agent skill for editorial SVG diagrams |
| Author | Cathryn Lavery |
| Repository | https://github.com/cathrynlavery/diagram-design |
| Revision used | `6a7f19fcc132b39b126bea90167679b46b14bcc4` |
| Revision date | 2026-11-09 (commit `chore(release): bump plugin manifests to 2.6.148`) |
| Declared version | skill `metadata.version: "2.6"`; plugin manifests 2.6.148 |
| Licence | MIT (see below) |
| Files consulted | `LICENSE`, `THIRD_PARTY_LICENSES.md`, `skills/diagram-design/SKILL.md`, `skills/diagram-design/references/{style-guide,import-mermaid,layout-budget,output-spec,primitives-core,type-flowchart,type-sequence,type-state,type-er,type-architecture,type-nested,type-uml-class,type-gantt,type-process}.md`, `skills/diagram-design/assets/{example-architecture,example-sequence,example-state,example-er,example-flowchart,example-nested,example-gantt,example-architecture-dark}.html`, `scripts/verify-contrast.py` |
| Derived artefact | `docs/diagram-design-skin-spec.md` in this package |

## MIT licence (verbatim)

```
MIT License

Copyright (c) 2025 Cathryn Lavery

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

This notice is reproduced in full because the skin spec reproduces a substantial portion of the upstream design
system (token values, type scale, geometry, and stated rules) — which the MIT terms require, and which this
repository does on purpose.

## Upstream third-party notices (as recorded by the upstream project)

Upstream bundles icon sets and one outlined glyph from third parties. **This plugin redistributes none of them** (see
the scope statement below), so these notices do not add obligations to this package. They are reproduced because they
are part of the upstream licence record, and because they constrain the *upstream* project, not us:

| Component | Licence | Upstream | What upstream uses it for |
|---|---|---|---|
| Tabler Icons | MIT | https://github.com/tabler/tabler-icons | Stroked system icons (compute, people, network, data, Kubernetes, action, DevOps, brand outlines) in `references/primitive-icons.md` and `assets/icons.html` |
| Simple Icons | CC0 1.0 | https://github.com/simple-icons/simple-icons | Filled brand silhouettes (Kubernetes, Google Cloud, PostgreSQL, Nginx, Gitea, Keycloak, MinIO, NiFi, Airflow, Trino, Superset, Jupyter, Python, R) |
| log-z/logos | MIT | https://github.com/log-z/logos | Filled brand silhouettes not covered above (MySQL, Redis, StarRocks) |
| Devicon | MIT | https://github.com/devicons/devicon | RStudio and SPSS icons |
| Instrument Serif | SIL Open Font License 1.1 | https://github.com/Instrument/instrument-serif | Outline of the lowercase "d" in the upstream plugin logo only; no font file bundled |
| One-off sourced icons | Wikimedia Commons (public domain, SAS); IcePanel Technology Icons via techicons.dev (Stata) | see upstream `THIRD_PARTY_LICENSES.md` | Single brand icons |

None of the above appears in this plugin: no icon paths, no brand silhouettes, no logo glyph, no font file.

## Trademarks

Brand names and logos remain the trademarks of their respective owners. Nothing in this package grants any right to
use a third-party mark. The upstream project's position is reproduced here and applies equally: brand marks in the
upstream icon set are there for documentation and illustrative use, and their presence does not imply endorsement,
sponsorship, or affiliation.

Independently of upstream: this plugin uses no brand mark at all, and the derived skin does not depict or imitate any
third-party logo. The name "Diagram Design" and the upstream author's name are used only to attribute the source, in
the descriptive sense permitted by the MIT licence — not as a mark for this plugin, and not as a suggestion that the
upstream author endorses, reviews, or maintains it.

## Reuse scope

### What this plugin reuses

| Reused | Form in this plugin |
|---|---|
| The semantic token set and its values (paper, paper-2, ink, ink-strong, muted, soft, rule, rule-solid, accent, accent-tint, link, series 1-5), light and dark | Reproduced as design values in `docs/diagram-design-skin-spec.md` §2 and, once implemented, as the plugin's Mermaid theme token module |
| The 1-accent (focal) rule, and the ban on a second chromatic family | Restated as an implementable algorithm, spec §3 |
| The type roles (serif title / sans name / mono technical), their sizes, weights, tracking and case | Restated as a role table, spec §4, with system-font substitution |
| The contrast contract and its thresholds (4.5 text / 3.0 large / 3.0 non-text / decorative exempt) | Spec §2.4, with ratios recomputed against the tokens |
| Geometry and chrome values: 6/8 radii, 2 px tag radius, 0.8/1/1.2/1.4 stroke scale, 8x6 marker, 4 px grid, 22x22 dot pattern, label-mask gap | Spec §5 |
| Per-grammar semantic treatments: decision rhombus, flat store instead of a cylinder, zone frames, sticky notes, actor columns, activation bars, fragment frames, ER header and cardinality | Spec §6 |
| The quality-gate ideas: objective checks on contrast, accent count, radius, stroke, shadow and accessibility | Spec §9, reformulated as assertions that run in Node/jsdom |
| The node-treatment vocabulary (focal / backend / store / external / input / optional / security) | Spec §5.1, mapped onto Mermaid constructs |

### What this plugin does not reuse

| Not reused | Why / what happens instead |
|---|---|
| Fonts (Instrument Serif, Geist, Geist Mono) | Not bundled, not requested from Google Fonts. The plugin uses system serif / sans / mono stacks that preserve the role contrast only. No font file, no `@font-face`, no `@import`, no external stylesheet. |
| Icons and brand silhouettes (Tabler, Simple Icons, log-z, Devicon, one-off marks) | Not copied, not vendored, not redrawn. Mermaid's own shapes are used as-is. |
| The upstream plugin logo and any outlined glyph | Not copied. This plugin has its own `icon.svg`. |
| HTML templates, page furniture (header, summary cards, footer, colophon), CSS files, example `.html` artefacts | Not copied and not linked. Only the *measured numeric values* those artefacts demonstrate were read and restated. |
| Scripts (`verify-contrast.py`, `export_svg.py`, `mermaid_extract.py`, the geometry verifiers, `self_check.py`) | Not copied, not vendored, not imported. The one script that was *executed* (`scripts/verify-contrast.py`) was run in place against the checked-out upstream revision; its output is quoted as measurement, no code is redistributed. |
| The screenshot/asset corpus (about 5.7 MB of PNG/WebP/GIF) | Not copied. No image from upstream appears in this package or in its documentation. |
| The Mermaid *renderer* behaviour of upstream | Upstream has none: it refuses to render Mermaid and hand-authors SVG. All Mermaid-side mapping here was derived independently by rendering the installed `mermaid@12.2.0` and inspecting its output. |
| Upstream's routing/layout algorithm (orthogonal elbows, hand-placed baselines) | Not reproducible in a Mermaid theme; explicitly out of scope in spec §8 and §B.3. |

### What this package adds

The Mermaid-specific mapping is original work, not upstream content: the `themeVariables`/`themeCSS` reach table
(spec §7), the post-render patch list with real mermaid 12.2.0 selectors (§8), the Node-checkable QA assertions (§9),
the per-type `look: "classic"` requirement, the CJK label-classification rule, and the system-font substitution.

## Statement of modification

The upstream design system was **restated and adapted**, not copied verbatim: values are reproduced as data in a
specification; prose was rewritten; no upstream prose, code, markup or binary asset is redistributed. Where the
upstream source and its own shipped examples disagree, the specification says which was followed and why (spec
Appendix B.1). Adaptations to a renderer upstream does not support are marked as inferred (spec Appendix B.2).

## Licence of this package

This plugin keeps its existing licence. This `ATTRIBUTION.md` and `docs/diagram-design-skin-spec.md` are offered under
the same terms as the rest of the package; the derived design values remain attributable to the upstream work above.