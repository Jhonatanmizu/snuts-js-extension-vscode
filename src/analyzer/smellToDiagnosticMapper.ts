import * as vscode from "vscode";
import { type TestSmell } from "./types.js";

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function toZeroBasedLine(line: number, maxLine: number): number {
	const zeroBased = Number.isFinite(line) ? line - 1 : 0;
	return clamp(zeroBased, 0, maxLine);
}

function toColumn(column: number, maxColumn: number): number {
	const normalized = Number.isFinite(column) ? column : 0;
	return clamp(normalized, 0, maxColumn);
}

function smellToRange(smell: TestSmell, document: vscode.TextDocument): vscode.Range {
	const maxLine = Math.max(document.lineCount - 1, 0);
	const startLineIndex = toZeroBasedLine(smell.start.line, maxLine);
	const endLineIndex = toZeroBasedLine(smell.end.line, maxLine);

	const startLine = document.lineAt(startLineIndex);
	const endLine = document.lineAt(endLineIndex);

	const startColumn = toColumn(smell.start.column, startLine.text.length);
	const endColumn = toColumn(smell.end.column, endLine.text.length);

	const start = new vscode.Position(startLineIndex, startColumn);
	const end = new vscode.Position(endLineIndex, endColumn);

	if (end.isBeforeOrEqual(start)) {
		const safeEndCharacter = Math.min(start.character + 1, startLine.text.length);
		return new vscode.Range(start, new vscode.Position(start.line, safeEndCharacter));
	}

	return new vscode.Range(start, end);
}

export function mapSmellsToDiagnostics(
	smells: TestSmell[],
	document: vscode.TextDocument,
	severity: vscode.DiagnosticSeverity,
): vscode.Diagnostic[] {
	return smells.map((smell) => {
		const diagnostic = new vscode.Diagnostic(smellToRange(smell, document), smell.message, severity);
		diagnostic.source = "SNUTS.js";
		diagnostic.code = "test-smell";
		return diagnostic;
	});
}
