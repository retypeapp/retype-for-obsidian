# Retype for Obsidian

Install and manage [Retype](https://retype.com) directly from your Obsidian vault.

## Features

- **Sidebar panel** — Start, Stop, and Build buttons for the Retype CLI
- **Console output** — Scrollable log of CLI output with color-coded error, warning, success, and URL lines
- **Server status card** — Live indicator (stopped / starting / running / error) with the server URL displayed as a clickable link
- **Status bar item** — Optional status bar entry showing the current server state; click to open the server URL or toggle the panel
- **Project detection** — Automatically finds the nearest `retype.yml` config file relative to the active document
- **Auto-install** — Installs the Retype CLI locally on first run if not found on `PATH`
- **Three settings** — Retype Key (stored securely), Open browser automatically, Show status bar item

## Installation

### Manual install

1. Download or clone this repository.
2. Run `npm install` then `npm run build` in the project root.
3. Copy `main.js`, `styles.css`, and `manifest.json` into your vault at:

   ```
   <vault>/.obsidian/plugins/retype-for-obsidian/
   ```

4. Open **Settings → Community plugins**, enable **Retype**.

## Usage

1. Click the **Retype** ribbon icon (or run **Retype: Open Retype panel** from the command palette) to open the sidebar panel.
2. The panel displays the detected Retype project name and config file path. If no `retype.yml` is found, it shows "No project".
3. Click **Start** to launch the Retype development server. The status card updates in real time and the output log streams CLI output.
4. Click **Stop** to shut down the server, or **Build** to run a one-off build (only available when the server is stopped).
5. Open **Settings → Retype** to configure:
   - **Retype Key** — your Retype Pro or Community license key (stored in Obsidian's secure secret storage)
   - **Open browser automatically** — open the default browser when the server starts
   - **Show status bar item** — toggle the Retype status indicator in the Obsidian status bar

## Commands

| Command | Description |
|---------|-------------|
| Open Retype panel | Open or reveal the Retype sidebar |
| Start Retype server | Start the development server |
| Stop Retype server | Stop the running server |
| Toggle Retype server | Start the server if stopped, stop if running |

## License

[Apache License 2.0](LICENSE)