import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { mapSmellsToDiagnostics } from '../analyzer/smellToDiagnosticMapper.js';
import { TestSmellAnalyzer } from '../analyzer/testSmellAnalyzer.js';
import { type TestSmell } from '../analyzer/types.js';
import { DiagnosticsController } from '../providers/diagnosticsController.js';
import { isTestFile } from '../utils/testFileMatcher.js';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	const fixturePath = path.resolve(__dirname, '../../src/test/fixtures/sampleSmelly.fixture.ts');
	const fixtureUri = vscode.Uri.file(fixturePath);

	test('Matches default test file patterns', () => {
		const patterns = [
			'**/*.test.ts',
			'**/*.spec.ts',
			'**/*.test.tsx',
			'**/*.spec.tsx',
			'**/*.test.js',
			'**/*.spec.js',
			'**/*.test.jsx',
			'**/*.spec.jsx',
			'**/__tests__/**/*.ts',
			'**/__tests__/**/*.tsx',
			'**/__tests__/**/*.js',
			'**/__tests__/**/*.jsx',
		];

		assert.strictEqual(isTestFile(vscode.Uri.file('/tmp/smell/sample.test.ts'), patterns), true);
		assert.strictEqual(isTestFile(vscode.Uri.file('sample.test.ts'), patterns), true);
		assert.strictEqual(isTestFile(vscode.Uri.file('/tmp/smell/sample.spec.js'), patterns), true);
		assert.strictEqual(isTestFile(vscode.Uri.file('/tmp/smell/sample.test.tsx'), patterns), true);
		assert.strictEqual(isTestFile(vscode.Uri.file('/tmp/smell/__tests__/sample.ts'), patterns), true);
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

	test('Real analyzer detects smells in sample fixture', async () => {
		const analyzer = new TestSmellAnalyzer();
		const smells = await analyzer.analyze(fixtureUri.fsPath);

		assert.ok(smells.length > 0, 'Expected the real analyzer to detect at least one smell.');
		assert.ok(
			smells.some((smell: TestSmell) => smell.message.includes('Anonymous test case')),
			`Unexpected smell messages: ${smells.map((smell: TestSmell) => smell.message).join(', ')}`,
		);
	});

	test('Forced controller analysis publishes diagnostics for non-test files', async () => {
		const document = await vscode.workspace.openTextDocument(fixtureUri);

		const stubSmells: TestSmell[] = [{
			file: document.uri.fsPath,
			start: { line: 1, column: 0 },
			end: { line: 1, column: 5 },
			message: 'Forced analysis smell',
			codeBlock: 'const value = 1;',
		}];

		const analyzer = {
			analyze: async () => stubSmells,
			consumeLastError: () => undefined,
		};
		const controller = new DiagnosticsController(analyzer);

		try {
			const result = await controller.analyzeNow(document, true);
			assert.strictEqual(result.diagnosticsCount, 1);
		} finally {
			controller.dispose();
		}
	});
});
