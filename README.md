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

- ✨ **Real-time Detection** — Analyzes test files on open, edit, and save (with configurable debounce)
- 🎯 **In-Editor Diagnostics & Explanations** — See issues directly in your code with category codes (`description`) and actionable remediation explanations (`explanation`) on hover
- 🤖 **AI-Powered Test Smell Refactoring (Single & Batch)** — Refactor a single test file, use Quick Fix (`Ctrl+.` / `Cmd+.`) on a specific smell diagnostic, or run **Batch AI Refactoring** across folders and multiple files with bounded concurrency
- 🔐 **Interactive AI Setup & Secret Storage** — Configure OpenAI, Google Gemini, Anthropic Claude, DeepSeek, or Moonshot Kimi via `SNUTS.js: Configure AI Provider`, storing API keys securely in VS Code `SecretStorage`
- 📊 **Batch Analysis & CSV/JSON Reports** — Analyze selected files or folders in batch (via the Command Palette or right-clicking in the Explorer) to populate the Problems panel and optionally export `.csv` and/or `.json` reports
- 📋 **Problems Panel Integration** — View all detected smells in VS Code's Problems panel
- 📺 **Dedicated Output Channel** — Inspect detailed analysis runs, line/column ranges, smell explanations, and AI refactoring summaries in the **SNUTS.js** Output Channel
- ⚡ **Manual Analysis** — Run analysis on demand via the Command Palette (`SNUTS.js: Analyze Current Test File`)
- 🎛️ **Fully Configurable** — Customize file patterns, detection debounce, and AI model parameters
- 🔄 **Auto-Discovery** — Automatically detects new detectors exported by `@snutsjs/core` (`createDetectorInstances` / `detectors` registry)

## Supported Test Smells (28 Built-in Detectors)

Powered by `@snutsjs/core`, the extension detects 28 test smells out of the box (covering both SNUTS.js and JNose catalogs):

