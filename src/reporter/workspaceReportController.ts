import { Buffer } from "node:buffer";
import * as path from "node:path";
import {
  createDetectorInstances,
  CsvReportGenerator,
  JsonReportGenerator,
  ProjectAnalyzer,
  type ReportGenerator,
  type Smell,
} from "@snutsjs/core";
import * as vscode from "vscode";
import { getExtensionConfig } from "../config/extensionConfig.js";
import type { DiagnosticsController } from "../providers/diagnosticsController.js";
import {
  findMatchingTestFilesInWorkspace,
  resolveBatchTargetFiles,
} from "../utils/batchTargetResolver.js";
import { formatSmellLogLines, getOutputChannel } from "../utils/outputChannel.js";

export type ReportFormatChoice = "csv" | "json" | "both";

export interface ProjectAnalyzerLike {
  analyze(paths: string[]): Promise<Smell[]>;
}

interface FormatQuickPickItem extends vscode.QuickPickItem {
  format: ReportFormatChoice;
}

const FORMAT_ITEMS: readonly FormatQuickPickItem[] = [
  {
    label: "CSV Report (.csv)",
    description: "csv",
    detail:
      "Generate a comma-separated values report of detected test smells",
    format: "csv",
  },
  {
    label: "JSON Report (.json)",
    description: "json",
    detail: "Generate a structured JSON array of detected test smells",
    format: "json",
  },
  {
    label: "Both CSV and JSON",
    description: "both",
    detail: "Export both .csv and .json report files",
    format: "both",
  },
];

function createDefaultProjectAnalyzer(): ProjectAnalyzerLike {
  return new ProjectAnalyzer(createDetectorInstances());
}

export function generateReportContent(
  smells: Smell[],
  format: "csv" | "json",
): string {
  const generator: ReportGenerator =
    format === "json" ? new JsonReportGenerator() : new CsvReportGenerator();
  return generator.generate(smells);
}

export class WorkspaceReportController {
  private readonly outputChannel = getOutputChannel();
  private readonly projectAnalyzer: ProjectAnalyzerLike;

  constructor(
    private readonly diagnosticsController: Pick<
      DiagnosticsController,
      "publishFileSmells"
    >,
    projectAnalyzer?: ProjectAnalyzerLike,
  ) {
    this.projectAnalyzer = projectAnalyzer ?? createDefaultProjectAnalyzer();
  }

  public async analyzeBatch(
    clickedUri?: vscode.Uri,
    selectedUris?: readonly vscode.Uri[],
  ): Promise<Smell[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      void vscode.window.showInformationMessage(
        "Open a workspace folder to run SNUTS.js batch analysis.",
      );
      return [];
    }

    const config = getExtensionConfig();
    const targetFiles = await resolveBatchTargetFiles(
      clickedUri,
      selectedUris,
      config.includePatterns,
      "SNUTS.js: Select Test Files for Batch Analysis",
    );

    if (targetFiles === undefined) {
      return [];
    }

    if (targetFiles.length === 0) {
      void vscode.window.showInformationMessage(
        "No matching test files were found for batch analysis.",
      );
      return [];
    }

    const smells = await this.executeBatchAnalysis(targetFiles);
    const workspaceRoot = workspaceFolders[0].uri.fsPath;

    const action = await vscode.window.showInformationMessage(
      `SNUTS.js analyzed ${targetFiles.length} file(s) and found ${smells.length} potential test smell(s).`,
      "Export Report (CSV/JSON)",
      "Open Output",
    );

    if (action === "Export Report (CSV/JSON)") {
      await this.promptAndSaveReports(workspaceRoot, smells);
    } else if (action === "Open Output") {
      this.outputChannel.show(true);
    }

