# Corrección local del bridge de pi-web-ui en Windows

## Artifact Graph
- Artifact ID: `artifact:pi-web-ui-windows-bridge-spec`
- Role: spec
- Standalone: true
- Children: [01-windows-package.md](../tickets/windows-bridge-package/01-windows-package.md)

## Tipo y objetivo
Bug analysis. Corregir la instalación local de `@isr4el-silv4/pi-web-ui` para que el comando
`/pi-web-ui start` pueda arrancar el bridge en Windows sin depender de ejecutar `npx.cmd`
como un binario nativo.

## Evidencia y estado actual
- Fuente: `70129eb8779c41aa9790c92d713709c44606cf4c`, rama `main`, versión 1.0.16.
- La instalación y npm latest consultado tienen la misma versión.
- `.npmignore` excluye `dist/`; la instalación carece de `dist/bridge/server.js`.
- `defaultBridgeEntryPath` termina eligiendo `src/bridge/server.ts`.
- `createBridgeProcessManager().start()` ejecuta `spawn('npx', ...)` para TypeScript.
- Reproducción local: ese spawn devuelve ENOENT; Node y npx mediante cmd.exe funcionan.
- El manifiesto declara `@sinclair/typebox` en dependencies; Pi exige peerDependencies
  con rango `*` para ese paquete proporcionado por el host.
- Documentación primaria consultada: docs/packages.md del Pi instalado y documentación
  Node.js de child_process mediante Context7.

## Decisión y comportamiento objetivo
Distribuir el bridge JavaScript que el lanzador existente ya sabe ejecutar con
`process.execPath`: corregir el filtrado npm y generar el build antes del empaquetado.
Mantener la carga de la extensión por `index.ts` y sus comandos actuales.
Corregir además las rutas del mismo arranque Windows: identificar el entry point mediante
file URL e importar el SDK del host mediante pathToFileURL cuando PI_HOST_PI es una ruta
absoluta. El build original tenía ocho errores de tipos: ajustar las firmas de broadcast,
el tipo de la caché de modelos y dos mocks, sin cambios de lógica ni rebajar el typecheck.
Declarar TypeBox como peer del host y conservarlo como dependencia de desarrollo cuando
sea necesario para compilar y probar. No introducir un shell con interpolación de rutas
como solución al arranque normal de la distribución.

## Alcance y no objetivos
Incluye manifiesto, exclusiones de empaquetado, pruebas causales y artefactos de build
necesarios para actualizar la copia local instalada.
No incluye publicar npm, abrir PR, push, merge, cambiar Pi, cambiar el plugin Chrome,
acceder a páginas/cookies, enviar prompts, migrar SDK ni modificar ai-agent-python-api.
El binario CLI independiente y el flujo de desarrollo sin build no se anuncian como
corregidos si no se ejercitan expresamente.

## Criterios de aceptación
1. El paquete inspeccionado contiene `dist/bridge/server.js` y sus imports locales.
2. El lanzador selecciona JavaScript y Node en vez de npx para la distribución instalada.
3. El bridge local responde en /status; no hace falta abrir Chrome ni enviar prompts.
4. TypeBox no está en dependencies y su peer tiene rango `*`.
5. Se preservan puerto, contexto de inicio y ejecución directa de Node sin shell.
6. Los cambios locales instalados coinciden con los artefactos verificados.
7. Las limitaciones, comprobaciones no ejecutadas y necesidad de /reload son explícitas.

## Seguimiento: SDK ausente en la sesión real
El usuario observó el bridge online pero sin sdkSession y un error de paquete SDK ausente.
La prueba anterior inyectaba resolveHostPiEntry: no cubría el resolver por defecto.
El resolver debe obtener el directorio del SDK mediante getPackageDir del módulo importado
por el loader del host; import.meta.resolve no aplica necesariamente los aliases de Jiti.
Se añadirá una regresión sin sobrescribir el resolver y un smoke con aliases reales del
host. Incluye src/pi-extension/bridge-process.ts y host-sdk-resolution.test.ts.
La publicación del fork/PR queda expresamente en pausa por indicación posterior del usuario.

## Estrategia de verificación
- RED de contrato de empaquetado sobre el manifiesto y lista de archivos actual.
- Tests causales del lanzador existente y de los artefactos publicados.
- Build/typecheck y pruebas pertinentes con las dependencias declaradas.
- Inspección de la lista real de npm pack, no solo del árbol de trabajo.
- Smoke local de /status con limpieza del proceso creado, sin navegador, credenciales
  impresas ni llamadas al proveedor.
- Revisión inline del diff congelado y comprobación de identidad antes de copiar.

## Gates
- Attempt: desde esta preparación hasta el handoff de la corrección local.
- Budget per attempt: none set.
- Time per attempt: none set.
- Maximum attempts: none set.
- Approvals given: corrección local de pi-web-ui, prioridad sobre debugpy; sin Autopilot.
- Approval received: el usuario respondió «si autorizo» a instalar las dependencias de
  desarrollo declaradas únicamente en este checkout para compilar y probar.
- Publication, push, PR, merge and runtime reload: no autorizados; fuera del alcance.
- Exact version: none required by user; la versión observada es contexto, no un pin.
- Existing blocks found: herramientas TypeScript/Vitest no disponibles en los roots
  inspeccionados; la copia npm no contiene dist. Se inspeccionaron manifiesto,
  tsconfig, .npmignore, .gitignore, PATH y resolución de herramientas existentes.

## Orden de implementación
1. Validar este spec y su ticket canónico.
2. Tras la aprobación pendiente, preparar el tooling local.
3. Reproducir el fallo de distribución, corregir el empaquetado y ejecutar checks causales.
4. Simplificar, congelar candidato, revisar inline y aplicar el plan de QA.
5. Actualizar únicamente el paquete local autorizado y comprobar su bridge.
