import type { NextFunction, Request, RequestHandler, Response } from "express";
import { logger } from "./getPortalLogger";

type RequestWithLocals = Request & {
  locals?: {
    logger?: typeof logger;
    startTime?: number;
  };
};

function redactPasswordFields(obj: unknown): unknown {
  if (!obj || typeof obj !== "object") {
    return obj;
  }

  const passwordRegex = /password/i;

  for (const key of Object.keys(obj as Record<string, unknown>)) {
    const value = (obj as Record<string, unknown>)[key];

    if (value && typeof value === "object") {
      redactPasswordFields(value);
      continue;
    }

    if (passwordRegex.test(key)) {
      (obj as Record<string, unknown>)[key] = "*** REDACTED ***";
    }
  }

  return obj;
}

function cloneBody<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function buildResponseLogger(
  req: RequestWithLocals,
  res: Response,
  startedAt: number,
) {
  let finalized = false;

  return (event: "finished" | "closed") => {
    if (finalized) {
      return;
    }
    finalized = true;

    logger.addContext({
      response: {
        responseSize: Number(res.get("content-length") ?? 0),
        responseTimeMs: Date.now() - startedAt,
        statusCode: res.statusCode,
        event,
      },
    });
    logger.info(`Request ended: ${req.method} ${req.url}`);
    logger.clearContext();
  };
}

export const expressLogger: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const request = req as RequestWithLocals;
  const requestBody = cloneBody(request.body);

  logger.clearContext();

  if (requestBody) {
    redactPasswordFields(requestBody);
  }

  logger.addContext({
    environment: {
      color: process.env.CURRENT_COLOR || "green",
      stage: process.env.STAGE || "local",
    },
    request: {
      body: requestBody ? JSON.stringify(requestBody) : undefined,
      headers: request.headers,
      method: request.method,
      url: request.url,
    },
    requestId: {
      application: request.get("x-request-id"),
    },
  });

  logger.info(`Request started: ${request.method} ${request.url}`);

  request.locals = {
    ...(request.locals || {}),
    logger,
    startTime: Date.now(),
  };

  const finalize = buildResponseLogger(
    request,
    res,
    request.locals.startTime ?? Date.now(),
  );

  res.once("finish", () => finalize("finished"));
  res.once("close", () => finalize("closed"));

  return next();
};
