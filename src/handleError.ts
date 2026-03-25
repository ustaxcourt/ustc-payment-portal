export const handleError = (err: any) => {
  console.error(`responding with an error`, err);
  if (err.statusCode && err.statusCode < 500) {
    return {
      statusCode: err.statusCode,
      body: JSON.stringify({ message: err.message }),
    };
  }
  throw err;
};
