import { ValidationError } from "joi";

export const handleError = (err: any) => {
  console.error(`responding with an error`, err);
  if (err.statusCode && err.statusCode < 500) {
    return {
      statusCode: err.statusCode,
      body: err.message,
    };
  } else if (err instanceof ValidationError) {
    return {
      statusCode: 400,
      body: JSON.stringify(err),
    };
  }
  throw err;
};
