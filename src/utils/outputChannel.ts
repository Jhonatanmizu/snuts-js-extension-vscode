import * as vscode from 'vscode';

let outputChannel: vscode.OutputChannel | undefined;

export function getOutputChannel(): vscode.OutputChannel {
	if (!outputChannel) {
		outputChannel = vscode.window.createOutputChannel('SNUTS.js');
	}

	return outputChannel;
}

export function logAnalysisError(filePath: string, error: Error): void {
	const channel = getOutputChannel();
	channel.appendLine(`[${new Date().toISOString()}] Analysis failed for ${filePath}`);
	channel.appendLine(error.stack ?? error.message);
	channel.appendLine('');
}