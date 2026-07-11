// SPDX-License-Identifier: GPL-3.0-or-later
// Based on Foresight by pesader:
// https://github.com/pesader/gnome-shell-extension-foresight
// Foresight was based on Show Application View When Workspace Empty by fawtytoo:
// https://github.com/fawtytoo/GnomeShellExtensions

import Meta from 'gi://Meta';
import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as WindowManager from 'resource:///org/gnome/shell/ui/windowManager.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

// Window types that should trigger overview behavior
const VALID_WINDOW_TYPES = [
    Meta.WindowType.NORMAL,
    Meta.WindowType.DIALOG,
    Meta.WindowType.MODAL_DIALOG,
];

// Patterns for temporary windows that should not trigger overview behavior
const TEMPORARY_WINDOW_PATTERNS = [
    // DBeaver splash screens
    {
        title: 'Progress Information',
        wmClass: 'DBeaver',
        appIds: ['io.dbeaver.DBeaver.Community'],
        allowMissingAppId: true,
    },
    {
        title: 'DBeaver',
        wmClass: 'java',
        appIds: ['io.dbeaver.DBeaver.Community'],
        allowMissingAppId: true,
    },
    // Steam splash and login screens
    {
        title: 'Steam',
        wmClass: null,
        appIds: ['com.valvesoftware.Steam'],
        allowMissingAppId: true,
    },
    {
        title: 'Sign in to Steam',
        wmClass: 'steam',
        appIds: ['com.valvesoftware.Steam'],
        allowMissingAppId: true,
    },
    {
        title: 'Launching...',
        wmClass: 'steam',
        appIds: ['com.valvesoftware.Steam'],
        allowMissingAppId: true,
    },
    // Discord updater
    {
        title: 'Discord Updater',
        wmClass: 'discord',
        appIds: ['com.discordapp.Discord'],
        allowMissingAppId: true,
    },
    // LibreOffice splash screen
    {
        titleRegex: /^LibreOffice \d+\.\d+$/,
        wmClass: 'soffice',
        appIds: ['org.libreoffice.LibreOffice'],
        allowMissingAppId: true,
    },
];

class ForesightReborn {
    constructor(workspaceManager) {
        this._signals = {};
        this._overviewActivatedByForesightReborn = false;
        this._workspaceManager = workspaceManager;
        this._currentWorkspace = this._workspaceManager.get_active_workspace();
        this._windowRemovalGeneration = 0;
        this._workspaceSwitchGeneration = 0;
        this._temporaryWindowSignals = new Map();
        this._laterIds = new Set();
        this._closeAnimationTimeoutIds = new Set();
        this._mutterSettings = Gio.Settings.new('org.gnome.mutter');

        this._connectSignals();
    }

    //
    // Signal Management
    //

    _connectSignals() {
        this._connectWorkspaceSignals();

        this._signals.workspaceSwitched = this._workspaceManager.connect('workspace-switched', () =>
            this._onWorkspaceSwitched()
        );

        this._signals.overviewHidden = Main.overview.connect(
            'hidden',
            () => (this._overviewActivatedByForesightReborn = false)
        );
    }

    _disconnectSignals() {
        this._disconnectWorkspaceSignals();

        if (this._signals.overviewHidden) Main.overview.disconnect(this._signals.overviewHidden);

        if (this._signals.workspaceSwitched)
            this._workspaceManager.disconnect(this._signals.workspaceSwitched);
    }

    _connectWorkspaceSignals() {
        this._signals.windowRemoved = this._currentWorkspace.connect(
            'window-removed',
            (workspace, window) => this._onWindowRemoved(workspace, window)
        );

        this._signals.windowAdded = this._currentWorkspace.connect(
            'window-added',
            (workspace, window) => this._onWindowAdded(workspace, window)
        );

        for (const window of this._currentWorkspace.list_windows())
            if (this._isTemporaryWindow(window)) this._watchTemporaryWindow(window);
    }

    _disconnectWorkspaceSignals() {
        this._unwatchAllTemporaryWindows();

        if (this._signals.windowRemoved) {
            this._currentWorkspace.disconnect(this._signals.windowRemoved);
            this._signals.windowRemoved = null;
        }

        if (this._signals.windowAdded) {
            this._currentWorkspace.disconnect(this._signals.windowAdded);
            this._signals.windowAdded = null;
        }
    }

    //
    // Event Handlers
    //

