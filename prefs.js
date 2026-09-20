import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class TmuxSessionsPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: 'General',
            icon_name: 'utilities-terminal-symbolic',
        });
        window.add(page);

        /* --- Terminal --- */
        const termGroup = new Adw.PreferencesGroup({
            title: 'Terminal',
            description: 'Comando usado para abrir las sesiones. Se le agrega "tmux attach -t <sesión>" al final.',
        });
        page.add(termGroup);

        const termRow = new Adw.EntryRow({title: 'Comando de terminal'});
        termRow.set_text(settings.get_string('terminal-command'));
        termRow.connect('changed', () =>
            settings.set_string('terminal-command', termRow.get_text()));
        termGroup.add(termRow);

        const presets = new Adw.ComboRow({
            title: 'Presets',
            subtitle: 'Rellena el campo de arriba',
            model: Gtk.StringList.new([
                'ghostty -e',
                'gnome-terminal --',
                'kitty',
                'alacritty -e',
                'wezterm start --',
                'xterm -e',
            ]),
        });
        presets.connect('notify::selected', () => {
            const item = presets.get_model().get_string(presets.get_selected());
            termRow.set_text(item);
        });
        termGroup.add(presets);

        const tmuxRow = new Adw.EntryRow({title: 'Binario de tmux'});
        tmuxRow.set_text(settings.get_string('tmux-command'));
        tmuxRow.connect('changed', () =>
            settings.set_string('tmux-command', tmuxRow.get_text()));
        termGroup.add(tmuxRow);

        const detachRow = new Adw.SwitchRow({
            title: 'Desconectar otros clientes',
            subtitle: 'Usa "tmux attach -d": la sesión queda solo en esta ventana',
        });
        settings.bind('detach-others', detachRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        termGroup.add(detachRow);

        /* --- Apariencia --- */
        const uiGroup = new Adw.PreferencesGroup({title: 'Apariencia'});
        page.add(uiGroup);

        const countRow = new Adw.SwitchRow({
            title: 'Mostrar cantidad en el panel',
        });
        settings.bind('show-count', countRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        uiGroup.add(countRow);

        const winRow = new Adw.SwitchRow({
            title: 'Mostrar detalle de cada sesión',
            subtitle: 'Cantidad de ventanas y clientes conectados',
        });
        settings.bind('show-windows', winRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        uiGroup.add(winRow);

        const killRow = new Adw.SwitchRow({
            title: 'Permitir terminar sesiones',
            subtitle: 'Botón ✕ en cada sesión, con confirmación',
        });
        settings.bind('allow-kill', killRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        uiGroup.add(killRow);

        const posRow = new Adw.ComboRow({
            title: 'Posición en el panel',
            model: Gtk.StringList.new(['left', 'center', 'right']),
        });
        const positions = ['left', 'center', 'right'];
        posRow.set_selected(Math.max(0, positions.indexOf(settings.get_string('panel-position'))));
        posRow.connect('notify::selected', () =>
            settings.set_string('panel-position', positions[posRow.get_selected()]));
        uiGroup.add(posRow);

        const intervalRow = new Adw.SpinRow({
            title: 'Intervalo de refresco',
            subtitle: 'Segundos',
            adjustment: new Gtk.Adjustment({
                lower: 2, upper: 300, step_increment: 1, page_increment: 5,
            }),
        });
        settings.bind('refresh-interval', intervalRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        uiGroup.add(intervalRow);
    }
}
