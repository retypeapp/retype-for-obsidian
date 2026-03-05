// ── PanelView.ts ──────────────────────────────────────────────────────────
// Retype sidebar panel — displays project info, server status, action
// buttons (Start/Stop/Build), and a scrollable CLI output log.
// ──────────────────────────────────────────────────────────────────────────

import {
    ItemView,
    WorkspaceLeaf,
    setIcon,
    Notice,
    FileSystemAdapter,
    TFile,
} from "obsidian";

import { CliService, ServerStatus } from "../services/CliService";
import { ProjectDetector, RetypeProject } from "../services/ProjectDetector";
import type RetypePlugin from "../main";
import {
    VIEW_TYPE_RETYPE_SIDEBAR,
    ICONS,
    CSS,
    LABELS,
    STATUS_TEXT,
    NOTICES,
    CLI_EVENTS,
    LOG_PATTERNS,
    MAX_LOG_LINES,
} from "../config";

// Re-export the view type for convenience.
export { VIEW_TYPE_RETYPE_SIDEBAR };

// ── RetypePanelView ───────────────────────────────────────────────────────

export class RetypePanelView extends ItemView {
    private plugin: RetypePlugin;
    private cli: CliService;
    private detector: ProjectDetector;

    // DOM references
    private statusDot!: HTMLElement;
    private statusText!: HTMLElement;
    private statusCard!: HTMLElement;
    private cliVersionEl!: HTMLElement;
    private serverUrlEl!: HTMLElement;
    private startBtn!: HTMLButtonElement;
    private stopBtn!: HTMLButtonElement;
    private buildBtn!: HTMLButtonElement;
    private logEl!: HTMLElement;
    private projectEl!: HTMLElement;

    private currentProject: RetypeProject | null = null;
    private logLines: string[] = [];

    // Bound event handlers (stored so they can be removed in onClose)
    private onStatusChanged: (status: ServerStatus) => void = () => {};
    private onUrlFound: (url: string) => void = () => {};
    private onLog: (line: string) => void = () => {};
    private onError: (message: string) => void = () => {};
    private onStopped: () => void = () => {};

    constructor(
        leaf: WorkspaceLeaf,
        plugin: RetypePlugin,
        cli: CliService,
        detector: ProjectDetector
    ) {
        super(leaf);
        this.plugin = plugin;
        this.cli = cli;
        this.detector = detector;
    }

    /** Obsidian view type identifier. */
    getViewType(): string {
        return VIEW_TYPE_RETYPE_SIDEBAR;
    }

    /** Display text shown in the view tab header. */
    getDisplayText(): string {
        return LABELS.pluginDisplayName;
    }

    /** Lucide icon name shown in the view tab. */
    getIcon(): string {
        return ICONS.viewIcon;
    }

    // ── Lifecycle ─────────────────────────────────────────────────

    /** Build the panel UI, bind CLI events, and load initial data. */
    async onOpen(): Promise<void> {
        this.contentEl.empty();
        this.contentEl.addClass(CSS.panel);

        this.buildHeader();
        this.buildProjectInfo();
        this.buildStatusCard();
        this.buildActions();
        this.buildLogSection();

        this.bindCliEvents();
        await this.refreshProjectInfo();
        await this.refreshCliVersion();
        this.syncButtonStates();
    }

    /** Remove CLI event listeners to prevent handler accumulation. */
    async onClose(): Promise<void> {
        this.cli.removeListener(CLI_EVENTS.statusChanged, this.onStatusChanged);
        this.cli.removeListener(CLI_EVENTS.urlFound, this.onUrlFound);
        this.cli.removeListener(CLI_EVENTS.log, this.onLog);
        this.cli.removeListener(CLI_EVENTS.error, this.onError);
        this.cli.removeListener(CLI_EVENTS.stopped, this.onStopped);
    }

    // ── Section Builders ──────────────────────────────────────────

    /** Branded header bar with logo, name, version badge, and gear button. */
    private buildHeader(): void {
        const header = this.contentEl.createDiv({ cls: CSS.header });

        const brand = header.createDiv({ cls: CSS.headerBrand });
        const logoEl = brand.createSpan({ cls: CSS.headerLogo });
        setIcon(logoEl, ICONS.retypeLogo);
        brand.createSpan({ cls: CSS.headerName, text: LABELS.pluginDisplayName });
        this.cliVersionEl = brand.createSpan({ cls: CSS.headerVersion });

        const gearBtn = header.createEl("button", {
            cls: CSS.headerGear,
            title: LABELS.gearTooltip,
            attr: { "aria-label": LABELS.gearTooltip },
        });
        setIcon(gearBtn.createSpan(), ICONS.settings);
        gearBtn.addEventListener("click", () => {
            // Open Obsidian Settings → Retype tab
            type AppWithSetting = typeof this.app & {
                setting: { open: () => void; openTabById: (id: string) => void };
            };
            const a = this.app as AppWithSetting;
            a.setting.open();
            a.setting.openTabById(LABELS.pluginId);
        });
    }

