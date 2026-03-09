describe('server', () => {
  const originalApiPort = process.env.API_PORT;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.API_PORT = originalApiPort;
    process.env.NODE_ENV = originalNodeEnv;
    jest.resetModules();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('starts app.listen and logs startup details', () => {
    process.env.API_PORT = '4567';
    process.env.NODE_ENV = 'test';

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    const listenMock = jest.fn((port: string, callback: () => void) => {
      callback();
      return { close: jest.fn() };
    });

    jest.doMock('./app', () => ({
      __esModule: true,
      default: {
        listen: listenMock,
      },
    }));

    jest.isolateModules(() => {
      require('./server');
    });

    expect(listenMock).toHaveBeenCalledWith('4567', expect.any(Function));
    expect(logSpy).toHaveBeenNthCalledWith(
      1,
      'Transaction Dashboard API running on http://localhost:4567'
    );
    expect(logSpy).toHaveBeenNthCalledWith(2, 'Environment: test');
  });
});