    return smells;
  }

  public async analyzeWorkspaceAndExportReport(): Promise<string[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      void vscode.window.showInformationMessage(
        "Open a workspace folder to run SNUTS.js workspace analysis.",
      );
      return [];
    }

    const pickedFormat =
      await vscode.window.showQuickPick<FormatQuickPickItem>(FORMAT_ITEMS, {
        title: "SNUTS.js: Export Workspace Test Smell Report",
        placeHolder: "Select report format to export after workspace analysis",
        ignoreFocusOut: true,
      });

    if (!pickedFormat) {
      return [];
    }

    const config = getExtensionConfig();
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const matchedUris = await findMatchingTestFilesInWorkspace(
      config.includePatterns,
    );
    const filePaths = matchedUris.map((uri) => uri.fsPath);

    if (filePaths.length === 0) {
      this.log("Workspace analysis found no matching test files.");
      void vscode.window.showInformationMessage(
        "No test files matching snuts-js.includePatterns were found in the workspace.",
      );
      return [];
    }

    const smells = await this.executeBatchAnalysis(filePaths);
    const savedPaths = await this.saveReports(
      workspaceRoot,
      smells,
      pickedFormat.format,
    );

    if (savedPaths.length > 0) {
      const firstDoc = await vscode.workspace.openTextDocument(
        vscode.Uri.file(savedPaths[0]),
      );
      await vscode.window.showTextDocument(firstDoc, { preview: false });

      void vscode.window.showInformationMessage(
        `SNUTS.js analyzed ${filePaths.length} file(s) (${smells.length} smell(s)) and exported ${savedPaths.map((p) => path.basename(p)).join(", ")}.`,
      );
    }

    return savedPaths;
  }

  private async executeBatchAnalysis(filePaths: string[]): Promise<Smell[]> {
    const smells = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `SNUTS.js: Analyzing ${filePaths.length} test file(s)...`,
        cancellable: false,
      },
      async (progress) => {
        progress.report({
          message: `Running AST detectors on ${filePaths.length} file(s)...`,
        });
        const detectedSmells = await this.projectAnalyzer.analyze(filePaths);

        progress.report({ message: "Publishing diagnostics to Problems..." });
        await this.publishDiagnosticsByFile(filePaths, detectedSmells);

        return detectedSmells;
      },
    );

    this.log(
      `Batch analysis completed: ${smells.length} smell(s) across ${filePaths.length} test file(s).`,
    );

    for (const smell of smells) {
      for (const line of formatSmellLogLines(smell)) {
        this.log(`${path.basename(smell.file)} ${line.trimStart()}`);
      }
    }

    return smells;
  }

  private async promptAndSaveReports(
    workspaceRoot: string,
    smells: Smell[],
  ): Promise<string[]> {
    const pickedFormat =
      await vscode.window.showQuickPick<FormatQuickPickItem>(FORMAT_ITEMS, {
        title: "SNUTS.js: Export Test Smell Report",
        placeHolder: "Select report format to export",
        ignoreFocusOut: true,
      });

    if (!pickedFormat) {
      return [];
    }

    const savedPaths = await this.saveReports(
      workspaceRoot,
      smells,
      pickedFormat.format,
    );

    if (savedPaths.length > 0) {
      const firstDoc = await vscode.workspace.openTextDocument(
        vscode.Uri.file(savedPaths[0]),
      );
      await vscode.window.showTextDocument(firstDoc, { preview: false });
    }

    return savedPaths;
  }

  private async publishDiagnosticsByFile(
    filePaths: readonly string[],
    smells: readonly Smell[],
  ): Promise<void> {
    const smellsByFile = new Map<string, Smell[]>();
    for (const filePath of filePaths) {
      smellsByFile.set(path.resolve(filePath), []);
    }

    for (const smell of smells) {
      const resolvedPath = path.resolve(smell.file);
      const list = smellsByFile.get(resolvedPath) ?? [];
      list.push(smell);
      smellsByFile.set(resolvedPath, list);
    }

    for (const [filePath, fileSmells] of smellsByFile) {
      await this.diagnosticsController.publishFileSmells(
        vscode.Uri.file(filePath),
        fileSmells,
      );
    }
  }

  private async saveReports(
    workspaceRoot: string,
    smells: Smell[],
    format: ReportFormatChoice,
  ): Promise<string[]> {
    const savedPaths: string[] = [];

    if (format === "csv" || format === "both") {
      const csvUri = await vscode.window.showSaveDialog({
        title: "Save SNUTS.js CSV Smell Report",
        defaultUri: vscode.Uri.file(
          path.join(workspaceRoot, "snuts-report.csv"),
        ),
        filters: { "CSV Files": ["csv"] },
      });

      if (csvUri) {
        const content = generateReportContent(smells, "csv");
        await vscode.workspace.fs.writeFile(
          csvUri,
          Buffer.from(content, "utf8"),
        );
        savedPaths.push(csvUri.fsPath);
        this.log(`Exported CSV report to ${csvUri.fsPath}`);
      }
    }

    if (format === "json" || format === "both") {
      const jsonUri = await vscode.window.showSaveDialog({
        title: "Save SNUTS.js JSON Smell Report",
        defaultUri: vscode.Uri.file(
          path.join(workspaceRoot, "snuts-report.json"),
        ),
        filters: { "JSON Files": ["json"] },
      });

      if (jsonUri) {
        const content = generateReportContent(smells, "json");
        await vscode.workspace.fs.writeFile(
          jsonUri,
          Buffer.from(content, "utf8"),
        );
        savedPaths.push(jsonUri.fsPath);
        this.log(`Exported JSON report to ${jsonUri.fsPath}`);
      }
    }

    return savedPaths;
  }

  private log(message: string): void {
    this.outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
  }
}
