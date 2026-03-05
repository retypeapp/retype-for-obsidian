// ── CliService.ts ─────────────────────────────────────────────────────────
// Manages the Retype CLI process lifecycle — spawning, monitoring, and
// stopping `retype start` and `retype build`. Emits typed events for
// status changes, log output, URL detection, and errors.
// ──────────────────────────────────────────────────────────────────────────

import { spawn, ChildProcess, execFile } from "child_process";
import { EventEmitter } from "events";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import {
    URL_PATTERN,
    VERSION_PATTERN,
    KEY_REDACTED,
    CLI_EVENTS,
    CLI_LOG,
} from "../config";
import { enrichedEnv } from "../utils/shellEnv";

// ── Types ─────────────────────────────────────────────────────────────────

/** Possible states of the Retype development server. */
export type ServerStatus = "stopped" | "starting" | "running" | "error";

/** Event signatures emitted by CliService. */
export interface CliServiceEvents {
    "status-changed": (status: ServerStatus) => void;
    "url-found": (url: string) => void;
    "log": (line: string) => void;
    "error": (message: string) => void;
    "stopped": () => void;
}

// ── CliService ────────────────────────────────────────────────────────────

/**
 * Spawns and monitors the Retype CLI (`retype start`, `retype build`).
 * Extends EventEmitter to broadcast status transitions and log output
 * to the sidebar panel and status bar.
 */
export class CliService extends EventEmitter {
    private process: ChildProcess | null = null;
    private _status: ServerStatus = "stopped";
    private _serverUrl = "";
    private _version: string | null = null;
    private cliPath: string;

    constructor(cliPath = "retype") {
        super();
        this.cliPath = cliPath;
    }

    // ── Accessors ─────────────────────────────────────────────────

    get status(): ServerStatus {
        return this._status;
    }

    get serverUrl(): string {
        return this._serverUrl;
    }

    get version(): string | null {
        return this._version;
    }

    get isRunning(): boolean {
        return this._status === "running" || this._status === "starting";
    }

    // ── CLI path management ───────────────────────────────────────

    /**
     * Update the path to the Retype binary and clear the cached version.
     */
    updateCliPath(newPath: string): void {
        this.cliPath = newPath;
        this._version = null;
    }

    // ── Installation check ────────────────────────────────────────

    /**
     * Returns `true` if the Retype CLI is reachable, `false` otherwise.
     */
    async isInstalled(): Promise<boolean> {
        return new Promise((resolve) => {
            execFile(
                this.cliPath,
                ["--version"],
                { timeout: 5000, shell: process.platform === "win32", env: enrichedEnv() },
                (err) => {
                    resolve(!err);
                }
            );
        });
    }

    /**
     * Returns the CLI version string (e.g. `"4.1.0"`), or `null` if not
     * installed. The result is cached after the first successful call.
     */
    async getVersion(): Promise<string | null> {
        if (this._version !== null) {
            return this._version;
        }

        return new Promise((resolve) => {
            execFile(
                this.cliPath,
                ["--version"],
                { timeout: 5000, shell: process.platform === "win32", env: enrichedEnv() },
                (err, stdout) => {
                    if (err) {
                        resolve(null);
                        return;
                    }
                    const match = stdout.match(VERSION_PATTERN);
                    this._version = match ? match[1] : stdout.trim();
                    resolve(this._version);
                }
            );
        });
    }

    // ── Server control ────────────────────────────────────────────

