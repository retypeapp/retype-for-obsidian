// ── InstallService.ts ─────────────────────────────────────────────────────
// User-triggered Retype CLI installation via a detected package manager.
//
// Spawns the appropriate global install command (npm, yarn, or dotnet)
// and streams stdout/stderr to a callback. On success, triggers
// re-detection via CliDetector.
// ──────────────────────────────────────────────────────────────────────────

import { spawn } from "child_process";

import { enrichedEnv } from "../utils/shellEnv";
import { CliDetector, type PackageManager } from "./CliDetector";
import { INSTALL_SERVICE } from "../config";

// ── Types ─────────────────────────────────────────────────────────────────

/** Result of an install attempt. */
export interface InstallResult {
    success: boolean;
    error?: string;
}

// ── InstallService ────────────────────────────────────────────────────────

/**
 * Installs the Retype CLI globally via the user's detected package
 * manager. Streams install output through a callback for the panel
 * console, and triggers re-detection on completion.
 */
export class InstallService {
    constructor(private readonly detector: CliDetector) {}

    /**
     * Run the appropriate global install command for the given package
     * manager.
     *
     * @param manager     The package manager to use ("npm", "yarn", or "dotnet")
     * @param managerPath Absolute path to the package manager binary
     * @param onLog       Callback receiving live stdout/stderr lines
     * @returns           Result indicating success or failure
     */
    async install(
        manager: PackageManager,
        managerPath: string,
        onLog?: (line: string) => void
    ): Promise<InstallResult> {
        const args = this.getInstallArgs(manager);
        const displayCmd = `${manager} ${args.join(" ")}`;
        onLog?.(INSTALL_SERVICE.running.replace("{command}", displayCmd));

        return new Promise((resolve) => {
            const child = spawn(managerPath, args, {
                env: enrichedEnv(),
                stdio: ["ignore", "pipe", "pipe"],
            });

            child.stdout?.on("data", (data: Buffer) => {
                const lines = data.toString().split(/\r?\n/).filter(Boolean);
                for (const line of lines) {
                    onLog?.(line);
                }
            });

            child.stderr?.on("data", (data: Buffer) => {
                const lines = data.toString().split(/\r?\n/).filter(Boolean);
                for (const line of lines) {
                    onLog?.(line);
                }
            });

            child.on("error", (err) => {
                const errorMsg = INSTALL_SERVICE.spawnError.replace(
                    "{message}",
                    err.message
                );
                onLog?.(errorMsg);
                resolve({ success: false, error: errorMsg });
            });

            child.on("close", (code) => {
                this.handleInstallClose(code, onLog).then(resolve, (err: unknown) => {
                    const errorMsg = INSTALL_SERVICE.spawnError.replace(
                        "{message}",
                        err instanceof Error ? err.message : String(err)
                    );
                    onLog?.(errorMsg);
                    resolve({ success: false, error: errorMsg });
                });
            });
        });
    }

    // ── Private Helpers ───────────────────────────────────────────

    /**
     * Get the install command arguments for each supported package manager.
     */
    private getInstallArgs(manager: PackageManager): string[] {
        switch (manager) {
            case "npm":
                return ["install", "retypeapp", "--global"];
            case "yarn":
                return ["global", "add", "retypeapp"];
            case "dotnet":
                return ["tool", "install", "retypeapp", "--global"];
        }
    }

    private async handleInstallClose(
        code: number | null,
        onLog?: (line: string) => void
    ): Promise<InstallResult> {
        if (code !== 0) {
            const errorMsg = INSTALL_SERVICE.exitCode.replace(
                "{code}",
                String(code ?? "unknown")
            );
            onLog?.(errorMsg);
            return { success: false, error: errorMsg };
        }

        onLog?.(INSTALL_SERVICE.complete);

        // Re-detect to confirm the CLI is now available.
        const result = await this.detector.redetect();
        if (result.found) {
            return { success: true };
        }

        const errorMsg = INSTALL_SERVICE.notFoundAfterInstall;
        onLog?.(errorMsg);
        return { success: false, error: errorMsg };
    }
}
