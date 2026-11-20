# Change Log

All notable changes to the "snuts-js" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.0.1] - 2026-03-29

- Integrate `@snutsjs/core` for JavaScript and TypeScript test smell detection.
- Add debounced diagnostics pipeline for test files.
- Add command: `SNUTS.js: Analyze Current Test File`.
- Add extension configuration for enablement, debounce, include patterns, and severity.
- Replace scaffold documentation with extension usage and settings.
- Initial release.

## [0.0.2] - 2026-03-30

- improve loggers.
- add new `@snutsjs/core` features, to show description and explanation to each smell.


## [0.0.3] - 2026-03-30

- bug fixes

## [0.0.4] - 2026-03-30

- fix logger not showing correctly
- fix command not working

## [0.1.0] - 2026-11-17

- Update `@snutsjs/core` to `^1.3.0` and automatically load all 15 test smell detectors.
- Add AI-powered test smell refactoring (`SNUTS.js: Refactor Current Test File`, `SNUTS.js: Refactor in Batch`, and Quick Fix lightbulb actions).
- Add batch smell analysis (`SNUTS.js: Analyze in Batch` and Explorer context menu integration) with optional CSV/JSON report export.
- Add interactive AI provider setup (`SNUTS.js: Configure AI Provider`) with VS Code `SecretStorage` for API keys (`openai`, `google`, `anthropic`, `deepseek`, `kimi`).
- Add workspace-wide smell analysis and CSV/JSON report export (`SNUTS.js: Analyze Workspace & Export Report`).
- Add `.jsx` and `.tsx` React test file include patterns.
- Standardize test smell diagnostics as warnings and remove custom `snuts-js.severity` configuration.

## [0.1.1] - 2026-11-19

- Add optional `snuts-js.ai.apiKey` setting and lower minimum VS Code engine requirement to `^1.85.0`.
- Document all 28 built-in test smell detectors.

## [0.1.2] - 2026-11-19

- Update `@snutsjs/core` to `^1.4.0` to bundle all 28 built-in test smell detectors and markdown-fenced JSON patch parsing for AI refactoring.

## [0.1.3] - 2026-11-19

- Update logo to be centered and cropped.