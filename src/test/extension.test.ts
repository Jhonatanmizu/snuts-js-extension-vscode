import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { mapSmellsToDiagnostics } from '../analyzer/smellToDiagnosticMapper.js';
import { TestSmellAnalyzer } from '../analyzer/testSmellAnalyzer.js';
import { type TestSmell } from '../analyzer/types.js';
import { DiagnosticsController } from '../providers/diagnosticsController.js';
import { formatSmellLogLines } from '../utils/outputChannel.js';
import { isTestFile } from '../utils/testFileMatcher.js';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	const fixturePath = path.resolve(__dirname, '../../src/test/fixtures/sampleSmelly.fixture.ts');
	const fixtureUri = vscode.Uri.file(fixturePath);

	test('Matches default test file patterns accurately', () => {
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

	test('Maps smell output to warning diagnostics with explanations', async () => {
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
			description: 'Anonymous Test',
			explanation: 'Provide a descriptive name.',
		}];

		const diagnostics = mapSmellsToDiagnostics(smells, document);

		assert.strictEqual(diagnostics.length, 1);
		assert.strictEqual(
			diagnostics[0].message,
			'Anonymous test description\n\nProvide a descriptive name.',
		);
		assert.strictEqual(diagnostics[0].source, 'SNUTS.js');
		assert.strictEqual(diagnostics[0].code, 'Anonymous Test');
		assert.strictEqual(diagnostics[0].severity, vscode.DiagnosticSeverity.Warning);
	});

	test('Formats output channel log lines with category and explanation', () => {
		const lines = formatSmellLogLines({
			file: '/tmp/sample.test.ts',
			start: { line: 5, column: 2 },
			end: { line: 8, column: 4 },
			message: 'Empty test body detected.',
			codeBlock: 'it("empty", () => {});',
			description: 'Comments-Only Test',
			explanation: 'Add an assertion to verify behavior.',
		});

		assert.strictEqual(lines.length, 2);
		assert.strictEqual(
			lines[0],
			'  - 5:2-8:4 [Comments-Only Test] Empty test body detected.',
		);
		assert.strictEqual(lines[1], '    💡 Add an assertion to verify behavior.');
	});

	test('Real analyzer detects smells with description and explanation in sample fixture', async () => {
		const analyzer = new TestSmellAnalyzer();
		const smells = await analyzer.analyze(fixtureUri.fsPath);

		assert.ok(smells.length > 0, 'Expected the real analyzer to detect at least one smell.');
		assert.ok(
			smells.some((smell: TestSmell) => smell.message.includes('Anonymous test case')),
			`Unexpected smell messages: ${smells.map((smell: TestSmell) => smell.message).join(', ')}`,
		);
		assert.ok(
			smells.every(
				(smell: TestSmell) =>
					typeof smell.description === 'string' && typeof smell.explanation === 'string',
			),
			'Expected every smell from @snutsjs/core to include description and explanation.',
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
