// ── main.ts ───────────────────────────────────────────────────────────────
// Retype — plugin entry point.
// Registers services, sidebar view, ribbon icon, status bar, commands, and
// settings tab.  Auto-resolves the Retype CLI on first load.
// ──────────────────────────────────────────────────────────────────────────

import {
    Plugin,
    Notice,
    addIcon,
    FileSystemAdapter,
} from "obsidian";

import {
    RetypePluginSettings,
    DEFAULT_SETTINGS,
    RetypeSettingTab,
} from "./settings";

import { CliService } from "./services/CliService";
import { ProjectDetector } from "./services/ProjectDetector";
import { RetypeInstaller } from "./services/RetypeInstaller";
import { RetypePanelView } from "./views/PanelView";

import {
    RETYPE_ICON_SVG,
    ICONS,
    VIEW_TYPE_RETYPE_SIDEBAR,
    COMMANDS,
    SECRET_KEY_RETYPE,
    LEGACY_KEY_FIELD,
    CSS,
    STATUS_BAR,
    NOTICES,
    CLI_EVENTS,
    LABELS,
    INSTALLER,
} from "./config";

// ── RetypePlugin ──────────────────────────────────────────────────────────

export default class RetypePlugin extends Plugin {
    settings!: RetypePluginSettings;
    cli!: CliService;
    detector!: ProjectDetector;
    installer!: RetypeInstaller;

    /** Retype license key — loaded from SecretStorage, held in memory only. */
    retypeProKey = "";

    private statusBarItem: HTMLElement | null = null;
    private sidebarView: RetypePanelView | null = null;

    // ── Plugin Lifecycle ──────────────────────────────────────────

    async onload(): Promise<void> {
        await this.loadSettings();
        await this.loadRetypeKey();

        // Register the custom Retype brand icon.
        addIcon(ICONS.retypeLogo, RETYPE_ICON_SVG);

        // Core services
        this.cli = new CliService("retype");
        this.detector = new ProjectDetector(this.app);
        this.installer = new RetypeInstaller(this.getPluginDir());

        // ── Sidebar view ──────────────────────────────────────────
        this.registerView(VIEW_TYPE_RETYPE_SIDEBAR, (leaf) => {
            this.sidebarView = new RetypePanelView(
                leaf,
                this,
                this.cli,
                this.detector
            );
            return this.sidebarView;
        });

        // ── Ribbon icon ───────────────────────────────────────────
        this.addRibbonIcon(ICONS.retypeLogo, LABELS.ribbonTooltip, () => {
            this.activateSidebar();
        });

        // ── Status bar ────────────────────────────────────────────
        if (this.settings.showStatusBar) {
            this.initStatusBar();
        }

        this.cli.on(CLI_EVENTS.statusChanged, () => this.updateStatusBar());
        this.cli.on(CLI_EVENTS.urlFound, () => this.updateStatusBar());

        // ── Commands ──────────────────────────────────────────────
        this.addCommand({
            id: COMMANDS.openSidebar.id,
            name: COMMANDS.openSidebar.name,
            callback: () => this.activateSidebar(),
        });

        this.addCommand({
            id: COMMANDS.startServer.id,
            name: COMMANDS.startServer.name,
            callback: async () => {
                await this.activateSidebar();
                this.sidebarView?.onStartClick();
            },
        });

        this.addCommand({
            id: COMMANDS.stopServer.id,
            name: COMMANDS.stopServer.name,
            callback: () => this.cli.stop(),
        });

        this.addCommand({
            id: COMMANDS.toggleServer.id,
            name: COMMANDS.toggleServer.name,
            callback: async () => {
                if (this.cli.isRunning) {
                    this.cli.stop();
                } else {
                    await this.activateSidebar();
                    this.sidebarView?.onStartClick();
                }
            },
        });

        // ── Active leaf change ────────────────────────────────────
        this.registerEvent(
            this.app.workspace.on("active-leaf-change", async () => {
                await this.sidebarView?.onActiveFileChange();
            })
        );

        // ── Settings tab ──────────────────────────────────────────
        this.addSettingTab(new RetypeSettingTab(this.app, this));

        // ── Auto-resolve CLI (non-blocking) ───────────────────────
        this.checkAndPrepareCli().catch(() => {
            new Notice(NOTICES.setupFailed);
        });
    }

    async onunload(): Promise<void> {
        if (this.cli?.isRunning) {
            await this.cli.stopAsync(1500);
        }
    }

    // ── Settings ──────────────────────────────────────────────────

    /** Load persisted settings from data.json, merging with defaults. */
    async loadSettings(): Promise<void> {
        const stored = (await this.loadData()) as Record<string, unknown> | null;
        this.settings = Object.assign({}, DEFAULT_SETTINGS, stored ?? {});
    }

