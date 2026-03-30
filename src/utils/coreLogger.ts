import * as vscode from "vscode";
import type { ILogger } from "@snutsjs/core";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function now(): string {
  return new Date().toISOString();
}

/**
 * Normalises the two calling conventions that {@link ILogger} methods accept:
 *
 *   logger.info("plain message")
 *   logger.info({ key: "value" }, "message with context")
 *
 * Returns a single human-readable string suitable for an OutputChannel line.
 */
function formatEntry(objOrMsg: object | string, msg?: string): string {
  if (typeof objOrMsg === "string") {
    return objOrMsg;
  }

  // objOrMsg is a context object
  let context = "";
  try {
    context = JSON.stringify(objOrMsg);
  } catch {
    context = String(objOrMsg);
  }

  if (msg !== undefined && msg.length > 0) {
    return `${msg} ${context}`;
  }

  return context;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates an {@link ILogger}-compatible implementation that writes every log
 * entry to the supplied VS Code {@link vscode.OutputChannel}.
 *
 * This must be passed to `setLogger()` from `@snutsjs/core` **before** the
 * first call to any library API so that pino never gets a chance to write
 * JSON to `process.stdout` (which would corrupt a stdio LSP transport).
 *
 * @example
 * ```ts
 * import { setLogger } from "@snutsjs/core";
 * import { createOutputChannelLogger } from "./utils/coreLogger.js";
 *
 * const out = vscode.window.createOutputChannel("SNUTS.js");
 * setLogger(createOutputChannelLogger(out));
 * ```
 */
export function createOutputChannelLogger(
  channel: vscode.OutputChannel,
): ILogger {
  function write(
    level: "debug" | "info" | "warn" | "error",
    objOrMsg: object | string,
    msg?: string,
  ): void {
    const label = level.padEnd(5); // "debug", "info ", "warn ", "error"
    channel.appendLine(
      `[${now()}] [core:${label}] ${formatEntry(objOrMsg, msg)}`,
    );
  }

  return {
    // Each method uses `object | string` as the first-param type so it
    // satisfies both overload signatures declared in ILogger while remaining
    // a single implementation at runtime.

    debug(objOrMsg: object | string, msg?: string): void {
      write("debug", objOrMsg, msg);
    },

    info(objOrMsg: object | string, msg?: string): void {
      write("info", objOrMsg, msg);
    },

    warn(objOrMsg: object | string, msg?: string): void {
      write("warn", objOrMsg, msg);
    },

    error(objOrMsg: object | string, msg?: string): void {
      write("error", objOrMsg, msg);
    },
  };
}
