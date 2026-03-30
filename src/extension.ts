import * as vscode from 'vscode';
import { TestSmellAnalyzer } from './analyzer/testSmellAnalyzer.js';
import { DiagnosticsController } from './providers/diagnosticsController.js';
import { getOutputChannel } from './utils/outputChannel.js';

export function activate(context: vscode.ExtensionContext) {
	const analyzer = new TestSmellAnalyzer();
	const diagnosticsController = new DiagnosticsController(analyzer);
	const outputChannel = getOutputChannel();

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

		const result = await diagnosticsController.analyzeNow(editor.document, true);
		if (result.error) {
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
			vscode.window.showInformationMessage('No test smells found in the current file.');
			return;
		}

		vscode.window.showWarningMessage(`SNUTS.js found ${result.diagnosticsCount} potential test smell(s).`);
	});

	context.subscriptions.push(analyzeCurrentFileCommand);
}

export function deactivate() {}
