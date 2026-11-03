# Ajuste del panel para ejecutar scripts de página sin confirmación

## Artifact Graph
- Artifact ID: `artifact:pi-web-ui-auto-approve-scripts-setting-spec`
- Role: spec
- Standalone: true
- Children: [01-bridge-setting.md](../tickets/auto-approve-scripts-setting/01-bridge-setting.md), [02-extension-checkbox.md](../tickets/auto-approve-scripts-setting/02-extension-checkbox.md)

## Tipo y objetivo
Feature. El usuario puede quitar desde el panel lateral de Chrome el aviso de confirmación que
salta cada vez que un agente ejecuta un script en la página. Es un ajuste explícito, apagado por
defecto, como los de cookies y storage. Hoy, la única forma de evitar el aviso es la variable de
entorno `PI_WEB_UI_AUTO_APPROVE_EVALUATE_ORIGINS`
([auto-approve-evaluate-origins.md](auto-approve-evaluate-origins.md)), que exige reiniciar el
bridge y no se ve en la UI.

## Evidencia y hechos
- Petición de Carlo (03/11, Telegram): «hay que poner también la posibilidad de quitar el popup
  en la extensión de Chrome […] crear unos settings para habilitar o quitar este aviso».
- El aviso es un `extension_ui_request` de tipo `confirm` que el bridge abre en el panel cuando
  `evaluateBrowserToolPermission` devuelve `requiresConfirmation`: `debugger.evaluateScript`
  siempre, y `debugger.sendCdpCommand` salvo las lecturas de DOM de solo lectura.
- Los ajustes del panel ya existen como casillas en la cabecera (`cookies`, `storage`). Viajan
  como `set_cookie_access` / `set_storage_access`, viven en `SessionState` y vuelven en
  `session_state`. Una sesión nueva o reanudada los deja apagados.
- El bridge crea el ejecutor de herramientas en cada llamada con la sesión actual, así que un
  cambio de ajuste vale desde la llamada siguiente.
- La extensión de Chrome vive en otro repositorio, `isr4el-silv4/pi-web-ui-chrome-extension`.
  El WebSocket no comprueba el origen, así que una copia de la extensión cargada sin empaquetar
  conecta igual.
- [cdp-confirmation-lifecycle.md](cdp-confirmation-lifecycle.md) descartó «crear un modo
  global». Esta spec lo cambia por decisión expresa del usuario, con el ajuste apagado por
  defecto, visible y acotado a scripts.

## Decisiones
1. **Contrato nuevo.** El comando de cliente `{ type: 'set_auto_approve_scripts', enabled: boolean }`.
   `SessionState` gana `autoApproveScriptsEnabled?: boolean`. El registro de sesiones lo pone a
   `false` al crear o reanudar una sesión, como cookies y storage, y `session_state` lo devuelve.
2. **Alcance: solo scripts de página.** Con el ajuste encendido se aprueban sin aviso
   `debugger.evaluateScript` y `debugger.sendCdpCommand` con `method === 'Runtime.evaluate'`, en
   cualquier pestaña. El resto de métodos CDP crudos (`Network.getAllCookies`, `Storage.*`,
   `Browser.*`, etc.) sigue pidiendo confirmación, porque saltan los ajustes de cookies y storage
   y van más allá de la página.
3. **Precedencia.** Con el ajuste encendido se aprueba sin `await` previo y sin consultar
   `tabs.list`. Con el ajuste apagado manda la lista de orígenes de la variable de entorno, que
   no cambia. Sin lista ni ajuste, el aviso se abre como hoy.
4. **Auditoría.** Toda ejecución aprobada por el ajuste se registra con `autoApproved: true`, igual
   que la aprobada por origen.
5. **UI.** Una tercera casilla en la cabecera del panel, junto a `cookies` y `storage`, con la
   etiqueta `auto-approve` y una descripción en `title`. Refleja el valor de `session_state`. Si
   el bridge no informa del campo, por ser una versión anterior, la casilla queda desactivada y
   el `title` explica por qué. Una respuesta sin el campo (el bridge contesta a
   `extension_ui_response` con un `session_state` cuya `session` es `{ handled }`) conserva el
   último valor, y una desconexión del bridge lo reinicia hasta el siguiente `session_state`.
6. **Sin persistencia propia.** El ajuste dura lo que la sesión del bridge, igual que cookies y
   storage. No se guarda en `chrome.storage`.

