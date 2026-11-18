import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { AIConfigManager, buildSecretKey } from '../ai/aiConfigManager.js';
import {
	createPreviewUri,
	RefactorDiffContentProvider,
} from '../ai/refactorDiffProvider.js';
import { mapSmellsToDiagnostics } from '../analyzer/smellToDiagnosticMapper.js';
import { TestSmellAnalyzer } from '../analyzer/testSmellAnalyzer.js';
import { type TestSmell } from '../analyzer/types.js';
import { DiagnosticsController } from '../providers/diagnosticsController.js';
import {
	REFACTOR_CURRENT_FILE_COMMAND,
	RefactorCodeActionProvider,
} from '../providers/refactorCodeActionProvider.js';
import { generateReportContent } from '../reporter/workspaceReportController.js';
import { dedupeAndSortFilePaths } from '../utils/batchTargetResolver.js';
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

	test('Stores and resolves AI configuration from SecretStorage', async () => {
		const store = new Map<string, string>();
		const secretStorage = {
			get: async (key: string) => store.get(key),
			store: async (key: string, value: string) => {
				store.set(key, value);
			},
			delete: async (key: string) => {
				store.delete(key);
			},
		};

		const manager = new AIConfigManager(secretStorage);
		await manager.storeApiKey('openai', 'sk-test-12345');

		assert.strictEqual(store.get(buildSecretKey('openai')), 'sk-test-12345');
		const resolved = await manager.resolve(false);
		assert.strictEqual(resolved?.apiKey, 'sk-test-12345');
	});

	test('Provides virtual preview content for refactoring diffs', () => {
		const provider = new RefactorDiffContentProvider();
		const previewUri = createPreviewUri(vscode.Uri.file('/tmp/sample.test.ts'));

		provider.setPreviewContent(previewUri, 'updated test content');
		assert.strictEqual(provider.provideTextDocumentContent(previewUri), 'updated test content');

		provider.deletePreviewContent(previewUri);
		assert.strictEqual(provider.provideTextDocumentContent(previewUri), '');
		provider.dispose();
	});

	test('Creates targeted and file-wide AI refactor QuickFix code actions', async () => {
		const document = await vscode.workspace.openTextDocument({
			language: 'typescript',
			content: 'it("", () => {});\n',
		});
		const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 10));
		const diagnostic = new vscode.Diagnostic(range, 'Anonymous test', vscode.DiagnosticSeverity.Warning);
		diagnostic.source = 'SNUTS.js';
		diagnostic.code = 'Anonymous Test';

		const provider = new RefactorCodeActionProvider();
		const actions = provider.provideCodeActions(document, range, {
			diagnostics: [diagnostic],
			only: undefined,
			triggerKind: vscode.CodeActionTriggerKind.Invoke,
		});

		assert.strictEqual(actions.length, 2);
		assert.strictEqual(actions[0].command?.command, REFACTOR_CURRENT_FILE_COMMAND);
		assert.deepStrictEqual(actions[0].command?.arguments, [document.uri, 'Anonymous Test']);
	});

	test('Generates CSV and JSON report content from detected smells', () => {
		const smells = [{
			file: '/tmp/sample.test.ts',
			start: { line: 2, column: 1 },
			end: { line: 4, column: 2 },
			message: 'Anonymous Test',
			codeBlock: 'it("", () => {});',
			description: 'Test title is too short',
			explanation: 'Use a descriptive title',
		}];

		const csv = generateReportContent(smells, 'csv');
		const json = generateReportContent(smells, 'json');

		assert.ok(csv.includes('Smell Type,File Path,Start Line,End Line,Message,Description'));
		assert.ok(json.includes('"smellType": "Anonymous Test"'));
	});

	test('Deduplicates and sorts batch target file paths consistently', () => {
		const normalized = dedupeAndSortFilePaths([
			'/tmp/smell/b.test.ts',
			'/tmp/smell/a.test.ts',
			'/tmp/smell/b.test.ts',
		]);

		assert.deepStrictEqual(normalized, [
			path.resolve('/tmp/smell/a.test.ts'),
			path.resolve('/tmp/smell/b.test.ts'),
		]);
	});
});
