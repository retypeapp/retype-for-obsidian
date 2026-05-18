// ── shellEnv.ts ───────────────────────────────────────────────────────────
// Resolves the user's real shell PATH on macOS / Linux.
//
// Obsidian launches as a GUI app and does NOT inherit the user's interactive
// shell PATH (where nvm, homebrew, dotnet tools, etc. live). We run a login
// shell once at startup to capture the full PATH and merge it into our
// environment so that child_process calls can find `retype`, `npm`, etc.
// ──────────────────────────────────────────────────────────────────────────

import { execFile } from "child_process";
import { homedir } from "os";

/** Cached enriched PATH — resolved once, reused everywhere. */
let _enrichedPath: string | null = null;

/**
 * Get the user's full shell PATH by invoking a login shell.
 *
 * On macOS/Linux this runs a login shell to capture the
 * fully-initialized PATH (including nvm, homebrew, pyenv, etc.).
 * On Windows, returns the current PATH unchanged.
 *
 * The result is cached after the first successful call.
 */
export function getShellPath(): Promise<string> {
    if (_enrichedPath !== null) {
        return Promise.resolve(_enrichedPath);
    }

    // Windows doesn't have this problem — GUI apps inherit PATH normally.
    if (process.platform === "win32") {
        _enrichedPath = "";
        return Promise.resolve(_enrichedPath);
    }

    return new Promise((resolve) => {
        const shell = process.platform === "darwin" ? "/bin/zsh" : "/bin/bash";
        const shellEnv: Record<string, string> = {
            SHELL: shell,
            TERM: "xterm-256color",
            LANG: "en_US.UTF-8",
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
 * Returns a minimal child process environment with the enriched PATH injected.
 * Call after `getShellPath()` has resolved.
 */
export function enrichedEnv(): NodeJS.ProcessEnv | undefined {
    if (!_enrichedPath) {
        return undefined;
    }

    return {
        PATH: _enrichedPath,
    };
}

/**
 * Fallback: use commonly-used binary directories without reading the host env.
 */
function buildFallbackPath(): string {
    const home = homedir();

    const extras = [
        "/usr/local/bin",
        "/opt/homebrew/bin",
        "/opt/homebrew/sbin",
        `${home}/.dotnet/tools`,
        `${home}/.local/bin`,
    ];

    return extras.filter(Boolean).join(":");
}
