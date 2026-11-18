import { setLogger } from "@snutsjs/core";
import * as vscode from "vscode";
import { AIConfigManager } from "./ai/aiConfigManager.js";
import { RefactorController } from "./ai/refactorController.js";
import {
  REFACTOR_PREVIEW_SCHEME,
  RefactorDiffContentProvider,
} from "./ai/refactorDiffProvider.js";
import { TestSmellAnalyzer } from "./analyzer/testSmellAnalyzer.js";
import { DiagnosticsController } from "./providers/diagnosticsController.js";
import {
  REFACTOR_CURRENT_FILE_COMMAND,
  RefactorCodeActionProvider,
} from "./providers/refactorCodeActionProvider.js";
import { WorkspaceReportController } from "./reporter/workspaceReportController.js";
import { createOutputChannelLogger } from "./utils/coreLogger.js";
import {
  formatSmellLogLines,
  getOutputChannel,
} from "./utils/outputChannel.js";

const SUPPORTED_CODE_ACTION_LANGUAGES: readonly vscode.DocumentFilter[] = [
  { scheme: "file", language: "javascript" },
  { scheme: "file", language: "javascriptreact" },
  { scheme: "file", language: "typescript" },
  { scheme: "file", language: "typescriptreact" },
];

export function activate(context: vscode.ExtensionContext): void {
  // Replace @snutsjs/core's default pino logger before detector instantiation
  // so stray stdout writes cannot corrupt the VS Code extension host transport.
  const outputChannel = getOutputChannel();
  const coreLogger = createOutputChannelLogger(outputChannel);
  setLogger(coreLogger);

  outputChannel.appendLine(
    `[${new Date().toISOString()}] Activating SNUTS.js extension...`,
  );

  try {
    const analyzer = new TestSmellAnalyzer(undefined, coreLogger);
    const diagnosticsController = new DiagnosticsController(analyzer);
    const aiConfigManager = new AIConfigManager(context.secrets);
    const diffProvider = new RefactorDiffContentProvider();
    const refactorController = new RefactorController(
      aiConfigManager,
      diffProvider,
    );
    const workspaceReportController = new WorkspaceReportController(
      diagnosticsController,
    );

    context.subscriptions.push(diagnosticsController);
    context.subscriptions.push(diffProvider);
    context.subscriptions.push(outputChannel);

    context.subscriptions.push(
      vscode.workspace.registerTextDocumentContentProvider(
        REFACTOR_PREVIEW_SCHEME,
        diffProvider,
      ),
    );

    context.subscriptions.push(
      vscode.languages.registerCodeActionsProvider(
        SUPPORTED_CODE_ACTION_LANGUAGES,
        new RefactorCodeActionProvider(),
        {
          providedCodeActionKinds:
            RefactorCodeActionProvider.providedCodeActionKinds,
        },
      ),
    );

    context.subscriptions.push(
      vscode.workspace.onDidOpenTextDocument((document) => {
        diagnosticsController.handleDocumentOpen(document);
      }),
    );

    context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        diagnosticsController.handleDocumentChange(event);
      }),
    );

    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument((document) => {
        diagnosticsController.handleDocumentSave(document);
      }),
    );

    context.subscriptions.push(
      vscode.workspace.onDidCloseTextDocument((document) => {
        diagnosticsController.handleDocumentClose(document);
      }),
    );

    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("snuts-js")) {
          for (const document of vscode.workspace.textDocuments) {
            diagnosticsController.handleDocumentOpen(document);
          }
        }
      }),
    );

    for (const document of vscode.workspace.textDocuments) {
      diagnosticsController.handleDocumentOpen(document);
    }

    const analyzeCurrentFileCommand = vscode.commands.registerCommand(
      "snuts-js.analyzeCurrentFile",
      async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          void vscode.window.showInformationMessage(
            "Open a test file to run SNUTS.js analysis.",
          );
          return;
        }

        const targetPath = editor.document.uri.fsPath;
        outputChannel.appendLine(
          `[${new Date().toISOString()}] Manual analysis started for ${targetPath}`,
        );

        try {
          const result = await diagnosticsController.analyzeNow(
            editor.document,
            true,
          );

          if (result.error) {
            outputChannel.appendLine(
              `[${new Date().toISOString()}] Manual analysis failed for ${targetPath}`,
            );

            const selection = await vscode.window.showErrorMessage(
              "SNUTS.js analysis failed. Check the SNUTS.js output channel for details.",
              "Open Output",
            );

            if (selection === "Open Output") {
              outputChannel.show(true);
            }

            return;
          }

          if (result.diagnosticsCount === 0) {
            outputChannel.appendLine(
              `[${new Date().toISOString()}] Manual analysis completed for ${targetPath}: no smells found`,
            );
            void vscode.window.showInformationMessage(
              "No test smells found in the current file.",
            );
            return;
          }

          outputChannel.appendLine(
            `[${new Date().toISOString()}] Manual analysis completed for ${targetPath}: ${result.diagnosticsCount} smell(s) found`,
          );

          for (const smell of result.smells ?? []) {
            for (const line of formatSmellLogLines(smell)) {
              outputChannel.appendLine(`[${new Date().toISOString()}] ${line}`);
            }
          }

          void vscode.window.showWarningMessage(
            `SNUTS.js found ${result.diagnosticsCount} potential test smell(s).`,
          );
        } catch (error) {
          const normalizedError =
            error instanceof Error ? error : new Error(String(error));
          outputChannel.appendLine(
            `[${new Date().toISOString()}] Manual analysis threw for ${targetPath}`,
          );
          outputChannel.appendLine(
            normalizedError.stack ?? normalizedError.message,
          );
          outputChannel.appendLine("");

          const selection = await vscode.window.showErrorMessage(
            "SNUTS.js analysis failed unexpectedly. Check the SNUTS.js output channel for details.",
            "Open Output",
          );

          if (selection === "Open Output") {
            outputChannel.show(true);
          }
        }
      },
    );

    const configureAICommand = vscode.commands.registerCommand(
      "snuts-js.configureAI",
      async () => {
        await aiConfigManager.configureInteractively();
      },
    );

    const refactorCurrentFileCommand = vscode.commands.registerCommand(
      REFACTOR_CURRENT_FILE_COMMAND,
      async (targetUri?: vscode.Uri, smellDescriptionFilter?: string) => {
        const applied = await refactorController.refactorDocument(
          targetUri,
          smellDescriptionFilter,
        );
        if (applied) {
          const doc =
            (targetUri
              ? vscode.workspace.textDocuments.find(
                  (item) => item.uri.toString() === targetUri.toString(),
                )
              : undefined) ?? vscode.window.activeTextEditor?.document;

          if (doc) {
            await doc.save();
            await diagnosticsController.analyzeNow(doc, true);
          }
        }
      },
    );

    const analyzeWorkspaceCommand = vscode.commands.registerCommand(
      "snuts-js.analyzeWorkspaceAndExportReport",
      async () => {
        await workspaceReportController.analyzeWorkspaceAndExportReport();
      },
    );

    context.subscriptions.push(
      analyzeCurrentFileCommand,
      configureAICommand,
      refactorCurrentFileCommand,
      analyzeWorkspaceCommand,
    );

    outputChannel.appendLine(
      `[${new Date().toISOString()}] SNUTS.js extension activated.`,
    );
  } catch (error) {
    const normalizedError =
      error instanceof Error ? error : new Error(String(error));
    outputChannel.appendLine(
      `[${new Date().toISOString()}] SNUTS.js activation failed.`,
    );
    outputChannel.appendLine(normalizedError.stack ?? normalizedError.message);
    outputChannel.appendLine("");
    outputChannel.show(true);
    throw error;
  }
}

export function deactivate(): void {}
