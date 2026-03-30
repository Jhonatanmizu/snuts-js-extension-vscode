import * as vscode from 'vscode';
import { TestSmellAnalyzer } from './analyzer/testSmellAnalyzer.js';
import { DiagnosticsController } from './providers/diagnosticsController.js';
import { getOutputChannel } from './utils/outputChannel.js';

export function activate(context: vscode.ExtensionContext) {
	const outputChannel = getOutputChannel();
	outputChannel.appendLine(`[${new Date().toISOString()}] Activating SNUTS.js extension...`);

	try {
		const analyzer = new TestSmellAnalyzer();
		const diagnosticsController = new DiagnosticsController(analyzer);

		context.subscriptions.push(diagnosticsController);
		context.subscriptions.push(outputChannel);

		context.subscriptions.push(vscode.workspace.onDidOpenTextDocument((document) => {
			diagnosticsController.handleDocumentOpen(document);
		}));

		context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((event) => {
			diagnosticsController.handleDocumentChange(event);
		}));

		context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((document) => {
			diagnosticsController.handleDocumentSave(document);
		}));

		context.subscriptions.push(vscode.workspace.onDidCloseTextDocument((document) => {
			diagnosticsController.handleDocumentClose(document);
		}));

		for (const document of vscode.workspace.textDocuments) {
			diagnosticsController.handleDocumentOpen(document);
		}

		const analyzeCurrentFileCommand = vscode.commands.registerCommand('snuts-js.analyzeCurrentFile', async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				vscode.window.showInformationMessage('Open a test file to run SNUTS.js analysis.');
				return;
			}

			const targetPath = editor.document.uri.fsPath;
			outputChannel.appendLine(
				`[${new Date().toISOString()}] Manual analysis started for ${targetPath}`,
			);

			try {
				const result = await diagnosticsController.analyzeNow(editor.document, true);
				if (result.error) {
					outputChannel.appendLine(
						`[${new Date().toISOString()}] Manual analysis failed for ${targetPath}`,
					);

					const selection = await vscode.window.showErrorMessage(
						'SNUTS.js analysis failed. Check the SNUTS.js output channel for details.',
						'Open Output',
					);

					if (selection === 'Open Output') {
						outputChannel.show(true);
					}

					return;
				}

				if (result.diagnosticsCount === 0) {
					outputChannel.appendLine(
						`[${new Date().toISOString()}] Manual analysis completed for ${targetPath}: no smells found`,
					);
					vscode.window.showInformationMessage('No test smells found in the current file.');
					return;
				}

				outputChannel.appendLine(
					`[${new Date().toISOString()}] Manual analysis completed for ${targetPath}: ${result.diagnosticsCount} smell(s) found`,
				);
				for (const smell of result.smells ?? []) {
					outputChannel.appendLine(
						`[${new Date().toISOString()}]   - ${smell.start.line}:${smell.start.column}-${smell.end.line}:${smell.end.column} ${smell.message}`,
					);
				}
				vscode.window.showWarningMessage(`SNUTS.js found ${result.diagnosticsCount} potential test smell(s).`);
			} catch (error) {
				const normalizedError = error instanceof Error ? error : new Error(String(error));
				outputChannel.appendLine(
					`[${new Date().toISOString()}] Manual analysis threw for ${targetPath}`,
				);
				outputChannel.appendLine(normalizedError.stack ?? normalizedError.message);
				outputChannel.appendLine('');

				const selection = await vscode.window.showErrorMessage(
					'SNUTS.js analysis failed unexpectedly. Check the SNUTS.js output channel for details.',
					'Open Output',
				);

				if (selection === 'Open Output') {
					outputChannel.show(true);
				}
			}
		});

		context.subscriptions.push(analyzeCurrentFileCommand);
		outputChannel.appendLine(`[${new Date().toISOString()}] SNUTS.js extension activated.`);
	} catch (error) {
		const normalizedError = error instanceof Error ? error : new Error(String(error));
		outputChannel.appendLine(`[${new Date().toISOString()}] SNUTS.js activation failed.`);
		outputChannel.appendLine(normalizedError.stack ?? normalizedError.message);
		outputChannel.appendLine('');
		outputChannel.show(true);
		throw error;
	}
}

export function deactivate() {}
