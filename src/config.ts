// ── config.ts ─────────────────────────────────────────────────────────────
// Centralized configuration — ALL string literals, labels, icon names,
// CSS class names, command IDs, setting keys, default values, patterns,
// and other constants used across the plugin. No other source file shall
// contain hardcoded string literals.
// ──────────────────────────────────────────────────────────────────────────

// ── Icons ─────────────────────────────────────────────────────────────────

/** Custom Retype brand icon SVG (3 geometric paths, fits 0 0 100 100 viewBox). */
export const RETYPE_ICON_SVG =
    `<g fill="currentColor" transform="scale(2)">` +
    `<path d="M0 0V41.7115H28.5062V0H0ZM23.388 36.5888H5.12267V5.11824H23.388V36.5888Z"/>` +
    `<path d="M33.135 41.7155H38.2532V9.74208L33.135 4.61938V41.7155Z"/>` +
    `<path d="M42.8773 14.3665V41.7157H48V19.4891L42.8773 14.3665Z"/>` +
    `</g>`;

export const ICONS = {
    /** Custom icon name registered via addIcon() */
    retypeLogo: "retype-logo",
    /** Lucide icon for the Start button */
    play: "play",
    /** Lucide icon for the Stop button */
    stop: "square",
    /** Lucide icon for the Build button */
    build: "package",
    /** Lucide icon for the Clear log button */
    clearLog: "ban",
    /** Lucide icon for the Settings gear */
    settings: "settings",
    /** Default view icon shown in the tab header */
    viewIcon: "retype-logo",
} as const;

// ── View ──────────────────────────────────────────────────────────────────

/** Obsidian view type ID for the Retype sidebar panel. */
export const VIEW_TYPE_RETYPE_SIDEBAR = "retype-sidebar";

// ── Commands ──────────────────────────────────────────────────────────────

export const COMMANDS = {
    openSidebar: {
        id: "open-sidebar",
        name: "Open Retype panel",
    },
    startServer: {
        id: "start-server",
        name: "Start Retype server",
    },
    stopServer: {
        id: "stop-server",
        name: "Stop Retype server",
    },
    toggleServer: {
        id: "toggle-server",
        name: "Toggle Retype server (start / stop)",
    },
} as const;

// ── Settings ──────────────────────────────────────────────────────────────

/** Key used with Obsidian's SecretStorage API for the Retype license key. */
export const SECRET_KEY_RETYPE = "retype-key";

/** Plugin setting keys (stored in data.json). */
export const SETTING_KEYS = {
    autoOpenBrowser: "autoOpenBrowser",
    showStatusBar: "showStatusBar",
} as const;

/** Default setting values. */
export const DEFAULT_SETTING_VALUES = {
    autoOpenBrowser: true,
    showStatusBar: true,
} as const;

// ── Labels & Text ─────────────────────────────────────────────────────────

export const LABELS = {
    /** Display name shown in the panel header and view tab. */
    pluginDisplayName: "Retype",
    /** Plugin ID used for navigating to the settings tab. */
    pluginId: "retype",
    /** Retype Key setting. */
    settingKeyName: "Retype Key",
    settingKeyDesc: "Your Retype Pro or Community key.",
    settingKeyPlaceholder: "Paste key here",
    /** Auto-open browser setting. */
    settingAutoOpenName: "Open browser automatically",
    settingAutoOpenDesc: "Open the default web browser when the Retype server starts.",
    /** Show status bar setting. */
    settingStatusBarName: "Show status bar item",
    settingStatusBarDesc: "Show Retype server status in the Obsidian status bar.",
    /** Ribbon button tooltip. */
    ribbonTooltip: "Retype",
    /** Gear button tooltip. */
    gearTooltip: "Retype Settings",
    /** Clear log button tooltip. */
    clearLogTooltip: "Clear output",
    /** Output panel heading. */
    outputTitle: "Output",
    /** Initial log line shown when the panel opens. */
    initialLogLine: "Click \u25B6 Start to launch the Retype server.",
    /** Project info — no project found. */
    noProjectName: "No project",
    noProjectPath: "No retype.yml found in vault",
    /** Config path click tooltip. */
    configPathTooltip: "Click to open retype.yml",
    /** Button labels. */
    startButton: "Start",
    stopButton: "Stop",
    buildButton: "Build",
} as const;

// ── Status ────────────────────────────────────────────────────────────────

export const STATUS_TEXT = {
    stopped: "Server stopped",
    starting: "Starting\u2026",
    running: "Server running",
    error: "Error",
} as const;

export const STATUS_BAR = {
    stopped: "\u2B21 Retype",
    starting: "\u2B21 Retype: Starting\u2026",
    error: "\u2B21 Retype: Error",
    /** Template — replace {host} at runtime. */
    runningTemplate: "\u2B21 Retype: {host}",
    runningFallback: "\u2B21 Retype: Running",
    titleRunning: "Retype server: {url} (click to open panel)",
    titleDefault: "Retype (click to open panel)",
} as const;

// ── Notice Messages ───────────────────────────────────────────────────────

