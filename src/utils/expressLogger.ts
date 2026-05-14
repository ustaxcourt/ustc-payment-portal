import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ClientPermission } from "../types/ClientPermission";
import { LoggerType } from "../types/LoggerType";
import { createLogger } from "./logger";

type RequestWithLocals = Request & {
  locals?: {
    logger?: LoggerType;
    startTime?: number;
  };
};

const createRequestScopedLogger = (): LoggerType => {
  const baseLogger = createLogger();
  let currentContext: Record<string, unknown> = {};

  const getLoggerWithContext = () =>
    Object.keys(currentContext).length
      ? baseLogger.child(currentContext)
      : baseLogger;

  return {
    addContext: (newMeta: Record<string, any>) => {
      currentContext = {
        ...currentContext,
        ...newMeta,
      };
    },
    addUser: ({ user }: { user: ClientPermission }) => {
      currentContext = {
        ...currentContext,
        user,
      };
    },
    clearContext: () => {
      currentContext = {};
    },
    getContext: () => ({ ...currentContext }),
    debug: (message: any, context?: any) =>
      getLoggerWithContext().debug(message, context),
    info: (message: any, context?: any) =>
      getLoggerWithContext().info(message, context),
    warn: (message: any, context?: any) =>
      getLoggerWithContext().warn(message, context),
    error: (message: any, context?: any) =>
      getLoggerWithContext().error(message, context),
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
  requestLogger: LoggerType,
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

    requestLogger.addContext({
      response: {
        responseSize: Number(res.get("content-length") ?? 0),
        responseTimeMs: Date.now() - startedAt,
        statusCode: res.statusCode,
        event,
      },
    });
    requestLogger.info(`Request ended: ${req.method} ${req.url}`);
    requestLogger.clearContext();
  };
}

export const expressLogger: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const request = req as RequestWithLocals;
  const requestBody = cloneBody(request.body);
  const requestLogger = createRequestScopedLogger();

  if (requestBody) {
    redactPasswordFields(requestBody);
  }

  requestLogger.addContext({
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

  requestLogger.info(`Request started: ${request.method} ${request.url}`);

  request.locals = {
    ...(request.locals || {}),
    logger: requestLogger,
    startTime: Date.now(),
  };

  const finalize = buildResponseLogger(
    requestLogger,
    request,
    res,
    request.locals.startTime ?? Date.now(),
  );

  res.once("finish", () => finalize("finished"));
  res.once("close", () => finalize("closed"));

  return next();
};
