// ── settings.ts ───────────────────────────────────────────────────────────
// Plugin settings interface, defaults, and PluginSettingTab UI.
// The Retype Key is stored in Obsidian's SecretStorage — NOT in data.json.
// Only `autoOpenBrowser` and `showStatusBar` are persisted via saveData().
// ──────────────────────────────────────────────────────────────────────────

import { App, PluginSettingTab, Setting } from "obsidian";

import type RetypePlugin from "./main";
import {
    LABELS,
    SECRET_KEY_RETYPE,
    DEFAULT_SETTING_VALUES,
} from "./config";

// ── Settings Interface ────────────────────────────────────────────────────

/** Persisted plugin settings (stored in data.json). */
export interface RetypePluginSettings {
    /** Open the default web browser when the Retype server starts. */
    autoOpenBrowser: boolean;
    /** Show the Retype status bar item. */
    showStatusBar: boolean;
}

/** Default values applied on first load. */
export const DEFAULT_SETTINGS: RetypePluginSettings = {
    autoOpenBrowser: DEFAULT_SETTING_VALUES.autoOpenBrowser,
    showStatusBar: DEFAULT_SETTING_VALUES.showStatusBar,
};

// ── Settings Tab ──────────────────────────────────────────────────────────

/**
 * Renders the "Retype Settings" tab inside Obsidian's Settings dialog.
 * Three setting rows: Retype Key (password), Open browser toggle, Status bar toggle.
 */
export class RetypeSettingTab extends PluginSettingTab {
    plugin: RetypePlugin;

    constructor(app: App, plugin: RetypePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    /** Build the settings UI. */
    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        // ── Retype Key (password input, stored in SecretStorage) ─
        new Setting(containerEl)
            .setName(LABELS.settingKeyName)
            .setDesc(LABELS.settingKeyDesc)
            .addText((text) => {
                text.setPlaceholder(LABELS.settingKeyPlaceholder)
                    .setValue(this.plugin.retypeProKey)
                    .onChange((value) => {
                        const trimmed = value.trim();
                        this.plugin.retypeProKey = trimmed;
                        this.app.secretStorage.setSecret(
                            SECRET_KEY_RETYPE,
                            trimmed
                        );
                    });
                text.inputEl.type = "password";
            });

        // ── Open browser automatically ──────────────────────────
        new Setting(containerEl)
            .setName(LABELS.settingAutoOpenName)
            .setDesc(LABELS.settingAutoOpenDesc)
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.autoOpenBrowser)
                    .onChange(async (value) => {
                        this.plugin.settings.autoOpenBrowser = value;
                        await this.plugin.saveSettings();
                    })
            );

        // ── Show status bar item ────────────────────────────────
        new Setting(containerEl)
            .setName(LABELS.settingStatusBarName)
            .setDesc(LABELS.settingStatusBarDesc)
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.showStatusBar)
                    .onChange(async (value) => {
                        this.plugin.settings.showStatusBar = value;
                        await this.plugin.saveSettings();
                        this.plugin.refreshStatusBar();
                    })
            );
    }
}
