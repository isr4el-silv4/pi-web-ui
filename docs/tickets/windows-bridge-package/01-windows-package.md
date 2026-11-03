---
ticket_schema: 1
ticket_id: "01"
execution_mode: AFK
blocked_by: []
---

# Distribuir y ejecutar el bridge JavaScript en Windows

## Artifact Graph
- Artifact ID: `artifact:pi-web-ui-windows-bridge-ticket-01`
- Role: ticket
- Parent: [windows-bridge-package.md](../../specs/windows-bridge-package.md)

## Parent Spec
[windows-bridge-package.md](../../specs/windows-bridge-package.md)

## What to Build
Aplicar la decisión de distribución JavaScript del spec: incluir el build en el paquete,
mantener Node como lanzador de producción y corregir TypeBox como peer del host.
Actualizar después únicamente la copia local de pi-web-ui autorizada por el usuario.
Incluir src/bridge/server.ts y sdk-session.ts para corregir entry point e importación de
rutas absolutas en Windows. Incluir windows-runtime.test.ts y los ajustes de tipos mínimos
en server.ts y bridge-process.test.ts necesarios para que el build existente compile.

## Acceptance Criteria
- [ ] npm pack incluye dist/bridge/server.js e imports locales.
- [ ] El lanzador de la distribución usa Node, no npx, y conserva puerto/contexto.
- [ ] El bridge responde en /status en Windows sin abrir navegador ni llamar al modelo.
- [ ] TypeBox no es runtime dependency y su peer es *.
- [ ] La copia instalada coincide con los artefactos verificados.
- [ ] Se documentan límites, comprobaciones no ejecutadas y /reload pendiente.

## Frontier
Ready: el usuario autorizó expresamente la instalación del tooling declarado
únicamente en C:/Users/CGS03/Projects/pi-web-ui.

## Gates
- Attempt: desde preparación hasta handoff de la corrección local.
- Budget per attempt: none set.
- Time per attempt: none set.
- Maximum attempts: none set.
- Approvals given: corregir localmente pi-web-ui y priorizarlo sobre debugpy.
- Approval received: «si autorizo» para instalar el tooling declarado solo en este checkout.
- Publication, push, PR, merge and runtime reload: no autorizados; fuera de alcance.
- Exact version: none required.
- Existing blocks: TypeScript/Vitest no disponibles; npm excluye dist.

## Step-by-Step Implementation Plan
1. Validar el contrato canónico y resolver el gate de instalación.
2. Reproducir RED de empaquetado.
3. Corregir manifiesto/exclusiones y añadir pruebas causales.
4. Compilar, comprobar la distribución y revisar el candidato congelado.
5. Actualizar la instalación local con identidad verificada y probar /status.

## Seguimiento SDK del host
Corregir src/pi-extension/bridge-process.ts para resolver el SDK usando el módulo importado
por el loader del host y getPackageDir. Cubrirlo en host-sdk-resolution.test.ts sin inyectar
el resolver; validar también el bridge empaquetado con el resolver por defecto.
La prueba anterior con ruta explícita no demuestra esta propiedad. Mantener esa evidencia
con su identidad original. Fork, push y PR quedan en pausa: no publicarlos.

## Testing Plan
Contrato de manifiesto y npm pack; pruebas pertinentes del lanzador; build/typecheck;
smoke HTTP local con limpieza; revisión inline. No sustituir acceso real al navegador
por una simulación ni presentar el smoke local como prueba de UI o proveedor.

## Out of Scope
Publicación, PR/merge, actualización de Pi, configuración de Chrome, acceso a páginas
y credenciales, cambios en ai-agent-python-api y el binario CLI independiente.
