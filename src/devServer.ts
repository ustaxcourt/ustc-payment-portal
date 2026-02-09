import express from "express";
import path from "path";
import swaggerUi from "swagger-ui-express";
import { createAppContext } from "./appContext";
import { generateOpenAPIDocument } from "./openapi/registry";
import dotenv from "dotenv";

// Prefer .env.dev for local development, fallback to default .env
const envPath = path.resolve(process.cwd(), ".env.dev");
dotenv.config({ path: envPath });

const appContext = createAppContext();

const app = express();
app.use(express.json());
const port = 8080; // default port to listen

// Configure Express to use EJS
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

// Swagger UI - serve API documentation at /docs
const openApiDocument = generateOpenAPIDocument();
app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));

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

// start the express server
app.listen(port, () => {
  // tslint:disable-next-line:no-console
  console.log(`server started at http://localhost:${port}`);
  console.log(`API docs available at http://localhost:${port}/docs`);
});
