# SNUTS.js - Test Smell Detector for VS Code

**Automatically detect and fix test smells in your JavaScript and TypeScript test files.**

SNUTS.js is a VS Code extension that helps you write better tests by identifying common code quality issues—known as "test smells"—in real-time. Powered by [`@snutsjs/core`](https://github.com/snutsjs/core), this extension integrates seamlessly with your workflow to catch issues as you code.

## What are Test Smells?

Test smells are patterns in test code that indicate potential quality issues, such as:
- Tests with anonymous logic (unclear test intent)
- Tests without proper descriptions
- Overly complex snapshot tests
- Conditional logic in tests
- Over-commented or under-described tests

Let SNUTS.js help you maintain clean, maintainable test suites.

## Features

- ✨ **Real-time Detection** — Analyzes test files as you type (with configurable debounce)
- 🎯 **In-Editor Diagnostics** — See issues directly in your code with inline messages
- 📋 **Problems Panel Integration** — View all detected smells in VS Code's Problems panel
- ⚡ **Manual Analysis** — Run analysis on demand with a command
- 🎛️ **Fully Configurable** — Customize severity levels, file patterns, and detection debounce
- 🔄 **Auto-Discovery** — Automatically detects new detectors added to `@snutsjs/core`

## Installation

1. Open VS Code
2. Go to the Extensions view (`Ctrl+Shift+X` / `Cmd+Shift+X`)
3. Search for **"SNUTS.js"**
4. Click **Install**

## Quick Start

1. Open a TypeScript or JavaScript test file (any file matching `*.test.*` or `*.spec.*`)
2. The extension automatically analyzes the file and highlights test smells
3. Hover over highlighted issues to see descriptions
4. Review the **Problems** panel for all detected issues

You can also run analysis manually:
- Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
- Run: **SNUTS.js: Analyze Current Test File**

## Configuration

Customize SNUTS.js behavior via VS Code settings (`Preferences: Open Settings`):

### Disable/Enable Detection
```json
"snuts-js.enabled": true
```

### Debounce Interval
Delay (in milliseconds) before running analysis after making edits:
```json
"snuts-js.debounceMs": 500
```

### File Patterns
Specify which test files to analyze (glob patterns):
```json
"snuts-js.includePatterns": [
  "**/*.test.ts",
  "**/*.spec.ts",
  "**/__tests__/**/*.ts"
]
```

### Diagnostic Severity
Choose how smells are reported: `error`, `warning`, or `information`:
```json
"snuts-js.severity": "warning"
```

### Default File Patterns

If not configured, SNUTS.js analyzes files matching:

- `**/*.test.ts` / `**/*.test.tsx`
- `**/*.spec.ts` / `**/*.spec.tsx`
- `**/*.test.js` / `**/*.test.jsx`
- `**/*.spec.js` / `**/*.spec.jsx`
- `**/__tests__/**/*.ts` / `**/__tests__/**/*.tsx`
- `**/__tests__/**/*.js` / `**/__tests__/**/*.jsx`

## Commands

| Command | Description |
| --- | --- |
| `SNUTS.js: Analyze Current Test File` | Manually trigger analysis of the active test file |

## Requirements

- **VS Code**: `^1.110.0`
- **Node.js**: `>=18`
- **Test Files**: JavaScript or TypeScript files matching configured patterns

## Troubleshooting

### Extension doesn't show up in the Problems panel

Check:
- ✅ The file matches your configured `includePatterns`
- ✅ The extension is enabled: `"snuts-js.enabled": true`
- ✅ VS Code has indexed the file (wait a moment after opening)

### No issues detected in my test files

This could mean:
- Your tests follow good practices! 🎉
- The file doesn't match any configured patterns (edit `snuts-js.includePatterns`)
- The extension is disabled (check settings)

### How to Report Issues

Found a bug or have a feature request? Please open an issue on the [GitHub repository](https://github.com/Jhonatanmizu/snuts-js-extension-vscode).

## About @snutsjs/core

SNUTS.js uses [`@snutsjs/core`](https://github.com/snutsjs/core) for its detection engine. New detectors added to that package are automatically supported—no extension updates needed!

## License

This extension is distributed under **GPL-3.0** to remain compatible with [`@snutsjs/core`](https://github.com/snutsjs/core).

## Known Limitations

- **No automatic fixes** — Currently diagnostics only (fixes coming in future releases)
- **File-level analysis** — Analysis runs per file, not across test suites
