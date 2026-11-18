import * as path from "node:path";
import * as vscode from "vscode";
import { isTestFile } from "./testFileMatcher.js";

interface FileQuickPickItem extends vscode.QuickPickItem {
  filePath: string;
}

export function dedupeAndSortFilePaths(paths: readonly string[]): string[] {
  const unique = new Set<string>();
  for (const item of paths) {
    const trimmed = item.trim();
    if (trimmed.length > 0) {
      unique.add(path.resolve(trimmed));
    }
  }

  return [...unique].sort((a, b) => a.localeCompare(b));
}

export async function findMatchingTestFilesInWorkspace(
  includePatterns: readonly string[],
  folderUri?: vscode.Uri,
): Promise<vscode.Uri[]> {
  const uniqueByPath = new Map<string, vscode.Uri>();

  for (const pattern of includePatterns) {
    const searchPattern = folderUri
      ? new vscode.RelativePattern(folderUri, pattern)
      : pattern;
    const matches = await vscode.workspace.findFiles(
      searchPattern,
      "**/node_modules/**",
    );
    for (const uri of matches) {
      uniqueByPath.set(uri.fsPath, uri);
    }
  }

  return [...uniqueByPath.values()].sort((a, b) =>
    a.fsPath.localeCompare(b.fsPath),
  );
}

export async function resolveExplorerTargetFiles(
  targetUris: readonly vscode.Uri[],
  includePatterns: readonly string[],
): Promise<string[]> {
  const collected: string[] = [];

  for (const uri of targetUris) {
    if (uri.scheme !== "file") {
      continue;
    }

    try {
      const stat = await vscode.workspace.fs.stat(uri);
      if ((stat.type & vscode.FileType.Directory) !== 0) {
        const matched = await findMatchingTestFilesInWorkspace(
          includePatterns,
          uri,
        );
        for (const item of matched) {
          collected.push(item.fsPath);
        }
      } else if (
        isTestFile(uri, [...includePatterns]) ||
        targetUris.length === 1
      ) {
        collected.push(uri.fsPath);
      }
    } catch {
      continue;
    }
  }

  return dedupeAndSortFilePaths(collected);
}

export async function resolveBatchTargetFiles(
  clickedUri: vscode.Uri | undefined,
  selectedUris: readonly vscode.Uri[] | undefined,
  includePatterns: readonly string[],
  promptTitle: string,
): Promise<string[] | undefined> {
  const explicitUris =
    selectedUris && selectedUris.length > 0
      ? selectedUris
      : clickedUri
        ? [clickedUri]
        : [];

  if (explicitUris.length > 0) {
    return await resolveExplorerTargetFiles(explicitUris, includePatterns);
  }

  const workspaceFiles = await findMatchingTestFilesInWorkspace(includePatterns);
  if (workspaceFiles.length === 0) {
    return [];
  }

  const items: FileQuickPickItem[] = workspaceFiles.map((uri) => ({
    label: vscode.workspace.asRelativePath(uri, false),
    description: path.dirname(vscode.workspace.asRelativePath(uri, false)),
    picked: true,
    filePath: uri.fsPath,
  }));

  const selected = await vscode.window.showQuickPick<FileQuickPickItem>(items, {
    title: promptTitle,
    placeHolder:
      "Select test files to include in batch (all workspace test files selected by default)",
    canPickMany: true,
    ignoreFocusOut: true,
  });

  if (!selected || selected.length === 0) {
    return undefined;
  }

  return dedupeAndSortFilePaths(selected.map((item) => item.filePath));
}
