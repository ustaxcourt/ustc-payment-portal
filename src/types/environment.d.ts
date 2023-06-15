declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: "development" | "production" | "staging";
      SOAP_URL: string;
      PAYMENT_URL: string;
      API_TOKEN: string;
      CERT_PASSPHRASE: string;
    }
  }
}

export {};
