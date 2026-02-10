import * as express from "express";
import { UnauthorizedError } from "./errors/unauthorized";

/**
 * Express authentication middleware for tsoa @Security decorator
 */
export function expressAuthentication(
  request: express.Request,
  securityName: string,
  _scopes?: string[]
): Promise<any> {
  if (securityName === "ApiKeyAuth") {
    const apiKey = request.headers["x-api-key"];

    if (!apiKey) {
      return Promise.reject(new UnauthorizedError("Missing API key"));
    }

    // In production, validate against stored API keys
    // For now, accept any non-empty key (existing authorizeRequest logic can be integrated here)
    return Promise.resolve({ apiKey });
  }

  return Promise.reject(new UnauthorizedError("Unknown security scheme"));
}
