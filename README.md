# pi-web-ui

Chrome side-panel UI and local bridge extension for Pi.

## Current phase

Phase 2 Pi extension launcher foundation:

- TypeScript package metadata
- Shared protocol types
- Build and test scripts
- Planned runtime directories for Pi extension, bridge, protocol, and Chrome extension
- Test-covered launcher command parsing
- Test-covered bridge process spawning with terminal context defaults
- Test-covered Chrome opener
- Bridge start-context parsing
- Bridge session registry
- HTTP `/status`, `/open`, and `/command` endpoints
- WebSocket command handling for the side panel
- Chrome MV3 side panel MVP
- Extension bridge WebSocket client
- Initial browser tool executor for tabs/page/debugger operations
- Bridge-side permission enforcement for browser tools
- Console and network capture buffers
- Extension UI adapter for confirm/input/notify flows
- Audit log primitive for sensitive browser actions
- SDK session host adapter seam
- Pi SDK adapter using `DefaultResourceLoader`, extension/skill loading hooks, and browser custom tool definitions
- CLI binary entrypoint for local `/pi-web-ui` style command integration
- Side panel execution path for bridge `browser_tool_request` messages

## Development

```bash
npm install
npm test
npm run build
```

## Planned command

```text
/pi-web-ui start
```

See [PLAN.md](./PLAN.md) for the full implementation plan.
