import * as vscode from 'vscode';
import { TestSmellAnalyzer } from './analyzer/testSmellAnalyzer';
import { DiagnosticsController } from './providers/diagnosticsController';

export function activate(context: vscode.ExtensionContext) {
	const analyzer = new TestSmellAnalyzer();
	const diagnosticsController = new DiagnosticsController(analyzer);

	context.subscriptions.push(diagnosticsController);

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

		const diagnosticsCount = await diagnosticsController.analyzeNow(editor.document);
		if (diagnosticsCount === 0) {
			vscode.window.showInformationMessage('No test smells found in the current file.');
			return;
		}

		vscode.window.showWarningMessage(`SNUTS.js found ${diagnosticsCount} potential test smell(s).`);
	});

	context.subscriptions.push(analyzeCurrentFileCommand);
}

export function deactivate() {}
