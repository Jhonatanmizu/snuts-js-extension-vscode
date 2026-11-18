import * as path from "node:path";
import {
  createDetectorInstances,
  LangChainProviderRegistry,
  RefactorService,
  type RefactorRequest,
  type RefactorResult,
} from "@snutsjs/core";
import * as vscode from "vscode";
import { getOutputChannel } from "../utils/outputChannel.js";
import type { AIConfigManager } from "./aiConfigManager.js";
import {
  createPreviewUri,
  type RefactorDiffContentProvider,
} from "./refactorDiffProvider.js";

export interface RefactorServiceLike {
  refactorFile(request: RefactorRequest): Promise<RefactorResult>;
}

function createDefaultRefactorService(): RefactorServiceLike {
  const detectors = createDetectorInstances();
  const registry = new LangChainProviderRegistry();
  return new RefactorService(detectors, registry);
}

export class RefactorController {
  private readonly outputChannel = getOutputChannel();
  private readonly service: RefactorServiceLike;

  constructor(
    private readonly aiConfigManager: AIConfigManager,
    private readonly diffProvider: RefactorDiffContentProvider,
    service?: RefactorServiceLike,
  ) {
    this.service = service ?? createDefaultRefactorService();
  }

  public async refactorDocument(
    targetUri?: vscode.Uri,
    smellDescriptionFilter?: string,
  ): Promise<boolean> {
    const document = await this.resolveTargetDocument(targetUri);
    if (!document) {
      void vscode.window.showInformationMessage(
        "Open a test file to run SNUTS.js AI refactoring.",
      );
      return false;
    }

    if (document.isUntitled || document.uri.scheme !== "file") {
      void vscode.window.showWarningMessage(
        "Please save the test file to disk before running SNUTS.js AI refactoring.",
      );
      return false;
    }

    if (document.isDirty) {
      const saved = await document.save();
      if (!saved) {
        return false;
      }
    }

    const aiConfig = await this.aiConfigManager.resolve(true);
    if (!aiConfig) {
      return false;
    }

    const filePath = document.uri.fsPath;
    const filterLabel = smellDescriptionFilter
      ? ` (filter: ${smellDescriptionFilter})`
      : "";

    this.log(
      `Starting AI refactoring for ${filePath}${filterLabel} using ${aiConfig.provider}/${aiConfig.model}`,
    );

    let result: RefactorResult;
    try {
      result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `SNUTS.js AI Refactoring (${aiConfig.provider}/${aiConfig.model})`,
          cancellable: false,
        },
        async (progress) => {
          return await this.service.refactorFile({
            file: filePath,
            apply: false,
            provider: aiConfig.provider,
            model: aiConfig.model,
            apiKey: aiConfig.apiKey,
            temperature: aiConfig.temperature,
            maxTokens: aiConfig.maxTokens,
            smellDescriptionFilter,
            onProgress: (event) => {
              progress.report({ message: event.message });
            },
          });
        },
      );
    } catch (error) {
      const normalizedError =
        error instanceof Error ? error : new Error(String(error));
      this.log(`AI refactoring failed for ${filePath}`);
      this.outputChannel.appendLine(
        normalizedError.stack ?? normalizedError.message,
      );
      this.outputChannel.appendLine("");

      const selection = await vscode.window.showErrorMessage(
        `SNUTS.js AI refactoring failed: ${normalizedError.message}`,
        "Open Output",
        "Configure AI",
      );

      if (selection === "Open Output") {
        this.outputChannel.show(true);
      } else if (selection === "Configure AI") {
        await this.aiConfigManager.configureInteractively();
      }

      return false;
    }

    if (result.diagnostics.smellsUsedInPrompt === 0) {
      this.log(
        `AI refactoring skipped for ${filePath}: no matching test smells found.`,
      );
      void vscode.window.showInformationMessage(
        smellDescriptionFilter
          ? `No "${smellDescriptionFilter}" smells found in ${path.basename(filePath)}.`
          : `No test smells found to refactor in ${path.basename(filePath)}.`,
      );
      return false;
    }

    if (
      result.patch.edits.length === 0 ||
      result.updatedContent === document.getText()
    ) {
      this.log(`AI refactoring produced no changes for ${filePath}.`);
      void vscode.window.showInformationMessage(
        "AI model returned no code changes for the detected test smells.",
      );
      return false;
    }

    this.logRefactorResult(result);

    const previewUri = createPreviewUri(document.uri);
    this.diffProvider.setPreviewContent(previewUri, result.updatedContent);

    try {
      const diffTitle = `${path.basename(filePath)} (Original ↔ SNUTS.js AI Refactor)`;
      await vscode.commands.executeCommand(
        "vscode.diff",
        document.uri,
        previewUri,
        diffTitle,
      );

      const decision = await vscode.window.showInformationMessage(
        `SNUTS.js AI Refactor: ${result.summary} (${result.patch.edits.length} edit(s))`,
        "Apply Refactoring",
        "Discard",
      );

      if (decision !== "Apply Refactoring") {
        this.log(`User discarded AI refactoring preview for ${filePath}.`);
        return false;
      }

      const applied = await this.applyUpdatedContent(
        document,
        result.updatedContent,
      );
      if (applied) {
        this.log(`Applied AI refactoring to ${filePath}.`);
        void vscode.window.showInformationMessage(
          `Applied SNUTS.js AI refactoring to ${path.basename(filePath)}.`,
        );
      }

      return applied;
    } finally {
      this.diffProvider.deletePreviewContent(previewUri);
    }
  }

  private async resolveTargetDocument(
    targetUri?: vscode.Uri,
  ): Promise<vscode.TextDocument | undefined> {
    if (targetUri) {
      return await vscode.workspace.openTextDocument(targetUri);
    }

    return vscode.window.activeTextEditor?.document;
  }

  private async applyUpdatedContent(
    document: vscode.TextDocument,
    updatedContent: string,
  ): Promise<boolean> {
    const lastLineIndex = Math.max(document.lineCount - 1, 0);
    const lastLine = document.lineAt(lastLineIndex);
    const fullRange = new vscode.Range(
      new vscode.Position(0, 0),
      lastLine.range.end,
    );

    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, fullRange, updatedContent);
    const success = await vscode.workspace.applyEdit(edit);
    if (success) {
      await vscode.window.showTextDocument(document);
    }

    return success;
  }

  private logRefactorResult(result: RefactorResult): void {
    this.log(
      `AI patch generated for ${result.file}: ${result.summary} (${result.patch.edits.length} edit(s))`,
    );
    for (const edit of result.patch.edits) {
      this.log(
        `  - Lines ${edit.startLine}-${edit.endLine}: ${edit.reason}`,
      );
    }
  }

  private log(message: string): void {
    this.outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
  }
}
