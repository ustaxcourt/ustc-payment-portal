import express from "express";
import path from "path";
import swaggerUi from "swagger-ui-express";
import dotenv from "dotenv";
import { RegisterRoutes } from "./generated/routes";
import * as swaggerDocument from "../docs/openapi.json";

// Prefer .env.dev for local development, fallback to default .env
const envPath = path.resolve(process.cwd(), ".env.dev");
dotenv.config({ path: envPath });

const app = express();
app.use(express.json());
const port = 8080; // default port to listen

// Configure Express to use EJS
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

// Swagger UI - serve API documentation at /docs
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Serve raw OpenAPI spec as JSON
app.get("/openapi.json", (req, res) => {
  res.json(swaggerDocument);
});

// Register tsoa-generated routes
RegisterRoutes(app);

app.get("/", (req, res) => {
  res.send("hello world!");
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(`Error: ${err.message}`);
  const status = err.status || 500;
  res.status(status).json({
    statusCode: status,
    message: err.message || "Internal Server Error",
  });
});

// start the express server
app.listen(port, () => {
  // tslint:disable-next-line:no-console
  console.log(`server started at http://localhost:${port}`);
  console.log(`API docs available at http://localhost:${port}/docs`);
});
