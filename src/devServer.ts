import express from "express";
import path from "path";
import dotenv from "dotenv";

// Load .env.dev BEFORE any module reads process.env
const envPath = path.resolve(process.cwd(), ".env.dev");
dotenv.config({ path: envPath });

import swaggerUi from "swagger-ui-express";
import { createAppContext } from "./appContext";
import { generateOpenAPIDocument } from "./openapi/registry";
import dashboardRoutes from "./dashboard/routes/transactions.routes";
import "./dashboard/db/knex"; // initialises Knex + Objection for dashboard queries

const appContext = createAppContext();

const app = express();
app.use(express.json());
const port = 8080; // default port to listen

// CORS — allow the web-client dev server to call the API
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

app.get("/details/:appId/:payGovTrackingId", async (req, res) => {
  const result = await appContext
    .getUseCases()
    .getDetails(appContext, req.params);
  res.json(result);
});

app.get("/", (req, res) => {
  res.send("hello world!");
});

// Dashboard API routes — same endpoints used by the Lambda handlers in production
app.get("/transaction-payment-status", async (_req, res, next) => {
  const { getTransactionPaymentStatus } = await import("./useCases/transactions");
  try {
    res.json(await getTransactionPaymentStatus());
  } catch (err) {
    next(err);
  }
});
app.use("/transactions", dashboardRoutes);

// start the express server
app.listen(port, () => {
  // tslint:disable-next-line:no-console
  console.log(`server started at http://localhost:${port}`);
  console.log(`API docs available at http://localhost:${port}/docs`);
});
