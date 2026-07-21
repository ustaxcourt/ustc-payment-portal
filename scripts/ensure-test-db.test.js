

// ensure-test-db.js auto-runs ensureTestDatabase() on require. Tests mock the
// pg.Client and flush the microtask queue to let the async call settle.

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

describe("ensure-test-db", () => {
  let processExitSpy;
  let MockClient;
  let mockConnect;
  let mockQuery;
  let mockEnd;

  function setupClientMock({ rowCount = 0, connectError = null, createError = null } = {}) {
    mockConnect = connectError
      ? jest.fn().mockRejectedValue(connectError)
      : jest.fn().mockResolvedValue(undefined);

    mockQuery = jest.fn();
    if (!connectError) {
      mockQuery
        .mockResolvedValueOnce({ rowCount }) // SELECT 1 FROM pg_database
        .mockResolvedValueOnce(undefined); // CREATE DATABASE (if reached)

      if (createError) {
        mockQuery
          .mockReset()
          .mockResolvedValueOnce({ rowCount: 0 })
          .mockRejectedValueOnce(createError);
      }
    }

    mockEnd = jest.fn().mockResolvedValue(undefined);
    MockClient = jest.fn(() => ({
      connect: mockConnect,
      query: mockQuery,
      end: mockEnd,
    }));
  }

  beforeEach(() => {
    jest.resetModules();
    processExitSpy = jest.spyOn(process, "exit").mockImplementation(() => {});
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});

    delete process.env.DB_NAME;
    delete process.env.DB_HOST;
    delete process.env.DB_PORT;
    delete process.env.DB_USER;
    delete process.env.DB_PASSWORD;
  });

  afterEach(() => jest.restoreAllMocks());

  it("creates the test database when it does not exist", async () => {
    setupClientMock({ rowCount: 0 });
    jest.doMock("pg", () => ({ Client: MockClient }));

    require("./ensure-test-db");
    await flushPromises();

    expect(mockConnect).toHaveBeenCalled();
    expect(mockQuery).toHaveBeenCalledWith(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      expect.any(Array),
    );
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringMatching(/^CREATE DATABASE/),
    );
    expect(mockEnd).toHaveBeenCalled();
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  it("skips creation and logs a message when the test database already exists", async () => {
    setupClientMock({ rowCount: 1 });
    jest.doMock("pg", () => ({ Client: MockClient }));

    require("./ensure-test-db");
    await flushPromises();

    // Only one query (the SELECT check) — no CREATE DATABASE
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockEnd).toHaveBeenCalled();
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  it("exits with 1 when the database connection fails", async () => {
    setupClientMock({ connectError: new Error("connection refused") });
    jest.doMock("pg", () => ({ Client: MockClient }));

    require("./ensure-test-db");
    await flushPromises();

    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it("exits with 1 when CREATE DATABASE fails", async () => {
    setupClientMock({ rowCount: 0, createError: new Error("permission denied") });
    jest.doMock("pg", () => ({ Client: MockClient }));

    require("./ensure-test-db");
    await flushPromises();

    expect(processExitSpy).toHaveBeenCalledWith(1);
    // end() should still be called via finally
    expect(mockEnd).toHaveBeenCalled();
  });

  it("quotes the database identifier correctly in the CREATE DATABASE statement", async () => {
    process.env.DB_NAME = "mydb";
    setupClientMock({ rowCount: 0 });
    jest.doMock("pg", () => ({ Client: MockClient }));

    require("./ensure-test-db");
    await flushPromises();

    expect(mockQuery).toHaveBeenCalledWith(
      'CREATE DATABASE "mydb_test"',
    );
  });

  it("connects to postgres database (not the target DB) for admin operations", async () => {
    setupClientMock({ rowCount: 1 });
    jest.doMock("pg", () => ({ Client: MockClient }));

    require("./ensure-test-db");
    await flushPromises();

    expect(MockClient).toHaveBeenCalledWith(
      expect.objectContaining({ database: "postgres" }),
    );
  });
});
