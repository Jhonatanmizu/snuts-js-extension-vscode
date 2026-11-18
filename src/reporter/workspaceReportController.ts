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
import { getOutputChannel } from "../utils/outputChannel.js";

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
    detail: "Generate a comma-separated values report of all workspace test smells",
    format: "csv",
  },
  {
    label: "JSON Report (.json)",
    description: "json",
    detail: "Generate a structured JSON array of all workspace test smells",
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

    const { smells, analyzedFiles } = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "SNUTS.js: Analyzing workspace test files...",
        cancellable: false,
      },
      async (progress) => {
        progress.report({ message: "Discovering test files..." });
        const matchedUris = await this.findWorkspaceTestFiles(
          config.includePatterns,
        );
        const filePaths = matchedUris.map((uri) => uri.fsPath);

        if (filePaths.length === 0) {
          return { smells: [] as Smell[], analyzedFiles: [] as string[] };
        }

        progress.report({
          message: `Running detectors on ${filePaths.length} file(s)...`,
        });
        const detectedSmells = await this.projectAnalyzer.analyze(filePaths);

        progress.report({ message: "Publishing workspace diagnostics..." });
        await this.publishDiagnosticsByFile(filePaths, detectedSmells);

        return { smells: detectedSmells, analyzedFiles: filePaths };
      },
    );

    if (analyzedFiles.length === 0) {
      this.log("Workspace analysis found no matching test files.");
      void vscode.window.showInformationMessage(
        "No test files matching snuts-js.includePatterns were found in the workspace.",
      );
      return [];
    }

    this.log(
      `Workspace analysis completed: ${smells.length} smell(s) across ${analyzedFiles.length} test file(s).`,
    );

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
        `SNUTS.js analyzed ${analyzedFiles.length} file(s) (${smells.length} smell(s)) and exported ${savedPaths.map((p) => path.basename(p)).join(", ")}.`,
      );
    }

    return savedPaths;
  }

  private async findWorkspaceTestFiles(
    includePatterns: readonly string[],
  ): Promise<vscode.Uri[]> {
    const uniqueByPath = new Map<string, vscode.Uri>();

    for (const pattern of includePatterns) {
      const matches = await vscode.workspace.findFiles(
        pattern,
        "**/node_modules/**",
      );
      for (const uri of matches) {
        uniqueByPath.set(uri.fsPath, uri);
      }
    }

    return [...uniqueByPath.values()].sort((a, b) =>
      a.fsPath.localeCompare(b.fsPath),
    );
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
