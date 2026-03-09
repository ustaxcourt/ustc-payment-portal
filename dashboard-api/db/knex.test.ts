describe('db/knex', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('throws when knex config is missing for environment', () => {
    process.env.NODE_ENV = 'missing-env';

    jest.doMock('../knexfile', () => ({
      development: {
        client: 'pg',
        connection: {},
      },
    }));

    expect(() => {
      jest.isolateModules(() => {
        require('./knex');
      });
    }).toThrow('No Knex configuration found for environment: missing-env');
  });

  it('logs connection failure when SELECT 1 fails', async () => {
    process.env.NODE_ENV = 'development';

    const rawMock = jest.fn().mockRejectedValue(new Error('connection failed'));
    const knexFactoryMock = jest.fn().mockReturnValue({
      raw: rawMock,
    });
    const modelKnexMock = jest.fn();

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    jest.doMock('knex', () => ({
      __esModule: true,
      default: knexFactoryMock,
    }));

    jest.doMock('objection', () => ({
      Model: {
        knex: modelKnexMock,
      },
      knexSnakeCaseMappers: () => ({}),
    }));

    jest.doMock('../knexfile', () => ({
      development: {
        client: 'pg',
        connection: {
          host: 'localhost',
          port: 5432,
          database: 'dashboard',
        },
      },
    }));

    jest.isolateModules(() => {
      require('./knex');
    });

    await new Promise<void>((resolve) => {
      setImmediate(() => resolve());
    });

    expect(knexFactoryMock).toHaveBeenCalledTimes(1);
    expect(rawMock).toHaveBeenCalledWith('SELECT 1');
    expect(modelKnexMock).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith('[Knex] Connecting to database: dashboard');
    expect(errorSpy).toHaveBeenCalledWith('[Knex] Database connection failed:', 'connection failed');
  });
});