## Riesgos aceptados
- Con el ajuste encendido, un agente puede ejecutar JavaScript en cualquier pestaña sin que el
  usuario lo vea. Lo enciende el usuario a mano, se apaga en cada sesión nueva y queda en la
  auditoría.
- El WebSocket del bridge no comprueba el origen (hecho previo, fuera de alcance). Quien pueda
  hablarle ya puede enviar `prompt`, que es más grave que activar este ajuste.

## Criterios de aceptación
- Bridge:
  - `isClientCommand` acepta `set_auto_approve_scripts` solo con `enabled` booleano.
  - El comando enciende y apaga el campo de la sesión, y `session_state` lo devuelve. Una sesión
    nueva lo deja en `false`.
  - Con el ajuste encendido, `debugger.evaluateScript` y `Runtime.evaluate` se despachan sin
    llamar a `confirm` ni a `tabs.list`, y se auditan con `autoApproved: true`.
  - Con el ajuste encendido, otro método CDP crudo pide confirmación.
  - Con el ajuste apagado, el comportamiento anterior no cambia: siguen pasando los tests de
    orígenes de confianza y de ciclo de vida CDP.
  - El README documenta el ajuste.
- Extensión:
  - El estado inicial lleva `autoApproveScriptsEnabled: false`, y `session_state` lo actualiza
    junto con el soporte del bridge. Una respuesta sin el campo conserva el valor; una
    desconexión lo apaga.
  - La casilla envía `set_auto_approve_scripts` con su valor, refleja el estado y queda
    desactivada si el bridge no informa del campo.
  - El README de la extensión documenta la casilla.

## Alcance
- `pi-web-ui`: `src/protocol/messages.ts`, `src/protocol/sessions.ts`,
  `src/bridge/session-registry.ts`, `src/bridge/server.ts`, `src/bridge/browser-tools.ts`, sus
  tests, `README.md`, esta spec y sus tickets.
- `pi-web-ui-chrome-extension`: `sidepanel.html`, `sidepanel.js`, `sidepanel-state.js`,
  `test/sidepanel-state.test.js`, `README.md`.

## No objetivos
- Quitar el aviso de otros métodos CDP o de cookies y storage. Recordar aprobaciones.
- Una página de opciones de la extensión o persistir el ajuste entre sesiones.
- Comprobar el origen del WebSocket.
- Publicar en npm o en la Chrome Web Store, instalar el bridge en el Pi local o cargar la
  extensión sin empaquetar.

## Verificación
- Unit (Vitest) en los dos repos, en rojo antes y en verde después: protocolo, registro de
  sesiones, ejecutor, servidor y estado del panel.
- Regresión: la suite completa del bridge comparada con la base, para separar los fallos que ya
  existían. Typecheck y build del bridge.
- Manual (sin ejecutar aquí): cargar la extensión sin empaquetar contra el bridge del fork,
  marcar la casilla y comprobar que `Runtime.evaluate` corre sin aviso, y que al desmarcarla
  vuelve el aviso.

## Gates
- Attempt: de la implementación al handoff, con commits locales en las ramas
  `feat/auto-approve-scripts-setting` de los dos repos.
- Budget per attempt: none set.
- Time per attempt: none set.
- Maximum attempts: none set.
- Approvals given: el mensaje de Carlo del 03/11 en Telegram que pide el ajuste en la extensión.
  Sin Autopilot ni delegación.
- Open: crear el fork `carlitose/pi-web-ui-chrome-extension`, subir las ramas a los forks, abrir
  PRs en `isr4el-silv4/pi-web-ui` y `isr4el-silv4/pi-web-ui-chrome-extension`, instalar el
  bridge del fork en el Pi local y cargar la extensión sin empaquetar.
- Exact version: none required.
- Existing blocks found: none. Se revisaron `package.json`, `permissions.ts`, `browser-tools.ts`,
  `server.ts`, `session-registry.ts`, `protocol/*`, las specs anteriores y, en la extensión,
  `manifest.json`, `sidepanel*.js`, `sidepanel.html` y `test/`. La restricción «sin modo global»
  de `cdp-confirmation-lifecycle.md` es nuestra y cede ante la decisión expresa del usuario.

## Orden
1. Ticket 01: bridge.
2. Ticket 02: extensión, que usa el contrato del 01.
