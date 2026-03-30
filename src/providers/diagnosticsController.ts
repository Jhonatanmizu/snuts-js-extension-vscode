import * as vscode from "vscode";
import { mapSmellsToDiagnostics } from "../analyzer/smellToDiagnosticMapper.js";
import { TestSmellAnalyzer } from "../analyzer/testSmellAnalyzer.js";
import type { TestSmell } from "../analyzer/types.js";
import {
  getExtensionConfig,
  toDiagnosticSeverity,
} from "../config/extensionConfig.js";
import { getOutputChannel } from "../utils/outputChannel.js";
import { isTestFile } from "../utils/testFileMatcher.js";

type AnalyzerLike = Pick<TestSmellAnalyzer, "analyze" | "consumeLastError">;

export interface AnalysisRunResult {
  diagnosticsCount: number;
  smells?: readonly TestSmell[];
  error?: Error;
}

export class DiagnosticsController implements vscode.Disposable {
  private readonly diagnostics =
    vscode.languages.createDiagnosticCollection("snuts-js");
  private readonly pendingRuns = new Map<string, NodeJS.Timeout>();
  private readonly runVersions = new Map<string, number>();
  private readonly outputChannel = getOutputChannel();

  constructor(private readonly analyzer: AnalyzerLike) {}

  public handleDocumentOpen(document: vscode.TextDocument): void {
    if (!this.shouldObserveDocument(document)) {
      return;
    }

    this.scheduleAnalysis(document, "open");
  }

  public handleDocumentChange(event: vscode.TextDocumentChangeEvent): void {
    if (!this.shouldObserveDocument(event.document)) {
      return;
    }

    this.scheduleAnalysis(event.document, "change");
  }

  public handleDocumentSave(document: vscode.TextDocument): void {
    if (!this.shouldObserveDocument(document)) {
      return;
    }

    this.scheduleAnalysis(document, "save");
  }

  public handleDocumentClose(document: vscode.TextDocument): void {
    this.clear(document.uri);
  }

  public async analyzeNow(
    document: vscode.TextDocument,
    force = false,
  ): Promise<AnalysisRunResult> {
    const config = getExtensionConfig();
    if (!this.isAnalyzable(document, config, force)) {
      this.clear(document.uri);
      return { diagnosticsCount: 0 };
    }

    const smells = await this.analyzer.analyze(document.uri.fsPath);
    const error = this.analyzer.consumeLastError();
    if (error) {
      this.diagnostics.set(document.uri, []);
      return {
        diagnosticsCount: 0,
        smells,
        error,
      };
    }

    const diagnostics = mapSmellsToDiagnostics(
      smells,
      document,
      toDiagnosticSeverity(config.severity),
    );

    this.diagnostics.set(document.uri, diagnostics);
    return { diagnosticsCount: diagnostics.length, smells };
  }

  public dispose(): void {
    for (const timer of this.pendingRuns.values()) {
      clearTimeout(timer);
    }

    this.pendingRuns.clear();
    this.runVersions.clear();
    this.diagnostics.dispose();
  }

  private scheduleAnalysis(
    document: vscode.TextDocument,
    trigger: "open" | "change" | "save",
  ): void {
    const config = getExtensionConfig();
    const skipReason = this.getNonAnalyzableReason(document, config, false);
    if (skipReason) {
      this.log(
        `Automatic analysis skipped (${skipReason}) for ${document.uri.fsPath}`,
      );
      this.clear(document.uri);
      return;
    }

    const key = document.uri.toString();
    const nextVersion = (this.runVersions.get(key) ?? 0) + 1;
    this.runVersions.set(key, nextVersion);

    const existing = this.pendingRuns.get(key);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      void this.runScheduled(document.uri, nextVersion);
    }, config.debounceMs);

    this.pendingRuns.set(key, timer);
    this.log(
      `Automatic analysis scheduled (${trigger}, debounce=${config.debounceMs}ms) for ${document.uri.fsPath}`,
    );
  }

  private async runScheduled(uri: vscode.Uri, version: number): Promise<void> {
    const key = uri.toString();
    const latestVersion = this.runVersions.get(key);
    if (latestVersion !== version) {
      return;
    }

    this.pendingRuns.delete(key);

    const document = vscode.workspace.textDocuments.find(
      (item) => item.uri.toString() === key,
    );
    if (!document) {
      this.clear(uri);
      return;
    }

    const result = await this.analyzeNow(document);
    const activeVersion = this.runVersions.get(key);
    if (activeVersion !== version) {
      return;
    }

    if (result.error) {
      this.log(`Automatic analysis failed for ${document.uri.fsPath}`);
      return;
    }

    if (result.diagnosticsCount > 0 && result.smells) {
      this.log(
        `Automatic analysis completed for ${document.uri.fsPath}: ${result.diagnosticsCount} smell(s) found`,
      );
      for (const smell of result.smells) {
        const category = smell.description ? `[${smell.description}] ` : "";
        this.log(
          `  - ${smell.start.line}:${smell.start.column}-${smell.end.line}:${smell.end.column} ${category}${smell.message}`,
        );
        if (smell.explanation) {
          this.log(`    💡 ${smell.explanation}`);
        }
      }
    } else {
      this.log(
        `Automatic analysis completed for ${document.uri.fsPath}: no smells found`,
      );
    }

    if (result.diagnosticsCount === 0) {
      this.diagnostics.set(uri, []);
    }
  }

  private clear(uri: vscode.Uri): void {
    const key = uri.toString();
    const existing = this.pendingRuns.get(key);
    if (existing) {
      clearTimeout(existing);
      this.pendingRuns.delete(key);
    }

    this.runVersions.delete(key);
    this.diagnostics.delete(uri);
  }

  private isAnalyzable(
    document: vscode.TextDocument,
    config: ReturnType<typeof getExtensionConfig>,
    force: boolean,
  ): boolean {
    return this.getNonAnalyzableReason(document, config, force) === undefined;
  }

  private getNonAnalyzableReason(
    document: vscode.TextDocument,
    config: ReturnType<typeof getExtensionConfig>,
    force: boolean,
  ): string | undefined {
    if (!config.enabled) {
      return "extension disabled by configuration";
    }

    if (document.isUntitled || document.uri.scheme !== "file") {
      return "document is untitled or not a file URI";
    }

    if (force) {
      return undefined;
    }

    if (!isTestFile(document.uri, config.includePatterns)) {
      return "file does not match snuts-js.includePatterns";
    }

    return undefined;
  }

  private log(message: string): void {
    this.outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
  }

  private shouldObserveDocument(document: vscode.TextDocument): boolean {
    return document.uri.scheme === "file";
  }
}
