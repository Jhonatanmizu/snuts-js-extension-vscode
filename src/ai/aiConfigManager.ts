import {
  resolveAIConfig,
  type AIProviderName,
  type ResolvedAIConfig,
} from "@snutsjs/core";
import * as vscode from "vscode";
import {
  CONFIG_SECTION,
  DEFAULT_AI_MODELS,
  getExtensionConfig,
} from "../config/extensionConfig.js";
import { getOutputChannel } from "../utils/outputChannel.js";

export interface SecretStoreLike {
  get(key: string): Thenable<string | undefined>;
  store(key: string, value: string): Thenable<void>;
  delete(key: string): Thenable<void>;
}

interface ProviderQuickPickItem extends vscode.QuickPickItem {
  provider: AIProviderName;
}

const PROVIDER_ITEMS: readonly ProviderQuickPickItem[] = [
  {
    label: "OpenAI",
    description: "openai",
    detail: `Default model: ${DEFAULT_AI_MODELS.openai} (env: OPENAI_API_KEY)`,
    provider: "openai",
  },
  {
    label: "Google Gemini",
    description: "google",
    detail: `Default model: ${DEFAULT_AI_MODELS.google} (env: GOOGLE_API_KEY)`,
    provider: "google",
  },
  {
    label: "Anthropic Claude",
    description: "anthropic",
    detail: `Default model: ${DEFAULT_AI_MODELS.anthropic} (env: ANTHROPIC_API_KEY)`,
    provider: "anthropic",
  },
  {
    label: "DeepSeek",
    description: "deepseek",
    detail: `Default model: ${DEFAULT_AI_MODELS.deepseek} (env: DEEPSEEK_API_KEY)`,
    provider: "deepseek",
  },
  {
    label: "Moonshot Kimi",
    description: "kimi",
    detail: `Default model: ${DEFAULT_AI_MODELS.kimi} (env: KIMI_API_KEY)`,
    provider: "kimi",
  },
];

export function buildSecretKey(provider: AIProviderName): string {
  return `${CONFIG_SECTION}.ai.apiKey.${provider}`;
}

export class AIConfigManager {
  private readonly outputChannel = getOutputChannel();

  constructor(private readonly secrets: SecretStoreLike) {}

  public async getStoredApiKey(
    provider: AIProviderName,
  ): Promise<string | undefined> {
    const raw = await this.secrets.get(buildSecretKey(provider));
    const trimmed = raw?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : undefined;
  }

  public async storeApiKey(
    provider: AIProviderName,
    apiKey: string,
  ): Promise<void> {
    const trimmed = apiKey.trim();
    if (trimmed.length === 0) {
      await this.secrets.delete(buildSecretKey(provider));
      return;
    }

    await this.secrets.store(buildSecretKey(provider), trimmed);
  }

  public async resolve(
    promptIfMissing = true,
  ): Promise<ResolvedAIConfig | undefined> {
    const { ai } = getExtensionConfig();
    const storedApiKey = await this.getStoredApiKey(ai.provider);

    try {
      return resolveAIConfig({
        provider: ai.provider,
        model: ai.model,
        apiKey: storedApiKey,
        temperature: ai.temperature,
        maxTokens: ai.maxTokens,
      });
    } catch {
      if (!promptIfMissing) {
        return undefined;
      }

      const action = await vscode.window.showWarningMessage(
        `No API key is configured for AI provider "${ai.provider}". Configure SNUTS.js AI now to continue refactoring?`,
        "Configure AI",
        "Cancel",
      );

      if (action !== "Configure AI") {
        return undefined;
      }

      return await this.configureInteractively();
    }
  }

  public async configureInteractively(): Promise<ResolvedAIConfig | undefined> {
    const currentConfig = getExtensionConfig().ai;

    const pickedProvider =
      await vscode.window.showQuickPick<ProviderQuickPickItem>(PROVIDER_ITEMS, {
        title: "SNUTS.js: Configure AI Provider (1/3)",
        placeHolder: `Select AI provider (current: ${currentConfig.provider})`,
        ignoreFocusOut: true,
      });

    if (!pickedProvider) {
      return undefined;
    }

    const provider = pickedProvider.provider;
    const defaultModel =
      provider === currentConfig.provider
        ? currentConfig.model
        : DEFAULT_AI_MODELS[provider];

    const modelInput = await vscode.window.showInputBox({
      title: "SNUTS.js: Configure AI Model (2/3)",
      prompt: `Enter model identifier for ${pickedProvider.label}`,
      value: defaultModel,
      placeHolder: DEFAULT_AI_MODELS[provider],
      ignoreFocusOut: true,
      validateInput: (value) =>
        value.trim().length === 0 ? "Model name cannot be empty." : undefined,
    });

    if (modelInput === undefined) {
      return undefined;
    }

    const model = modelInput.trim() || DEFAULT_AI_MODELS[provider];
    const existingKey = await this.getStoredApiKey(provider);

    const apiKeyInput = await vscode.window.showInputBox({
      title: "SNUTS.js: Configure AI API Key (3/3)",
      prompt: existingKey
        ? `Enter a new API key for ${pickedProvider.label} (or leave blank to keep existing stored key)`
        : `Enter API key for ${pickedProvider.label} (stored securely in VS Code SecretStorage)`,
      password: true,
      placeHolder: existingKey ? "••••••••••••••••" : "sk-...",
      ignoreFocusOut: true,
      validateInput: (value) => {
        if (!existingKey && value.trim().length === 0) {
          return "An API key is required.";
        }
        return undefined;
      },
    });

    if (apiKeyInput === undefined) {
      return undefined;
    }

    const finalApiKey =
      apiKeyInput.trim().length > 0 ? apiKeyInput.trim() : existingKey;
    if (!finalApiKey) {
      return undefined;
    }

    await this.storeApiKey(provider, finalApiKey);

    const vsConfig = vscode.workspace.getConfiguration(CONFIG_SECTION);
    await vsConfig.update(
      "ai.provider",
      provider,
      vscode.ConfigurationTarget.Global,
    );
    await vsConfig.update("ai.model", model, vscode.ConfigurationTarget.Global);

    this.outputChannel.appendLine(
      `[${new Date().toISOString()}] Configured AI provider="${provider}", model="${model}" (API key saved to SecretStorage).`,
    );

    void vscode.window.showInformationMessage(
      `SNUTS.js AI configured: ${pickedProvider.label} (${model}).`,
    );

    const updatedAiConfig = getExtensionConfig().ai;
    return resolveAIConfig({
      provider,
      model,
      apiKey: finalApiKey,
      temperature: updatedAiConfig.temperature,
      maxTokens: updatedAiConfig.maxTokens,
    });
  }
}