export const NOTICES = {
    cliReady: "Retype CLI found \u2713",
    cliNotFound: "Retype CLI not found. npm is not available to install it automatically. Install Retype manually \u2014 see https://retype.com/guides/getting-started/",
    installing: "Installing Retype CLI\u2026 this may take a moment.",
    installed: "Retype CLI installed \u2713",
    installFailed: "Retype CLI installation failed: {message}",
    setupFailed: "Retype CLI setup failed. Open the Retype panel for details.",
    buildComplete: "Retype build completed \u2713",
    buildFailed: "Retype build failed: {message}",
    stopBeforeBuild: "Stop the Retype server before running a build.",
} as const;

// ── CLI Events ────────────────────────────────────────────────────────────

export const CLI_EVENTS = {
    statusChanged: "status-changed",
    urlFound: "url-found",
    log: "log",
    error: "error",
    stopped: "stopped",
} as const;

// ── CLI Log Messages ──────────────────────────────────────────────────────

export const CLI_LOG = {
    keyValid: "[Key validation passed \u2713]",
    serverStopped: "\n[Retype server stopped (exit code {code})]",
    stopping: "\n[Stopping Retype server\u2026]",
    buildComplete: "\n[Build completed \u2713]",
    buildError: "\n[ERROR] retype build exited with code {code}",
    commandPrefix: "> {cli} {args}",
    workingDir: "  Working directory: {root}",
    errorPrefix: "[ERROR] {message}",
    keyInvalid: "Retype key is invalid. Check your Pro key and try again.",
    cliNotFound: "Retype CLI not found at \"{path}\". Install it with: npm install retypeapp --global",
    processError: "Process error: {message}",
    alreadyRunning: "Server is already running. Stop it first.",
} as const;

// ── CSS Classes ───────────────────────────────────────────────────────────

export const CSS = {
    /** Root panel container. */
    panel: "retype-panel",
    /** Header bar. */
    header: "retype-ph",
    headerBrand: "retype-ph-brand",
    headerLogo: "retype-ph-logo",
    headerName: "retype-ph-name",
    headerVersion: "retype-ph-version",
    headerGear: "retype-ph-gear",
    /** Project info section. */
    infoSection: "retype-info-section",
    projectBlock: "retype-project-block",
    projectHeader: "retype-project-header",
    projectName: "retype-project-name",
    projectNone: "retype-project-none",
    projectPath: "retype-project-path",
    projectPathLink: "retype-project-path-link",
    /** Status card. */
    statusSection: "retype-status-section",
    statusCard: "retype-status-card",
    statusRow: "retype-sc-row",
    statusDot: "retype-sc-dot",
    statusText: "retype-sc-text",
    statusUrlRow: "retype-sc-url-row",
    statusUrlText: "retype-sc-url-text",
    /** Action buttons. */
    actions: "retype-actions",
    actionsPrimary: "retype-actions-primary",
    btn: "retype-btn",
    btnStart: "retype-btn-start",
    btnStop: "retype-btn-stop",
    btnBuild: "retype-btn-build",
    /** Output log. */
    output: "retype-output",
    outputHeader: "retype-output-header",
    outputTitle: "retype-output-title",
    outputClear: "retype-output-clear",
    outputBody: "retype-output-body",
    log: "retype-log",
    logLineError: "retype-log-line-error",
    logLineWarning: "retype-log-line-warning",
    logLineUrl: "retype-log-line-url",
    logLineSuccess: "retype-log-line-success",
    /** Status bar. */
    statusBar: "retype-status-bar",
} as const;

// ── Patterns ──────────────────────────────────────────────────────────────

/** Regex to detect an HTTP/HTTPS URL in CLI output. */
export const URL_PATTERN = /https?:\/\/[^\s]+/;

/** Regex to extract a semver version string from CLI output. */
export const VERSION_PATTERN = /(\d+\.\d+[\.\d]*)/;

/** Log line classification patterns (case-insensitive). */
export const LOG_PATTERNS = {
    error: /error|failed/i,
    warning: /warn/i,
    url: /https?:\/\//i,
    success: /success|complete/i,
} as const;

/** Retype config file names to look for. */
export const CONFIG_FILE_NAMES = ["retype.yml", "retype.yaml"] as const;

/** Regex to extract the title field from a retype.yml file. */
export const YAML_TITLE_PATTERN = /^\s*title\s*:\s*(.+)$/m;

/** Maximum number of log lines to keep in the output panel. */
export const MAX_LOG_LINES = 500;

/** Key redaction placeholder. */
export const KEY_REDACTED = "********";

// ── Installer Messages ────────────────────────────────────────────────────

export const INSTALLER = {
    unsupportedPlatform: "Platform \"{platform}\" is not supported by retypeapp.",
    usingGlobal: "Using global Retype CLI:",
    usingLocal: "Using local Retype CLI:",
    npmNotFound: "npm is not available on this system. Install Retype manually \u2014 see https://retype.com/guides/getting-started/",
    npmInstalling: "Running: npm install retypeapp\u2026",
    npmError: "npm install failed: {message}",
    npmExitCode: "npm install exited with code {code}",
    binaryNotFound: "npm install succeeded but the Retype binary was not found at: {path}",
    notFound: "Retype CLI not found. Install Retype globally or ensure npm is available \u2014 see https://retype.com/guides/getting-started/",
} as const;

// ── Legacy Settings Keys ──────────────────────────────────────────────────

/** Legacy data.json key for Retype key (before SecretStorage migration). */
export const LEGACY_KEY_FIELD = "retypeProKey";
