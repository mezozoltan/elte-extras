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
- Read-only API access. Only the panel's open/closed preference is stored locally.

## Install in Firefox

Requires Firefox 128 or later. This is an unsigned development extension.

1. Download [stuki-history-1.2.zip](packages/stuki-history-1.2.zip) using GitHub's **Download raw file** control, or clone the repository.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…** and choose the ZIP, or choose `manifest.json` from the cloned repository.
4. Reload the Stuki page, sign in normally, and click **History** beside **Theme**.

Click History again, or press Escape inside the panel, to close it. Temporary add-ons are removed when Firefox restarts. Persistent installation in standard Firefox requires Mozilla signing; the included package is not signed.

To update a temporary installation, reload it in `about:debugging` if loading unpacked files, or remove it and load the new ZIP. Then reload the Stuki tab.

[Hungarian installation instructions](TELEPITES.md) · [Mozilla temporary-installation documentation](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/)

## Diagram names

`Main` is the initial function name, not a value forced on every save. Hover over a diagram, click its **F** operation, edit the function heading, then save. The name is stored in `data.structograms[].name`, and this extension displays it.

Speci sends a separate top-level `name` field. Stuki's current save client does not. Server support for a separate Stuki save title has not been verified.

## Development

No build step or runtime dependencies are required. `manifest.json`, `content.js`, and `model.js` are the extension.

Run the portable data-model checks with Node.js:

```sh
node tests/model.test.cjs
```

Repackage with PowerShell:

```powershell
./build.ps1
```

The tests cover version chains, forks, cycles, missing parents, duplicate entries, names, and safe links. Layout, search, authentication errors, server errors, empty results, mobile bounds, and keyboard behavior were also checked in an isolated Chromium browser with the site's actual CSS and mocked API responses. The deployed Stuki client was tested with intercepted requests to confirm custom function names are sent when saving. No authenticated live ELTE account test was performed.

## API and privacy

The extension runs only on `https://progalap.elte.hu/stuki` and its child paths. It reads:

- `GET https://webprogramozas.inf.elte.hu:3000/me` using the existing session.
- `GET https://webprogramozas.inf.elte.hu:3001/structograms` using the returned access token.

There is no telemetry and no save, delete, or account-management functionality. The list endpoint exists and requires authentication; the exact live response format and scope of returned records have not been verified with an authenticated account. Direct arrays and arrays under `structograms`, `items`, or `data` are supported. Unsupported formats produce an error.

This is an independent extension, not an official ELTE add-on. The original site's bundled code and CSS are not included in this repository.