| Smell Category (`code`)  | Detector Class                          | What It Detects                                                                                      |
| ------------------------ | --------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Anonymous Test           | `AnonymousTestLogicDetector`            | Test descriptions that are too short (at most 2 words after trimming).                               |
| Assertion Roulette       | `AssertionRouletteDetector`             | Multiple assertions in a single test case where assertions omit explanatory failure messages.        |
| Comments-Only Test       | `CommentsOnlyLogicTestDetector`         | `it` / `test` bodies that are empty or contain only comments.                                        |
| Complex Snapshot         | `ComplexSnapshotTestLogicDetector`      | Snapshot matchers (`toMatchSnapshot`, `toMatchInlineSnapshot`) with templates exceeding 50 lines.    |
| Conditional Test Logic   | `ConditionalTestLogicDetector`          | Branching and loops (`if`, `switch`, `for`, `while`, `do..while`, ternaries) inside a test body.     |
| Dependent Test           | `DependentTestDetector`                 | Tests reading shared mutable state written by a prior test without being reset in `beforeEach`.      |
| Duplicate Assert         | `DuplicateAssertDetector`               | Identical assertion statements repeated within the same test case.                                   |
| Eager Test               | `EagerTestDetector`                     | A single test invoking multiple distinct methods on the same System Under Test (SUT) instance.       |
| Exception Handling       | `ExceptionHandlingDetector`             | Manual `try/catch` or `throw` statements inside test cases instead of framework matchers.            |
| General Fixture          | `GeneralFixtureTestLogicDetector`       | Variables initialized in `beforeAll` / `beforeEach` that are not used across all tests in the suite. |
| Identical Description    | `IdenticalDescriptionTestLogicDetector` | Duplicate `it` / `test` descriptions within the same file.                                           |
| Ignored Test             | `IgnoredTestDetector`                   | Skipped or placeholder tests (`it.skip`, `test.skip`, `describe.skip`, `xit`, `xtest`, `it.todo`).   |
| Lazy Test                | `LazyTestDetector`                      | Multiple test cases in the same suite invoking the exact same single method on the SUT.              |
| Magic Number Test        | `MagicNumberTestDetector`               | Unexplained raw numeric literals (excluding `0`, `1`, `-1`) used directly in assertion matchers.     |
| Mystery Guest            | `MysteryGuestDetector`                  | Direct access to external resources (`fs`, `fetch`, `axios`, `http`, `localStorage`, etc.).          |
| Overcommented Test       | `OvercommentedTestLogicDetector`        | Test cases with more than 5 distinct comment anchors.                                                |
| Redundant Assertion      | `RedundantAssertionDetector`            | Tautological assertions comparing identical literals or identifiers (e.g. `expect(true).toBe(true)`).|
| Resource Optimism        | `ResourceOptimismDetector`              | File system operations (`fs.readFileSync`, etc.) in a test without a preceding existence check.      |
| Sleepy Test              | `SleepyTestDetector`                    | Explicit timer delays (`setTimeout`, `setInterval`, `sleep(ms)`) inside test cases.                  |
| Test Without Description | `DetectorTestWithoutDescriptionLogic`   | `it()` / `test()` calls missing a leading string literal description.                                |
| Non-Functional Statement | `NonFunctionalStatementDetector`        | Effectively empty blocks with no executable statements or comments.                                  |
| Focused / Isolated Test  | `OnlyTestDetector`                      | Leftover `.only` calls on `it`, `test`, or `describe`.                                               |
| Sensitive Equality       | `SensitiveEqualityDetector`             | Assertions relying on brittle `.toString()` string coercion.                                         |
| Suboptimal Assertion     | `SubOptimalAssertDetector`              | Assertions that obscure intent compared to idiomatic matchers.                                       |
| Transcripting Test       | `TranscriptingTestDetector`             | `console.log`, `console.error`, `console.warn`, or `console.info` calls inside tests.                |
| Unknown Test             | `UnknownTestDetector`                   | Non-empty test cases that execute code without making any assertions.                                |
| Verbose Test             | `VerboseTestDetector`                   | Test blocks exceeding 13 statements, indicating multiple scenarios packed into a single test.        |
| Assertion in Setup       | `VerifyInSetupDetector`                 | Assertions (`expect` / `assert`) placed inside lifecycle hooks (`beforeAll`, `beforeEach`, `after*`).|

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
Delay (in milliseconds, minimum `50`, default `300`) before running analysis after making edits:
```json
"snuts-js.debounceMs": 300
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

### Default File Patterns

If not configured, SNUTS.js analyzes files matching:

- `**/*.test.ts` / `**/*.test.tsx`
- `**/*.spec.ts` / `**/*.spec.tsx`
- `**/*.test.js` / `**/*.test.jsx`
- `**/*.spec.js` / `**/*.spec.jsx`
- `**/__tests__/**/*.ts` / `**/__tests__/**/*.tsx`
- `**/__tests__/**/*.js` / `**/__tests__/**/*.jsx`

### AI Refactoring Configuration

Configure the AI refactoring engine via the interactive command **`SNUTS.js: Configure AI Provider`** (which stores your API key securely in VS Code `SecretStorage`) or adjust model parameters in `settings.json`:

```json
"snuts-js.ai.provider": "openai",
"snuts-js.ai.model": "gpt-4.1-mini",
"snuts-js.ai.temperature": 0.1,
"snuts-js.ai.maxTokens": 1400,
"snuts-js.ai.concurrency": 3
```

Supported providers and default models:
- `openai` (`gpt-4.1-mini`, fallback env: `OPENAI_API_KEY`)
- `google` (`gemini-2.0-flash`, fallback env: `GOOGLE_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY`)
- `anthropic` (`claude-3-5-sonnet-latest`, fallback env: `ANTHROPIC_API_KEY`)
- `deepseek` (`deepseek-chat`, fallback env: `DEEPSEEK_API_KEY`)
- `kimi` (`moonshot-v1-8k`, fallback env: `KIMI_API_KEY` / `MOONSHOT_API_KEY`)

## Commands

| Command | Description |
| --- | --- |
| `SNUTS.js: Analyze Current Test File` | Manually trigger analysis of the active test file |
| `SNUTS.js: Analyze in Batch` | Analyze selected files/folders (via Explorer context menu or multi-select QuickPick) and populate the Problems panel |
| `SNUTS.js: Refactor Current Test File` | Generate an AI refactoring patch for the active test file and preview it in a Diff Editor |
| `SNUTS.js: Refactor in Batch` | Run AI refactoring across multiple test files or folders with bounded concurrency and review modified files before applying |
| `SNUTS.js: Configure AI Provider` | Interactive wizard to select the AI provider, model, and securely save the API key |
| `SNUTS.js: Analyze Workspace & Export Report` | Analyze all workspace test files, populate the Problems panel, and export a CSV and/or JSON report |

## Requirements

- **VS Code**: `^1.110.0`
- **Node.js**: `>=18`
- **Test Files**: JavaScript or TypeScript files matching configured patterns

## Troubleshooting

### Inspecting the SNUTS.js Output Channel

SNUTS.js writes detailed execution logs, skipped-file reasons, and per-smell remediation explanations to its dedicated Output Channel:
1. Open the **Output** panel (`Ctrl+Shift+U` / `Cmd+Shift+U`)
2. Select **SNUTS.js** from the channel dropdown

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
