// ── shellEnv.ts ───────────────────────────────────────────────────────────
// Resolves the user's real shell PATH on macOS / Linux.
//
// Obsidian launches as a GUI app and does NOT inherit the user's interactive
// shell PATH (where nvm, homebrew, dotnet tools, etc. live). We run a login
// shell once at startup to capture the full PATH and merge it into our
// environment so that child_process calls can find `retype`, `npm`, etc.
// ──────────────────────────────────────────────────────────────────────────

import { execFile } from "child_process";
import * as fs from "fs";
import * as path from "path";

/** Cached enriched PATH — resolved once, reused everywhere. */
let _enrichedPath: string | null = null;

/**
 * Get the user's full shell PATH by invoking a login shell.
 *
 * On macOS/Linux this runs `$SHELL -li -c 'echo $PATH'` to capture the
 * fully-initialized PATH (including nvm, homebrew, pyenv, etc.).
 * On Windows, returns `process.env.PATH` unchanged.
 *
 * The result is cached after the first successful call.
 */
export function getShellPath(): Promise<string> {
    if (_enrichedPath !== null) {
        return Promise.resolve(_enrichedPath);
    }

    // Windows doesn't have this problem — GUI apps inherit PATH normally.
    if (process.platform === "win32") {
        _enrichedPath = process.env.PATH ?? "";
        return Promise.resolve(_enrichedPath);
    }

    return new Promise((resolve) => {
        const shell =
            process.env.SHELL ||
            (process.platform === "darwin" ? "/bin/zsh" : "/bin/bash");

        // Pass a realistic environment to the login shell so that tools
        // like nvm, pyenv, sdkman, etc. initialize properly. Many of them
        // guard on USER, HOME, or TERM before modifying PATH.
        const shellEnv: Record<string, string> = {
            HOME: process.env.HOME ?? "",
            USER: process.env.USER ?? process.env.LOGNAME ?? "",
            SHELL: shell,
            TERM: process.env.TERM ?? "xterm-256color",
            LANG: process.env.LANG ?? "en_US.UTF-8",
        };

        // -l  = login shell (sources profile)
        // -i  = interactive (sources rc files like .zshrc / .bashrc)
        // -c  = run command and exit
        execFile(
            shell,
            ["-li", "-c", "echo $PATH"],
            { timeout: 8000, env: shellEnv },
            (err, stdout) => {
                if (err || !stdout.trim()) {
                    _enrichedPath = buildFallbackPath();
                } else {
                    _enrichedPath = stdout.trim();
                }
                resolve(_enrichedPath ?? buildFallbackPath());
            }
        );
    });
}

/**
 * Returns a copy of `process.env` with the enriched PATH injected.
 * Call after `getShellPath()` has resolved.
 */
export function enrichedEnv(): NodeJS.ProcessEnv {
    return {
        ...process.env,
        PATH: _enrichedPath ?? process.env.PATH,
    };
}

/**
 * Fallback: prepend commonly-used binary directories to the current PATH.
 * Includes auto-detected nvm node bin directory if present.
 */
function buildFallbackPath(): string {
    const home = process.env.HOME ?? "";
    const existing = process.env.PATH ?? "";

    const extras = [
        "/usr/local/bin",
        "/opt/homebrew/bin",
        "/opt/homebrew/sbin",
        `${home}/.dotnet/tools`,
        `${home}/.local/bin`,
    ];

    // Detect nvm's active or default node version
    const nvmBin = resolveNvmBin(home);
    if (nvmBin) {
        extras.unshift(nvmBin);
    }

    return [...extras.filter(Boolean), existing].join(":");
}

/**
 * Try to find the nvm-managed node bin directory.
 * Checks the `default` alias first, then falls back to the latest
 * installed version directory.
 */
function resolveNvmBin(home: string): string | null {
    const nvmDir = process.env.NVM_DIR || path.join(home, ".nvm");
    const versionsDir = path.join(nvmDir, "versions", "node");

    try {
        // Check if the nvm alias/default symlink exists
        const defaultAlias = path.join(nvmDir, "alias", "default");
        if (fs.existsSync(defaultAlias)) {
            const version = fs.readFileSync(defaultAlias, "utf8").trim();
            // The alias may be a version like "23" or "v23.10.0"
            // Try exact match first
            const candidates = fs.readdirSync(versionsDir);
            const match = candidates.find(
                (d) => d === version || d === `v${version}` || d.startsWith(`v${version}.`)
            );
            if (match) {
                const binDir = path.join(versionsDir, match, "bin");
                if (fs.existsSync(binDir)) {
                    return binDir;
                }
            }
        }

        // Fallback: pick the highest version directory
        if (fs.existsSync(versionsDir)) {
            const versions = fs.readdirSync(versionsDir)
                .filter((d) => d.startsWith("v"))
                .sort()
                .reverse();
            if (versions.length > 0) {
                const binDir = path.join(versionsDir, versions[0], "bin");
                if (fs.existsSync(binDir)) {
                    return binDir;
                }
            }
        }
    } catch {
        // nvm not installed — that's fine
    }

    return null;
}