    /** Persist settings to data.json. */
    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }

    // ── Secret Storage ────────────────────────────────────────────

    /**
     * Load the Retype key from Obsidian's SecretStorage.
     * If a legacy `retypeProKey` field exists in data.json, migrate it.
     */
    private async loadRetypeKey(): Promise<void> {
        const secret = this.app.secretStorage.getSecret(SECRET_KEY_RETYPE);

        if (secret) {
            this.retypeProKey = secret;
        }

        // Legacy migration: retypeProKey stored in data.json
        const raw = (await this.loadData()) as Record<string, unknown> | null;
        if (raw && typeof raw[LEGACY_KEY_FIELD] === "string" && raw[LEGACY_KEY_FIELD]) {
            if (!this.retypeProKey) {
                this.retypeProKey = raw[LEGACY_KEY_FIELD] as string;
                this.app.secretStorage.setSecret(SECRET_KEY_RETYPE, raw[LEGACY_KEY_FIELD] as string);
            }
            delete raw[LEGACY_KEY_FIELD];
            await this.saveData(raw);
        }
    }

    // ── Sidebar Management ────────────────────────────────────────

    /** Reveal the existing Retype sidebar or open a new one. */
    async activateSidebar(): Promise<void> {
        const { workspace } = this.app;

        const existing = workspace.getLeavesOfType(VIEW_TYPE_RETYPE_SIDEBAR);
        if (existing.length > 0) {
            workspace.revealLeaf(existing[0]);
            return;
        }

        const leaf = workspace.getRightLeaf(false);
        if (leaf) {
            await leaf.setViewState({
                type: VIEW_TYPE_RETYPE_SIDEBAR,
                active: true,
            });
            workspace.revealLeaf(leaf);
        }
    }

    /** Check whether the sidebar panel is currently visible. */
    isSidebarOpen(): boolean {
        return (
            this.app.workspace.getLeavesOfType(VIEW_TYPE_RETYPE_SIDEBAR)
                .length > 0
        );
    }

    /** Close all Retype sidebar leaves. */
    closeSidebar(): void {
        this.app.workspace
            .getLeavesOfType(VIEW_TYPE_RETYPE_SIDEBAR)
            .forEach((leaf) => leaf.detach());
    }

    // ── Status Bar ────────────────────────────────────────────────

    /** Create the status bar item and wire the click handler. */
    initStatusBar(): void {
        this.statusBarItem = this.addStatusBarItem();
        this.statusBarItem.addClass(CSS.statusBar);
        this.statusBarItem.style.cursor = "pointer";
        this.statusBarItem.addEventListener("click", () => {
            const url = this.cli?.serverUrl;
            if (this.cli?.status === "running" && url) {
                window.open(url);
            } else if (this.isSidebarOpen()) {
                this.closeSidebar();
            } else {
                this.activateSidebar();
            }
        });
        this.updateStatusBar();
    }

    /** Set the status bar text based on current CLI state. */
    updateStatusBar(): void {
        if (!this.statusBarItem) {
            return;
        }

        const status = this.cli?.status ?? "stopped";
        const url = this.cli?.serverUrl;

        let text: string;
        switch (status) {
            case "running": {
                if (url) {
                    try {
                        text = STATUS_BAR.runningTemplate.replace(
                            "{host}",
                            new URL(url).host
                        );
                    } catch {
                        text = STATUS_BAR.runningFallback;
                    }
                } else {
                    text = STATUS_BAR.runningFallback;
                }
                break;
            }
            case "starting":
                text = STATUS_BAR.starting;
                break;
            case "error":
                text = STATUS_BAR.error;
                break;
            default:
                text = STATUS_BAR.stopped;
        }

        this.statusBarItem.textContent = text;
        this.statusBarItem.title =
            status === "running" && url
                ? STATUS_BAR.titleRunning.replace("{url}", url)
                : STATUS_BAR.titleDefault;
    }

    /** Create or remove the status bar item to match the current setting. */
    refreshStatusBar(): void {
        if (this.settings.showStatusBar && !this.statusBarItem) {
            this.initStatusBar();
        } else if (!this.settings.showStatusBar && this.statusBarItem) {
            this.statusBarItem.remove();
            this.statusBarItem = null;
        }
    }

    // ── Plugin Directory ──────────────────────────────────────────

    /** Absolute filesystem path to this plugin's install directory. */
    getPluginDir(): string {
        const adapter = this.app.vault.adapter as FileSystemAdapter;
        return adapter.getFullPath(this.manifest.dir ?? "");
    }

    // ── CLI Auto-Resolution ───────────────────────────────────────

    /**
     * Ensures a usable Retype binary is available, installing from npm
     * if needed. Called once on load; never blocks plugin startup.
     *
     * Resolution order:
     *  1. Global `retype` on enriched PATH (handles macOS GUI apps)
     *  2. Local binary already present at `[pluginDir]/node_modules/retypeapp/…`
     *  3. Auto-install via `npm install retypeapp` into the plugin directory
     *  4. Error notice — npm unavailable or install failed
     */
    async checkAndPrepareCli(): Promise<void> {
        // 1. Global install (enriched PATH resolves nvm / homebrew / dotnet)
        const globalBin = await this.installer.resolveGlobalBinary();
        if (globalBin) {
            this.cli.updateCliPath(globalBin);
            console.log(INSTALLER.usingGlobal, globalBin);
            await this.sidebarView?.refreshCliVersion();
            return;
        }

        // 2. Previously installed local binary
        const localBin = this.installer.findLocalBinary();
        if (localBin) {
            this.cli.updateCliPath(localBin);
            console.log(INSTALLER.usingLocal, localBin);
            await this.sidebarView?.refreshCliVersion();
            return;
        }

        // 3. Auto-install from npm
        const notice = new Notice(NOTICES.installing, 0);
        try {
            const binPath = await this.installer.install((line) => {
                this.sidebarView?.appendLog(line);
            });

            this.cli.updateCliPath(binPath);
            notice.hide();
            new Notice(NOTICES.installed, 4000);
            console.log(INSTALLER.usingLocal, binPath);
            await this.sidebarView?.refreshCliVersion();
        } catch (err) {
            notice.hide();
            const message = (err as Error).message;
            console.error(INSTALLER.notFound, message);
            new Notice(
                NOTICES.installFailed.replace("{message}", message),
                0
            );
            this.sidebarView?.appendLog(
                `[ERROR] ${message}`,
                CSS.logLineError
            );
        }
    }
}
