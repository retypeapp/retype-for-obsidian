# Contributing

Thanks for helping improve Retype for Obsidian.

## Development

1. Install dependencies with `npm install`.
2. Run `npm run dev` for a watch build during local testing.
3. Run `npm run build` before submitting changes.

## Local Testing

Copy `main.js`, `styles.css`, and `manifest.json` into an Obsidian vault plugin folder:

```text
<vault>/.obsidian/plugins/retype/
```

Reload Obsidian, then enable or re-enable the Retype plugin from Community plugins.

## Pull Requests

Keep changes focused and update the README when user-facing behavior changes. Do not commit generated secrets, vault data, or local environment files.
