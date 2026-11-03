# Orígenes de confianza para `Runtime.evaluate` sin confirmación

## Artifact Graph
- Artifact ID: `artifact:pi-web-ui-auto-approve-evaluate-origins-spec`
- Role: spec
- Standalone: true
- Children: [01-auto-approve-evaluate-origins.md](../tickets/auto-approve-evaluate-origins/01-auto-approve-evaluate-origins.md)

## Tipo y objetivo
Decision. Permitir que un agente ejecute `Runtime.evaluate` en las pestañas de las aplicaciones
de prueba del propio usuario sin el diálogo de confirmación, para poder correr UAT desatendidas.
Llevar al fork el parche que hoy vive solo en el `node_modules` instalado. Exponer el bridge
solo en loopback.

## Evidencia
- UAT desatendida de una aplicación de prueba (03/11): cada `debugger.sendCdpCommand` con `Runtime.evaluate` abría un
  diálogo en el panel. El puente HTTP corta `/browser-tool` a los 30 s, así que el agente no
  podía esperar la aprobación.
- Para desbloquearla se parcheó a mano el `dist/bridge/browser-tools.js` instalado, con el
  origen de la aplicación de prueba escrito en el código, y `server.js` pasó a
  escuchar en `127.0.0.1`. Los originales se guardaron como `*.orig-20261103`. Ese parche se
  pierde al reinstalar y no está en ningún repositorio.
- `main()` en `src/bridge/server.ts` escucha en `0.0.0.0`. `/browser-tool` no tiene
  autenticación, y la extensión de Chrome conecta a `127.0.0.1`.
- [cdp-confirmation-lifecycle.md](cdp-confirmation-lifecycle.md) dejó `Runtime.evaluate` con
  confirmación y descartó un modo global. Esta spec no cambia el valor por defecto. Añade una
  excepción explícita y opcional, acotada por origen.

## Decisión
1. Una variable de entorno, `PI_WEB_UI_AUTO_APPROVE_EVALUATE_ORIGINS`, admite una lista de
   orígenes exactos `http(s)` separada por comas. Se ignoran rutas, comodines, otros esquemas y
   entradas que no son URL, de modo que una errata nunca amplía la lista. Si no está definida,
   nada cambia.
2. Solo se aprueba sin diálogo `debugger.sendCdpCommand` con `method === 'Runtime.evaluate'`
   y un `tabId` entero, cuando `tabs.list` dice que esa pestaña está en un origen de la lista.
   Cualquier otro método, herramienta o pestaña sigue pidiendo confirmación, igual que ocurre
   si `tabs.list` falla.
3. La aprobación automática queda en el log de auditoría con `autoApproved: true`.
4. Sin lista configurada, el diálogo se pide sin ningún `await` previo, para conservar la
   semántica de cancelación de la spec anterior.
5. El bridge escucha en `127.0.0.1`.

## Riesgos aceptados
- TOCTOU: la pestaña podría navegar entre `tabs.list` y la evaluación. El riesgo queda acotado
  porque la lista la pone el propio usuario y el bridge solo escucha en loopback.
- Quien controle el entorno del proceso del bridge puede ampliar la lista. Ese proceso ya es
  del usuario.

## Criterios de aceptación
- Con la pestaña en un origen de la lista, `Runtime.evaluate` se ejecuta sin llamar a
  `confirm` y se audita con `autoApproved: true`.
- Con la pestaña en otro origen, aunque comparta prefijo (`https://a.test.evil.test`), se
  pide confirmación y, si se rechaza, no se despacha.
- Con otro método CDP en un origen de la lista, se pide confirmación.
- Sin lista configurada, se pide confirmación y no se llama a `tabs.list`.
- El parser solo acepta orígenes exactos `http(s)`.
- Siguen pasando los tests de ciclo de vida CDP de la spec anterior.
- `main()` escucha en `127.0.0.1`. El README documenta la variable y el loopback.

## Alcance
`src/bridge/browser-tools.ts`, `src/bridge/server.ts`, `src/bridge/test/browser-tools.test.ts`,
`README.md`, esta spec y su ticket.

## No objetivos
- Un interruptor en la UI de la extensión. Aprobaciones recordadas para otros métodos.
- Exenciones para `debugger.evaluateScript`, cookies o storage.
- Instalar el paquete en el Pi local, retirar el parche manual o reiniciar el bridge.
- Abrir un PR upstream o publicar en npm.

## Verificación
- Unit (Vitest): los casos nuevos de `browser-tools.test.ts`, RED antes y GREEN después.
- Regresión: ficheros de permisos, ciclo de vida CDP y servidor. Se compara la suite
  completa con la base para separar los fallos que ya existían.
- Typecheck con `tsc --noEmit`.
- Manual (sin ejecutar aquí): bridge arrancado con la variable, y una UAT con `Runtime.evaluate`
  en el origen de prueba sin diálogo.

## Gates
- Attempt: de la implementación al handoff y el push de la rama al fork.
- Budget per attempt: none set.
- Time per attempt: none set.
- Maximum attempts: none set.
- Approvals given: el mensaje de Carlo «hacer el fork (que creo ya existe) de pi-web-ui» (03/11,
  Telegram) para llevar el cambio al fork `carlitose/pi-web-ui`. Sin Autopilot ni delegación.
- Open: PR upstream a `isr4el-silv4/pi-web-ui`; instalar la build del fork en el Pi local en
  lugar del parche manual; reiniciar el bridge.
- Exact version: none required.
- Existing blocks found: none. Se revisaron `package.json`, `permissions.ts`, `browser-tools.ts`,
  `server.ts`, la spec anterior y las reglas de `.local-ticket/`.

## Orden
1. Ticket 01: implementación, tests y README.