    /** Project info block — name + clickable config path. */
    private buildProjectInfo(): void {
        const section = this.contentEl.createDiv({ cls: CSS.infoSection });
        this.projectEl = section.createDiv({ cls: CSS.projectBlock });
    }

    /** Server status card with dot, label, and URL row. */
    private buildStatusCard(): void {
        const section = this.contentEl.createDiv({ cls: CSS.statusSection });

        this.statusCard = section.createDiv({
            cls: `${CSS.statusCard} stopped`,
        });

        const statusRow = this.statusCard.createDiv({ cls: CSS.statusRow });
        this.statusDot = statusRow.createSpan({ cls: `${CSS.statusDot} stopped` });
        this.statusText = statusRow.createSpan({
            cls: CSS.statusText,
            text: STATUS_TEXT.stopped,
        });

        // URL — inline, right-aligned within the status row.
        this.serverUrlEl = statusRow.createSpan({ cls: CSS.statusUrlRow });
        this.serverUrlEl.style.display = "none";
    }

    /** Start / Stop / Build action buttons. */
    private buildActions(): void {
        const section = this.contentEl.createDiv({ cls: CSS.actions });
        const primary = section.createDiv({ cls: CSS.actionsPrimary });

        // Start button
        this.startBtn = primary.createEl("button", {
            cls: `${CSS.btn} ${CSS.btnStart}`,
        });
        setIcon(this.startBtn.createSpan(), ICONS.play);
        this.startBtn.createSpan({ text: LABELS.startButton });
        this.startBtn.addEventListener("click", () => this.onStartClick());

        // Stop button (hidden initially)
        this.stopBtn = primary.createEl("button", {
            cls: `${CSS.btn} ${CSS.btnStop}`,
        });
        setIcon(this.stopBtn.createSpan(), ICONS.stop);
        this.stopBtn.createSpan({ text: LABELS.stopButton });
        this.stopBtn.addEventListener("click", () => this.onStopClick());
        this.stopBtn.style.display = "none";

        // Build button
        this.buildBtn = primary.createEl("button", {
            cls: `${CSS.btn} ${CSS.btnBuild}`,
        });
        setIcon(this.buildBtn.createSpan(), ICONS.build);
        this.buildBtn.createSpan({ text: LABELS.buildButton });
        this.buildBtn.addEventListener("click", () => this.onBuildClick());
    }

    /** Output log section with header + scrollable body. */
    private buildLogSection(): void {
        const section = this.contentEl.createDiv({ cls: CSS.output });

        const header = section.createDiv({ cls: CSS.outputHeader });
        header.createSpan({ cls: CSS.outputTitle, text: LABELS.outputTitle });

        const clearBtn = header.createEl("button", {
            cls: CSS.outputClear,
            title: LABELS.clearLogTooltip,
            attr: { "aria-label": LABELS.clearLogTooltip },
        });
        setIcon(clearBtn.createSpan(), ICONS.clearLog);
        clearBtn.addEventListener("click", () => this.clearLog());

        const body = section.createDiv({ cls: CSS.outputBody });
        this.logEl = body.createDiv({ cls: CSS.log });
        this.appendLog(LABELS.initialLogLine);
    }

    // ── CLI Event Binding ─────────────────────────────────────────

    private bindCliEvents(): void {
        this.onStatusChanged = (status: ServerStatus) => {
            this.updateStatusUI(status);
            this.syncButtonStates();
        };

        this.onUrlFound = (url: string) => {
            this.showServerUrl(url);
            if (this.plugin.settings.autoOpenBrowser) {
                window.open(url);
            }
        };

        this.onLog = (line: string) => {
            this.appendLog(line);
        };

        this.onError = (message: string) => {
            this.appendLog(`[ERROR] ${message}`, CSS.logLineError);
            new Notice(`Retype: ${message}`, 8000);
        };

        this.onStopped = () => {
            this.serverUrlEl.style.display = "none";
        };

        this.cli.on(CLI_EVENTS.statusChanged, this.onStatusChanged);
        this.cli.on(CLI_EVENTS.urlFound, this.onUrlFound);
        this.cli.on(CLI_EVENTS.log, this.onLog);
        this.cli.on(CLI_EVENTS.error, this.onError);
        this.cli.on(CLI_EVENTS.stopped, this.onStopped);
    }

    // ── Button Click Handlers ─────────────────────────────────────

    /** Handle the Start button click — refresh project info and launch the CLI. */
    async onStartClick(): Promise<void> {
        if (this.cli.isRunning) {
            return;
        }

        await this.refreshProjectInfo();

        const root =
            this.currentProject?.root ??
            (this.app.vault.adapter as FileSystemAdapter).getBasePath();

        const key = this.plugin.retypeProKey || undefined;

        // Always suppress the CLI's own browser launch; the urlFound
        // handler opens the browser once when autoOpenBrowser is enabled.
        await this.cli.start(root, key, true);
    }

