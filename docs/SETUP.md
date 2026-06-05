# pi-web-ui setup

## Install dependencies

```bash
npm install
npm run build
```

## Run bridge from this package

```bash
PI_WEB_UI_START_CONTEXT='{"cwd":"'"$PWD"'","permissionMode":"debug","cookieAccessEnabled":false,"storageAccessEnabled":false,"port":43117}' node dist/bridge/server.js
```

Or use the CLI after build:

```bash
node dist/pi-extension/cli.js start
```

## Load Chrome extension

1. Open `chrome://extensions`.
2. Enable Developer Mode.
3. Click Load unpacked.
4. Select `chrome-extension/` from this repository.
5. Click the Pi Web UI extension icon to open the side panel.

## Validate

Run:

```bash
npm test
npm run build
```

Then follow `MANUAL_TEST_CHECKLIST.md`.
