# Manual Test Checklist

- Run `npm test` and `npm run build`.
- Run `/pi-web-ui start` from terminal Pi once command registration is wired in host Pi.
- Confirm Chrome opens `http://localhost:43117/open`.
- Load `chrome-extension/` as an unpacked MV3 extension.
- Click the extension button and verify side panel opens.
- Stop bridge and verify offline instructions appear.
- Start bridge and verify side panel shows online/debug mode.
- Create a new session with cwd.
- Toggle cookies/storage and verify session state updates.
- Ask for current page text/html/selection/screenshot.
- Ask for console logs and network requests after capture starts.
- Attempt cookies before toggle and verify blocked.
- Attempt raw CDP/evaluate and verify confirmation/audit policy path before allowing in production.
