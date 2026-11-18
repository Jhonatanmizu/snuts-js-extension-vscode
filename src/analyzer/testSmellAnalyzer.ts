import type { ILogger } from "@snutsjs/core";
import { logAnalysisError } from "../utils/outputChannel.js";
import { type TestSmell } from "./types.js";

type DetectorConstructor = new () => unknown;
type DetectorFactory = () => unknown[];
type DetectorRunnerConstructor = new (
  detectors: unknown[],
) => DetectorRunnerLike;
type DetectorRunnerLike = {
  run(file: string): Promise<TestSmell[]>;
};
type SnutsCoreModule = {
  DetectorRunner?: new (detectors: unknown[]) => DetectorRunnerLike;
  createDetectorInstances?: DetectorFactory;
  detectors?: Record<string, unknown>;
  setLogger?: (logger: ILogger) => void;
  silentLogger?: ILogger;
  default?: {
    DetectorRunner?: new (detectors: unknown[]) => DetectorRunnerLike;
    createDetectorInstances?: DetectorFactory;
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
  NonFunctionalStatementDetector?: DetectorConstructor;
  OnlyTestDetector?: DetectorConstructor;
  OvercommentedTestLogicDetector?: DetectorConstructor;
  SensitiveEqualityDetector?: DetectorConstructor;
  SubOptimalAssertDetector?: DetectorConstructor;
  TranscriptingTestDetector?: DetectorConstructor;
  VerboseTestDetector?: DetectorConstructor;
  VerifyInSetupDetector?: DetectorConstructor;
};

const FALLBACK_DETECTOR_NAMES: readonly (keyof SnutsCoreModule)[] = [
  "AnonymousTestLogicDetector",
  "CommentsOnlyLogicTestDetector",
  "ComplexSnapshotTestLogicDetector",
  "ConditionalTestLogicDetector",
  "DetectorTestWithoutDescriptionLogic",
  "GeneralFixtureTestLogicDetector",
  "IdenticalDescriptionTestLogicDetector",
  "NonFunctionalStatementDetector",
  "OnlyTestDetector",
  "OvercommentedTestLogicDetector",
  "SensitiveEqualityDetector",
  "SubOptimalAssertDetector",
  "TranscriptingTestDetector",
  "VerboseTestDetector",
  "VerifyInSetupDetector",
];

function isDetectorConstructor(value: unknown): value is DetectorConstructor {
  return typeof value === "function";
}

function isDetectorFactory(value: unknown): value is DetectorFactory {
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

    // Replace @snutsjs/core's default pino logger before detector instantiation
    // so stray stdout writes cannot corrupt the VS Code extension host transport.
    const setLoggerFn = (moduleRecord["setLogger"] ??
      defaultRecord["setLogger"] ??
      nestedDefaultRecord["setLogger"]) as
      | ((logger: ILogger) => void)
      | undefined;

    if (typeof setLoggerFn === "function") {
      if (this.coreLogger) {
        setLoggerFn(this.coreLogger);
      } else {
        const silentLoggerValue = (moduleRecord["silentLogger"] ??
          defaultRecord["silentLogger"] ??
          nestedDefaultRecord["silentLogger"]) as ILogger | undefined;

        if (silentLoggerValue) {
          setLoggerFn(silentLoggerValue);
        }
      }
    }

    const detectorRunnerCtor = [
      moduleRecord["DetectorRunner"],
      defaultRecord["DetectorRunner"],
      nestedDefaultRecord["DetectorRunner"],
    ].find(isDetectorRunnerConstructor);

    if (!isDetectorRunnerConstructor(detectorRunnerCtor)) {
      throw new Error("Invalid DetectorRunner export from @snutsjs/core.");
    }

    const createDetectorInstancesFn = [
      moduleRecord["createDetectorInstances"],
      defaultRecord["createDetectorInstances"],
      nestedDefaultRecord["createDetectorInstances"],
    ].find(isDetectorFactory);

    if (isDetectorFactory(createDetectorInstancesFn)) {
      const instances = createDetectorInstancesFn();
      if (Array.isArray(instances) && instances.length > 0) {
        return new detectorRunnerCtor(instances);
      }
    }

    const registry = toRecord(
      moduleRecord["detectors"] ??
        defaultRecord["detectors"] ??
        nestedDefaultRecord["detectors"],
    );

    const registryDetectorCtors = Object.values(registry).filter(
      isDetectorConstructor,
    );

    const detectorConstructors: DetectorConstructor[] =
      registryDetectorCtors.length > 0
        ? registryDetectorCtors
        : FALLBACK_DETECTOR_NAMES.map(
            (name) =>
              moduleRecord[name] ??
              defaultRecord[name] ??
              nestedDefaultRecord[name],
          ).filter(isDetectorConstructor);

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
