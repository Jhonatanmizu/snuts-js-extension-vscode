import { logAnalysisError } from '../utils/outputChannel.js';
import { type TestSmell } from './types.js';

type DetectorConstructor = new () => unknown;
type DetectorRunnerLike = {
	run(file: string): Promise<TestSmell[]>;
};
type SnutsCoreModule = {
	DetectorRunner: new (detectors: unknown[]) => DetectorRunnerLike;
	AnonymousTestLogicDetector: DetectorConstructor;
	CommentsOnlyLogicTestDetector: DetectorConstructor;
	ComplexSnapshotTestLogicDetector: DetectorConstructor;
	ConditionalTestLogicDetector: DetectorConstructor;
	DetectorTestWithoutDescriptionLogic: DetectorConstructor;
	GeneralFixtureTestLogicDetector: DetectorConstructor;
	IdenticalDescriptionTestLogicDetector: DetectorConstructor;
	OvercommentedTestLogicDetector: DetectorConstructor;
};

function isDetectorConstructor(value: unknown): value is DetectorConstructor {
	return typeof value === 'function';
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
		const detectorEntries = [
			['AnonymousTestLogicDetector', snutsCore.AnonymousTestLogicDetector],
			['CommentsOnlyLogicTestDetector', snutsCore.CommentsOnlyLogicTestDetector],
			['ComplexSnapshotTestLogicDetector', snutsCore.ComplexSnapshotTestLogicDetector],
			['ConditionalTestLogicDetector', snutsCore.ConditionalTestLogicDetector],
			['DetectorTestWithoutDescriptionLogic', snutsCore.DetectorTestWithoutDescriptionLogic],
			['GeneralFixtureTestLogicDetector', snutsCore.GeneralFixtureTestLogicDetector],
			['IdenticalDescriptionTestLogicDetector', snutsCore.IdenticalDescriptionTestLogicDetector],
			['OvercommentedTestLogicDetector', snutsCore.OvercommentedTestLogicDetector],
		] as const;

		const invalidDetectorNames = detectorEntries
			.filter(([, DetectorClass]) => !isDetectorConstructor(DetectorClass))
			.map(([name]) => name);

		if (invalidDetectorNames.length > 0) {
			throw new Error(`Invalid detector exports from @snutsjs/core: ${invalidDetectorNames.join(', ')}`);
		}

		const detectorInstances = detectorEntries.map(([, DetectorClass]) => new DetectorClass());

		return new snutsCore.DetectorRunner(detectorInstances);
	}
}
