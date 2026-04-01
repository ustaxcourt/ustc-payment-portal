import express from "express";
import path from "path";
import dotenv from "dotenv";
import swaggerUi from "swagger-ui-express";
import { createAppContext } from "./appContext";
import { generateOpenAPIDocument } from "./openapi/registry";
import { TransactionsByStatusPathParams } from "./types/TransactionsByStatus";
import { migrationHandler } from "./migrationHandler";
const envPath = path.resolve(__dirname, "../.env");
dotenv.config({ path: envPath });
import "./db/knex";

const appContext = createAppContext();

const app = express();
app.use(express.json());
const port = 8080; // default port to listen

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
  const result = await appContext
    .getUseCases()
    .initPayment(appContext, req.body);
  res.json(result);
});

app.post("/process", async (req, res) => {
  const result = await appContext
    .getUseCases()
    .processPayment(appContext, req.body);
  res.json(result);
});

app.get("/details/:payGovTrackingId", async (req, res) => {
  const result = await appContext
    .getUseCases()
    .getDetails(appContext, req.params);
  res.json(result);
});

// ONLY FOR LOCAL TESTING - DO NOT CONNECT TO API GATEWAY
if (process.env.NODE_ENV !== "production") {
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
