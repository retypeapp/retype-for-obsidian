// ── main.ts ───────────────────────────────────────────────────────────────
// Retype — plugin entry point.
// Registers services, sidebar view, ribbon icon, status bar, commands, and
// settings tab.  Auto-resolves the Retype CLI on first load.
// ──────────────────────────────────────────────────────────────────────────

import {
    Plugin,
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
import { CliDetector, DETECTOR_EVENTS, type CliDetectionResult, type PackageManagerResult } from "./services/CliDetector";
import { InstallService } from "./services/InstallService";
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
    CLI_EVENTS,
    LABELS,
    DETECTOR,
} from "./config";

// ── RetypePlugin ──────────────────────────────────────────────────────────

export default class RetypePlugin extends Plugin {
    settings!: RetypePluginSettings;
    cli!: CliService;
    detector!: ProjectDetector;
    cliDetector!: CliDetector;
    installService!: InstallService;

    /** Last CLI detection result — shared with the panel view. */
    cliDetection: CliDetectionResult = { found: false };
    /** Last package manager detection result — shared with the panel view. */
    pmDetection: PackageManagerResult | null = null;

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
        this.cliDetector = new CliDetector();
        this.installService = new InstallService(this.cliDetector);

        // When CLI is detected (via polling or redetect), update state
        this.cliDetector.on(DETECTOR_EVENTS.stateChanged, (result: CliDetectionResult) => {
            this.cliDetection = result;
            this.pmDetection = this.cliDetector.lastPmResult;
            if (result.found && result.path) {
                this.cli.updateCliPath(result.path);
                console.log(DETECTOR.usingCli, result.path);
            }
            void this.sidebarView?.onDetectionComplete();
        });

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
            void this.activateSidebar();
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
            callback: () => {
                void this.activateSidebar();
            },
        });

        this.addCommand({
            id: COMMANDS.startServer.id,
            name: COMMANDS.startServer.name,
            callback: () => {
                void this.startServerFromCommand();
            },
        });

        this.addCommand({
            id: COMMANDS.stopServer.id,
            name: COMMANDS.stopServer.name,
            callback: () => this.cli.stop(),
        });

        // ── Active leaf change ────────────────────────────────────
        this.registerEvent(
            this.app.workspace.on("active-leaf-change", () => {
                void this.sidebarView?.onActiveFileChange();
            })
        );

        // ── Settings tab ──────────────────────────────────────────
        this.addSettingTab(new RetypeSettingTab(this.app, this));

        // ── Detect CLI (non-blocking) ─────────────────────────────
        void this.detectCli();
    }

    async onunload(): Promise<void> {
        this.cliDetector?.stopPolling();
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
            const legacyKey = raw[LEGACY_KEY_FIELD];
            if (!this.retypeProKey) {
                this.retypeProKey = legacyKey;
                await this.app.secretStorage.setSecret(
                    SECRET_KEY_RETYPE,
                    legacyKey
                );
            }
            delete raw[LEGACY_KEY_FIELD];
            await this.saveData(raw);
        }
    }

    private async startServerFromCommand(): Promise<void> {
        await this.activateSidebar();
        await this.sidebarView?.onStartClick();
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
        this.statusBarItem.addEventListener("click", () => {
            const url = this.cli?.serverUrl;
            if (this.cli?.status === "running" && url) {
                window.open(url);
            } else if (this.isSidebarOpen()) {
                this.closeSidebar();
            } else {
                void this.activateSidebar();
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

    // ── CLI Detection ─────────────────────────────────────────────

    /**
     * Detect whether the Retype CLI is available on the system PATH.
     * Also detects available package managers. Results are stored on the
     * plugin instance and shared with the panel view.
     *
     * Never blocks plugin startup — runs asynchronously.
     */
    async detectCli(): Promise<void> {
        this.cliDetection = await this.cliDetector.detect();
        this.pmDetection = await this.cliDetector.detectPackageManager();

        if (this.cliDetection.found && this.cliDetection.path) {
            this.cli.updateCliPath(this.cliDetection.path);
            console.log(DETECTOR.usingCli, this.cliDetection.path);
        } else {
            console.log(DETECTOR.cliNotDetected);
            // Start polling so we detect external installs automatically
            this.cliDetector.startPolling();
        }

        // Notify the sidebar view to render the correct state
        void this.sidebarView?.onDetectionComplete();
    }
}
