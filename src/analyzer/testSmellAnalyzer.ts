import type { ILogger } from "@snutsjs/core";
import { logAnalysisError } from "../utils/outputChannel.js";
import { type TestSmell } from "./types.js";

type DetectorConstructor = new () => unknown;
type DetectorRunnerConstructor = new (
  detectors: unknown[],
) => DetectorRunnerLike;
type DetectorRunnerLike = {
  run(file: string): Promise<TestSmell[]>;
};
type SnutsCoreModule = {
  DetectorRunner?: new (detectors: unknown[]) => DetectorRunnerLike;
  detectors?: Record<string, unknown>;
  setLogger?: (logger: ILogger) => void;
  silentLogger?: ILogger;
  default?: {
    DetectorRunner?: new (detectors: unknown[]) => DetectorRunnerLike;
    detectors?: Record<string, unknown>;
    setLogger?: (logger: ILogger) => void;
    silentLogger?: ILogger;
  };
  AnonymousTestLogicDetector?: DetectorConstructor;
  CommentsOnlyLogicTestDetector?: DetectorConstructor;
  ComplexSnapshotTestLogicDetector?: DetectorConstructor;
  ConditionalTestLogicDetector?: DetectorConstructor;
  DetectorTestWithoutDescriptionLogic?: DetectorConstructor;
  GeneralFixtureTestLogicDetector?: DetectorConstructor;
  IdenticalDescriptionTestLogicDetector?: DetectorConstructor;
  OvercommentedTestLogicDetector?: DetectorConstructor;
};

function isDetectorConstructor(value: unknown): value is DetectorConstructor {
  return typeof value === "function";
}

function isDetectorRunnerConstructor(
  value: unknown,
): value is DetectorRunnerConstructor {
  return typeof value === "function";
}

function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }

  return {};
}

export class TestSmellAnalyzer {
  private runnerPromise: Promise<DetectorRunnerLike> | undefined;
  private lastError: Error | undefined;
  private readonly coreLogger: ILogger | undefined;

  constructor(runner?: DetectorRunnerLike, logger?: ILogger) {
    this.runnerPromise = runner ? Promise.resolve(runner) : undefined;
    this.coreLogger = logger;
  }

  public async analyze(filePath: string): Promise<TestSmell[]> {
    this.lastError = undefined;

    if (!filePath || filePath.trim().length === 0) {
      return [];
    }

    try {
      const runner = await this.getRunner();
      return await runner.run(filePath);
    } catch (error) {
      const normalizedError =
        error instanceof Error ? error : new Error(String(error));
      this.lastError = normalizedError;
      this.runnerPromise = undefined;
      logAnalysisError(filePath, normalizedError);
      return [];
    }
  }

  public consumeLastError(): Error | undefined {
    const error = this.lastError;
    this.lastError = undefined;
    return error;
  }

  private async getRunner(): Promise<DetectorRunnerLike> {
    if (!this.runnerPromise) {
      this.runnerPromise = this.createRunner();
    }

    return this.runnerPromise;
  }

  private async createRunner(): Promise<DetectorRunnerLike> {
    const snutsCore =
      (await import("@snutsjs/core")) as unknown as SnutsCoreModule;
    const moduleRecord = toRecord(snutsCore);
    const defaultRecord = toRecord(snutsCore.default);
    const nestedDefaultRecord = toRecord(defaultRecord["default"]);

    // ── setLogger must be the very first call after the module is imported ──
    // The default @snutsjs/core logger is a plain pino instance that writes
    // JSON to process.stdout. In a stdio LSP transport a single stray write
    // would corrupt the protocol. Calling setLogger here, before any detector
    // is instantiated or run, ensures pino never gets a chance to write.
    const setLoggerFn = (moduleRecord["setLogger"] ??
      defaultRecord["setLogger"] ??
      nestedDefaultRecord["setLogger"]) as
      | ((logger: ILogger) => void)
      | undefined;

    if (typeof setLoggerFn === "function") {
      if (this.coreLogger) {
        // Forward library logs to the VS Code OutputChannel.
        setLoggerFn(this.coreLogger);
      } else {
        // No channel provided – use the library's own silentLogger so that
        // pino is still replaced and stdout stays clean.
        const silentLoggerValue = (moduleRecord["silentLogger"] ??
          defaultRecord["silentLogger"] ??
          nestedDefaultRecord["silentLogger"]) as ILogger | undefined;

        if (silentLoggerValue) {
          setLoggerFn(silentLoggerValue);
        }
      }
    }

    // ── DetectorRunner resolution ─────────────────────────────────────────
    const detectorRunnerCtor = [
      moduleRecord["DetectorRunner"],
      defaultRecord["DetectorRunner"],
      nestedDefaultRecord["DetectorRunner"],
    ].find(isDetectorRunnerConstructor);

    if (!isDetectorRunnerConstructor(detectorRunnerCtor)) {
      throw new Error("Invalid DetectorRunner export from @snutsjs/core.");
    }

    // ── Detector resolution ───────────────────────────────────────────────
    const registry = toRecord(
      moduleRecord["detectors"] ??
        defaultRecord["detectors"] ??
        nestedDefaultRecord["detectors"],
    );

    const registryDetectorCtors = Object.values(registry).reduce<
      DetectorConstructor[]
    >((accumulator, value) => {
      if (isDetectorConstructor(value)) {
        accumulator.push(value);
      }
      return accumulator;
    }, []);

    const detectorConstructors: DetectorConstructor[] =
      registryDetectorCtors.length > 0
        ? registryDetectorCtors
        : [
            moduleRecord["AnonymousTestLogicDetector"] ??
              defaultRecord["AnonymousTestLogicDetector"] ??
              nestedDefaultRecord["AnonymousTestLogicDetector"],
            moduleRecord["CommentsOnlyLogicTestDetector"] ??
              defaultRecord["CommentsOnlyLogicTestDetector"] ??
              nestedDefaultRecord["CommentsOnlyLogicTestDetector"],
            moduleRecord["ComplexSnapshotTestLogicDetector"] ??
              defaultRecord["ComplexSnapshotTestLogicDetector"] ??
              nestedDefaultRecord["ComplexSnapshotTestLogicDetector"],
            moduleRecord["ConditionalTestLogicDetector"] ??
              defaultRecord["ConditionalTestLogicDetector"] ??
              nestedDefaultRecord["ConditionalTestLogicDetector"],
            moduleRecord["DetectorTestWithoutDescriptionLogic"] ??
              defaultRecord["DetectorTestWithoutDescriptionLogic"] ??
              nestedDefaultRecord["DetectorTestWithoutDescriptionLogic"],
            moduleRecord["GeneralFixtureTestLogicDetector"] ??
              defaultRecord["GeneralFixtureTestLogicDetector"] ??
              nestedDefaultRecord["GeneralFixtureTestLogicDetector"],
            moduleRecord["IdenticalDescriptionTestLogicDetector"] ??
              defaultRecord["IdenticalDescriptionTestLogicDetector"] ??
              nestedDefaultRecord["IdenticalDescriptionTestLogicDetector"],
            moduleRecord["OvercommentedTestLogicDetector"] ??
              defaultRecord["OvercommentedTestLogicDetector"] ??
              nestedDefaultRecord["OvercommentedTestLogicDetector"],
          ].filter(isDetectorConstructor);

    if (detectorConstructors.length === 0) {
      throw new Error(
        "No compatible detector exports found from @snutsjs/core.",
      );
    }

    const detectorInstances = detectorConstructors.map(
      (DetectorClass) => new DetectorClass(),
    );
    return new detectorRunnerCtor(detectorInstances);
  }
}
