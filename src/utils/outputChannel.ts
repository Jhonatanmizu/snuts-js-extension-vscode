import * as vscode from "vscode";
import type { TestSmell } from "../analyzer/types.js";

let outputChannel: vscode.OutputChannel | undefined;

export function getOutputChannel(): vscode.OutputChannel {
	if (!outputChannel) {
		outputChannel = vscode.window.createOutputChannel("SNUTS.js");
	}

	return outputChannel;
}

export function formatSmellLogLines(smell: TestSmell): string[] {
	const category = smell.description ? `[${smell.description}] ` : "";
	const lines = [
		`  - ${smell.start.line}:${smell.start.column}-${smell.end.line}:${smell.end.column} ${category}${smell.message}`,
	];

	if (smell.explanation) {
		lines.push(`    💡 ${smell.explanation}`);
	}

	return lines;
}

export function logAnalysisError(filePath: string, error: Error): void {
	const channel = getOutputChannel();
	channel.appendLine(`[${new Date().toISOString()}] Analysis failed for ${filePath}`);
	channel.appendLine(error.stack ?? error.message);
	channel.appendLine("");
}