    /**
     * Start `retype start` in the given project root directory.
     *
     * @param projectRoot - Absolute path to the folder containing retype.yml
     * @param key         - Optional Retype license key
     * @param noOpen      - If `true`, pass `--no-open` to suppress auto-browser
     */
    async start(
        projectRoot: string,
        key?: string,
        noOpen = true
    ): Promise<void> {
        if (this.isRunning) {
            this.emit(CLI_EVENTS.error, CLI_LOG.alreadyRunning);
            return;
        }

        this._status = "starting";
        this._serverUrl = "";
        this.emit(CLI_EVENTS.statusChanged, this._status);

        // Validate key before launching the server
        if (key) {
            const isValidKey = await this.validateKey(key);
            if (!isValidKey) {
                this.setError(CLI_LOG.keyInvalid);
                return;
            }
            this.emit(CLI_EVENTS.log, CLI_LOG.keyValid);
        }

        const args: string[] = ["start"];
        if (noOpen) {
            args.push("--no-open");
        }
        if (key) {
            args.push("--key", key);
        }

        // Redact the key in log output
        const logArgs = args.map((arg, index) =>
            index > 0 && args[index - 1] === "--key" ? KEY_REDACTED : arg
        );

        this.emit(
            CLI_EVENTS.log,
            CLI_LOG.commandPrefix
                .replace("{cli}", this.cliPath)
                .replace("{args}", logArgs.join(" "))
        );
        this.emit(
            CLI_EVENTS.log,
            CLI_LOG.workingDir.replace("{root}", projectRoot)
        );
        this.emit(CLI_EVENTS.log, "");

        try {
            this.process = spawn(this.cliPath, args, {
                cwd: projectRoot,
                env: enrichedEnv(),
                shell: process.platform === "win32",
            });
        } catch (err) {
            this.setError(
                CLI_LOG.processError.replace(
                    "{message}",
                    (err as Error).message
                )
            );
            return;
        }

        this.process.stdout?.setEncoding("utf8");
        this.process.stderr?.setEncoding("utf8");

        this.process.stdout?.on("data", (data: string) => {
            this.handleOutput(data);
        });

        this.process.stderr?.on("data", (data: string) => {
            this.handleOutput(data, true);
        });

        this.process.on("error", (err) => {
            if (err.message.includes("ENOENT")) {
                this.setError(
                    CLI_LOG.cliNotFound.replace("{path}", this.cliPath)
                );
            } else {
                this.setError(
                    CLI_LOG.processError.replace("{message}", err.message)
                );
            }
        });

        this.process.on("close", (code) => {
            const wasRunning = this._status !== "error";
            this.process = null;
            this._status = "stopped";
            this._serverUrl = "";
            if (wasRunning) {
                this.emit(
                    CLI_EVENTS.log,
                    CLI_LOG.serverStopped.replace(
                        "{code}",
                        String(code)
                    )
                );
                this.emit(CLI_EVENTS.statusChanged, this._status);
                this.emit(CLI_EVENTS.stopped);
            }
        });
    }

    /**
     * Stop the running Retype server process.
     */
    stop(): void {
        if (!this.process) {
            return;
        }

        this.emit(CLI_EVENTS.log, CLI_LOG.stopping);

        if (process.platform === "win32") {
            try {
                spawn("taskkill", [
                    "/pid",
                    String(this.process.pid),
                    "/f",
                    "/t",
                ]);
            } catch {
                this.process.kill();
            }
        } else {
            this.process.kill("SIGTERM");
        }
    }

