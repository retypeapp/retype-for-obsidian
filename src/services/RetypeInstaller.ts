// ── RetypeInstaller.ts ────────────────────────────────────────────────────
// Locates — or installs — the Retype CLI binary.
//
// Resolution order:
//   1. Global `retype` already on the user's PATH
//   2. Local binary previously installed into the plugin directory
//   3. Auto-install via `npm install retypeapp` into the plugin directory
//
// The native binary is called directly (not the Node.js shim at
// node_modules/.bin/retype) because Obsidian launches as a GUI app
// without `node` on the PATH.
// ──────────────────────────────────────────────────────────────────────────

import { execFile, spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";

import { INSTALLER } from "../config";
import { getShellPath, enrichedEnv } from "../utils/shellEnv";

// ── RetypeInstaller ───────────────────────────────────────────────────────

/**
 * Locates or installs the Retype CLI binary. Provides platform-specific
 * binary path resolution for the `retypeapp` npm package and can discover
 * a global `retype` install via the user's enriched shell PATH.
 */
export class RetypeInstaller {
    constructor(private readonly pluginDir: string) {}

    // ── Platform detection ────────────────────────────────────────

    /**
     * Map the current OS/arch to retypeapp's `platforms/` subdirectory.
     * Throws for platforms where no binary is available.
     */
    private platformDir(): string {
        switch (process.platform) {
            case "darwin":
                return process.arch === "arm64" ? "osx-arm64" : "osx-x64";
            case "linux":
                return `linux-${process.arch}`;
            case "win32":
                return process.arch === "x64" ? "win-x64" : "win-x86";
            default:
                throw new Error(
                    INSTALLER.unsupportedPlatform.replace("{platform}", process.platform)
                );
        }
    }

    // ── Binary path helpers ───────────────────────────────────────

    /**
     * Absolute path to the native Retype binary inside the plugin dir.
     * Does NOT check whether the file exists — use `findLocalBinary()`.
     */
    localBinaryPath(): string {
        const exe = process.platform === "win32" ? "retype.exe" : "retype";
        return path.join(
            this.pluginDir,
            "node_modules",
            "retypeapp",
            "platforms",
            this.platformDir(),
            exe
        );
    }

    /**
     * Returns the local native binary path if it exists and is
     * executable, or `null` if not present.
     */
    findLocalBinary(): string | null {
        try {
            const p = this.localBinaryPath();
            fs.accessSync(
                p,
                process.platform === "win32"
                    ? fs.constants.F_OK
                    : fs.constants.X_OK
            );
            return p;
        } catch {
            return null;
        }
    }

    // ── Global binary resolution ──────────────────────────────────

    /**
     * Try to locate a global `retype` binary on the user's PATH.
     *
     * On macOS / Linux, the GUI app's PATH is limited, so we first
     * resolve the user's full interactive-shell PATH via `getShellPath()`,
     * then run `which retype` inside that environment.
     *
     * Resolves with the absolute path to the binary, or `null` if not
     * found.
     */
    async resolveGlobalBinary(): Promise<string | null> {
        await getShellPath();

        return new Promise((resolve) => {
            const cmd = process.platform === "win32" ? "where" : "which";
            execFile(
                cmd,
                ["retype"],
                { timeout: 5000, env: enrichedEnv() },
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

    // ── npm-based install ─────────────────────────────────────────

    /**
     * Try to locate `npm` on the enriched PATH.
     * Resolves with the absolute path, or `null` if npm is unavailable.
     */
    async resolveNpm(): Promise<string | null> {
        await getShellPath();

        return new Promise((resolve) => {
            const cmd = process.platform === "win32" ? "where" : "which";
            execFile(
                cmd,
                ["npm"],
                { timeout: 5000, env: enrichedEnv() },
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
     * Install `retypeapp` from npm into the plugin directory.
     *
     * Runs `npm install retypeapp --prefix <pluginDir>` using the
     * enriched shell environment so that nvm / homebrew npm is found.
     *
     * @param onLog  Optional callback receiving live stdout/stderr lines.
     * @returns      Absolute path to the installed native binary.
     * @throws       If npm is not found or the install command fails.
     */
    async install(onLog?: (line: string) => void): Promise<string> {
        const npmPath = await this.resolveNpm();
        if (!npmPath) {
            throw new Error(INSTALLER.npmNotFound);
        }

        onLog?.(INSTALLER.npmInstalling);

        return new Promise((resolve, reject) => {
            const child = spawn(
                npmPath,
                ["install", "retypeapp", "--prefix", this.pluginDir],
                {
                    cwd: this.pluginDir,
                    env: enrichedEnv(),
                    stdio: ["ignore", "pipe", "pipe"],
                }
            );

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
                reject(new Error(
                    INSTALLER.npmError.replace("{message}", err.message)
                ));
            });

            child.on("close", (code) => {
                if (code !== 0) {
                    reject(new Error(
                        INSTALLER.npmExitCode.replace("{code}", String(code ?? "unknown"))
                    ));
                    return;
                }

                const bin = this.findLocalBinary();
                if (bin) {
                    resolve(bin);
                } else {
                    reject(new Error(
                        INSTALLER.binaryNotFound.replace("{path}", this.localBinaryPath())
                    ));
                }
            });
        });
    }
}
