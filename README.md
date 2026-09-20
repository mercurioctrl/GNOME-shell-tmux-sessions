# tmux Sessions — extensión de GNOME Shell

Indicador en la barra superior de GNOME que lista las sesiones de tmux del usuario.
Un clic abre el menú; un clic en una sesión la abre en la terminal con `tmux attach-session`.

- **UUID:** `tmux-sessions@hermess`
- **Probado en:** GNOME Shell 46 (X11), tmux 3.4, Ghostty 1.2.2, Ubuntu
- **Declara soporte:** shell 45–48 (API ESM de GNOME 45+)

## Instalación

```bash
git clone git@github.com:mercurioctrl/GNOME-shell-tmux-sessions.git ~/Proyectos/gnome-shell-tmux-sessions
ln -s ~/Proyectos/gnome-shell-tmux-sessions ~/.local/share/gnome-shell/extensions/tmux-sessions@hermess
glib-compile-schemas ~/Proyectos/gnome-shell-tmux-sessions/schemas/
# recargar GNOME Shell: Alt+F2 -> r -> Enter (X11) o cerrar sesión (Wayland)
gnome-extensions enable tmux-sessions@hermess
```

`schemas/gschemas.compiled` no está versionado: hay que generarlo con
`glib-compile-schemas` después de clonar y cada vez que se toque el `.gschema.xml`.

---

## Uso

| Acción | Resultado |
|---|---|
| Clic en el 🟢 del panel (izquierdo **o** derecho) | Abre el menú con todas las sesiones |
| Clic en una sesión | Abre la terminal configurada con `tmux attach-session -t <sesión>` |
| Botón ✕ de una sesión | `tmux kill-session` — pide confirmación en un diálogo modal |
| Escribir un nombre en *Nueva sesión…* + Enter | `tmux new-session -A -s <nombre>` (adjunta si ya existe) |
| *Nueva sesión sin nombre* | `tmux new-session` (tmux le pone número) |
| *Actualizar* | Refresca la lista a mano |
| *Preferencias* | Abre la ventana de settings |

Cada fila muestra el nombre, la cantidad de ventanas y si está conectada
(`conectada` / `N clientes`). El icono de la fila cambia a ▶ cuando la sesión
tiene al menos un cliente adjunto.

El indicador del panel muestra el 🟢 y la cantidad de sesiones. Con cero sesiones
el emoji baja a opacidad 140 para que se note de un vistazo.

> **Nota sobre el clic derecho:** no hace falta código para distinguirlo.
> `PanelMenu.Button.vfunc_event()` abre el menú ante **cualquier** `BUTTON_PRESS`,
> así que el botón izquierdo y el derecho hacen lo mismo.

---

## Preferencias

`gnome-extensions prefs tmux-sessions@hermess`, o desde el menú.

| Clave GSettings | Default | Qué hace |
|---|---|---|
| `terminal-command` | `ghostty -e` | Terminal + flag de "ejecutá este comando". Se le concatenan los argumentos de tmux. Hay presets para ghostty, gnome-terminal, kitty, alacritty, wezterm y xterm |
| `tmux-command` | `tmux` | Ruta o nombre del binario de tmux |
| `detach-others` | `false` | Agrega `-d` al attach: desconecta cualquier otro cliente de esa sesión |
| `show-count` | `true` | Muestra el número de sesiones al lado del emoji |
| `show-windows` | `true` | Muestra el renglón de detalle (ventanas + clientes) en cada fila |
| `allow-kill` | `true` | Muestra el botón ✕ |
| `panel-position` | `right` | `left`, `center` o `right` |
| `refresh-interval` | `30` | Segundos entre refrescos con el menú **cerrado** (2–300). Con el menú abierto el sondeo pasa a 3 s |

Leer/escribir a mano:

```bash
gsettings --schemadir ~/.local/share/gnome-shell/extensions/tmux-sessions@hermess/schemas \
  get org.gnome.shell.extensions.tmux-sessions terminal-command
```

### Formato de `terminal-command`

Se parsea con `GLib.shell_parse_argv()` y se le agregan los argumentos de tmux al
final. El valor tiene que terminar en el flag que le dice a la terminal
"lo que sigue es el comando a ejecutar":

```
ghostty -e          → ghostty -e tmux attach-session -t sesion
gnome-terminal --   → gnome-terminal -- tmux attach-session -t sesion
kitty               → kitty tmux attach-session -t sesion
alacritty -e        → alacritty -e tmux attach-session -t sesion
```

Si el parseo falla, cae a `ghostty -e`.

---

## Archivos

```
gnome-shell-tmux-sessions/     ← symlinkeado como tmux-sessions@hermess
├── extension.js      indicador, menú, listado y lanzamiento
├── prefs.js          ventana de preferencias (libadwaita / Adw)
├── stylesheet.css    estilos del panel y del menú
├── metadata.json     UUID, nombre, shell-version, settings-schema
├── schemas/
│   ├── org.gnome.shell.extensions.tmux-sessions.gschema.xml
│   └── gschemas.compiled     ← generado por glib-compile-schemas
├── reload.sh         recompila el schema y recarga la shell (X11)
└── README.md
```

### Piezas de `extension.js`

| Símbolo | Rol |
|---|---|
| `runCapture(argv)` | `Gio.Subprocess` + `communicate_utf8_async` envuelto en Promise. Para leer la salida de tmux sin bloquear la shell |
| `spawnDetached(argv)` | `GLib.spawn_async` con `DO_NOT_REAP_CHILD`. Para lanzar la terminal, que sobrevive a la shell |
| `ConfirmDialog` | `ModalDialog` de confirmación para el kill |
| `SessionItem` | Fila del menú: icono + nombre + detalle + botón ✕ |
| `NewSessionItem` | Fila con un `St.Entry` para crear sesión por nombre |
| `TmuxIndicator` | `PanelMenu.Button`: emoji + contador, timer de refresco, armado del menú y acciones |

