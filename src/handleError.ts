import { ZodError } from "zod";

export const handleError = (err: any) => {
  console.error(`responding with an error`, err);
  if (err.statusCode && err.statusCode < 500) {
    return {
      statusCode: err.statusCode,
      body: err.message,
    };
  } else if (err instanceof ZodError) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: "Validation error",
        errors: err.issues,
      }),
    };
  }
  throw err;
};
