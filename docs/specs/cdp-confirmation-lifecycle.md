# Confirmaciones CDP acotadas y cancelación de solicitudes

## Artifact Graph
- Artifact ID: `artifact:pi-web-ui-cdp-lifecycle-spec`
- Role: spec
- Standalone: true
- Children: [02-cdp-lifecycle.md](../tickets/cdp-confirmation-lifecycle/02-cdp-lifecycle.md)

## Tipo y objetivo
Bug analysis. Corregir localmente el bucle de confirmaciones de lectura y evitar que una
aprobación tardía ejecute una solicitud cuyo cliente ya dejó de esperar.

## Evidencia
- El usuario identifica el aviso `debugger.sendCdpCommand` y pide «fallo che non lo sopporto».
- `evaluateBrowserToolPermission` exige confirmación para cualquier método CDP.
- El adaptador de diálogos no caduca ni cancela solicitudes. El handler HTTP no enlaza
  la desconexión del cliente con la operación pendiente.
- Reproducción aislada sobre el paquete instalado: dos llamadas piden dos permisos;
  tras abandonar la espera, aceptar el diálogo anterior todavía despacha la operación.
- Chrome 1.4.0 ya retira diálogos al recibir `extension_ui_request_timeout`.

## Decisión
1. Eximir de confirmación únicamente seis métodos de lectura de DOM: `DOM.getDocument`,
   `DOM.describeNode`, `DOM.getAttributes`, `DOM.getOuterHTML`, `DOM.querySelector` y
   `DOM.querySelectorAll`. Coincidencia exacta del campo `params.method`, sin prefijos.
   Son lecturas equivalentes al acceso de página ya permitido, no un permiso CDP general.
2. Métodos desconocidos, escritura, `Runtime.evaluate`, evaluación de scripts, cookies y
   storage conservan sus controles. No recordar aprobaciones peligrosas ni crear un modo global.
3. Propagar AbortSignal desde HTTP y la ejecución de herramientas SDK hasta confirmación
   y transporte, incluida la vía HTTP alternativa del terminal. Esta vía propaga abortos,
   tiene un plazo de 30 segundos y devuelve errores explícitos, no éxitos vacíos.
   Una desconexión HTTP antes del despacho invalida el diálogo, informa a
   Chrome para retirarlo y hace imposible aprobarlo después.
4. Las solicitudes pendientes tienen plazo de 30 segundos. Cancelación, timeout,
   desconexión del navegador, aborto del agente y cambio de sesión limpian recursos.
5. No reintentar automáticamente. Si la acción ya se despachó, su resultado es desconocido:
   no se promete deshacerla ni cancelarla dentro de Chrome.

## Invariantes y contrato
- Verificar cancelación antes y después de esperar una aprobación y antes del despacho.
- Registrar las esperas antes de emitir solicitudes; aceptar cada respuesta como máximo una vez.
- Reutilizar el evento de caducidad entendido por el cliente instalado; para una solicitud
  invalidada el cliente actual puede mostrar «Dialog timed out» aunque la causa sea cancelación.
- Preservar JSON de solicitudes/respuestas y comandos de Chrome existentes.
- No llamar a un navegador real, proveedor o acción de negocio durante la verificación.
- Mantener las correcciones previas de Windows, empaquetado y resolución SDK.

## Criterios de aceptación
1. Los seis métodos DOM de lectura no abren diálogos; variantes, métodos ausentes y comandos
   mutables siguen requiriendo confirmación. Cookies/storage continúan bloqueados sin opt-in.
2. Una solicitud cancelada mientras espera aprobación no se despacha aunque llegue un OK tardío;
   el diálogo se retira y su ID deja de ser válido.
3. Expirar, desconectar y cancelar libera timers/listeners y promesas; una respuesta tardía
   no reactiva la operación ni genera una segunda ejecución.
4. Una desconexión HTTP se propaga al ejecutor; una señal SDK se transmite a las herramientas.
5. Tests focalizados y build/typecheck pasan; la copia local instalada coincide con el build.
6. Se distinguen la simulación, la instalación y la activación real; no se anuncia seguridad
   global, estabilidad de toda la UI ni cancelación de acciones ya ejecutadas.

## Alcance
`permissions.ts`, `browser-tools.ts`, `browser-client.ts`, `extension-ui-adapter.ts`,
`server.ts`, `sdk-session.ts`, `src/index.ts`, `pi-extension/launcher.ts`,
`pi-extension/bridge-process.ts`, `.npmignore`, pruebas causales y estos artefactos.
Excluir los tarballs locales antiguos: no deben entrar dentro de la nueva distribución. Actualización del paquete
local instalado autorizada por la petición de aplicar la corrección local.

## No objetivos
No cambiar la extensión Chrome instalada, no quitar confirmación a JavaScript arbitrario,
no acceder a páginas o datos, no corregir aquí la carrera de cambio de sesión del chat ni
el tamaño de `/status`, no publicar, fork, push, PR ni merge.

## Verificación
Regresiones unitarias de permisos, diálogos, despacho y desconexión; integración HTTP local
con ejecutor simulado, sin SDK/proveedor real; typecheck/build; grafo documental y empaquetado;
revisión inline del candidato congelado. Preservar los resultados anteriores, incluidos los
10 fallos de la suite general; no repetirla automáticamente. No hay script de lint en package.json:
typecheck cubre el control estático disponible, sin añadir herramientas.

## Gates
- Attempt: preparación hasta handoff de esta corrección local.
- Budget per attempt: none set.
- Time per attempt: none set.
- Maximum attempts: none set.
- Approvals given: «fallo che non lo sopporto» para aplicar localmente la corrección diagnosticada;
  mantener fork y PR en pausa. Sin Autopilot ni delegación.
- Publication, push, PR, merge, browser actions and runtime reload: no autorizados, fuera de alcance.
- Exact version: none required; versiones observadas solo identifican el entorno.
- Existing blocks found: none for local implementation; se revisaron instrucciones locales,
  package.json, permisos, adaptadores y handler HTTP. La activación del proceso actual queda
  pendiente de un reinicio del bridge por el usuario; instalar archivos no recarga módulos.

## Orden
1. Validar spec, ticket canónico, identidad y árbol base sin tocar el índice del usuario.
2. Escribir regresiones causales RED, implementar y ejecutar las comprobaciones focalizadas.
3. Simplificar, congelar, revisar inline y completar el plan de QA con recibos reales.
4. Actualizar solo archivos propios del paquete local y comprobar sus hashes, sin reiniciar.
