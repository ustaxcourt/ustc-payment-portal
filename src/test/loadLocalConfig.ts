import path from "path";
import * as yaml from "js-yaml";
import { readFileSync } from "fs";

type YamlConfig = {
  apiToken: string;
  baseUrl: string;
  nodeEnv: "development" | "production" | "staging" | "local";
  paymentUrl: string;
  soapUrl: string;
  payGovDevServerToken: string;
  flagSoapClient: "http" | "soap";
};

export const loadLocalConfig = () => {
  const doc = yaml.load(
    readFileSync(path.resolve(__dirname, "../../config.local.yml"), "utf-8")
  ) as YamlConfig;

  process.env.API_ACCESS_TOKEN = doc.apiToken;
  process.env.PAY_GOV_DEV_SERVER_TOKEN = doc.payGovDevServerToken;
  process.env.CERT_PASSPHRASE = "";
  process.env.FLAG_SOAP_CLIENT = doc.flagSoapClient;
  process.env.NODE_ENV = doc.nodeEnv;
  process.env.PAYMENT_URL = doc.paymentUrl;
  process.env.SOAP_URL = doc.soapUrl;
  process.env.BASE_URL = doc.baseUrl;
};
