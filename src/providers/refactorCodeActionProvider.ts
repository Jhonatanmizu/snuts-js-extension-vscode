import * as vscode from "vscode";

export const REFACTOR_CURRENT_FILE_COMMAND = "snuts-js.refactorCurrentFile";

function extractSmellCategory(
  code: vscode.Diagnostic["code"],
): string | undefined {
  if (typeof code === "string" && code.trim().length > 0) {
    return code.trim();
  }

  if (
    code &&
    typeof code === "object" &&
    "value" in code &&
    typeof code.value === "string" &&
    code.value.trim().length > 0
  ) {
    return code.value.trim();
  }

  return undefined;
}

export class RefactorCodeActionProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
  ];

  public provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const snutsDiagnostics = context.diagnostics.filter(
      (diagnostic) => diagnostic.source === "SNUTS.js",
    );

    if (snutsDiagnostics.length === 0) {
      return [];
    }

    const actions: vscode.CodeAction[] = [];
    const diagnosticsByCategory = new Map<string, vscode.Diagnostic[]>();

    for (const diagnostic of snutsDiagnostics) {
      const category = extractSmellCategory(diagnostic.code);
      if (category && category !== "test-smell") {
        const existing = diagnosticsByCategory.get(category) ?? [];
        existing.push(diagnostic);
        diagnosticsByCategory.set(category, existing);
      }
    }

    for (const [category, categoryDiagnostics] of diagnosticsByCategory) {
      const action = new vscode.CodeAction(
        `SNUTS.js: Refactor "${category}" with AI`,
        vscode.CodeActionKind.QuickFix,
      );
      action.diagnostics = categoryDiagnostics;
      action.isPreferred = true;
      action.command = {
        command: REFACTOR_CURRENT_FILE_COMMAND,
        title: `SNUTS.js: Refactor "${category}" with AI`,
        arguments: [document.uri, category],
      };
      actions.push(action);
    }

    const refactorAllAction = new vscode.CodeAction(
      "SNUTS.js: Refactor all test smells in file with AI",
      vscode.CodeActionKind.QuickFix,
    );
    refactorAllAction.diagnostics = snutsDiagnostics;
    refactorAllAction.command = {
      command: REFACTOR_CURRENT_FILE_COMMAND,
      title: "SNUTS.js: Refactor all test smells in file with AI",
      arguments: [document.uri],
    };
    actions.push(refactorAllAction);

    return actions;
  }
}
