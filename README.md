# Stuki History

A Firefox extension that adds a saved-diagram history panel to [ELTE's Stuki editor](https://progalap.elte.hu/stuki/).

![History panel](docs/preview.png)

## Features

- History toggle beside the editor's Theme button, styled by the site's own CSS.
- Yellow panel below the header, shifting only the toolbar and diagram workspace on desktop.
- Search saved diagrams by name, UUID, or date.
- Expand earlier versions linked by `prev_id`, with the current version highlighted.
- Refresh after the saved UUID changes, every 30 seconds while visible and open, or manually.
- Reuses the editor's login session. Passwords are never requested by the extension; access tokens and diagram lists are not persisted.
- First-save naming dialog for new documents, including Ctrl+S. The chosen name is applied to the first function before invoking the editor’s own Save action.
- Only the panel’s open/closed preference is stored locally.

## Install in Firefox

Requires Firefox 128 or later. This is an unsigned development extension.

1. Download [stuki-history-1.3.0.zip](packages/stuki-history-1.3.0.zip) using GitHub's **Download raw file** control, or clone the repository.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…** and choose the ZIP, or choose `manifest.json` from the cloned repository.
4. Reload the Stuki page, sign in normally, and click **History** beside **Theme**.

Click History again, or press Escape inside the panel, to close it. Temporary add-ons are removed when Firefox restarts. Persistent installation in standard Firefox requires Mozilla signing; the included package is not signed.

To update a temporary installation, reload it in `about:debugging` if loading unpacked files, or remove it and load the new ZIP. Then reload the Stuki tab.

[Hungarian installation instructions](TELEPITES.md) · [Mozilla temporary-installation documentation](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/)

## Diagram names

Click **Save** (or press **Ctrl+S**) on a new document to enter a name. Confirm with **Mentés** or Enter. Cancel or Escape leaves the document unsaved. Blank names are rejected. The first function is renamed in the editor before the normal save runs; its heading stays hidden if it was hidden before. Subsequent saves of the same document do not ask again.

The name is stored in `data.structograms[].name`, and History displays it. You can still change it manually using the diagram’s **F** operation.

Speci sends a separate top-level `name` field. Stuki's current save client does not. Server support for a separate Stuki save title has not been verified.

## Development

No build step or runtime dependencies are required. `manifest.json`, `content.js`, and `model.js` are the extension.

Run the portable data-model checks with Node.js:

```sh
node tests/model.test.cjs
```

The save-dialog integration test requires Playwright and a locally downloaded copy of the deployed Stuki JavaScript bundle. The bundle is intentionally excluded from the repository. All network requests are intercepted:

```powershell
npm install
npx playwright install chromium
$env:STUKI_BUNDLE_PATH = 'C:/path/to/stuki-client.js'
npm run test:integration
```

Optionally set `TEST_BROWSER_PATH` to an installed Chromium executable. Repackage with PowerShell:

```powershell
./build.ps1
```

The tests cover version chains, forks, cycles, missing parents, duplicate entries, names, and safe links. Layout, search, authentication errors, server errors, empty results, mobile bounds, and keyboard behavior were also checked in an isolated Chromium browser with the site's actual CSS and mocked API responses. The deployed Stuki client was tested with intercepted requests to verify the first-save dialog, Ctrl+S, blank-name validation, cancel, Enter submission, exactly one save per confirmation, name persistence, version linking, preserving a hidden function header, and retrying a failed first save. No authenticated live ELTE account test was performed.

## API and privacy

The extension runs only on `https://progalap.elte.hu/stuki` and its child paths. It reads:

- `GET https://webprogramozas.inf.elte.hu:3000/me` using the existing session.
- `GET https://webprogramozas.inf.elte.hu:3001/structograms` using the returned access token.

There is no telemetry, deletion, or account-management functionality. When you explicitly confirm a first save, the extension renames the first function through the editor’s own controls and invokes its existing Save action. The editor then performs its normal authenticated `POST /structograms`; the extension does not construct a separate save request. The list endpoint exists and requires authentication; the exact live response format and scope of returned records have not been verified with an authenticated account. Direct arrays and arrays under `structograms`, `items`, or `data` are supported. Unsupported formats produce an error.

This is an independent extension, not an official ELTE add-on. The original site's bundled code and CSS are not included in this repository.