    private onStopClick(): void {
        this.cli.stop();
    }

    private async onBuildClick(): Promise<void> {
        if (this.cli.isRunning) {
            new Notice(NOTICES.stopBeforeBuild, 4000);
            return;
        }

        this.buildBtn.disabled = true;

        const root =
            this.currentProject?.root ??
            (this.app.vault.adapter as FileSystemAdapter).getBasePath();

        const key = this.plugin.retypeProKey || undefined;

        try {
            await this.cli.build(root, key);
            new Notice(NOTICES.buildComplete, 4000);
        } catch (err) {
            new Notice(
                NOTICES.buildFailed.replace("{message}", (err as Error).message),
                8000
            );
        } finally {
            this.buildBtn.disabled = false;
        }
    }

    // ── UI Update Helpers ─────────────────────────────────────────

    private updateStatusUI(status: ServerStatus): void {
        this.statusDot.className = `${CSS.statusDot} ${status}`;
        this.statusCard.className = `${CSS.statusCard} ${status}`;
        this.statusText.textContent = STATUS_TEXT[status];

        if (status !== "running") {
            this.serverUrlEl.style.display = "none";
        }
    }

    private syncButtonStates(): void {
        const running = this.cli.isRunning;
        this.startBtn.style.display = running ? "none" : "";
        this.stopBtn.style.display = running ? "" : "none";
        this.buildBtn.disabled = running;
    }

    private showServerUrl(url: string): void {
        this.serverUrlEl.empty();
        this.serverUrlEl.style.display = "inline";

        const link = this.serverUrlEl.createEl("a", {
            cls: CSS.statusUrlText,
            text: url,
            href: url,
        });
        link.addEventListener("click", (e) => {
            e.preventDefault();
            window.open(url);
        });
    }

    /** Append a line to the output log with optional CSS class. Auto-scrolls. */
    appendLog(line: string, cls?: string): void {
        this.logLines.push(line);
        if (this.logLines.length > MAX_LOG_LINES) {
            this.logLines.shift();
        }

        const lineEl = this.logEl.createDiv({ text: line });
        if (cls) {
            lineEl.addClass(cls);
        } else if (LOG_PATTERNS.error.test(line)) {
            lineEl.addClass(CSS.logLineError);
        } else if (LOG_PATTERNS.warning.test(line)) {
            lineEl.addClass(CSS.logLineWarning);
        } else if (LOG_PATTERNS.url.test(line)) {
            lineEl.addClass(CSS.logLineUrl);
        } else if (LOG_PATTERNS.success.test(line)) {
            lineEl.addClass(CSS.logLineSuccess);
        }

        this.logEl.scrollTop = this.logEl.scrollHeight;
    }

    private clearLog(): void {
        this.logLines = [];
        this.logEl.empty();
    }

    // ── Data Refresh ──────────────────────────────────────────────

    /** Refresh the project info block from the active file's nearest retype.yml. */
    async refreshProjectInfo(): Promise<void> {
        const activeFile = this.app.workspace.getActiveFile();
        this.currentProject = await this.detector.findNearestProject(activeFile);

        this.projectEl.empty();

        if (this.currentProject) {
            const headerRow = this.projectEl.createDiv({ cls: CSS.projectHeader });
            headerRow.createDiv({
                cls: CSS.projectName,
                text: this.currentProject.name,
            });

            const pathEl = headerRow.createDiv({
                cls: `${CSS.projectPath} ${CSS.projectPathLink}`,
                text: this.currentProject.configPath,
                title: LABELS.configPathTooltip,
            });
            pathEl.addEventListener("click", async () => {
                const file = this.app.vault.getAbstractFileByPath(
                    this.currentProject!.configPath
                );
                if (file instanceof TFile) {
                    const leaf = this.app.workspace.getLeaf(false);
                    await leaf.openFile(file);
                }
            });
        } else {
            this.projectEl.createDiv({
                cls: `${CSS.projectName} ${CSS.projectNone}`,
                text: LABELS.noProjectName,
            });
            this.projectEl.createDiv({
                cls: CSS.projectPath,
                text: LABELS.noProjectPath,
            });
        }
    }

    /** Query the CLI version and update the header badge. */
    async refreshCliVersion(): Promise<void> {
        const version = await this.cli.getVersion();
        this.cliVersionEl.empty();

        if (version) {
            this.cliVersionEl.textContent = `v${version}`;
        }
    }

    // ── Public API ────────────────────────────────────────────────

    /** Called when the active file changes — refreshes project info if server is stopped. */
    async onActiveFileChange(): Promise<void> {
        if (!this.cli.isRunning) {
            await this.refreshProjectInfo();
        }
    }
}
