declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: "development" | "production" | "staging" | "local" | "test";
      SOAP_URL: string;
      PAYMENT_URL: string;
      API_ACCESS_TOKEN: string;
      PAY_GOV_DEV_SERVER_TOKEN: string;
      CERT_PASSPHRASE: string;
    }
  }
}

export {};
