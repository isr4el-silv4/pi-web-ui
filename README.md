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