    _onWindowAdded(workspace, window) {
        // Ignore windows not on current workspace
        if (workspace !== this._currentWorkspace) return;

        // Ignore invalid or temporary windows
        if (!this._isValidWindow(window, true)) return;

        if (this._isTemporaryWindow(window)) {
            // Recheck it if the application reuses this temporary window as
            // its main window without emitting another window-added signal.
            this._watchTemporaryWindow(window);
            return;
        }

        // Hide overview when a new window appears (if we activated it)
        if (Main.overview.visible) this._hideOverview();
    }

    _onWindowRemoved(workspace, window) {
        // Ignore windows not on current workspace
        if (workspace !== this._currentWorkspace) return;

        // The window can no longer change into a main application window, so
        // disconnect any temporary-window property watchers attached to it.
        this._unwatchTemporaryWindow(window);

        // Ignore invalid or temporary windows
        if (!this._isValidWindow(window) || this._isTemporaryWindow(window)) return;

        // Use Shell's own exported animation duration. The compositor actor
        // may already be unavailable when window-removed is emitted, so its
        // signals and internal destroying set cannot be relied upon here.
        const generation = ++this._windowRemovalGeneration;
        const animationTime =
            window.get_window_type() === Meta.WindowType.NORMAL
                ? WindowManager.DESTROY_WINDOW_ANIMATION_TIME
                : WindowManager.DIALOG_DESTROY_WINDOW_ANIMATION_TIME;
        this._runAfterDelay(animationTime, () => {
            if (generation !== this._windowRemovalGeneration || !this._workspaceManager) return;

            if (!this._workspaceHasValidWindows()) this._showOverview();
        });
    }

    _onWorkspaceSwitched() {
        this._windowRemovalGeneration++;

        // Reconnect signals to the new active workspace
        this._disconnectWorkspaceSignals();
        this._currentWorkspace = this._workspaceManager.get_active_workspace();
        this._connectWorkspaceSignals();

        // Opening the overview directly from workspace-switched interrupts
        // keyboard and scroll-based navigation. Check on each redraw and react
        // as soon as Shell's workspace animation has completed.
        const generation = ++this._workspaceSwitchGeneration;
        this._checkWorkspaceSwitchComplete(generation);
    }

    //
    // Helper Methods
    //

    _workspaceHasValidWindows() {
        return this._currentWorkspace
            .list_windows()
            .some(window => this._isValidWindow(window) && !this._isTemporaryWindow(window));
    }

    _isAppGridVisible() {
        return Main.overview.dash.showAppsButton.checked;
    }

    _checkWorkspaceSwitchComplete(generation) {
        this._runBeforeRedraw(() => {
            // Ignore callbacks queued by an earlier switch or before disable.
            if (generation !== this._workspaceSwitchGeneration || !this._workspaceManager) return;

            // GNOME Shell does not expose a public workspace-animation
            // completion signal. This internal flag is used only to postpone
            // the check; if it disappears in a future Shell version, Foresight
            // Reborn safely falls back to checking on the next redraw.
            if (Main.wm._switchInProgress) {
                this._checkWorkspaceSwitchComplete(generation);
                return;
            }

            if (this._workspaceHasValidWindows() && !this._isAppGridVisible()) this._hideOverview();
            else if (!Main.overview.visible) this._showOverview();
        });
    }

    _runBeforeRedraw(callback) {
        const laters = global.compositor.get_laters();
        const laterId = laters.add(Meta.LaterType.BEFORE_REDRAW, () => {
            this._laterIds.delete(laterId);
            callback();
            return false;
        });
        this._laterIds.add(laterId);
    }

    _runAfterDelay(delay, callback) {
        const timeoutId = setTimeout(() => {
            this._closeAnimationTimeoutIds.delete(timeoutId);
            callback();
        }, delay);
        this._closeAnimationTimeoutIds.add(timeoutId);
    }

    _showOverview() {
        Main.overview.show();
        this._overviewActivatedByForesightReborn = true;
    }

    _hideOverview() {
        if (this._overviewActivatedByForesightReborn) Main.overview.hide();
    }

