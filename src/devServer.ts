import "dotenv/config";
import express from "express";
import path from "path";
import swaggerUi from "swagger-ui-express";
import { createAppContext } from "./appContext";
import { isLocal } from "./config/appEnv";
import { generateOpenAPIDocument } from "./openapi/registry";
import { TransactionsByStatusPathParams } from "./types/TransactionsByStatus";
import { migrationHandler } from "./migrationHandler";
import { handleError } from "./handleError";
import { InvalidRequestError } from "./errors/invalidRequest";
import { parseRequestBody } from "./parseRequestBody";
import { InitPaymentRequestSchema } from "./schemas/InitPayment.schema";
import { ProcessPaymentRequestSchema } from "./schemas/ProcessPayment.schema";
import "./db/knex";
import { ClientPermission } from "./types/ClientPermission";
import { logger } from "./utils/logger";

const app = express();

const setupLocalAppContext = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void => {
  res.locals.appContext = createAppContext({ localRequest: req });
  next();
};

// strict: false to match the Lambda's JSON.parse, which accepts primitive top-level
// values (strings, null, booleans, numbers). With strict: true (the express default),
// those would be rejected as parse errors before reaching schema validation, so a
// payload like "foo" would return "invalid JSON in request body" locally but a
// Zod "Validation error" through the Lambda. Instantiate once — the parser is
// stateless across requests.
const jsonBodyParser = express.json({ strict: false });
app.use((req, res, next) => {
  jsonBodyParser(req, res, (err) => {
    if (err) {
      const { statusCode, body } = handleError(
        res.locals.appContext,
        new InvalidRequestError("invalid JSON in request body"),
      );
      res.status(statusCode).json(JSON.parse(body));
      return;
    }
    next();
  });
});
app.use(setupLocalAppContext);

// tslint:disable-next-line:no-var-requires
const { parsePort } = require("../scripts/lib/parsePort");
const port: number = parsePort(process.env.API_PORT, 8080, "API_PORT");
const devClient: ClientPermission = {
  clientName: "Dev Client App",
  clientRoleArn: "arn:aws:iam::123456789012:role/dev-client",
  allowedFeeKeys: ["*"],
};

// Note: This is only needed for local development
// when the web client is served from a different origin (e.g. localhost:3000).
// In production, the web client will be served from the same origin as the API,
// so CORS is not required.
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.sendStatus(200);
    return;
  }
  next();
});

// Configure Express to use EJS
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

// Swagger UI - serve API documentation at /docs
const openApiDocument = generateOpenAPIDocument();
app.use(
  "/docs",
  swaggerUi.serve,
  swaggerUi.setup(openApiDocument, {
    swaggerOptions: {
      defaultModelsExpandDepth: 5,
      defaultModelExpandDepth: 5,
    },
  }),
);

// Serve raw OpenAPI spec as JSON
app.get("/openapi.json", (_req, res) => {
  res.json(openApiDocument);
});

// define a route handler for the default home page
app.post("/init", async (req, res) => {
  logger.info(
    {
      fee: req.body?.fee,
      transactionReferenceId: req.body?.transactionReferenceId,
    },
    "Received /init request",
  );
  try {
    const request = parseRequestBody(req, InitPaymentRequestSchema);
    const result = await res.locals.appContext
      .getUseCases()
      .initPayment(res.locals.appContext, { client: devClient, request });
    res.json(result);
  } catch (err) {
    const { statusCode, body } = handleError(res.locals.appContext, err);
    res.status(statusCode).json(JSON.parse(body));
  }
});

app.post("/process", async (req, res) => {
  try {
    const request = parseRequestBody(req, ProcessPaymentRequestSchema);
    const result = await res.locals.appContext
      .getUseCases()
      .processPayment(res.locals.appContext, { client: devClient, request });
    res.json(result);
  } catch (err) {
    const { statusCode, body } = handleError(res.locals.appContext, err);
    res.status(statusCode).json(JSON.parse(body));
  }
});

app.get("/details/:transactionReferenceId", async (req, res) => {
  try {
    const result = await res.locals.appContext
      .getUseCases()
      .getDetails(res.locals.appContext, {
        client: devClient,
        request: { transactionReferenceId: req.params.transactionReferenceId },
      });
    res.json(result);
  } catch (err) {
    const { statusCode, body } = handleError(res.locals.appContext, err);
    res.status(statusCode).json(JSON.parse(body));
  }
});

// ONLY FOR LOCAL TESTING - DO NOT CONNECT TO API GATEWAY
if (isLocal()) {
  app.get("/migrations", async (_req, res, next) => {
    try {
      const result = await migrationHandler();
      res.status(result.statusCode).json(JSON.parse(result.body));
    } catch (err) {
      next(err);
    }
  });
}

app.get("/", (_req, res) => {
  res.send("hello world!");
});

app.get("/transactions", async (_req, res, next) => {
  try {
    const result = await res.locals.appContext
      .getUseCases()
      .getRecentTransactions(res.locals.appContext);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.get("/transactions/:paymentStatus", async (req, res, next) => {
  try {
    const result = await res.locals.appContext
      .getUseCases()
      .getTransactionsByStatus(
        res.locals.appContext,
        req.params as unknown as TransactionsByStatusPathParams,
      );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.get("/transaction-payment-status", async (_req, res, next) => {
  try {
    const result = await res.locals.appContext
      .getUseCases()
      .getTransactionPaymentStatus(res.locals.appContext);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// start the express server
app.listen(port, () => {
  // tslint:disable-next-line:no-console
  console.log(`server started at http://localhost:${port}`);
  console.log(`API docs available at http://localhost:${port}/docs`);
});
