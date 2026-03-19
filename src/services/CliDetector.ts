// ── CliDetector.ts ────────────────────────────────────────────────────────
// Detects whether the Retype CLI is available on the host system PATH and
// retrieves its version via `retype -v`. Also detects available package
// managers (npm, yarn, dotnet) for user-triggered installation.
//
// This service is side-effect-free — it never installs anything.
// ──────────────────────────────────────────────────────────────────────────

import { execFile } from "child_process";
import { EventEmitter } from "events";

import { getShellPath, enrichedEnv } from "../utils/shellEnv";
import { DETECTOR } from "../config";

// ── Types ─────────────────────────────────────────────────────────────────

/** Result of a CLI detection check. */
export interface CliDetectionResult {
    found: boolean;
    path?: string;
    version?: string;
}

/** Supported package managers for installing Retype. */
export type PackageManager = "npm" | "yarn" | "dotnet";

/** Result of a package manager detection check. */
export interface PackageManagerResult {
    manager: PackageManager | null;
    path: string | null;
    command: string;
}

// ── Events ────────────────────────────────────────────────────────────────

export const DETECTOR_EVENTS = {
    stateChanged: "state-changed",
} as const;

// ── CliDetector ───────────────────────────────────────────────────────────

/**
 * Detects the Retype CLI on the host system PATH and checks for
 * available package managers. Emits `state-changed` when detection
 * results change (e.g. after a re-detect following install).
 */
export class CliDetector extends EventEmitter {
    private _lastResult: CliDetectionResult = { found: false };
    private _lastPmResult: PackageManagerResult | null = null;
    private _pollTimer: ReturnType<typeof setInterval> | null = null;
    private _polling = false;

    /** Most recent CLI detection result. */
    get lastResult(): CliDetectionResult {
        return this._lastResult;
    }

    /** Most recent package manager detection result. */
    get lastPmResult(): PackageManagerResult | null {
        return this._lastPmResult;
    }

    // ── CLI Detection ─────────────────────────────────────────────

    /**
     * Detect whether `retype` is available on the enriched PATH.
     *
     * 1. Runs `which retype` (Unix) / `where retype` (Windows)
     * 2. If found, runs `retype -v` to confirm and get version
     *
     * Returns `{ found: true, path, version }` on success,
     * or `{ found: false }` if not available.
     */
    async detect(): Promise<CliDetectionResult> {
        await getShellPath();

        const binPath = await this.whichBinary("retype");
        if (!binPath) {
            this._lastResult = { found: false };
            return this._lastResult;
        }

        const version = await this.getVersion(binPath);
        if (!version) {
            // Binary found but `retype -v` failed — treat as unavailable
            this._lastResult = { found: false };
            return this._lastResult;
        }

        this._lastResult = { found: true, path: binPath, version };
        return this._lastResult;
    }

    // ── Package Manager Detection ─────────────────────────────────

    /**
     * Detect which package manager is available for installing Retype.
     * Checks npm → yarn → dotnet in priority order.
     *
     * Returns the first manager found along with the full install command.
     * If none found, returns `{ manager: null, path: null, command }` with
     * the default npm command as fallback.
     */
    async detectPackageManager(): Promise<PackageManagerResult> {
        await getShellPath();

        const managers: { name: PackageManager; command: string }[] = [
            { name: "npm", command: DETECTOR.npmInstallCommand },
            { name: "yarn", command: DETECTOR.yarnInstallCommand },
            { name: "dotnet", command: DETECTOR.dotnetInstallCommand },
        ];

        for (const { name, command } of managers) {
            const managerPath = await this.whichBinary(name);
            if (managerPath) {
                this._lastPmResult = { manager: name, path: managerPath, command };
                return this._lastPmResult;
            }
        }

        this._lastPmResult = {
            manager: null,
            path: null,
            command: DETECTOR.npmInstallCommand,
        };
        return this._lastPmResult;
    }

    // ── Re-detection ──────────────────────────────────────────────

    /**
     * Re-run CLI detection (typically after an install completes).
     * Emits a `state-changed` event with the new result.
     */
    async redetect(): Promise<CliDetectionResult> {
        const result = await this.detect();
        this.emit(DETECTOR_EVENTS.stateChanged, result);
        return result;
    }

    // ── Polling ───────────────────────────────────────────────

    /** Whether the polling loop is currently active. */
    get isPolling(): boolean {
        return this._polling;
    }

    /**
     * Start polling for the CLI at the given interval.
     * Polling automatically stops once the CLI is detected.
     * Safe to call multiple times — restarts with the new interval.
     */
    startPolling(intervalMs: number = DETECTOR.pollIntervalMs): void {
        this.stopPolling();
        this._polling = true;

        this._pollTimer = setInterval(() => {
            void this.pollForCli();
        }, intervalMs);
    }

    /**
     * Stop the polling loop. Safe to call even if not polling.
     */
    stopPolling(): void {
        if (this._pollTimer) {
            clearInterval(this._pollTimer);
            this._pollTimer = null;
        }
        this._polling = false;
    }

    private async pollForCli(): Promise<void> {
        const result = await this.detect();
        if (!result.found) {
            return;
        }

        // Also detect package manager so pmDetection is populated.
        await this.detectPackageManager();
        this.stopPolling();
        this.emit(DETECTOR_EVENTS.stateChanged, result);
    }

    // ── Private Helpers ───────────────────────────────────────────

    /**
     * Run `which <binary>` (Unix) or `where <binary>` (Windows) to
     * find a binary on the enriched PATH.
     */
    private whichBinary(name: string): Promise<string | null> {
        return new Promise((resolve) => {
            const cmd = process.platform === "win32" ? "where" : "which";
            execFile(
                cmd,
                [name],
                { timeout: 2000, env: enrichedEnv() },
                (err, stdout) => {
                    if (err || !stdout.trim()) {
                        resolve(null);
                        return;
                    }
                    const bin = stdout.trim().split(/\r?\n/)[0];
                    resolve(bin || null);
                }
            );
        });
    }

    /**
     * Run `retype -v` to retrieve the version string.
     * Returns the trimmed first line of stdout, or `null` on failure.
     */
    private getVersion(binPath: string): Promise<string | null> {
        return new Promise((resolve) => {
            execFile(
                binPath,
                ["-v"],
                { timeout: 5000, env: enrichedEnv() },
                (err, stdout) => {
                    if (err || !stdout.trim()) {
                        resolve(null);
                        return;
                    }
                    const version = stdout.trim().split(/\r?\n/)[0].trim();
                    resolve(version || null);
                }
            );
        });
    }
}
