import * as assert from 'assert';
import * as vscode from 'vscode';
import { mapSmellsToDiagnostics } from '../analyzer/smellToDiagnosticMapper';
import { type TestSmell } from '../analyzer/types';
import { isTestFile } from '../utils/testFileMatcher';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Matches default test file patterns', () => {
		const patterns = ['**/*.test.ts', '**/*.spec.ts', '**/*.test.js', '**/*.spec.js'];

		assert.strictEqual(isTestFile(vscode.Uri.file('/tmp/smell/sample.test.ts'), patterns), true);
		assert.strictEqual(isTestFile(vscode.Uri.file('/tmp/smell/sample.spec.js'), patterns), true);
		assert.strictEqual(isTestFile(vscode.Uri.file('/tmp/smell/sample.ts'), patterns), false);
	});

	test('Maps smell output to diagnostics', async () => {
		const document = await vscode.workspace.openTextDocument({
			language: 'typescript',
			content: 'describe("x", () => {\n\tit("", () => {});\n});\n',
		});

		const smells: TestSmell[] = [{
			file: document.uri.fsPath,
			start: { line: 2, column: 1 },
			end: { line: 2, column: 12 },
			message: 'Anonymous test description',
			codeBlock: 'it("", () => {});',
		}];

		const diagnostics = mapSmellsToDiagnostics(smells, document, vscode.DiagnosticSeverity.Warning);

		assert.strictEqual(diagnostics.length, 1);
		assert.strictEqual(diagnostics[0].message, 'Anonymous test description');
		assert.strictEqual(diagnostics[0].source, 'SNUTS.js');
		assert.strictEqual(diagnostics[0].severity, vscode.DiagnosticSeverity.Warning);
	});
});
