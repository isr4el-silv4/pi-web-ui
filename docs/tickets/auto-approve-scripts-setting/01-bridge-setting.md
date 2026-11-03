---
ticket_schema: 1
ticket_id: "01"
execution_mode: AFK
blocked_by: []
---

# Bridge: ajuste de sesión para ejecutar scripts sin confirmación

## Artifact Graph
- Artifact ID: `artifact:pi-web-ui-auto-approve-scripts-setting-01-bridge`
- Role: `ticket`
- Parent: [auto-approve-scripts-setting.md](../../specs/auto-approve-scripts-setting.md)

## Parent Spec
[auto-approve-scripts-setting.md](../../specs/auto-approve-scripts-setting.md)

## What to Build
El comando `set_auto_approve_scripts` y el campo de sesión `autoApproveScriptsEnabled`. Con el
campo encendido, el ejecutor despacha sin confirmación `debugger.evaluateScript` y
`debugger.sendCdpCommand` con `Runtime.evaluate`, y lo audita con `autoApproved: true`. Spec:
Decisiones 1–4, Criterios de aceptación (Bridge).

## Acceptance Criteria
- [ ] `isClientCommand` acepta `set_auto_approve_scripts` solo con `enabled` booleano.
- [ ] El registro de sesiones crea las sesiones con `autoApproveScriptsEnabled: false` y tiene un setter. El servidor atiende el comando y devuelve la sesión.
- [ ] Con el ajuste encendido, `debugger.evaluateScript` y `Runtime.evaluate` se despachan sin `confirm` ni `tabs.list`, con auditoría `autoApproved: true`.
- [ ] Con el ajuste encendido, otro método CDP crudo pide confirmación.
- [ ] Con el ajuste apagado, siguen pasando los tests de orígenes de confianza y de ciclo de vida CDP.
- [ ] README: el ajuste en la tabla de permisos y en el texto de scripts.
- [ ] Typecheck y build pasan. La suite completa no tiene fallos nuevos respecto de la base.

## Frontier
Ready.

## Gates
- Attempt: de la implementación al handoff, con commit local en la rama `feat/auto-approve-scripts-setting`.
- Budget per attempt: none set.
- Time per attempt: none set.
- Maximum attempts: none set.
- Approvals given: el mensaje de Carlo del 03/11 en Telegram que pide el ajuste en la extensión.
- Open: crear el fork de la extensión, subir las ramas a los forks, abrir PRs upstream, instalar el bridge del fork en el Pi local y cargar la extensión sin empaquetar. No bloquean este ticket.
- Exact version: none required.
- Existing blocks found: none (ver la spec).

## Step-by-Step Implementation Plan
1. Tests en rojo: `messages.test.ts` (comando), `session-registry.test.ts` (valor por defecto y setter), `browser-tools.test.ts` (aprobación por ajuste, otro método CDP sigue con aviso).
2. `protocol/messages.ts` y `protocol/sessions.ts`: comando y campo opcional.
3. `session-registry.ts`: valor `false` al crear y `setAutoApproveScripts`.
4. `server.ts`: caso `set_auto_approve_scripts`.
5. `browser-tools.ts`: aprobación síncrona por ajuste antes de la lógica de orígenes.
6. README y verificación (tests focalizados, suite completa contra la base, typecheck, build).

## Testing Plan
Vitest focalizado en rojo y en verde; suite completa comparada con la base (`server.test.ts › handles side panel commands` ya fallaba); `tsc --noEmit` y build. Sin prueba en vivo aquí.

## Out of Scope
- La extensión de Chrome (ticket 02).
- Otros métodos CDP, cookies y storage. Persistencia entre sesiones.
