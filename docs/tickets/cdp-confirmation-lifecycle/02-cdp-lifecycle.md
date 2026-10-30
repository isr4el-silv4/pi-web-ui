---
ticket_schema: 1
ticket_id: "02"
execution_mode: AFK
blocked_by: []
---

# Corregir confirmaciones CDP de lectura y solicitudes caducadas

## Artifact Graph
- Artifact ID: `artifact:pi-web-ui-cdp-lifecycle-ticket-02`
- Role: ticket
- Parent: [cdp-confirmation-lifecycle.md](../../specs/cdp-confirmation-lifecycle.md)

## Parent Spec
[cdp-confirmation-lifecycle.md](../../specs/cdp-confirmation-lifecycle.md)

## What to Build
Aplicar la decisión del spec: seis lecturas DOM sin confirmación genérica, y cancelación
propagada entre HTTP/SDK, diálogos y transporte, incluida la vía HTTP alternativa del terminal
(src/index.ts, pi-extension/launcher.ts y bridge-process.ts). No ocultar errores ni perder
la señal de aborto. Traducir los nombres SDK a los nombres del protocolo antes del HTTP.
Preservar autorización para CDP arbitrario.

## Acceptance Criteria
- [ ] Seis métodos DOM exactos no piden permiso; escritura y métodos desconocidos sí.
- [ ] Cancelar o expirar una aprobación impide despacho tardío y retira el diálogo.
- [ ] Timeout, aborto, desconexión y cambio de sesión limpian las esperas sin reintentos.
- [ ] HTTP y SDK propagan cancelación; acciones ya despachadas se declaran de resultado desconocido.
- [ ] Regresiones focalizadas y build/typecheck pasan; hashes instalados coinciden.
- [ ] Se preservan límites y no se afirma activación real ni cancelación dentro de Chrome.

## Frontier
Ready: el usuario ha pedido aplicar la corrección local. No hay dependencias nuevas.

## Gates
- Attempt: preparación hasta handoff de esta corrección local.
- Budget per attempt: none set.
- Time per attempt: none set.
- Maximum attempts: none set.
- Approvals given: «fallo che non lo sopporto», local, sin Autopilot ni delegación.
- Publication, push, PR, merge, browser actions and runtime reload: fuera de alcance/no autorizados.
- Exact version: none required.
- Existing blocks found: ninguno para implementar; activación real mediante reinicio del usuario pendiente.

## Step-by-Step Implementation Plan
1. Validar el ticket y CandidateRef contra el árbol local que conserva las correcciones previas.
2. Añadir regresiones RED y una lista explícita de lecturas, sin modo de permiso general.
3. Propagar AbortSignal y caducidad, limpiar solicitudes y retirar diálogos invalidados.
4. Ejecutar checks causales, build y revisión inline; congelar el candidato.
5. Actualizar solo el paquete instalado y verificar identidad sin reiniciarlo.

## Testing Plan
Pruebas unitarias y de integración HTTP aislada, sin navegador ni proveedor reales;
checks causales de permisos, cancelación, respuesta tardía, desconexión y señal SDK;
build/typecheck, empaquetado e inspección del grafo. No repetir la suite general sin causa.

## Out of Scope
UI Chrome, CDP arbitrario sin aprobación, acciones reales, carrera del chat, payload de /status,
publicación, fork, PR, merge y recarga automática de la sesión activa.
