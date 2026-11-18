import * as vscode from "vscode";

export interface ExtensionConfig {
	enabled: boolean;
	debounceMs: number;
	includePatterns: string[];
}

const CONFIG_SECTION = "snuts-js";
const DEFAULT_DEBOUNCE_MS = 300;
const DEFAULT_INCLUDE_PATTERNS = [
	"**/*.test.ts",
	"**/*.spec.ts",
	"**/*.test.tsx",
	"**/*.spec.tsx",
	"**/*.test.js",
	"**/*.spec.js",
	"**/*.test.jsx",
	"**/*.spec.jsx",
	"**/__tests__/**/*.ts",
	"**/__tests__/**/*.tsx",
	"**/__tests__/**/*.js",
	"**/__tests__/**/*.jsx",
];

function normalizePatterns(patterns: string[] | undefined): string[] {
	if (!patterns || patterns.length === 0) {
		return [...DEFAULT_INCLUDE_PATTERNS];
	}

	const sanitized = patterns
		.map((pattern) => pattern.trim())
		.filter((pattern) => pattern.length > 0);

	return sanitized.length > 0 ? sanitized : [...DEFAULT_INCLUDE_PATTERNS];
}

function normalizeDebounceMs(value: number | undefined): number {
	if (!Number.isFinite(value) || value === undefined) {
		return DEFAULT_DEBOUNCE_MS;
	}

	return Math.max(50, Math.trunc(value));
}

export function getExtensionConfig(): ExtensionConfig {
	const config = vscode.workspace.getConfiguration(CONFIG_SECTION);

	return {
		enabled: config.get<boolean>("enabled", true),
		debounceMs: normalizeDebounceMs(config.get<number>("debounceMs", DEFAULT_DEBOUNCE_MS)),
		includePatterns: normalizePatterns(config.get<string[]>("includePatterns", DEFAULT_INCLUDE_PATTERNS)),
	};
}
