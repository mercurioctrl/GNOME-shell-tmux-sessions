# tmux Sessions — extensión de GNOME Shell

Indicador de panel que lista las sesiones de tmux y las abre en la terminal.
Ver `README.md` para uso, preferencias y flujo de desarrollo.

## Entorno

- GNOME Shell 46 (X11), GJS con módulos ESM. Sin dependencias externas ni build.
- Instalada por symlink: `~/.local/share/gnome-shell/extensions/tmux-sessions@hermess` → este repo.
- Tras editar `extension.js` o `prefs.js` hay que **reiniciar la shell** (`Alt+F2` → `r`): GJS cachea los módulos ESM y desactivar/activar no recarga el código. `stylesheet.css` sí se relee con disable/enable.
- Tras editar el `.gschema.xml`: `glib-compile-schemas schemas/`.
- Validar sintaxis sin reiniciar: `cp extension.js /tmp/extension.mjs && node --check /tmp/extension.mjs`.

## Convenciones

- Español rioplatense en comentarios, mensajes de commit y documentación.
- Los comentarios explican **por qué**, no qué hace la línea. Las trampas de la API de GNOME se documentan donde se las sortea.
- **Autoría:** los commits van solo a nombre de Catriel. No agregar líneas de atribución generadas (`Co-Authored-By`, "Generated with…").

## Obsidian

La documentación de este proyecto vive en la bóveda, en `hermess-pc/tmux-sessions/`:

- `tmux-sessions.md` — Índice: qué hace y links al resto
- `arquitectura.md` — Piezas del código, cómo lee tmux, decisiones y por qué
- `stack.md` — APIs de GNOME usadas, dependencias del sistema
- `changelog.md` — Registro de lo trabajado por fecha
- `contexto.md` — Trampas del entorno, diagnóstico, decisiones y pendientes

Ruta local de la bóveda: `/var/www/obsidian-hermess/hermess-pc/tmux-sessions/`.
Sincronizar con `/sincronizarBoveda`.
