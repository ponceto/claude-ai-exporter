# CLAUDE AI EXPORTER

A tool that exports a Claude.ai conversation to a markdown file and downloads every file Claude generated during it. It comes in two forms sharing the exact same code: a standalone JavaScript snippet you paste into the browser console (no install, no dependencies), and a Chrome/Firefox extension that triggers the export from a toolbar button.

## WHAT IT DOES

  - Saves the full conversation as a `.md` file, named after the conversation title.
  - Collects every file Claude generated in the conversation (markdown, code, PDF, etc.), in its current version, under its original filename and with binary content preserved.
  - By default bundles the `.md` and all generated files into a single `.zip` download. Set `BUNDLE_AS_ZIP = false` at the top of the script to download each file individually instead.
  - Skips the model's internal reasoning and tool steps, as well as the files you uploaded yourself.

The exported `.md` starts with the conversation title, then lists every message in order, alternating `## Human` and `## Assistant` headings. The markdown produced by Claude (code blocks, lists, headings) is kept as-is.

## REQUIREMENTS

  - A browser logged in to claude.ai (the script reuses your session cookies).
  - An open Claude.ai conversation page (`https://claude.ai/chat/...`).

The script is a single async function with no dependencies and no build step; used as a console snippet, there is nothing to install. The browser extension is optional and is built from the same script (see below).

## USAGE AS A CONSOLE SNIPPET

  1. Open the conversation you want to export at `https://claude.ai/chat/...`.
  2. Open the browser developer console (F12, *Console* tab).
  3. Copy the entire contents of [`src/claude-ai-exporter.js`](src/claude-ai-exporter.js), paste it into the console, and press Enter.
  4. A single `.zip` named after the conversation is downloaded, containing the `.md` and every generated file. (With `BUNDLE_AS_ZIP = false`, the files download one by one and the browser may ask permission for multiple downloads.)

A summary line is printed to the console, for example:

```
claude-ai-exporter: 12 message(s), 3 file(s) -> "my-conversation.zip" : my-conversation.md, report.md, chart.svg
```

## USAGE AS A BROWSER EXTENSION

The extension runs the exact same script (`src/claude-ai-exporter.js`, copied unmodified at build time), so the behavior and the output are identical to the console snippet. It only requests the `activeTab` and `scripting` permissions: it can only act on the tab you click it on, and does nothing outside `claude.ai`.

Build the packages (requires `make` and `zip`):

```
make
```

This assembles `dist/chrome/` and `dist/firefox/` and produces `dist/claude-ai-exporter-chrome.zip` and `dist/claude-ai-exporter-firefox.zip`. Each browser can also be built separately (`make build-chrome`, `make build-firefox`), and `make clean` removes `dist/`.

To load it:

  - **Chrome**: open `chrome://extensions`, enable *Developer mode*, click *Load unpacked* and select `dist/chrome/`.
  - **Firefox**: open `about:debugging#/runtime/this-firefox`, click *Load Temporary Add-on* and select `dist/firefox/manifest.json`. (Temporary add-ons are removed when Firefox closes; a permanent install requires signing the zip through addons.mozilla.org.)

Then open the conversation you want to export and click the extension icon: the download starts immediately and the summary line is printed to the page console.

## HOW IT WORKS

The script reads the conversation UUID from the page URL, finds the organization that owns the conversation by trying each one returned by `/api/organizations` until the conversation responds (a failure on one organization never aborts the search), then fetches the conversation through Claude.ai's internal API:

```
GET /api/organizations/{org}/chat_conversations/{conversation}?tree=True&rendering_mode=messages
```

For the generated files, it queries the conversation's "wiggle" workspace (note the path uses `conversations`, not `chat_conversations`):

```
GET /api/organizations/{org}/conversations/{conversation}/wiggle/list-files
GET /api/organizations/{org}/conversations/{conversation}/wiggle/download-file?path=...
```

`list-files` returns the workspace paths. The files Claude generated are the ones under `/mnt/user-data/outputs/`; each is fetched via `download-file`. All calls run same-origin with your session cookies, which is why you must be logged in.

When `BUNDLE_AS_ZIP` is enabled, the files are packaged into a `.zip` by a small built-in ZIP writer (store method, no compression). It is implemented inline so the script stays dependency-free; no external library is loaded. If the content exceeds the ZIP32 limits (65535 entries, 4 GiB per file or in total), the script falls back to downloading each file individually instead of producing a corrupt archive.

## LIMITATIONS

The `.md` contains only the conversational text. The model's reasoning and its tool steps are removed.

## DISCLAIMER

The result is absolutely not guaranteed. This tool relies entirely on Claude.ai's internal, undocumented API, which is not a public interface: it can change, break, or be removed at any time without notice, and the script may then stop working, export incomplete data, or fail silently. It is provided as-is, with no warranty of any kind (see the license below). Always check the exported content against the original conversation, and use the tool only on accounts and data you are allowed to access.

## LICENSE

This project is released under the terms of the General Public License version 2.

```
claude-ai-exporter - Copyright (c) 2026 - Olivier Poncet

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 2 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>
```

