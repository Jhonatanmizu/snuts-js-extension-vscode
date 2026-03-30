import { logAnalysisError } from '../utils/outputChannel.js';
import { type TestSmell } from './types.js';

type DetectorConstructor = new () => unknown;
type DetectorRunnerConstructor = new (detectors: unknown[]) => DetectorRunnerLike;
type DetectorRunnerLike = {
	run(file: string): Promise<TestSmell[]>;
};
type SnutsCoreModule = {
	DetectorRunner?: new (detectors: unknown[]) => DetectorRunnerLike;
	detectors?: Record<string, unknown>;
	default?: {
		DetectorRunner?: new (detectors: unknown[]) => DetectorRunnerLike;
		detectors?: Record<string, unknown>;
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
	return typeof value === 'function';
}

function isDetectorRunnerConstructor(value: unknown): value is DetectorRunnerConstructor {
	return typeof value === 'function';
}

function toRecord(value: unknown): Record<string, unknown> {
	if (value && typeof value === 'object') {
		return value as Record<string, unknown>;
	}

	return {};
}

export class TestSmellAnalyzer {
	private runnerPromise: Promise<DetectorRunnerLike> | undefined;
	private lastError: Error | undefined;

	constructor(runner?: DetectorRunnerLike) {
		this.runnerPromise = runner ? Promise.resolve(runner) : undefined;
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
			const normalizedError = error instanceof Error ? error : new Error(String(error));
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
		const snutsCore = (await import('@snutsjs/core')) as unknown as SnutsCoreModule;
		const mergedModule = {
			...toRecord(snutsCore.default),
			...toRecord(snutsCore),
		};

		const detectorRunnerCtor = mergedModule.DetectorRunner;
		if (!isDetectorRunnerConstructor(detectorRunnerCtor)) {
			throw new Error('Invalid DetectorRunner export from @snutsjs/core.');
		}

		const registry = toRecord(mergedModule.detectors);
		const registryDetectorCtors = Object.values(registry).reduce<DetectorConstructor[]>((accumulator, value) => {
			if (isDetectorConstructor(value)) {
				accumulator.push(value);
			}

			return accumulator;
		}, []);

		const detectorConstructors: DetectorConstructor[] = registryDetectorCtors.length > 0
			? registryDetectorCtors
			: [
				mergedModule.AnonymousTestLogicDetector,
				mergedModule.CommentsOnlyLogicTestDetector,
				mergedModule.ComplexSnapshotTestLogicDetector,
				mergedModule.ConditionalTestLogicDetector,
				mergedModule.DetectorTestWithoutDescriptionLogic,
				mergedModule.GeneralFixtureTestLogicDetector,
				mergedModule.IdenticalDescriptionTestLogicDetector,
				mergedModule.OvercommentedTestLogicDetector,
			].filter(isDetectorConstructor);

		if (detectorConstructors.length === 0) {
			throw new Error('No compatible detector exports found from @snutsjs/core.');
		}

		const detectorInstances = detectorConstructors.map((DetectorClass) => new DetectorClass());
		return new detectorRunnerCtor(detectorInstances);
	}
}