    _isValidWindow(window, isBeingAdded = false) {
        // Check if window type is valid
        if (!VALID_WINDOW_TYPES.includes(window.get_window_type())) return false;

        // Skip hidden windows (except when first added, due to shortcut quirk)
        if (!isBeingAdded && window.is_hidden()) return false;

        // GNOME and applications use this standard hint for utility windows,
        // splash screens, and other windows that should not represent an open
        // application in the workspace UI.
        if (window.is_skip_taskbar()) return false;

        // If workspaces are limited to primary monitor, skip secondary monitor windows
        const isWorkspacesOnPrimaryOnly = this._mutterSettings.get_boolean(
            'workspaces-only-on-primary'
        );
        if (isWorkspacesOnPrimaryOnly && !window.is_on_primary_monitor()) return false;

        return true;
    }

    _isTemporaryWindow(window) {
        const title = window.get_title();
        const wmClass = window.get_wm_class();
        const appIds = [window.get_sandboxed_app_id(), window.get_gtk_application_id()].filter(
            appId => typeof appId === 'string' && appId.length > 0
        );

        return this._matchesTemporaryWindowPattern(title, wmClass, appIds);
    }

    _matchesTemporaryWindowPattern(title, wmClass, appIds) {
        return TEMPORARY_WINDOW_PATTERNS.some(windowPattern => {
            // Check title (exact match or regex)
            const titleMatches = windowPattern.titleRegex
                ? windowPattern.titleRegex.test(title)
                : title === windowPattern.title;

            // Check wmClass (exact match or null pattern)
            const wmClassMatches = wmClass === windowPattern.wmClass;

            // Native applications may expose no application ID, so patterns
            // must explicitly opt in to matching by title and WM class alone.
            const appIdMatches = appIds.length
                ? appIds.some(appId => windowPattern.appIds.includes(appId))
                : windowPattern.allowMissingAppId;

            return titleMatches && wmClassMatches && appIdMatches;
        });
    }

    _watchTemporaryWindow(window) {
        // Some applications reuse a splash or updater Meta.Window for their
        // main window instead of emitting window-added again. Watch the
        // identity properties used by our temporary-window patterns so the
        // window can be reclassified as soon as it stops matching. Once that
        // happens, stop watching it and handle it like a newly added window.
        if (this._temporaryWindowSignals.has(window)) return;

        const recheckWindow = () => {
            if (window.get_workspace() !== this._currentWorkspace) return;
            if (this._isTemporaryWindow(window)) return;

            this._unwatchTemporaryWindow(window);
            if (this._isValidWindow(window, true) && Main.overview.visible) this._hideOverview();
        };

        this._temporaryWindowSignals.set(window, [
            window.connect('notify::title', recheckWindow),
            window.connect('notify::wm-class', recheckWindow),
            window.connect('notify::gtk-application-id', recheckWindow),
        ]);
    }

    _unwatchTemporaryWindow(window) {
        // Remove every property watcher registered above. This is called when
        // a temporary window becomes a normal window, is removed, leaves the
        // active workspace, or the extension is disabled.
        const signalIds = this._temporaryWindowSignals.get(window);
        if (!signalIds) return;

        for (const signalId of signalIds) window.disconnect(signalId);
        this._temporaryWindowSignals.delete(window);
    }

    _unwatchAllTemporaryWindows() {
        for (const window of [...this._temporaryWindowSignals.keys()])
            this._unwatchTemporaryWindow(window);
    }

    _removeLaters() {
        const laters = global.compositor.get_laters();
        for (const laterId of this._laterIds) laters.remove(laterId);
        this._laterIds.clear();
    }

    _removeCloseAnimationTimeouts() {
        for (const timeoutId of this._closeAnimationTimeoutIds) clearTimeout(timeoutId);
        this._closeAnimationTimeoutIds.clear();
    }

    //
    // Lifecycle
    //

    destroy() {
        this._disconnectSignals();
        this._removeLaters();
        this._removeCloseAnimationTimeouts();

        this._windowRemovalGeneration++;
        this._workspaceSwitchGeneration++;

        // Clean up all references
        this._signals = null;
        this._overviewActivatedByForesightReborn = null;
        this._workspaceManager = null;
        this._currentWorkspace = null;
        this._mutterSettings = null;
        this._temporaryWindowSignals = null;
        this._laterIds = null;
        this._closeAnimationTimeoutIds = null;
    }
}

export default class ForesightRebornExtension extends Extension {
    enable() {
        this._ForesightReborn = new ForesightReborn(global.workspace_manager);
    }

    disable() {
        this._ForesightReborn.destroy();
        this._ForesightReborn = null;
    }
}
