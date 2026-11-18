import * as path from "node:path";
import {
  createDetectorInstances,
  LangChainProviderRegistry,
  RefactorService,
  type BatchRefactorRequest,
  type BatchRefactorResult,
  type RefactorRequest,
  type RefactorResult,
} from "@snutsjs/core";
import * as vscode from "vscode";
import { getExtensionConfig } from "../config/extensionConfig.js";
import { resolveBatchTargetFiles } from "../utils/batchTargetResolver.js";
import { getOutputChannel } from "../utils/outputChannel.js";
import type { AIConfigManager } from "./aiConfigManager.js";
import {
  createPreviewUri,
  type RefactorDiffContentProvider,
} from "./refactorDiffProvider.js";

export interface RefactorServiceLike {
  refactorFile(request: RefactorRequest): Promise<RefactorResult>;
  refactorBatch(request: BatchRefactorRequest): Promise<BatchRefactorResult>;
}

interface BatchResultQuickPickItem extends vscode.QuickPickItem {
  result: RefactorResult;
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
      await this.handleRefactorError(filePath, error);
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

  public async refactorBatch(
    clickedUri?: vscode.Uri,
    selectedUris?: readonly vscode.Uri[],
  ): Promise<vscode.Uri[]> {
    const config = getExtensionConfig();
    const targetFiles = await resolveBatchTargetFiles(
      clickedUri,
      selectedUris,
      config.includePatterns,
      "SNUTS.js: Select Test Files for Batch AI Refactoring",
    );

    if (targetFiles === undefined) {
      return [];
    }

    if (targetFiles.length === 0) {
      void vscode.window.showInformationMessage(
        "No matching test files were found for batch refactoring.",
      );
      return [];
    }

    await this.saveDirtyDocuments(targetFiles);

    const aiConfig = await this.aiConfigManager.resolve(true);
    if (!aiConfig) {
      return [];
    }

    this.log(
      `Starting batch AI refactoring across ${targetFiles.length} candidate file(s) using ${aiConfig.provider}/${aiConfig.model} (concurrency=${config.ai.concurrency})`,
    );

    let batchResult: BatchRefactorResult;
    try {
      batchResult = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `SNUTS.js Batch AI Refactoring (${aiConfig.provider}/${aiConfig.model})`,
          cancellable: false,
        },
        async (progress) => {
          return await this.service.refactorBatch({
            paths: targetFiles,
            apply: false,
            provider: aiConfig.provider,
            model: aiConfig.model,
            apiKey: aiConfig.apiKey,
            temperature: aiConfig.temperature,
            maxTokens: aiConfig.maxTokens,
            concurrency: config.ai.concurrency,
            onProgress: (event) => {
              const fileName = path.basename(event.file);
              progress.report({
                message: `(${event.completedFiles}/${event.totalFiles}) ${fileName}: ${event.message}`,
              });
            },
          });
        },
      );
    } catch (error) {
      await this.handleRefactorError("batch target files", error);
      return [];
    }

    for (const res of batchResult.results) {
      this.logRefactorResult(res);
    }

    for (const failure of batchResult.failures) {
      this.log(`Batch refactoring failed for ${failure.file}: ${failure.error}`);
    }

    if (batchResult.filesWithSmells === 0) {
      void vscode.window.showInformationMessage(
        `No test smells were detected across ${batchResult.totalFilesDiscovered} file(s).`,
      );
      return [];
    }

    const modifiedResults = batchResult.results.filter(
      (res) => res.patch.edits.length > 0,
    );

    if (modifiedResults.length === 0) {
      const failureSuffix =
        batchResult.filesFailed > 0
          ? ` (${batchResult.filesFailed} file(s) failed — check Output channel)`
          : "";
      void vscode.window.showInformationMessage(
        `Batch AI refactoring produced no code changes across ${batchResult.filesWithSmells} smelly file(s)${failureSuffix}.`,
      );
      return [];
    }

    const pickItems: BatchResultQuickPickItem[] = modifiedResults.map((res) => {
      const fileUri = vscode.Uri.file(res.file);
      return {
        label: vscode.workspace.asRelativePath(fileUri, false),
        description: `${res.patch.edits.length} edit(s) (${res.diagnostics.smellsUsedInPrompt} smell(s))`,
        detail: res.summary,
        picked: true,
        result: res,
      };
    });

    const selectedItems =
      await vscode.window.showQuickPick<BatchResultQuickPickItem>(pickItems, {
        title: `SNUTS.js: Review & Apply Batch AI Refactoring (${modifiedResults.length} file(s))`,
        placeHolder:
          "Select the refactored test files to apply to your workspace",
        canPickMany: true,
        ignoreFocusOut: true,
      });

    if (!selectedItems || selectedItems.length === 0) {
      this.log("User cancelled or deselected all batch refactoring results.");
      return [];
    }

    const appliedUris = await this.applyBatchResults(
      selectedItems.map((item) => item.result),
    );

    if (appliedUris.length > 0) {
      this.log(`Applied batch AI refactoring to ${appliedUris.length} file(s).`);
      void vscode.window.showInformationMessage(
        `SNUTS.js applied AI refactoring to ${appliedUris.length} test file(s).`,
      );
    }

    return appliedUris;
  }

  private async resolveTargetDocument(
    targetUri?: vscode.Uri,
  ): Promise<vscode.TextDocument | undefined> {
    if (targetUri) {
      return await vscode.workspace.openTextDocument(targetUri);
    }

    return vscode.window.activeTextEditor?.document;
  }

  private async saveDirtyDocuments(filePaths: readonly string[]): Promise<void> {
    const targetSet = new Set(filePaths.map((p) => path.resolve(p)));
    for (const doc of vscode.workspace.textDocuments) {
      if (
        doc.isDirty &&
        doc.uri.scheme === "file" &&
        targetSet.has(path.resolve(doc.uri.fsPath))
      ) {
        await doc.save();
      }
    }
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

  private async applyBatchResults(
    results: readonly RefactorResult[],
  ): Promise<vscode.Uri[]> {
    const edit = new vscode.WorkspaceEdit();
    const documents: vscode.TextDocument[] = [];

    for (const res of results) {
      const uri = vscode.Uri.file(res.file);
      const doc = await vscode.workspace.openTextDocument(uri);
      const lastLineIndex = Math.max(doc.lineCount - 1, 0);
      const lastLine = doc.lineAt(lastLineIndex);
      const fullRange = new vscode.Range(
        new vscode.Position(0, 0),
        lastLine.range.end,
      );

      edit.replace(uri, fullRange, res.updatedContent);
      documents.push(doc);
    }

    const applied = await vscode.workspace.applyEdit(edit);
    if (!applied) {
      return [];
    }

    for (const doc of documents) {
      await doc.save();
    }

    return documents.map((doc) => doc.uri);
  }

  private async handleRefactorError(
    targetLabel: string,
    error: unknown,
  ): Promise<void> {
    const normalizedError =
      error instanceof Error ? error : new Error(String(error));
    this.log(`AI refactoring failed for ${targetLabel}`);
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
  }

  private logRefactorResult(result: RefactorResult): void {
    this.log(
      `AI patch generated for ${result.file}: ${result.summary} (${result.patch.edits.length} edit(s))`,
    );
    for (const edit of result.patch.edits) {
      this.log(`  - Lines ${edit.startLine}-${edit.endLine}: ${edit.reason}`);
    }
  }

  private log(message: string): void {
    this.outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
  }
}
