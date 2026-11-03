---
ticket_schema: 1
ticket_id: "02"
execution_mode: AFK
blocked_by:
  - "01"
---

# Extensión: casilla «auto-approve» en la cabecera del panel

## Artifact Graph
- Artifact ID: `artifact:pi-web-ui-auto-approve-scripts-setting-02-extension`
- Role: `ticket`
- Parent: [auto-approve-scripts-setting.md](../../specs/auto-approve-scripts-setting.md)

## Parent Spec
[auto-approve-scripts-setting.md](../../specs/auto-approve-scripts-setting.md)

## What to Build
En `pi-web-ui-chrome-extension`: una tercera casilla en la cabecera, junto a `cookies` y
`storage`, que envía `set_auto_approve_scripts` y refleja `autoApproveScriptsEnabled` de
`session_state`. Queda desactivada si el bridge no informa del campo. Spec: Decisiones 5–6,
Criterios de aceptación (Extensión).

## Acceptance Criteria
- [ ] `createInitialState` lleva `autoApproveScriptsEnabled: false` y `autoApproveScriptsSupported: false`.
- [ ] `session_state` actualiza los dos: soportado si la sesión trae el campo booleano. Sin el campo (respuesta a `extension_ui_response`) conserva el último valor; `bridge_disconnected` los apaga.
- [ ] La casilla envía `{ type: 'set_auto_approve_scripts', enabled }`, refleja el estado y queda desactivada sin soporte.
- [ ] El README de la extensión documenta la casilla.
- [ ] Los tests de la extensión pasan, sin fallos nuevos respecto de la base.

## Frontier
Dependency-blocked by 01 (contrato del comando y del campo).

## Gates
- Attempt: de la implementación al handoff, con commit local en la rama de la extensión `feat/auto-approve-scripts-setting`.
- Budget per attempt: none set.
- Time per attempt: none set.
- Maximum attempts: none set.
- Approvals given: el mensaje de Carlo del 03/11 en Telegram que pide el ajuste en la extensión.
- Open: crear el fork de la extensión, subir las ramas a los forks, abrir PRs upstream, instalar el bridge del fork en el Pi local y cargar la extensión sin empaquetar. No bloquean este ticket.
- Exact version: none required.
- Existing blocks found: none (ver la spec).

## Step-by-Step Implementation Plan
1. Test en rojo en `test/sidepanel-state.test.js`: estado inicial, `session_state` con y sin el campo, respuesta `{ handled }` y desconexión.
2. `sidepanel-state.js`: los dos campos.
3. `sidepanel.html`: la casilla. `sidepanel.js`: referencia, `render` y listener.
4. README y verificación.

## Testing Plan
Vitest del repo de la extensión en rojo y en verde, comparado con la base. La parte DOM de `sidepanel.js` no tiene tests en el repo: se revisa a mano y queda la prueba manual de la spec.

## Out of Scope
- Página de opciones y persistencia en `chrome.storage`.
- Publicar en la Chrome Web Store.
