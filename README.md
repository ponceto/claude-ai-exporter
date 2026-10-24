# CLAUDE AI EXPORTER

A tool that exports a Claude.ai conversation to a markdown file and downloads every file exchanged during it: the files Claude generated as well as the files you provided. It comes in two forms sharing the exact same code: a standalone JavaScript snippet you paste into the browser console (no install, no dependencies), and a Chrome/Firefox extension that triggers the export from a toolbar button.

## WHAT IT DOES

  - Saves the full conversation as a `.md` file, named after the conversation title (letters and digits kept, every other run of characters replaced by `-`, cut to 80 characters; `conversation` if the title is empty).
  - Collects every file Claude generated in the conversation (markdown, code, PDF, etc.), that is every file it saved to its outputs folder, in its current version, under its original filename and with binary content preserved. Characters unsafe in a file name (such as `\`, `:` or control characters) are replaced by `_`, very long names are shortened, files from subfolders are placed directly in their export folder, and names that clash (including by case only) get a `-1`, `-2`... suffix.
  - Collects the files you provided to the conversation (texts, PDF, images, etc.) the same way, including the pasted texts (exported as files, named after the paste or `paste.txt`).
  - By default bundles everything into a single `.zip` download: the `.md` at the root, the generated files under `outputs/` and the provided files under `uploads/`. Set `BUNDLE_AS_ZIP = false` at the top of the script to download each file individually instead (flat names, de-duplicated).
  - Skips the model's internal reasoning and tool steps.

The exported `.md` starts with the conversation title, then lists every message of the displayed thread in order, each under a `## Human` or `## Assistant` heading (messages without text are skipped; a message from any other sender is headed with that sender's name, or `## Unknown`). The markdown produced by Claude (code blocks, lists, headings) is kept as-is, except that runs of blank lines outside code blocks are collapsed and code blocks left empty by the removed tool steps are dropped.

## REQUIREMENTS

  - A browser logged in to claude.ai (the script reuses your session cookies).
  - An open Claude.ai conversation page (`https://claude.ai/chat/...`).

The script is a single async function with no dependencies and no build step; used as a console snippet, there is nothing to install. The browser extension is optional and is built from the same script (see below).

## USAGE AS A CONSOLE SNIPPET

  1. Open the conversation you want to export at `https://claude.ai/chat/...`.
  2. Open the browser developer console (F12, *Console* tab).
  3. Copy the entire contents of [`src/claude-ai-exporter.js`](src/claude-ai-exporter.js), paste it into the console, and press Enter. (On first use, Chrome and Firefox block pasting into the console until you type `allow pasting`.)
  4. A single `.zip` named after the conversation is downloaded, containing the `.md` and every collected file. (With `BUNDLE_AS_ZIP = false`, the files download one by one and the browser may ask permission for multiple downloads.)

A summary line is printed to the console, for example:

```
claude-ai-exporter: 12 message(s), 4 file(s) -> "my-conversation.zip" : my-conversation.md, outputs/report.md, outputs/chart.svg, uploads/data.pdf
```

## USAGE AS A BROWSER EXTENSION

The extension runs the exact same script (`src/claude-ai-exporter.js`, copied unmodified at build time), so the behavior and the output are identical to the console snippet. It only requests the `activeTab` and `scripting` permissions: it can only act on the tab you click it on, and does nothing outside `claude.ai`.

Build the packages (requires `make`, `bash` and `zip`):

```
make
```

This assembles `tmp/chrome/` and `tmp/firefox/` (the folders you load) and produces `tmp/claude-ai-exporter-chrome.zip` and `tmp/claude-ai-exporter-firefox.zip` (the packages for store submission or signing). Options such as `BUNDLE_AS_ZIP` are set in `src/claude-ai-exporter.js`: edit it and rebuild for the extension to pick them up. Each browser can also be built separately (`make build-chrome`, `make build-firefox`), and `make clean` removes `tmp/`.

To load it:

  - **Chrome**: open `chrome://extensions`, enable *Developer mode*, click *Load unpacked* and select `tmp/chrome/`.
  - **Firefox**: open `about:debugging#/runtime/this-firefox`, click *Load Temporary Add-on* and select `tmp/firefox/manifest.json`. (Requires Firefox 142 or later. Temporary add-ons are removed when Firefox closes; a permanent install requires signing the zip through addons.mozilla.org.)

Then open the conversation you want to export and click the extension icon: the download starts once everything has been fetched (nothing is shown meanwhile), and the summary line is printed to the page console. The icon does nothing on a page outside `https://claude.ai/`.

## HOW IT WORKS

The script reads the conversation UUID from the page URL, finds the organization that owns the conversation by trying each one returned by `/api/organizations` until the conversation responds (a failure on one organization never aborts the search), then fetches the conversation through Claude.ai's internal API:

```
GET /api/organizations/{org}/chat_conversations/{conversation}?tree=True&rendering_mode=messages
```

For the generated and provided files, it queries the conversation's "wiggle" workspace (note the path uses `conversations`, not `chat_conversations`):

```
GET /api/organizations/{org}/conversations/{conversation}/wiggle/list-files
GET /api/organizations/{org}/conversations/{conversation}/wiggle/download-file?path=...
```

`list-files` returns the workspace paths. The files Claude generated are the ones under `/mnt/user-data/outputs/` and the files you provided are under `/mnt/user-data/uploads/`; each is fetched via `download-file` and lands in the matching `outputs/` or `uploads/` folder of the archive. Pasted texts are not materialized in that workspace: they are read from the conversation payload itself (`attachments[].extracted_content`) and exported under `uploads/` too, unless a workspace file with the same name was already exported (the original file wins over its extracted text; unnamed pastes are always exported). All calls run same-origin with your session cookies, which is why you must be logged in.

When `BUNDLE_AS_ZIP` is enabled, the files are packaged into a `.zip` by a small built-in ZIP writer (store method, no compression). It is implemented inline so the script stays dependency-free; no external library is loaded. If the content exceeds the ZIP32 limits (65535 entries, 65535 bytes per file name, 4 GiB per file or for the whole archive), the script falls back to downloading each file individually (the browser may then ask permission for multiple downloads) instead of producing a corrupt archive.

## TROUBLESHOOTING

Every message printed to the console starts with `claude-ai-exporter:`. Errors stop the export; warnings do not.

  - `No conversation detected in the URL...`: the current page is not a conversation; open one at `https://claude.ai/chat/...`.
  - `Could not fetch organizations...`: you are not logged in, your session has expired, or claude.ai did not answer normally; log in again and retry.
  - `No organization found on this account.`, `No usable organization found on this account.`: the account has no organization the script can query.
  - `Access to the conversation was denied...`: every organization refused access; your session may have expired (log in again and retry), or your account has no rights on this conversation.
  - `Conversation not found in any of your organizations.`: none of your organizations gives access to this conversation.
  - `Unexpected response from claude.ai...`: a server error, a network error, a login page instead of data, or a change in the internal API.
  - `Current message unknown...` / `Current message not found...` (warning): the displayed thread could not be identified, so the `.md` contains every branch of the conversation (edited and regenerated messages included), in raw order.
  - `Cycle detected in the message tree...` (warning): the conversation data is inconsistent; the `.md` may miss the start of the thread.
  - `No conversation text to export.` (warning): no message has text; only the files are exported.
  - `Nothing to export.`: no text and no file were found.
  - `Files list unavailable (wiggle).`, `Error while downloading ...` (warning): the workspace files, or one of them, could not be fetched; the rest of the export goes on.
  - `Content exceeds ZIP32 limits, downloading files individually.` (warning): see above.

## LIMITATIONS

The `.md` contains only the conversational text. The model's reasoning and its tool steps are removed.

Pasted texts and extracted documents are taken from the displayed thread only: a paste made in a message you later edited away is not exported, whereas the workspace files are.

When a provided document (a PDF, for example) is not found in the workspace, its extracted text is exported instead, under the document's original name: `uploads/report.pdf` is then a plain-text file despite its extension.

Images attached purely for viewing (never materialized in the conversation workspace) are not exported: they exist in neither the workspace listing nor the extracted attachments.

## DISCLAIMER

The result is absolutely not guaranteed. This tool relies entirely on Claude.ai's internal, undocumented API, which is not a public interface: it can change, break, or be removed at any time without notice, and the script may then stop working, export incomplete data, or fail silently. It is provided as-is, with no warranty of any kind (see the license below). Always check the exported content against the original conversation, and use the tool only on accounts and data you are allowed to access.

## LICENSE

This project is released under the terms of the GNU General Public License version 2 or (at your option) any later version.

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
along with this program.  If not, see <http://www.gnu.org/licenses/>.
```

