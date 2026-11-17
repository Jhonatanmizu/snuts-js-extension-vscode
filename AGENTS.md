# SNUTS.js VS Code Extension — AI Agent Rules

Every AI agent working in `snuts-js-extension-vscode` MUST strictly adhere to these engineering rules and repository conventions.

---

## 1. Strict TypeScript — Zero `any`

- **Never use `any`**: Explicit `any`, `as any`, `<any>`, and untyped parameters/returns are strictly forbidden across `src/` and `src/test/` (enforced by `@typescript-eslint/no-explicit-any: "error"`).
- **Safe Type Narrowing**:
  - Use `unknown` for dynamic imports, untrusted configuration values, and caught errors, narrowing with explicit type guards (`value is ExpectedType` or `error instanceof Error`).
  - Maintain explicit ESM relative imports with `.js` extensions (e.g., `import { isTestFile } from "../utils/testFileMatcher.js"`) as required by `module: "Node16"`.
- **Strict Compiler Compliance**: All code must pass `yarn check-types` (`tsc --noEmit`) with `strict: true`.

---

## 2. Logging Policy — Zero `console.*` & Stdio Safety

- **Never use `console.*`**: `console.log`, `console.debug`, `console.info`, `console.warn`, and `console.error` are strictly prohibited across all extension and test files (enforced by ESLint `no-console: "error"`).
- **No Unnecessary Logging**: Do not add debug or trace logs during development.
- **VS Code `OutputChannel` Only**:
  - Route all operational and error diagnostics exclusively through the VS Code `OutputChannel` (`getOutputChannel()` / `createOutputChannelLogger()`).
  - **Critical Invariant**: `@snutsjs/core` ships with a default Pino logger that writes JSON to `process.stdout`, which can corrupt the VS Code extension host / stdio transport. Always ensure `setLogger(coreLogger)` (or `silentLogger`) is invoked immediately upon importing `@snutsjs/core` before instantiating or running any detectors.

---

## 3. Comments Policy — Self-Documenting Code Only

- **No Unnecessary Comments**: Do not write inline comments that describe *what* the code does, restate variable/method names, add visual section dividers, or leave `TODO` / `FIXME` placeholders.
- **No Commented-Out Code**: Delete obsolete code cleanly.
- **Allowed Comments**:
  - Concise JSDoc on exported interfaces or functions when parameters or contracts aren't obvious from types alone.
  - Brief *"why"* comments for non-obvious platform constraints (such as the Pino/stdout transport invariant).

---

## 4. Architecture & Design Principles — SOLID & DRY

- **Single Responsibility Principle (SRP)**:
  - `src/extension.ts`: Extension lifecycle (`activate` / `deactivate`), command registration, and workspace event wiring.
  - `src/providers/diagnosticsController.ts`: Debounced scheduling, document lifecycle tracking, `vscode.DiagnosticCollection` management, and disposal.
  - `src/analyzer/testSmellAnalyzer.ts`: Dynamic loading and execution of `@snutsjs/core` detectors.
  - `src/analyzer/smellToDiagnosticMapper.ts`: Pure mapping from `@snutsjs/core` `Smell` objects (1-based lines) to `vscode.Diagnostic` ranges (0-based lines).
  - `src/config/extensionConfig.ts`: Reading, validating, and normalizing `snuts-js.*` workspace configuration.
  - `src/utils/`: Focused utilities (`testFileMatcher.ts`, `outputChannel.ts`, `coreLogger.ts`).
- **Open/Closed Principle (OCP)**:
  - Automatically discover detectors exported by `@snutsjs/core` via its `detectors` registry rather than hardcoding detector lists when new smells are introduced.
- **Liskov Substitution & Interface Segregation (LSP & ISP)**:
  - Define minimal structural interfaces for collaborators (e.g., `AnalyzerLike = Pick<TestSmellAnalyzer, "analyze" | "consumeLastError">`) so controllers and tests only depend on the methods they use.
  - Ensure all resources (`DiagnosticCollection`, timers, event listeners, `OutputChannel`) implement or register with `vscode.Disposable` for clean teardown.
- **Dependency Inversion Principle (DIP)**:
  - Inject collaborators (`AnalyzerLike`, `ILogger`, `DetectorRunnerLike`) through constructors so components can be tested independently without invoking the full core engine.
- **Don't Repeat Yourself (DRY)**:
  - Centralize configuration defaults and severity mapping in `src/config/extensionConfig.ts`.
  - Reuse `smellToDiagnosticMapper` and `testFileMatcher` rather than duplicating range clamping or glob matching logic.

---

## 5. Testing Standards — Dogfooding SNUTS.js

- Every test in `src/test/` (excluding intentional smell fixture files under `src/test/fixtures/`) must be free of all 15 SNUTS.js test smells:
  - Descriptive test titles (> 2 words), unique per suite.
  - No conditional logic (`if`, `switch`, loops) inside test bodies.
  - No assertions inside `setup` / `teardown` / `suiteSetup` / `suiteTeardown` hooks.
  - Concise test bodies (<= 13 statements per block).
  - No `.only`, no `console.*`, no empty tests, and no redundant comments.

---

## 6. Verification & Documentation Gates

Before finishing any task:
1. Run and pass all checks:
   ```bash
   yarn check-types
   yarn lint
   yarn compile
   ```
2. Update `README.md` and `package.json` whenever commands, configuration properties (`snuts-js.*`), default values, or user-facing features change.
