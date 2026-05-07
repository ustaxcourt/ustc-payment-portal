declare global {
  namespace NodeJS {
    interface ProcessEnv {
      /** Node runtime mode. For deployment topology, use APP_ENV. */
      NODE_ENV: "development" | "production" | "test";
      /** Deployment topology. Read via getAppEnv() — do not access directly. */
      APP_ENV: "local" | "dev" | "stg" | "prod" | "test";
      SOAP_URL: string;
      PAYMENT_URL: string;
      API_ACCESS_TOKEN: string;
      PAY_GOV_DEV_SERVER_TOKEN: string;
    }
  }
}

export {};
