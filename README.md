# SNUTS.js

SNUTS.js is a VS Code extension that detects common test smells in JavaScript and TypeScript test files using `@snutsjs/core`.

## Features

- Real-time smell detection while editing test files (debounced).
- Diagnostics in the editor and Problems panel.
- Manual command to analyze the active file.
- Configurable severity, debounce interval, and file include patterns.

## Command

- `SNUTS.js: Analyze Current Test File`

## Settings

This extension contributes the following settings:

- `snuts-js.enabled`: Enable or disable diagnostics.
- `snuts-js.debounceMs`: Delay in milliseconds before running analysis after edits.
- `snuts-js.includePatterns`: Glob-like patterns used to select test files.
- `snuts-js.severity`: Diagnostic severity (`error`, `warning`, `information`).

Default patterns:

- `**/*.test.ts`
- `**/*.spec.ts`
- `**/*.test.js`
- `**/*.spec.js`

## Requirements

- VS Code `^1.110.0`
- Node.js `>=18`

## Logo

The Marketplace icon is configured as `images/logo.png` in `package.json`.

- Recommended size: `256x256` or `512x512` PNG (square)
- Keep visual details bold so the icon is still readable at small sizes

## Publish

1. Install dependencies:

	```bash
	yarn install
	```

2. Create a Personal Access Token (Azure DevOps / Visual Studio Marketplace) with Marketplace publish permissions.

3. Export your token in the shell:

	```bash
	export VSCE_PAT=<your-token>
	```

4. Build and package:

	```bash
	yarn vsix
	```

5. Publish:

	```bash
	yarn publish:marketplace
	```

For later releases, bump and publish in one command:

```bash
yarn publish:patch
```

## License

This extension is distributed under `GPL-3.0` to remain compatible with `@snutsjs/core`.

## Known Limitations

- MVP focuses on diagnostics only (no automatic fixes yet).
- Analysis currently runs at file level for eligible test files.
