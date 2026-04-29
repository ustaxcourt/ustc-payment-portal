declare global {
  namespace NodeJS {
    interface ProcessEnv {
      /**
       * Node runtime mode. Restricted to Node's three legal values.
       * For deployment topology (local/dev/stg/prod) read APP_ENV instead.
       */
      NODE_ENV: "development" | "production" | "test";
      /**
       * Deployment topology of this service. Read via getAppEnv() in src/config/appEnv.ts.
       */
      APP_ENV: "local" | "dev" | "stg" | "prod" | "test";
      SOAP_URL: string;
      PAYMENT_URL: string;
      API_ACCESS_TOKEN: string;
      PAY_GOV_DEV_SERVER_TOKEN: string;
      CERT_PASSPHRASE: string;
    }
  }
}

export {};
