# Security policy

## The short version

This plugin has no credentials of its own. It does not ask for API keys, it
does not read the Harness credentials, and it does not talk to any
third-party server. Its whole surface is: the files in your workspace and the
one line it adds to your profile's patch file.

| What | Where it lives | How to change it |
| --- | --- | --- |
| plugin bundle row | `<profile>/cordis.patch.yml` | remove the `workspace-file-preview` entry |
| pinned files | the browser's `localStorage`, key `wfp-pinned::<workspace>` | clear the site data, or unpin the file |

There is no token to rotate, because no token is issued.

## What the plugin can reach

* **The workspace.** File reads and writes go through the Harness file API.
  The host half refuses relative paths, any path containing `..`, paths that
  are not regular files, and writes larger than 4 MB.
* **The file tree.** The context menu can create, rename, move, copy and
  delete files in the workspace. Those operations run with the privileges of
  the Harness process, so the plugin is exactly as trusted as the agent that
  drives it.
* **The browser tab.** The client half renders file content, and the
  annotation UI injects a small element-picker script into the HTML/SVG page
  it displays. It only reads the page you are looking at and posts the
  selection back into the Harness window.

## What it does not do

* No outbound network calls. Markdown, Mermaid, video playback and the
  annotation UI are rendered locally in the browser.
* No telemetry, no analytics, no crash reporting.
* No reading of `~/.dsh/credentials.yaml` or any other credential store.
* No background processes, no scheduled tasks, no daemons.

## Bundled third-party code

The published bundles inline MIT-licensed browser libraries (mermaid, marked,
turndown and mermaid's dependency tree). They run inside the browser tab
alongside the rest of the Harness UI, with the same origin and the same
privileges. See the README for the full list and the license texts.

## Reporting a problem

Please report security issues privately through GitHub's
[security advisory](https://docs.github.com/en/code-security/security-advisories)
form for this repository rather than opening a public issue.
