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
import "./db/knex";
import { ClientPermission } from "./types/ClientPermission";

const appContext = createAppContext();

const app = express();
app.use(express.json());
const port = 8080; // default port to listen
const devClient: ClientPermission = {
  clientName: "Dev Client App",
  clientRoleArn: "arn:aws:iam::123456789012:role/dev-client",
  allowedFeeIds: ["*"],
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
app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument, {
  swaggerOptions: {
    defaultModelsExpandDepth: 5,
    defaultModelExpandDepth: 5,
  },
}));

// Serve raw OpenAPI spec as JSON
app.get("/openapi.json", (req, res) => {
  res.json(openApiDocument);
});

// define a route handler for the default home page
app.post("/init", async (req, res) => {
  try {
    const result = await appContext
      .getUseCases()
      .initPayment(appContext, { client: devClient, request: req.body });
    res.json(result);
  } catch (err) {
    const { statusCode, body } = handleError(err);
    res.status(statusCode).json(JSON.parse(body));
  }
});

app.post("/process", async (req, res) => {
  try {
    const result = await appContext
      .getUseCases()
      .processPayment(appContext, { client: devClient, request: req.body });
    res.json(result);
  } catch (err) {
    const { statusCode, body } = handleError(err);
    res.status(statusCode).json(JSON.parse(body));
  }
});

app.get("/details/:transactionReferenceId", async (req, res) => {
  try {
    const result = await appContext
      .getUseCases()
      .getDetails(appContext, {
        client: devClient,
        request: { transactionReferenceId: req.params.transactionReferenceId },
      });
    res.json(result);
  } catch (err) {
    const { statusCode, body } = handleError(err);
    res.status(statusCode).json(JSON.parse(body));
  }
});

// ONLY FOR LOCAL TESTING - DO NOT CONNECT TO API GATEWAY
if (isLocal()) {
  app.get("/migrations", async (req, res, next) => {
    try {
      const result = await migrationHandler();
      res.status(result.statusCode).json(JSON.parse(result.body));
    } catch (err) {
      next(err);
    }
  });
}

app.get("/", (req, res) => {
  res.send("hello world!");
});

app.get("/transactions", async (_req, res, next) => {
  try {
    const result = await appContext
      .getUseCases()
      .getRecentTransactions(appContext);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.get("/transactions/:paymentStatus", async (req, res, next) => {
  try {
    const result = await appContext
      .getUseCases()
      .getTransactionsByStatus(appContext, req.params as unknown as TransactionsByStatusPathParams);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.get("/transaction-payment-status", async (_req, res, next) => {
  try {
    const result = await appContext
      .getUseCases()
      .getTransactionPaymentStatus(appContext);
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
