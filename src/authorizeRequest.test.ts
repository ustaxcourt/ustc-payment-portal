import { authorizeRequest } from "./authorizeRequest";
import { UnauthorizedError } from "./errors/unauthorized";

let tempEnv: any;
const testToken = "one-quarter";

describe("authorizeRequest", () => {
  const mockRequest = {
    authToken: testToken,
    appId: "some-app-id",
    token: "a-token",
  };

  beforeAll(() => {
    tempEnv = process.env;
    process.env.API_TOKEN = testToken;
  });

  afterAll(() => {
    process.env = tempEnv;
  });

  it("does not throw an error if the request.authToken matches process.env.API_TOKEN", () => {
    let result;
    try {
      authorizeRequest(mockRequest);
      result = "success";
    } catch (err) {
      // catch any errors,
    }
    expect(result).toEqual("success");
  });

  it("throws an error if the request.authToken does not match process.env.API_TOKEN", () => {
    let result;
    try {
      authorizeRequest({
        ...mockRequest,
        authToken: "some-other-token",
      });
      result = "success";
    } catch (err) {
      // catch any errors,
      expect(err).toBeInstanceOf(UnauthorizedError);
    }
    expect(result).toBeUndefined();
  });
});
