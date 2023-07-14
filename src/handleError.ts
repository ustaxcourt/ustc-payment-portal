import { ValidationError } from "joi";
import { UnauthorizedError } from "./errors/unauthorized";

export const handleError = (err: any) => {
  console.log(`responding with an error`, err);
  if (err instanceof ValidationError) {
    return {
      statusCode: 400,
      body: JSON.stringify(err),
    };
  } else if (err instanceof UnauthorizedError) {
    return {
      statusCode: 403,
      body: err.message,
    };
  }
  return {
    statusCode: 500,
    body: JSON.stringify({
      message: "error!",
    }),
  };
};
