# Retype for Obsidian

Install and manage [Retype](https://retype.com) directly from your Obsidian vault.

Desktop-only Obsidian plugin for macOS, Windows, and Linux.

## Features

- **Sidebar panel** — Start, Stop, and Build buttons for the Retype CLI
- **Console output** — Scrollable log of CLI output with color-coded error, warning, success, and URL lines
- **Server status card** — Live indicator (stopped / starting / running / error) with the server URL displayed as a clickable link
- **Status bar item** — Optional status bar entry showing the current server state; click to open the server URL or toggle the panel
- **Project detection** — Automatically finds the nearest `retype.yml` config file relative to the active document
- **CLI detection** — Detects the Retype CLI on your system PATH (including via nvm, Homebrew, dotnet tools, etc.)
- **Install gate** — When the Retype CLI is not found, the panel shows a two-step setup guide with install options instead of Start/Build/Console controls
- **User-triggered install** — Install the Retype CLI with one click using npm, yarn, or dotnet (auto-detected in that order)
- **Auto-detection polling** — When the CLI is not found, the plugin polls every few seconds and automatically transitions to the ready state if the CLI is installed externally
- **Four settings** — Retype Key (stored securely), Debounce value, Open browser automatically, Show status bar item

## Installation

### Manual install

1. Download or clone this repository.
2. Run `npm install` then `npm run build` in the project root.
3. Copy `main.js`, `styles.css`, and `manifest.json` into your vault at:

   ```
   <vault>/.obsidian/plugins/retype/
   ```

4. Open **Settings → Community plugins**, enable **Retype**.

## Usage

1. Click the **Retype** ribbon icon (or run **Retype: Open Retype panel** from the command palette) to open the sidebar panel.
2. The panel displays the detected Retype project name and config file path. If no `retype.yml` is found, it shows "No project".
3. Click **Start** to launch the Retype development server. The status card updates in real time and the output log streams CLI output.
4. Click **Stop** to shut down the server, or **Build** to run a one-off build (only available when the server is stopped).
5. Open **Settings → Retype** to configure:
   - **Retype Key** — your Retype Pro or Community license key (stored in Obsidian's secure secret storage)
   - **Debounce** — delay in milliseconds before Retype rebuilds after a file change
   - **Open browser automatically** — open the default browser when the server starts
   - **Show status bar item** — toggle the Retype status indicator in the Obsidian status bar

## CLI Detection & Installation

The plugin detects whether the `retype` CLI is installed on your system when it loads. It uses your full shell PATH — including paths added by nvm, Homebrew, dotnet tools, and other environment managers.

### How detection works

1. The plugin runs `which retype` (macOS/Linux) or `where retype` (Windows) using an enriched shell environment.
2. If found, it runs `retype -v` to confirm the binary works and retrieves the version number.
3. The detected version is displayed in the panel header badge.

### Install gate

If the Retype CLI is **not detected**, the panel shows a two-step setup guide instead of the normal Start/Build/Console controls:

- **Step 1 — Plugin installed ✅** — Confirms the plugin is installed and directs you to Step 2
- **Step 2 — Add Retype CLI** — Provides a **Retype CLI** button (if a supported package manager is detected), a code block with the install command you can copy and run manually, and a link to the [Retype installation guide](https://retype.com/guides/installation/)

The plugin also polls for the CLI every few seconds while in this state. If you install Retype externally (e.g. from a terminal), the panel automatically transitions to the ready state without requiring a restart.

### User-triggered install

When you click the **Retype CLI** button, the plugin:

1. Detects which package manager is available (checked in order: `npm`, `yarn`, `dotnet`)
2. Runs the appropriate global install command:
   - `npm install retypeapp --global`
   - `yarn global add retypeapp`
   - `dotnet tool install retypeapp --global`
3. Streams the install output to the console log in real time
4. On success, re-detects the CLI and transitions the panel to the ready state

If no supported package manager is detected, the install button is hidden and only manual instructions are shown.

### Manual installation

You can always install Retype manually by running one of these commands in your terminal:

```bash
npm install retypeapp --global
# or
yarn global add retypeapp
# or
dotnet tool install retypeapp --global
```

See the [Retype installation guide](https://retype.com/guides/installation/) for more options.

## Commands

| Command | Description |
|---------|-------------|
| Retype: Open Retype panel | Open or reveal the Retype sidebar |
| Retype: Start Retype server | Start the Retype development server |
| Retype: Stop Retype server | Stop the Retype development server |

## License

[Apache License 2.0](LICENSE)