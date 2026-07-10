const { createLogger } = require("./log");

describe("createLogger", () => {
	let consoleSpy;

	beforeEach(() => {
		consoleSpy = {
			log: jest.spyOn(console, "log").mockImplementation(() => {}),
			warn: jest.spyOn(console, "warn").mockImplementation(() => {}),
			error: jest.spyOn(console, "error").mockImplementation(() => {}),
		};
	});

	afterEach(() => jest.restoreAllMocks());

	it("sets the tag property to [prefix]", () => {
		expect(createLogger("my-script").tag).toBe("[my-script]");
	});

	it("info calls console.log with tag and message", () => {
		createLogger("test").info("hello");
		expect(consoleSpy.log).toHaveBeenCalledWith("[test] hello");
	});

	it("warn calls console.warn with tag and message", () => {
		createLogger("test").warn("be careful");
		expect(consoleSpy.warn).toHaveBeenCalledWith("[test] be careful");
	});

	it("error calls console.error with tag and message", () => {
		createLogger("test").error("something broke");
		expect(consoleSpy.error).toHaveBeenCalledWith("[test] something broke");
	});

	it("error forwards additional arguments to console.error", () => {
		const err = new Error("detail");
		createLogger("test").error("context message", err);
		expect(consoleSpy.error).toHaveBeenCalledWith(
			"[test] context message",
			err,
		);
	});
});
