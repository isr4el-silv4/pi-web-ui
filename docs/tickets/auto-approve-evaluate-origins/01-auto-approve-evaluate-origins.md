---
ticket_schema: 1
ticket_id: "01"
execution_mode: AFK
blocked_by: []
---

# Aprobar `Runtime.evaluate` en orígenes de confianza y escuchar en loopback

## Artifact Graph
- Artifact ID: `artifact:pi-web-ui-auto-approve-evaluate-origins-ticket-01`
- Role: ticket
- Parent: [auto-approve-evaluate-origins.md](../../specs/auto-approve-evaluate-origins.md)

## Parent Spec
[auto-approve-evaluate-origins.md](../../specs/auto-approve-evaluate-origins.md)

## What to Build
Las secciones «Decisión» y «Criterios de aceptación» de la spec. Añadir una política opcional
al ejecutor de herramientas del navegador, leída de `PI_WEB_UI_AUTO_APPROVE_EVALUATE_ORIGINS`,
que apruebe `Runtime.evaluate` sin diálogo cuando la pestaña de destino está en un origen exacto
de la lista. Hacer que el bridge escuche en `127.0.0.1` y documentar las dos cosas en el README.

## Acceptance Criteria
- [ ] Pestaña en un origen de la lista: se ejecuta sin `confirm` y se audita con `autoApproved: true`.
- [ ] Pestaña en otro origen, aunque comparta prefijo: se pide confirmación y no se despacha si se rechaza.
- [ ] Otro método CDP en un origen de la lista: se pide confirmación.
- [ ] Sin lista configurada: se pide confirmación sin llamar a `tabs.list`.
- [ ] El parser solo acepta orígenes exactos `http(s)`, sin rutas, comodines ni otros esquemas.
- [ ] Los tests de ciclo de vida CDP siguen pasando, y la suite completa no tiene fallos nuevos respecto a la base.
- [ ] `main()` escucha en `127.0.0.1`. El README documenta la variable y el loopback.

## Frontier
Ready.

## Gates
- Attempt: de la implementación al handoff y el push de la rama al fork.
- Budget, time and maximum attempts per attempt: none set.
- Approvals given: «hacer el fork (que creo ya existe) de pi-web-ui» (Carlo, 03/11) para llevar el cambio a `carlitose/pi-web-ui`.
- Open: PR upstream, instalación local de la build del fork y reinicio del bridge.
- Exact version: none required.
- Existing blocks found: none.

## Step-by-Step Implementation Plan
1. Tests RED en `src/bridge/test/browser-tools.test.ts` para los cinco comportamientos nuevos.
2. `parseAutoApproveEvaluateOrigins` y `BrowserToolPolicy` en `src/bridge/browser-tools.ts`. Una precondición síncrona, que evita el `await` cuando no hay lista, y una comprobación del origen con `tabs.list` que, si falla, deja el diálogo.
3. `server.ts`: construir la política una vez a partir del entorno y pasarla al ejecutor. Escuchar en `127.0.0.1`.
4. README: documentar la variable y el loopback en «Permissions & Safety».

## Testing Plan
- Vitest focalizado: `browser-tools`, `permissions*`, `cdp-*lifecycle`, `server*`.
- La suite completa, antes y después, para comparar fallos con la base.
- `tsc --noEmit`.
- Manual, sin ejecutar aquí: bridge arrancado con la variable y una UAT sin diálogo.

## Out of Scope
- Un interruptor en la UI, y exenciones para `debugger.evaluateScript`, cookies o storage.
- Instalar en el Pi local, retirar el parche manual o reiniciar el bridge.
- PR upstream y publicación en npm.
