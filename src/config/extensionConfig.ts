import type { AIProviderName } from "@snutsjs/core";
import * as vscode from "vscode";

export interface ExtensionAIConfig {
  provider: AIProviderName;
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface ExtensionConfig {
  enabled: boolean;
  debounceMs: number;
  includePatterns: string[];
  ai: ExtensionAIConfig;
}

export const CONFIG_SECTION = "snuts-js";
const DEFAULT_DEBOUNCE_MS = 300;
const DEFAULT_AI_PROVIDER: AIProviderName = "openai";
const DEFAULT_AI_TEMPERATURE = 0.1;
const DEFAULT_AI_MAX_TOKENS = 1400;

export const DEFAULT_AI_MODELS: Readonly<Record<AIProviderName, string>> = {
  openai: "gpt-4.1-mini",
  google: "gemini-2.0-flash",
  anthropic: "claude-3-5-sonnet-latest",
  deepseek: "deepseek-chat",
  kimi: "moonshot-v1-8k",
};

export const SUPPORTED_AI_PROVIDERS: readonly AIProviderName[] = [
  "openai",
  "google",
  "anthropic",
  "deepseek",
  "kimi",
];

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

export function isSupportedAIProvider(value: unknown): value is AIProviderName {
  return (
    typeof value === "string" &&
    (SUPPORTED_AI_PROVIDERS as readonly string[]).includes(value)
  );
}

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

function normalizeProvider(value: string | undefined): AIProviderName {
  if (isSupportedAIProvider(value)) {
    return value;
  }

  return DEFAULT_AI_PROVIDER;
}

function normalizeTemperature(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value < 0 || value > 2) {
    return DEFAULT_AI_TEMPERATURE;
  }

  return value;
}

function normalizeMaxTokens(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_AI_MAX_TOKENS;
  }

  return Math.trunc(value);
}

export function getExtensionConfig(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const provider = normalizeProvider(
    config.get<string>("ai.provider", DEFAULT_AI_PROVIDER),
  );
  const configuredModel = config.get<string>("ai.model", "").trim();
  const model =
    configuredModel.length > 0 ? configuredModel : DEFAULT_AI_MODELS[provider];

  return {
    enabled: config.get<boolean>("enabled", true),
    debounceMs: normalizeDebounceMs(
      config.get<number>("debounceMs", DEFAULT_DEBOUNCE_MS),
    ),
    includePatterns: normalizePatterns(
      config.get<string[]>("includePatterns", DEFAULT_INCLUDE_PATTERNS),
    ),
    ai: {
      provider,
      model,
      temperature: normalizeTemperature(
        config.get<number>("ai.temperature", DEFAULT_AI_TEMPERATURE),
      ),
      maxTokens: normalizeMaxTokens(
        config.get<number>("ai.maxTokens", DEFAULT_AI_MAX_TOKENS),
      ),
    },
  };
}
