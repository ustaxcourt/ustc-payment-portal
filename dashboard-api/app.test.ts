import request from 'supertest';

const loadAppWithRoutes = (registerRoutes?: (router: any) => void) => {
  jest.resetModules();

  jest.doMock('./db/knex', () => ({}));

  if (registerRoutes) {
    jest.doMock('./routes/transactions.routes', () => {
      const express = require('express');
      const router = express.Router();
      registerRoutes(router);
      return router;
    });
  }

  let app: any;
  jest.isolateModules(() => {
    app = require('./app').default;
  });

  return app;
};

describe('app', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('returns health check response', async () => {
    const app = loadAppWithRoutes();

    const response = await request(app)
      .get('/health')
      .expect(200);

    expect(response.body).toEqual({ status: 'ok' });
  });

  it('handles OPTIONS requests in CORS middleware', async () => {
    const app = loadAppWithRoutes();

    const response = await request(app)
      .options('/api/transactions/success')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBe('*');
    expect(response.headers['access-control-allow-methods']).toBe('GET, POST, PUT, DELETE, OPTIONS');
    expect(response.headers['access-control-allow-headers']).toBe('Content-Type, Authorization');
  });

  it('uses error middleware for route exceptions', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const app = loadAppWithRoutes((router) => {
      router.get('/boom', () => {
        throw new Error('boom route failure');
      });
    });

    const response = await request(app)
      .get('/api/boom')
      .expect(500);

    expect(response.body).toEqual({
      error: {
        message: 'boom route failure',
      },
    });
    expect(errorSpy).toHaveBeenCalled();
  });
});
