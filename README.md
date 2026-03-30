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

## License

This extension is distributed under `GPL-3.0` to remain compatible with `@snutsjs/core`.

## Known Limitations

- MVP focuses on diagnostics only (no automatic fixes yet).
- Analysis currently runs at file level for eligible test files.
