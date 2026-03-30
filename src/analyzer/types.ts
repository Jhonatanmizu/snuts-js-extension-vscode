export interface TestSmell {
	file: string;
	start: {
		line: number;
		column: number;
	};
	end: {
		line: number;
		column: number;
	};
	message: string;
	codeBlock: string;
}
