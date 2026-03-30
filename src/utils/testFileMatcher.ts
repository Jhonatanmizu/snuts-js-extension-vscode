import * as vscode from "vscode";

function escapeRegex(value: string): string {
	return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function globToRegExp(globPattern: string): RegExp {
	const normalized = globPattern.replace(/\\/g, "/");
	let regex = "^";
	let index = 0;

	while (index < normalized.length) {
		const char = normalized[index];
		const nextChar = normalized[index + 1];
		const thirdChar = normalized[index + 2];

		if (char === "*" && nextChar === "*" && thirdChar === "/") {
			regex += "(?:.*/)?";
			index += 3;
			continue;
		}

		if (char === "*" && nextChar === "*") {
			regex += ".*";
			index += 2;
			continue;
		}

		if (char === "*") {
			regex += "[^/]*";
			index += 1;
			continue;
		}

		if (char === "?") {
			regex += "[^/]";
			index += 1;
			continue;
		}

		regex += escapeRegex(char);
		index += 1;
	}

	regex += "$";
	return new RegExp(regex);
}

function normalizePath(value: string): string {
	return value.replace(/\\/g, "/");
}

export function isTestFile(uri: vscode.Uri, includePatterns: string[]): boolean {
	if (uri.scheme !== "file") {
		return false;
	}

	const relativePath = normalizePath(vscode.workspace.asRelativePath(uri, false));
	const absolutePath = normalizePath(uri.fsPath);

	return includePatterns.some((pattern) => {
		const expression = globToRegExp(pattern);
		return expression.test(relativePath) || expression.test(absolutePath);
	});
}
