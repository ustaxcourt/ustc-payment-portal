import express from "express";
import path from "path";
import { createAppContext } from "./appContext";
import { InitPaymentRequest } from "./types/InitPaymentRequest";
import { loadLocalConfig } from "./test/loadLocalConfig";

loadLocalConfig();

const appContext = createAppContext();

const app = express();
app.use(express.json());
const port = 8080; // default port to listen

// Configure Express to use EJS
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

// define a route handler for the default home page
app.post("/init", (req, res) => {
  // initialize a payment

  const result = appContext.getUseCases().initPayment(appContext, req.body);
  res.json(result);
});

app.post("/process", (req, res) => {
  // process a payment
  res.json({
    foo: "bar",
  });
});

app.get("/", (req, res) => {
  res.send("hello world!");
});

// start the express server
app.listen(port, () => {
  // tslint:disable-next-line:no-console
  console.log(`server started at http://localhost:${port}`);
});