    /**
     * Stop the server and wait for the process to exit, or force-kill
     * after the timeout.
     */
    async stopAsync(timeoutMs = 3000): Promise<void> {
        if (!this.process) {
            return;
        }

        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                this.process?.kill("SIGKILL");
                resolve();
            }, timeoutMs);

            this.once(CLI_EVENTS.stopped, () => {
                clearTimeout(timer);
                resolve();
            });

            this.stop();
        });
    }

    /**
     * Run `retype build` in the given project root directory.
     * Resolves on exit code 0, rejects with a descriptive Error otherwise.
     *
     * @param projectRoot - Absolute path to the folder containing retype.yml
     * @param key         - Optional Retype license key
     */
    build(projectRoot: string, key?: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const runBuild = () => {
                const args: string[] = ["build"];
                if (key) {
                    args.push("--key", key);
                }
                const logArgs = args.map((arg, index) =>
                    index > 0 && args[index - 1] === "--key"
                        ? KEY_REDACTED
                        : arg
                );

                this.emit(
                    CLI_EVENTS.log,
                    CLI_LOG.commandPrefix
                        .replace("{cli}", this.cliPath)
                        .replace("{args}", logArgs.join(" "))
                );
                this.emit(
                    CLI_EVENTS.log,
                    CLI_LOG.workingDir.replace("{root}", projectRoot)
                );
                this.emit(CLI_EVENTS.log, "");

                let proc: ChildProcess;
                try {
                    proc = spawn(this.cliPath, args, {
                        cwd: projectRoot,
                        env: enrichedEnv(),
                        shell: process.platform === "win32",
                    });
                } catch (err) {
                    const msg = CLI_LOG.processError.replace(
                        "{message}",
                        (err as Error).message
                    );
                    this.emit(
                        CLI_EVENTS.log,
                        CLI_LOG.errorPrefix.replace("{message}", msg)
                    );
                    reject(new Error(msg));
                    return;
                }

                proc.stdout?.setEncoding("utf8");
                proc.stderr?.setEncoding("utf8");

                const forward = (data: string) =>
                    data
                        .split(/\r?\n/)
                        .filter(Boolean)
                        .forEach((l) => this.emit(CLI_EVENTS.log, l));

                proc.stdout?.on("data", forward);
                proc.stderr?.on("data", forward);

                proc.on("error", (err) => {
                    const msg = err.message.includes("ENOENT")
                        ? CLI_LOG.cliNotFound.replace("{path}", this.cliPath)
                        : CLI_LOG.processError.replace(
                              "{message}",
                              err.message
                          );
                    this.emit(
                        CLI_EVENTS.log,
                        CLI_LOG.errorPrefix.replace("{message}", msg)
                    );
                    reject(new Error(msg));
                });

                proc.on("close", (code) => {
                    if (code === 0) {
                        this.emit(CLI_EVENTS.log, CLI_LOG.buildComplete);
                        resolve();
                    } else {
                        const msg = CLI_LOG.buildError.replace(
                            "{code}",
                            String(code)
                        );
                        this.emit(CLI_EVENTS.log, msg);
                        reject(new Error(msg));
                    }
                });
            };

            // If a key is provided, validate it before building
            if (!key) {
                runBuild();
                return;
            }

            this.validateKey(key)
                .then((isValidKey) => {
                    if (!isValidKey) {
                        this.emit(
                            CLI_EVENTS.log,
                            CLI_LOG.errorPrefix.replace(
                                "{message}",
                                CLI_LOG.keyInvalid
                            )
                        );
                        reject(new Error(CLI_LOG.keyInvalid));
                        return;
                    }
                    this.emit(CLI_EVENTS.log, CLI_LOG.keyValid);
                    runBuild();
                })
                .catch((err) => {
                    const msg = CLI_LOG.processError.replace(
                        "{message}",
                        (err as Error).message
                    );
                    this.emit(
                        CLI_EVENTS.log,
                        CLI_LOG.errorPrefix.replace("{message}", msg)
                    );
                    reject(new Error(msg));
                });
        });
    }

    // ── Private helpers ───────────────────────────────────────────

    /**
     * Validate a Retype key by running `retype wallet --add` in a temp
     * HOME directory, then cleaning up. Resolves `true` if the key is
     * accepted, `false` otherwise.
     */
    private async validateKey(key: string): Promise<boolean> {
        const trimmedKey = key.trim();
        if (!trimmedKey) {
            return false;
        }

        const tempHome = await mkdtemp(join(tmpdir(), "retype-wallet-check-"));

        return new Promise((resolve) => {
            const env: NodeJS.ProcessEnv = {
                ...enrichedEnv(),
                HOME: tempHome,
            };

            if (process.platform === "win32") {
                env.USERPROFILE = tempHome;
            }

            execFile(
                this.cliPath,
                ["wallet", "--add", trimmedKey],
                {
                    timeout: 10000,
                    shell: process.platform === "win32",
                    env,
                },
                async (err) => {
                    try {
                        await rm(tempHome, { recursive: true, force: true });
                    } catch {
                        // no-op
                    }
                    resolve(!err);
                }
            );
        });
    }

    /**
     * Process raw output from the CLI, splitting by newline, emitting
     * log events, and detecting the server URL.
     */
    private handleOutput(data: string, _isStderr = false): void {
        const lines = data.split(/\r?\n/).filter(Boolean);
        for (const line of lines) {
            this.emit(CLI_EVENTS.log, line);

            // Detect server URL in output (only before first URL is found)
            if (this._status !== "running") {
                const urlMatch = line.match(URL_PATTERN);
                if (urlMatch) {
                    const url = urlMatch[0].replace(/[.,;]+$/, "");
                    this._serverUrl = url;
                    this._status = "running";
                    this.emit(CLI_EVENTS.statusChanged, this._status);
                    this.emit(CLI_EVENTS.urlFound, url);
                }
            }
        }
    }

    /**
     * Transition to the error state and emit relevant events.
     */
    private setError(message: string): void {
        this._status = "error";
        this.process = null;
        this.emit(CLI_EVENTS.error, message);
        this.emit(CLI_EVENTS.statusChanged, this._status);
        this.emit(
            CLI_EVENTS.log,
            CLI_LOG.errorPrefix.replace("{message}", message)
        );
    }

    // ── Typed event emitter overloads ─────────────────────────────

    on(event: "status-changed", listener: (s: ServerStatus) => void): this;
    on(event: "url-found", listener: (url: string) => void): this;
    on(event: "log", listener: (line: string) => void): this;
    on(event: "error", listener: (msg: string) => void): this;
    on(event: "stopped", listener: () => void): this;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    on(event: string, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    once(event: "status-changed", listener: (s: ServerStatus) => void): this;
    once(event: "url-found", listener: (url: string) => void): this;
    once(event: "log", listener: (line: string) => void): this;
    once(event: "error", listener: (msg: string) => void): this;
    once(event: "stopped", listener: () => void): this;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    once(event: string, listener: (...args: any[]) => void): this {
        return super.once(event, listener);
    }
}