---

## Cómo lee las sesiones

```bash
tmux list-sessions -F '#{session_name}<US>#{session_windows}<US>#{session_attached}<US>#{session_created}'
```

`<US>` es el separador de unidad (`0x1F`, `String.fromCharCode(31)`), elegido
porque no puede aparecer en un nombre de sesión — un `|` o un `:` sí podrían.
Si el comando falla (no hay servidor tmux corriendo), devuelve lista vacía sin
ruido: ese es el caso normal de "no hay sesiones", no un error.

El refresco corre al abrir el menú, 2 s después de lanzar o matar una sesión
(`_scheduleRefresh()`), y por timer: cada 3 s mientras el menú está abierto y
cada `refresh-interval` segundos cuando está cerrado, donde lo único que puede
cambiar es el contador del panel.

Un refresco en vuelo bloquea los siguientes (`_refreshing`), porque el timer, el
abrir el menú y las acciones pueden pedirlo casi a la vez.

El menú **no** se rearma en cada refresco: se compara una firma de la lista
(`nombre\tventanas\tclientes` por sesión) y solo se reconstruyen los actores si
cambió algo de verdad.

---

## Desarrollo

### Instalar / activar

```bash
glib-compile-schemas schemas/          # obligatorio tras tocar el .gschema.xml
# recargar GNOME Shell (ver abajo)
gnome-extensions enable tmux-sessions@hermess
```

### Recargar tras editar el código

GNOME Shell no reescanea el directorio de extensiones solo: mientras no se
recargue, `gnome-extensions enable` responde **«La extensión no existe»**.
Y como GJS **cachea los módulos ESM**, desactivar/activar no recarga
`extension.js` — hace falta reiniciar la shell.

- **X11:** `Alt+F2` → `r` → Enter (las ventanas sobreviven), o `./reload.sh`
- **Wayland:** cerrar sesión y volver a entrar

Excepción: `stylesheet.css` sí se recarga con solo desactivar y activar la extensión.

### Ver errores

```bash
journalctl -f -o cat /usr/bin/gnome-shell
gnome-extensions info tmux-sessions@hermess   # Estado: ACTIVE / ERROR / INITIALIZED
```

Si `enable()` tira una excepción, el estado queda en `ERROR` y el stack sale en
el journal con la ruta del archivo y el número de línea.

### Chequeo de sintaxis sin reiniciar la shell

```bash
cp extension.js /tmp/extension.mjs && node --check /tmp/extension.mjs
```

No valida las APIs de GNOME (los `import gi://…` no resuelven fuera de GJS),
pero atrapa los errores de sintaxis, que son la mitad de los fallos al iterar.

---

## Detalles de implementación y trampas

- **Las terminales se lanzan con `Gio.Subprocess`, no con `GLib.spawn_async()`.**
  GSubprocess se cosecha solo: mantiene su propio child watch en el worker de
  GLib aunque se suelte la referencia. Con `GLib.spawn_async` +
  `DO_NOT_REAP_CHILD` y sin `child_watch_add`, **cada terminal abierta dejaba un
  proceso zombie** colgando de gnome-shell hasta reiniciar la shell. La
  alternativa (`child_watch_add` + `spawn_close_pid`) obliga a llevar la cuenta
  de esos GSource para removerlos en `destroy()`; `Gio.Subprocess` no necesita
  ninguna de las dos cosas.
- **El menú se rearma solo si la lista cambió.** `removeAll()` destruye y recrea
  todos los actores; hacerlo en cada tick con el menú abierto era basura para el
  GC y además borraba lo tipeado en *Nueva sesión…*. Lo que se tipeó se preserva
  igual entre rearmados (`_newItem.getText()` / `setText()`).
- **El emoji del panel es un `St.Label`, no un `St.Icon`.** Un SVG cargado como
  `-symbolic.svg` lo recolorea St con el color del tema y perdería el verde.
  El tamaño se ajusta con `.tmux-panel-icon { font-size: 11px; }` en
  `stylesheet.css` — sin eso hereda el tamaño de fuente del panel, que para un
  emoji queda grande al lado del contador.
- **Sesiones agrupadas** (`tmux new-session -t grupo`) aparecen como sesiones
  independientes, que es lo que devuelve `list-sessions`. Por eso `session_attached`
  puede valer más de 1 y subir cuando se adjunta desde otra ventana.
- **Todo `GLib.timeout_add*` se remueve en `destroy()`.** Un timer vivo después
  de desactivar la extensión es la causa clásica de que la rechacen en
  extensions.gnome.org y de que la shell tire errores al deshabilitarla.
- **`_destroyed`** corta los callbacks async que vuelven después de `destroy()`
  (el `await` de `runCapture` puede resolver con el actor ya destruido).
- **`NewSessionItem` se crea con `reactive: false, can_focus: false`** para que
  el ítem no se "active" y cierre el menú al tipear; el `St.Entry` de adentro
  igual recibe eventos, porque la reactividad en Clutter es por actor.
- **`_menuBuilt`** evita rearmar el menú en cada tick del timer: solo se rearma
  si el menú está abierto o si algo lo invalidó.

---

## Ideas pendientes

- Listar también las **ventanas** de cada sesión en un submenú.
- Atajo de teclado global para abrir el menú.
- Indicador de actividad (`#{window_activity_flag}`) en las sesiones no adjuntas.
- Integrar con los avisos de Claude Code (los hooks que ponen emoji de estado por
  pestaña de Ghostty) para pintar ese mismo estado en cada fila de la lista.
