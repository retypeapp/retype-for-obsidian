// ── ProjectDetector.ts ────────────────────────────────────────────────────
// Locates the nearest Retype project (`retype.yml` / `retype.yaml`) by
// walking up the folder tree from the active file. Falls back to the vault
// root. Extracts the project display name from the YAML `title` field.
// ──────────────────────────────────────────────────────────────────────────

import { App, TFile, TFolder, normalizePath } from "obsidian";
import * as path from "path";

import { CONFIG_FILE_NAMES, YAML_TITLE_PATTERN } from "../config";

// ── Types ─────────────────────────────────────────────────────────────────

/** Describes a detected Retype project in the vault. */
export interface RetypeProject {
    /** Absolute filesystem path to the folder containing retype.yml. */
    root: string;
    /** Vault-relative path to the retype.yml file. */
    configPath: string;
    /** Display name — from the YAML `title` field, or the folder name. */
    name: string;
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
     * Reads the `title` field from the YAML; falls back to the folder name.
     */
    private async buildProject(file: TFile): Promise<RetypeProject> {
        const folderPath = file.parent?.path ?? "";
        const absRoot = this.toAbsolutePath(folderPath || ".");

        let name = path.basename(absRoot);
        try {
            const content = await this.app.vault.read(file);
            const titleMatch = content.match(YAML_TITLE_PATTERN);
            if (titleMatch) {
                name = titleMatch[1].trim().replace(/^['"]|['"]$/g, "");
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
}
