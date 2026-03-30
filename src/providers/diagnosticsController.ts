import * as vscode from "vscode";
import { mapSmellsToDiagnostics } from "../analyzer/smellToDiagnosticMapper.js";
import { TestSmellAnalyzer } from "../analyzer/testSmellAnalyzer.js";
import { getExtensionConfig, toDiagnosticSeverity } from "../config/extensionConfig.js";
import { isTestFile } from "../utils/testFileMatcher.js";

type AnalyzerLike = Pick<TestSmellAnalyzer, "analyze" | "consumeLastError">;

export interface AnalysisRunResult {
	diagnosticsCount: number;
	error?: Error;
}

export class DiagnosticsController implements vscode.Disposable {
	private readonly diagnostics = vscode.languages.createDiagnosticCollection("snuts-js");
	private readonly pendingRuns = new Map<string, NodeJS.Timeout>();
	private readonly runVersions = new Map<string, number>();

	constructor(private readonly analyzer: AnalyzerLike) {}

	public handleDocumentOpen(document: vscode.TextDocument): void {
		this.scheduleAnalysis(document);
	}

	public handleDocumentChange(event: vscode.TextDocumentChangeEvent): void {
		this.scheduleAnalysis(event.document);
	}

	public handleDocumentSave(document: vscode.TextDocument): void {
		this.scheduleAnalysis(document);
	}

	public handleDocumentClose(document: vscode.TextDocument): void {
		this.clear(document.uri);
	}

	public async analyzeNow(document: vscode.TextDocument, force = false): Promise<AnalysisRunResult> {
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
				error,
			};
		}

		const diagnostics = mapSmellsToDiagnostics(
			smells,
			document,
			toDiagnosticSeverity(config.severity),
		);

		this.diagnostics.set(document.uri, diagnostics);
		return { diagnosticsCount: diagnostics.length };
	}

	public dispose(): void {
		for (const timer of this.pendingRuns.values()) {
			clearTimeout(timer);
		}

		this.pendingRuns.clear();
		this.runVersions.clear();
		this.diagnostics.dispose();
	}

	private scheduleAnalysis(document: vscode.TextDocument): void {
		const config = getExtensionConfig();
		if (!this.isAnalyzable(document, config, false)) {
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
	}

	private async runScheduled(uri: vscode.Uri, version: number): Promise<void> {
		const key = uri.toString();
		const latestVersion = this.runVersions.get(key);
		if (latestVersion !== version) {
			return;
		}

		this.pendingRuns.delete(key);

		const document = vscode.workspace.textDocuments.find((item) => item.uri.toString() === key);
		if (!document) {
			this.clear(uri);
			return;
		}

		const result = await this.analyzeNow(document);
		const activeVersion = this.runVersions.get(key);
		if (activeVersion !== version) {
			return;
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
		if (!config.enabled) {
			return false;
		}

		if (document.isUntitled || document.uri.scheme !== "file") {
			return false;
		}

		if (force) {
			return true;
		}

		return isTestFile(document.uri, config.includePatterns);
	}
}
