declare function describe(name: string, callback: () => void): void;
declare function it(name: string, callback: () => void): void;
declare function expect(value: number): { toBe(expected: number): void };

describe("sum", () => {
	it("", () => {
		if (true) {
			expect(1 + 1).toBe(2);
		}
	});
});
