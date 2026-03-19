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
    /** Delay in milliseconds before Retype rebuilds after a file change. */
    debounce: number;
}

/** Default values applied on first load. */
export const DEFAULT_SETTINGS: RetypePluginSettings = {
    autoOpenBrowser: DEFAULT_SETTING_VALUES.autoOpenBrowser,
    showStatusBar: DEFAULT_SETTING_VALUES.showStatusBar,
    debounce: DEFAULT_SETTING_VALUES.debounce,
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
        const keyDesc = document.createDocumentFragment();
        keyDesc.append("Your Retype ");
        const proLink = keyDesc.createEl("a", { text: "Pro", href: LABELS.settingKeyProUrl });
        proLink.setAttr("target", "_blank");
        keyDesc.append(" or ");
        const communityLink = keyDesc.createEl("a", { text: "Community", href: LABELS.settingKeyCommunityUrl });
        communityLink.setAttr("target", "_blank");
        keyDesc.append(" key");

        new Setting(containerEl)
            .setName(LABELS.settingKeyName)
            .setDesc(keyDesc)
            .addText((text) => {
                text.setPlaceholder(LABELS.settingKeyPlaceholder)
                    .setValue(this.plugin.retypeProKey)
                    .onChange((value) => {
                        const trimmed = value.trim();
                        this.plugin.retypeProKey = trimmed;
                        void this.app.secretStorage.setSecret(
                            SECRET_KEY_RETYPE,
                            trimmed
                        );
                    });
                text.inputEl.type = "password";
            });

        // ── Debounce ────────────────────────────────────────────
        new Setting(containerEl)
            .setName(LABELS.settingDebounceName)
            .setDesc(LABELS.settingDebounceDesc)
            .addText((text) => {
                text.inputEl.type = "number";
                text.inputEl.min = "0";
                text.setValue(String(this.plugin.settings.debounce));
                text.onChange(async (value) => {
                    const parsed = parseInt(value, 10);
                    if (!isNaN(parsed) && parsed >= 0) {
                        this.plugin.settings.debounce = parsed;
                        await this.plugin.saveSettings();
                    }
                });
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
