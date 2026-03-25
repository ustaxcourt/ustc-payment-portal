import { handleError } from "./handleError";

describe("handleError", () => {
  it("returns an object with the statusCode if the statusCode is set and less than 500", () => {
    const error = {
      statusCode: 403,
      message: "You are not authorized to view this test",
    };
    expect(handleError(error)).toMatchObject({
      statusCode: 403,
      body: JSON.stringify({ message: "You are not authorized to view this test" }),
    });
  });

  it("re-throws the error if statusCode is set and greater than 500", () => {
    let result;
    try {
      result = handleError({
        statusCode: 500,
        message: "Something broke",
      });
    } catch (err) {
      expect(err).toMatchObject({
        statusCode: 500,
        message: "Something broke",
      });
    }
    expect(result).toBeUndefined();
  });
});
