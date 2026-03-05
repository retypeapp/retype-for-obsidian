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

    // State: controls which UI is rendered (install vs. ready)
    private isCliAvailable = false;

    // DOM references — ready state
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

    // DOM references — install state
    private installSection!: HTMLElement;
    private installBtn!: HTMLButtonElement | null;
    private outputSection!: HTMLElement;

    private currentProject: RetypeProject | null = null;
    private logLines: string[] = [];
    private isInstalling = false;

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
        // Sync state from plugin detection results
        this.isCliAvailable = this.plugin.cliDetection.found;

        this.contentEl.empty();
        this.contentEl.addClass(CSS.panel);

        this.buildHeader();

        if (this.isCliAvailable) {
            this.buildReadyState();
        } else {
            this.buildInstallState();
        }

        this.buildLogSection();
        this.bindCliEvents();

        if (this.isCliAvailable) {
            await this.refreshProjectInfo();
            await this.refreshCliVersion();
            this.syncButtonStates();
        } else {
            // Hide the output section until an install starts
            this.outputSection.style.display = "none";
        }
    }

    /** Remove CLI event listeners to prevent handler accumulation. */
    async onClose(): Promise<void> {
        this.unbindCliEvents();
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
        this.cliVersionEl.style.display = this.isCliAvailable ? "" : "none";

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

    /** Build the ready-state sections: project info, status, actions. */
    private buildReadyState(): void {
        this.buildProjectInfo();
        this.buildStatusCard();
        this.buildActions();
    }

    /**
     * Build the install-state UI: heading, message, install button
     * (if a package manager is detected), code block with the install
     * command, and a link to the installation guide.
     */
    private buildInstallState(): void {
        this.installSection = this.contentEl.createDiv({ cls: CSS.installSection });

        // ── Step 1: Plugin installed ──────────────────────────────
        this.installSection.createDiv({
            cls: CSS.installStepHeading,
            text: LABELS.step1Heading,
        });

        const step1Msg = this.installSection.createDiv({
            cls: CSS.installStepMessage,
            text: LABELS.step1Message,
        });

        // ── Step 2: Add Retype CLI ────────────────────────────────
        this.installSection.createDiv({
            cls: CSS.installStepHeading,
            text: LABELS.step2Heading,
        });

        const pm = this.plugin.pmDetection;

        // Only show the button, hint, and code block if a package manager was detected
        if (pm && pm.manager) {
            this.installBtn = this.installSection.createEl("button", {
                cls: `${CSS.btn} ${CSS.installBtn}`,
            });
            setIcon(this.installBtn.createSpan(), "circle-plus");
            this.installBtn.createSpan({ text: LABELS.installButton });
            this.installBtn.addEventListener("click", () => this.onInstallClick());

            // Manual install hint
            this.installSection.createDiv({
                cls: CSS.installStepMessage,
                text: LABELS.manualInstallHint,
            });

            // Code block with the install command + copy button
            const codeBlock = this.installSection.createDiv({ cls: CSS.installCode });
            const command = pm.command;
            codeBlock.createEl("code", { text: command });

            const copyBtn = codeBlock.createEl("button", {
                cls: CSS.installCodeCopy,
                title: LABELS.copyTooltip,
                attr: { "aria-label": LABELS.copyTooltip },
            });
            setIcon(copyBtn, "copy");
            copyBtn.addEventListener("click", () => {
                navigator.clipboard.writeText(command);
                copyBtn.title = LABELS.copiedTooltip;
                copyBtn.setAttribute("aria-label", LABELS.copiedTooltip);
                setTimeout(() => {
                    copyBtn.title = LABELS.copyTooltip;
                    copyBtn.setAttribute("aria-label", LABELS.copyTooltip);
                }, 2000);
            });
        } else {
            this.installBtn = null;
        }

        // Link to installation guide
        const guideLink = this.installSection.createEl("a", {
            cls: CSS.installGuide,
            text: LABELS.installGuideLabel,
            href: LABELS.installGuideUrl,
        });
        guideLink.addEventListener("click", (e) => {
            e.preventDefault();
            window.open(LABELS.installGuideUrl);
        });
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
        this.outputSection = this.contentEl.createDiv({ cls: CSS.output });

        const header = this.outputSection.createDiv({ cls: CSS.outputHeader });
        header.createSpan({ cls: CSS.outputTitle, text: LABELS.outputTitle });

        const clearBtn = header.createEl("button", {
            cls: CSS.outputClear,
            title: LABELS.clearLogTooltip,
            attr: { "aria-label": LABELS.clearLogTooltip },
        });
        setIcon(clearBtn.createSpan(), ICONS.clearLog);
        clearBtn.addEventListener("click", () => this.clearLog());

        const body = this.outputSection.createDiv({ cls: CSS.outputBody });
        this.logEl = body.createDiv({ cls: CSS.log });

        // Replay existing lines if we have them (preserves content across
        // re-renders). Only show the initial welcome line when in ready state
        // with no existing log content.
        const savedLines = this.logLines.length > 0
            ? [...this.logLines]
            : this.isCliAvailable ? [LABELS.initialLogLine] : [];
        this.logLines = [];
        for (const line of savedLines) {
            this.appendLog(line);
        }
    }

    // ── CLI Event Binding ─────────────────────────────────────────

    /** Remove any previously bound CLI event listeners. */
    private unbindCliEvents(): void {
        this.cli.removeListener(CLI_EVENTS.statusChanged, this.onStatusChanged);
        this.cli.removeListener(CLI_EVENTS.urlFound, this.onUrlFound);
        this.cli.removeListener(CLI_EVENTS.log, this.onLog);
        this.cli.removeListener(CLI_EVENTS.error, this.onError);
        this.cli.removeListener(CLI_EVENTS.stopped, this.onStopped);
    }

    private bindCliEvents(): void {
        // Ensure we never stack duplicate listeners across re-renders
        this.unbindCliEvents();
        this.onStatusChanged = (status: ServerStatus) => {
            this.updateStatusUI(status);
            this.syncButtonStates();
        };

        this.onUrlFound = (url: string) => {
            this.showServerUrl(url);
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

        // Pass --no-open only when the user has disabled auto-open.
        // When enabled, Retype opens the browser itself.
        const noOpen = !this.plugin.settings.autoOpenBrowser;
        await this.cli.start(root, key, noOpen);
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

    // ── Install Click Handler ─────────────────────────────────────

    /**
     * Handle the "Install Retype" button click.
     * Disables the button, shows the console, streams install output,
     * and transitions to ready state on success.
     */
    private async onInstallClick(): Promise<void> {
        const pm = this.plugin.pmDetection;
        if (!pm || !pm.manager || !pm.path || this.isInstalling) {
            return;
        }

        this.isInstalling = true;

        // Disable button and change label to "Installing…"
        if (this.installBtn) {
            this.installBtn.disabled = true;
            this.installBtn.textContent = LABELS.installingButton;
            this.installBtn.addClass(CSS.installBtnDisabled);
        }

        // Show the console section for install output
        this.outputSection.style.display = "";

        const result = await this.plugin.installService.install(
            pm.manager,
            pm.path,
            (line: string) => this.appendLog(line)
        );

        if (result.success) {
            // Re-read detection from plugin (redetect was called by InstallService)
            this.plugin.cliDetection = this.plugin.cliDetector.lastResult;
            if (this.plugin.cliDetection.found && this.plugin.cliDetection.path) {
                this.plugin.cli.updateCliPath(this.plugin.cliDetection.path);
            }
            // Append the "Click Start" prompt after install output
            this.appendLog("");
            this.appendLog(LABELS.initialLogLine);
            new Notice(NOTICES.installSuccess, 4000);
            this.transitionToReady();
        } else {
            // Install failed — show error, keep console visible, re-enable button
            new Notice(
                NOTICES.installFailed.replace("{message}", result.error ?? "Unknown error"),
                8000
            );
            if (this.installBtn) {
                this.installBtn.disabled = false;
                this.installBtn.textContent = LABELS.installButton;
                this.installBtn.removeClass(CSS.installBtnDisabled);
            }
            this.isInstalling = false;
        }
    }

    // ── State Transitions ─────────────────────────────────────────

    /**
     * Transition from install state to ready state by re-rendering.
     */
    private transitionToReady(): void {
        this.isCliAvailable = true;
        this.isInstalling = false;
        // Re-render the full panel in ready state
        this.onOpen();
    }

    /**
     * Called by the plugin after CLI detection completes.
     * Updates the panel state and re-renders if needed.
     */
    async onDetectionComplete(): Promise<void> {
        const wasAvailable = this.isCliAvailable;
        this.isCliAvailable = this.plugin.cliDetection.found;

        if (this.isCliAvailable !== wasAvailable) {
            // State changed — full re-render
            await this.onOpen();
        } else if (this.isCliAvailable) {
            await this.refreshCliVersion();
        } else {
            // Still in install state — re-render to pick up pmDetection
            await this.onOpen();
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
