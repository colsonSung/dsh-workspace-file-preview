# dsh-workspace-file-preview

The package half of **Workspace File Preview** for DeepSeek Harness. Install it
from the repository root with `./install.sh <profile>` — installing the package
on its own leaves the Harness without the bundle row that loads it. The
user-facing documentation is the [repository README](../README.md).

## Layout

| Path | What it is |
| --- | --- |
| `index.js` | host half: file commands, session title commands, the model route |
| `host-ai.js` | the two model calls the page is allowed to make (annotation draft, side-chat answer) |
| `paths.js` | the path helpers shared by both halves |
| `client.js` | client half: the document previews, the file tree, the diagram figure |
| `client.mermaid.js` | lazy chunk: Mermaid itself |
| `client.editor.js` | lazy chunk: marked + turndown, only for the Markdown editor |
| `src/` | source of the three bundles |
| `test/` | `node --test` suite, no browser required |
| `locale/` | the zh / en dictionaries |
| `ATTRIBUTION.md` | upstream licence and reuse scope for the diagram skin |
| `docs/diagram-design-skin-spec.md` | the design spec the diagram renderer implements |

## Host half

`index.js` exports `inject = ['commands', 'fs', 'sessionTitle']` and registers:

* `/wfp-save` — write edited Markdown back to a file;
* `/wfp-fs` — `mkdir`, `create`, `rename` / `move`, `copy`, `delete` for
  the file-tree context menu;
* `/rename` and `/retitle` — session title commands;
* `POST /api/workspace-file-preview` — the annotation draft and the side-chat
  question, through the ```connection``` service when the Harness mounts it.

The route and the AI features read the `llm` and `agentDefaultModel` services
per request, so a profile without a model simply reports that AI assist is
unavailable; every other surface keeps working.

## Client half

The Harness client loader evaluates a bundle through
`window.__ModuleLoader__.load({ id, chunk?, factory })`. The id **is** the
package name, and the document-preview ids this plugin registers are built from
the same string — a mismatch shows up as "loaded without registering" or as
previews that never appear. `npm run build` reads the name from
`package.json`; a release build overrides it:

```bash
WFP_PACKAGE_NAME=dsh-workspace-file-preview npm run build
```

## Build and test

```bash
npm install
npm test          # 130 tests: skin tokens, SVG pass, host guards, preview wiring
npm run build     # writes client.js / client.editor.js / client.mermaid.js here
```

The committed bundles are the ones that shipped in v1.3.0. Rebuild and commit
them together with any change under `src/` — the installer runs no build step.

## Licence

MIT. The diagram skin derives from MIT-licensed diagram-design; see
`ATTRIBUTION.md` for the notice, the pinned revision and exactly what is
reused.
