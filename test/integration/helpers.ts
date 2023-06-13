import * as yaml from "js-yaml";
import { readFileSync } from "fs";
import path from "path";

type YamlConfig = {
  baseUrl: string;
  apiToken: string;
};

export const getConfig = () => {
  const doc = yaml.load(
    readFileSync(path.resolve(__dirname, "../../config.dev.yml"), "utf-8")
  ) as YamlConfig;
  return doc;
};
