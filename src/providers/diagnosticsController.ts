import * as vscode from "vscode";
import { mapSmellsToDiagnostics } from "../analyzer/smellToDiagnosticMapper";
import { TestSmellAnalyzer } from "../analyzer/testSmellAnalyzer";
import { getExtensionConfig, toDiagnosticSeverity } from "../config/extensionConfig";
import { isTestFile } from "../utils/testFileMatcher";

export class DiagnosticsController implements vscode.Disposable {
	private readonly diagnostics = vscode.languages.createDiagnosticCollection("snuts-js");
	private readonly pendingRuns = new Map<string, NodeJS.Timeout>();
	private readonly runVersions = new Map<string, number>();

	constructor(private readonly analyzer: TestSmellAnalyzer) {}

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

	public async analyzeNow(document: vscode.TextDocument): Promise<number> {
		const config = getExtensionConfig();
		if (!this.isAnalyzable(document, config)) {
			this.clear(document.uri);
			return 0;
		}

		const smells = await this.analyzer.analyze(document.uri.fsPath);
		const diagnostics = mapSmellsToDiagnostics(
			smells,
			document,
			toDiagnosticSeverity(config.severity),
		);

		this.diagnostics.set(document.uri, diagnostics);
		return diagnostics.length;
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
		if (!this.isAnalyzable(document, config)) {
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

		const diagnosticsCount = await this.analyzeNow(document);
		const activeVersion = this.runVersions.get(key);
		if (activeVersion !== version) {
			return;
		}

		if (diagnosticsCount === 0) {
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
	): boolean {
		if (!config.enabled) {
			return false;
		}

		if (document.isUntitled || document.uri.scheme !== "file") {
			return false;
		}

		return isTestFile(document.uri, config.includePatterns);
	}
}
