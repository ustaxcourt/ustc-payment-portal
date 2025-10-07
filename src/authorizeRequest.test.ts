import { authorizeRequest } from "./authorizeRequest";
import { UnauthorizedError } from "./errors/unauthorized";

let tempEnv: any;
const testToken = "one-quarter";

describe("authorizeRequest", () => {
  const mockRequest = {
    Authentication: `Bearer ${testToken}`,
  };

  beforeAll(() => {
    tempEnv = process.env;
    process.env.API_ACCESS_TOKEN = testToken;
  });

  afterAll(() => {
    process.env = tempEnv;
  });

  it("does not throw an error if the request.authToken matches process.env.API_ACCESS_TOKEN", () => {
    let result;
    try {
      authorizeRequest(mockRequest);
      result = "success";
    } catch (err) {
      // catch any errors,
    }
    expect(result).toEqual("success");
  });

  it("throws an error if the request.authToken does not match process.env.API_ACCESS_TOKEN", () => {
    let result;
    try {
      authorizeRequest({
        Authentication: "Bearer some-other-token",
      });
      result = "success";
    } catch (err) {
      // catch any errors,
      expect(err).toBeInstanceOf(UnauthorizedError);
    }
    expect(result).toBeUndefined();
  });

  it("throws an error if headers are missing", () => {
    let result;
    try {
      authorizeRequest(undefined);
      result = "success";
    } catch (err) {
      expect(err).toBeInstanceOf(UnauthorizedError);
      expect((err as UnauthorizedError).message).toEqual(
        "Missing Authentication"
      );
    }
    expect(result).toBeUndefined();
  });

  it("throws an error if Authentication header is missing from headers object", () => {
    let result;
    try {
      authorizeRequest({
        "Content-Type": "application/json",
        "User-Agent": "test",
      });
      result = "success";
    } catch (err) {
      expect(err).toBeInstanceOf(UnauthorizedError);
      expect((err as UnauthorizedError).message).toEqual("Unauthorized");
    }
    expect(result).toBeUndefined();
  });
});
