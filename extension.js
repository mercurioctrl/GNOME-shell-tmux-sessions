/* extension.js — tmux Sessions
 * Indicador en la barra superior con las sesiones de tmux.
 */

import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

// Separador de campos para el formato de tmux (unit separator).
const SEP = String.fromCharCode(31);

/* ---------- helpers de proceso ---------- */

function runCapture(argv) {
    return new Promise(resolve => {
        let proc;
        try {
            proc = Gio.Subprocess.new(argv,
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
        } catch (e) {
            resolve({ok: false, stdout: '', stderr: String(e)});
            return;
        }
        proc.communicate_utf8_async(null, null, (p, res) => {
            try {
                const [, stdout, stderr] = p.communicate_utf8_finish(res);
                resolve({ok: p.get_successful(), stdout: stdout ?? '', stderr: stderr ?? ''});
            } catch (e) {
                resolve({ok: false, stdout: '', stderr: String(e)});
            }
        });
    });
}

function spawnDetached(argv) {
    try {
        GLib.spawn_async(
            null, argv, null,
            GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD,
            null);
        return true;
    } catch (e) {
        Main.notifyError('tmux Sessions', `No se pudo ejecutar: ${argv.join(' ')}`);
        return false;
    }
}

/* ---------- diálogo de confirmación ---------- */

const ConfirmDialog = GObject.registerClass(
class ConfirmDialog extends ModalDialog.ModalDialog {
    _init(title, body, onConfirm) {
        super._init({styleClass: 'modal-dialog'});

        const box = new St.BoxLayout({
            vertical: true,
            style_class: 'message-dialog-content',
            x_expand: true,
        });
        box.add_child(new St.Label({
            text: title,
            style_class: 'message-dialog-title',
        }));
        box.add_child(new St.Label({
            text: body,
            style_class: 'message-dialog-description',
        }));
        this.contentLayout.add_child(box);

        this.addButton({
            label: _('Cancelar'),
            action: () => this.close(),
            key: Clutter.KEY_Escape,
        });
        this.addButton({
            label: _('Terminar'),
            action: () => {
                this.close();
                onConfirm();
            },
            default: true,
        });
    }
});

/* ---------- item de sesión ---------- */

const SessionItem = GObject.registerClass(
class SessionItem extends PopupMenu.PopupBaseMenuItem {
    _init(session, opts) {
        super._init({style_class: 'tmux-session-item'});

        this._session = session;

        const icon = new St.Icon({
            icon_name: session.attached > 0
                ? 'media-playback-start-symbolic'
                : 'utilities-terminal-symbolic',
            style_class: 'popup-menu-icon',
        });
        this.add_child(icon);

        const textBox = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        textBox.add_child(new St.Label({
            text: session.name,
            style_class: 'tmux-session-name',
        }));

        if (opts.showWindows) {
            const w = session.windows === 1 ? '1 ventana' : `${session.windows} ventanas`;
            let a = '';
            if (session.attached === 1)
                a = ' · conectada';
            else if (session.attached > 1)
                a = ` · ${session.attached} clientes`;
            textBox.add_child(new St.Label({
                text: `${w}${a}`,
                style_class: 'tmux-session-detail',
            }));
        }
        this.add_child(textBox);

        if (opts.allowKill) {
            const killBtn = new St.Button({
                style_class: 'tmux-kill-button',
                child: new St.Icon({
                    icon_name: 'window-close-symbolic',
                    style_class: 'popup-menu-icon',
                }),
                y_align: Clutter.ActorAlign.CENTER,
                can_focus: true,
            });
            killBtn.connect('clicked', () => {
                opts.onKill(this._session);
                return Clutter.EVENT_STOP;
            });
            this.add_child(killBtn);
        }
    }
});

/* ---------- entrada "nueva sesión" ---------- */

const NewSessionItem = GObject.registerClass(
class NewSessionItem extends PopupMenu.PopupBaseMenuItem {
    _init(onCreate) {
        super._init({reactive: false, can_focus: false, style_class: 'tmux-new-item'});

        this.add_child(new St.Icon({
            icon_name: 'list-add-symbolic',
            style_class: 'popup-menu-icon',
        }));

        this._entry = new St.Entry({
            hint_text: _('Nueva sesión…'),
            can_focus: true,
            x_expand: true,
            style_class: 'tmux-new-entry',
        });
        this._entry.clutter_text.connect('activate', () => {
            const name = this._entry.get_text().trim();
            this._entry.set_text('');
            onCreate(name);
        });
        this.add_child(this._entry);
    }
});

/* ---------- indicador ---------- */

const TmuxIndicator = GObject.registerClass(
class TmuxIndicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.5, 'tmux Sessions');

        this._ext = extension;
        this._settings = extension.getSettings();
        this._sessions = [];
        this._timeoutId = 0;
        this._pendingId = 0;
        this._destroyed = false;
        this._menuBuilt = false;

        const box = new St.BoxLayout({style_class: 'panel-status-menu-box'});
        this._icon = new St.Label({
            text: '🟢',
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'tmux-panel-icon',
        });
        this._label = new St.Label({
            text: '',
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'tmux-panel-label',
        });
        box.add_child(this._icon);
        box.add_child(this._label);
        this.add_child(box);

        this.menu.connect('open-state-changed', (_m, open) => {
            if (open)
                this._refresh();
        });

        this._settingsChangedId = this._settings.connect('changed', (_s, key) => {
            if (key === 'refresh-interval')
                this._restartTimer();
            this._menuBuilt = false;
            this._refresh();
        });

        this._restartTimer();
        this._refresh();
    }

    /* --- config --- */

    _tmux() {
        return this._settings.get_string('tmux-command') || 'tmux';
    }

    _terminalArgv() {
        const raw = this._settings.get_string('terminal-command') || 'ghostty -e';
        try {
            const [ok, argv] = GLib.shell_parse_argv(raw);
            if (ok && argv.length > 0)
                return argv;
        } catch (e) {
            // cae al default
        }
        return ['ghostty', '-e'];
    }

    /* --- timer --- */

    _restartTimer() {
        if (this._timeoutId) {
            GLib.Source.remove(this._timeoutId);
            this._timeoutId = 0;
        }
        const secs = this._settings.get_int('refresh-interval');
        this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, secs, () => {
            this._refresh();
            return GLib.SOURCE_CONTINUE;
        });
    }

    /* --- datos --- */

    async _listSessions() {
        const fmt = ['#{session_name}', '#{session_windows}', '#{session_attached}',
            '#{session_created}'].join(SEP);
        const res = await runCapture([this._tmux(), 'list-sessions', '-F', fmt]);
        if (!res.ok)
            return [];

        return res.stdout.split('\n')
            .filter(l => l.trim().length > 0)
            .map(line => {
                const [name, windows, attached, created] = line.split(SEP);
                return {
                    name,
                    windows: parseInt(windows, 10) || 0,
                    attached: parseInt(attached, 10) || 0,
                    created: parseInt(created, 10) || 0,
                };
            })
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    async _refresh() {
        if (this._destroyed)
            return;
        const sessions = await this._listSessions();
        if (this._destroyed)
            return;
        this._sessions = sessions;

        const n = this._sessions.length;
        const showCount = this._settings.get_boolean('show-count');
        this._label.text = showCount ? ` ${n}` : '';
        this._label.visible = showCount;
        this._icon.opacity = n > 0 ? 255 : 140;

        if (this.menu.isOpen || !this._menuBuilt)
            this._rebuildMenu();
    }

    /* --- menú --- */

    _rebuildMenu() {
        this.menu.removeAll();
        this._menuBuilt = true;

        const showWindows = this._settings.get_boolean('show-windows');
        const allowKill = this._settings.get_boolean('allow-kill');

        if (this._sessions.length === 0) {
            this.menu.addMenuItem(new PopupMenu.PopupMenuItem(
                _('Sin sesiones de tmux'), {reactive: false}));
        } else {
            for (const s of this._sessions) {
                const item = new SessionItem(s, {
                    showWindows,
                    allowKill,
                    onKill: session => this._confirmKill(session),
                });
                item.connect('activate', () => this._attach(s.name));
                this.menu.addMenuItem(item);
            }
        }

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this.menu.addMenuItem(new NewSessionItem(name => {
            this.menu.close();
            this._newSession(name);
        }));

        const quickNew = new PopupMenu.PopupMenuItem(_('Nueva sesión sin nombre'));
        quickNew.connect('activate', () => this._newSession(''));
        this.menu.addMenuItem(quickNew);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const refreshItem = new PopupMenu.PopupMenuItem(_('Actualizar'));
        refreshItem.connect('activate', () => this._refresh());
        this.menu.addMenuItem(refreshItem);

        const prefsItem = new PopupMenu.PopupMenuItem(_('Preferencias'));
        prefsItem.connect('activate', () => this._ext.openPreferences());
        this.menu.addMenuItem(prefsItem);
    }

    /* --- acciones --- */

    _attach(name) {
        const argv = this._terminalArgv();
        argv.push(this._tmux(), 'attach-session');
        if (this._settings.get_boolean('detach-others'))
            argv.push('-d');
        argv.push('-t', name);
        spawnDetached(argv);
        this._scheduleRefresh();
    }

    _newSession(name) {
        const argv = this._terminalArgv();
        argv.push(this._tmux(), 'new-session');
        if (name && name.length > 0)
            argv.push('-A', '-s', name);
        spawnDetached(argv);
        this._scheduleRefresh();
    }

    _scheduleRefresh() {
        if (this._pendingId)
            GLib.Source.remove(this._pendingId);
        this._pendingId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, () => {
            this._pendingId = 0;
            this._menuBuilt = false;
            this._refresh();
            return GLib.SOURCE_REMOVE;
        });
    }

    _confirmKill(session) {
        this.menu.close();
        const dlg = new ConfirmDialog(
            _('Terminar sesión de tmux'),
            `Se va a cerrar la sesión "${session.name}" y todos sus procesos.`,
            async () => {
                await runCapture([this._tmux(), 'kill-session', '-t', session.name]);
                this._menuBuilt = false;
                this._refresh();
            });
        dlg.open();
    }

    destroy() {
        this._destroyed = true;
        if (this._timeoutId) {
            GLib.Source.remove(this._timeoutId);
            this._timeoutId = 0;
        }
        if (this._pendingId) {
            GLib.Source.remove(this._pendingId);
            this._pendingId = 0;
        }
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = 0;
        }
        super.destroy();
    }
});

/* ---------- extensión ---------- */

export default class TmuxSessionsExtension extends Extension {
    enable() {
        this._indicator = new TmuxIndicator(this);
        const pos = this.getSettings().get_string('panel-position');
        const index = pos === 'left' ? 1 : 0;
        Main.panel.addToStatusArea(this.uuid, this._indicator, index, pos);
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
    }
}
