// ── ProjectDetector.ts ────────────────────────────────────────────────────
// Locates the nearest Retype project (`retype.yml` / `retype.yaml`) by
// walking up the folder tree from the active file. Falls back to the vault
// root. Extracts the project display name from Retype config metadata.
// ──────────────────────────────────────────────────────────────────────────

import { App, TFile, TFolder, normalizePath } from "obsidian";
import * as path from "path";

import { CONFIG_FILE_NAMES } from "../config";

// ── Types ─────────────────────────────────────────────────────────────────

/** Describes a detected Retype project in the vault. */
export interface RetypeProject {
    /** Absolute filesystem path to the folder containing retype.yml. */
    root: string;
    /** Vault-relative path to the retype.yml file. */
    configPath: string;
    /** Display name from Retype config metadata, or the folder name. */
    name: string;
}

interface YamlPathValue {
    path: string[];
    value: string;
}

// ── ProjectDetector ───────────────────────────────────────────────────────

/**
 * Scans the Obsidian vault for `retype.yml` / `retype.yaml` config files
 * and resolves absolute paths for use by the CLI service.
 */
export class ProjectDetector {
    constructor(private app: App) {}

    // ── Path helpers ──────────────────────────────────────────────

    /**
     * Return the absolute vault root path on the host filesystem.
     */
    getVaultBasePath(): string {
        const adapter = this.app.vault.adapter;
        return (adapter as { basePath?: string }).basePath ?? "";
    }

    /**
     * Resolve a vault-relative path to an absolute filesystem path.
     */
    toAbsolutePath(vaultRelative: string): string {
        return path.join(this.getVaultBasePath(), vaultRelative);
    }

    // ── Project detection ─────────────────────────────────────────

    /**
     * Find the nearest `retype.yml` walking up from the given file's
     * directory. Falls back to a root-level config. Returns `null` if
     * no config is found anywhere in the vault.
     */
    async findNearestProject(
        activeFile: TFile | null
    ): Promise<RetypeProject | null> {
        if (!activeFile) {
            return this.findRootProject();
        }

        let folder: TFolder | null = activeFile.parent;
        while (folder) {
            for (const name of CONFIG_FILE_NAMES) {
                const configFile = this.app.vault.getAbstractFileByPath(
                    normalizePath(`${folder.path}/${name}`)
                );
                if (configFile instanceof TFile) {
                    return this.buildProject(configFile);
                }
            }
            folder = folder.parent;
        }

        return this.findRootProject();
    }

    // ── Private helpers ───────────────────────────────────────────

    /**
     * Look for a retype.yml / retype.yaml directly at the vault root.
     */
    private async findRootProject(): Promise<RetypeProject | null> {
        for (const name of CONFIG_FILE_NAMES) {
            const file = this.app.vault.getAbstractFileByPath(name);
            if (file instanceof TFile) {
                return this.buildProject(file);
            }
        }
        return null;
    }

    /**
     * Build a `RetypeProject` descriptor from a retype config TFile.
     * Reads the configured site name; falls back to the folder name.
     */
    private async buildProject(file: TFile): Promise<RetypeProject> {
        const folderPath = file.parent?.path ?? "";
        const absRoot = this.toAbsolutePath(folderPath || ".");

        let name = path.basename(absRoot);
        try {
            const content = await this.app.vault.read(file);
            const configuredName = this.getConfiguredProjectName(content);
            if (configuredName) {
                name = configuredName;
            }
        } catch {
            // Use folder name as fallback
        }

        return {
            root: absRoot,
            configPath: file.path,
            name,
        };
    }

    private getConfiguredProjectName(content: string): string | null {
        return (
            this.readYamlPath(content, ["meta", "siteName"]) ??
            this.readYamlPath(content, ["branding", "title"])
        );
    }

    private readYamlPath(content: string, targetPath: string[]): string | null {
        for (const entry of this.readYamlPathValues(content)) {
            if (this.pathsMatch(entry.path, targetPath)) {
                const value = this.normalizeYamlScalar(entry.value);
                if (value) {
                    return value;
                }
            }
        }
        return null;
    }

    private readYamlPathValues(content: string): YamlPathValue[] {
        const values: YamlPathValue[] = [];
        const stack: Array<{ indent: number; key: string }> = [];

        for (const line of content.split(/\r?\n/)) {
            if (!line.trim() || line.trimStart().startsWith("#")) {
                continue;
            }

            const match = line.match(/^(\s*)([^:#][^:]*?)\s*:\s*(.*)$/);
            if (!match) {
                continue;
            }

            const indent = match[1].length;
            const key = match[2].trim().replace(/^['"]|['"]$/g, "");
            const rawValue = this.stripYamlComment(match[3].trim());

            while (stack.length > 0 && indent <= stack[stack.length - 1].indent) {
                stack.pop();
            }

            const currentPath = [...stack.map((item) => item.key), key];
            if (rawValue) {
                values.push({ path: currentPath, value: rawValue });
            } else {
                stack.push({ indent, key });
            }
        }

        return values;
    }

    private pathsMatch(actualPath: string[], targetPath: string[]): boolean {
        const normalizedPath = actualPath.flatMap((part) => part.split("."));
        if (normalizedPath.length !== targetPath.length) {
            return false;
        }
        return normalizedPath.every((part, index) => part === targetPath[index]);
    }

    private normalizeYamlScalar(value: string): string | null {
        const trimmed = value.trim().replace(/^['"]|['"]$/g, "").trim();
        if (!trimmed || trimmed === "~" || trimmed.toLowerCase() === "null") {
            return null;
        }
        return trimmed;
    }

    private stripYamlComment(value: string): string {
        let quote: string | null = null;

        for (let index = 0; index < value.length; index += 1) {
            const char = value[index];
            if ((char === '"' || char === "'") && value[index - 1] !== "\\") {
                quote = quote === char ? null : char;
            }
            if (char === "#" && quote === null && /\s/.test(value[index - 1] ?? "")) {
                return value.slice(0, index).trim();
            }
        }

        return value;
    }
}
