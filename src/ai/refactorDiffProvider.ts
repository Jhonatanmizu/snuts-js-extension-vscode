import * as vscode from "vscode";

export const REFACTOR_PREVIEW_SCHEME = "snuts-refactor-preview";

export class RefactorDiffContentProvider
  implements vscode.TextDocumentContentProvider, vscode.Disposable
{
  private readonly emitter = new vscode.EventEmitter<vscode.Uri>();
  private readonly contents = new Map<string, string>();

  public readonly onDidChange = this.emitter.event;

  public provideTextDocumentContent(uri: vscode.Uri): string {
    return this.contents.get(uri.toString()) ?? "";
  }

  public setPreviewContent(uri: vscode.Uri, content: string): void {
    this.contents.set(uri.toString(), content);
    this.emitter.fire(uri);
  }

  public deletePreviewContent(uri: vscode.Uri): void {
    this.contents.delete(uri.toString());
  }

  public dispose(): void {
    this.contents.clear();
    this.emitter.dispose();
  }
}

export function createPreviewUri(targetUri: vscode.Uri): vscode.Uri {
  return targetUri.with({
    scheme: REFACTOR_PREVIEW_SCHEME,
    query: `ts=${Date.now()}`,
  });
}
