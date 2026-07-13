import * as https from "node:https";
import type { APIGatewayEvent } from "aws-lambda";
import { getSecretString } from "@clients/secretsClient";
import { createRequestLogger } from "@utils/logger";
import { createAppContext } from "./appContext";

jest.mock("node-fetch", () => jest.fn());
jest.mock("https");
jest.mock("./clients/secretsClient");
jest.mock("./utils/logger", () => ({
	createRequestLogger: jest.fn(() => ({
		debug: jest.fn(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
	})),
}));

// Import after mocking
let mockFetch: jest.Mock;
const mockGetSecretString = getSecretString as jest.Mock;
const mockCreateRequestLogger = createRequestLogger as jest.Mock;
beforeAll(async () => {
	mockFetch = (await import("node-fetch")).default as unknown as jest.Mock;
});

describe("appContext", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		jest.clearAllMocks();
		process.env = { ...originalEnv };
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it("should create an HTTPS agent with correct options", () => {
		// Since cache may be populated from previous test, verify the agent has correct properties
		const appContext = createAppContext();
		const agent = appContext.getHttpsAgent();

		expect(agent).toBeInstanceOf(Promise<https.Agent>);
	});

	it("should cache the HTTPS agent and return the same instance on subsequent calls", () => {
		const appContext = createAppContext();
		const agent1 = appContext.getHttpsAgent();
		const agent2 = appContext.getHttpsAgent();

		expect(agent1).toStrictEqual(agent2);
	});

	it("passes local request context to createRequestLogger", () => {
		createAppContext({
			localRequest: {
				method: "POST",
				path: "/payments/init",
				transactionReferenceId: "TXN-123",
			},
		});

		expect(mockCreateRequestLogger).toHaveBeenCalledWith({
			httpMethod: "POST",
			path: "/payments/init",
			transactionReferenceId: "TXN-123",
		});
	});

	it("passes lambda request context to createRequestLogger", () => {
		createAppContext({
			lambdaRequest: {
				httpMethod: "GET",
				path: "/payments/details",
				requestContext: {
					requestId: "req-123",
					identity: {
						userArn: "arn:aws:sts::123456789012:assumed-role/ClientRole/client",
					},
				},
				queryStringParameters: {
					transactionReferenceId: "TXN-456",
				},
			} as unknown as APIGatewayEvent,
		});

		expect(mockCreateRequestLogger).toHaveBeenCalledWith({
			httpMethod: "GET",
			awsRequestId: "req-123",
			path: "/payments/details",
			clientArn: "arn:aws:sts::123456789012:assumed-role/ClientRole/client",
			transactionReferenceId: "TXN-456",
		});
	});

	it("prefers local request context when both local and lambda requests are provided", () => {
		createAppContext({
			localRequest: {
				method: "PUT",
				path: "/payments/process",
				transactionReferenceId: "LOCAL-789",
			},
			lambdaRequest: {
				httpMethod: "DELETE",
				path: "/ignored",
				requestContext: {
					requestId: "lambda-req-id",
					identity: {
						userArn: "arn:aws:iam::123456789012:user/ignored",
					},
				},
				queryStringParameters: {
					transactionReferenceId: "LAMBDA-000",
				},
			} as unknown as APIGatewayEvent,
		});

		expect(mockCreateRequestLogger).toHaveBeenCalledWith({
			httpMethod: "PUT",
			path: "/payments/process",
			transactionReferenceId: "LOCAL-789",
		});
	});
});

describe("postHttpRequest", () => {
	const mockResponseText = jest.fn();

	beforeEach(() => {
		process.env.SOAP_URL = "https://test-soap-url.com";
		mockFetch.mockResolvedValueOnce({
			text: mockResponseText,
		});
		mockResponseText.mockResolvedValue("mock-response-body");
	});

	it("should make a POST request to the SOAP_URL with correct headers and body", async () => {
		const appContext = createAppContext();
		const body = "<soap>request</soap>";

		await appContext.postHttpRequest(appContext, body);

		expect(mockFetch).toHaveBeenCalledWith("https://test-soap-url.com", {
			method: "POST",
			headers: {
				"Content-type": "application/soap+xml",
			},
			body,
			agent: undefined,
			signal: expect.any(AbortSignal),
		});
	});

	it("should include authentication header when PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID is set and secret is retrieved successfully", async () => {
		process.env.PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID = "token-secret-id";
		process.env.APP_ENV = "test";
		mockGetSecretString.mockResolvedValueOnce("secret-token-from-aws");

		const appContext = createAppContext();
		const body = "<soap>request</soap>";

		await appContext.postHttpRequest(appContext, body);

		expect(mockGetSecretString).toHaveBeenCalledWith("token-secret-id");
		expect(mockFetch).toHaveBeenCalledWith(
			"https://test-soap-url.com",
			expect.objectContaining({
				headers: {
					"Content-type": "application/soap+xml",
					Authentication: "Bearer secret-token-from-aws",
					Authorization: "Bearer secret-token-from-aws",
				},
			}),
		);
	});

	it("should include authentication and authorization headers when PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID is set and retrieved locally", async () => {
		process.env.PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID = "local-token-secret-id";
		process.env.APP_ENV = "local";

		const appContext = createAppContext();
		const body = "<soap>request</soap>";

		await appContext.postHttpRequest(appContext, body);

		expect(mockFetch).toHaveBeenCalledWith(
			"https://test-soap-url.com",
			expect.objectContaining({
				headers: {
					"Content-type": "application/soap+xml",
					Authentication: "Bearer local-token-secret-id",
					Authorization: "Bearer local-token-secret-id",
				},
			}),
		);
	});

	it("should use HTTPS agent when key/cert secret IDs are set", async () => {
		process.env.PRIVATE_KEY_SECRET_ID = "key-id";
		process.env.CERTIFICATE_SECRET_ID = "secret-id";
		(getSecretString as jest.Mock).mockResolvedValue("mock-secret-value");
		const appContext = createAppContext();
		const body = "<soap>request</soap>";

		await appContext.postHttpRequest(appContext, body);

		expect(mockFetch).toHaveBeenNthCalledWith(
			4,
			"https://test-soap-url.com",
			expect.objectContaining({
				agent: expect.any(https.Agent),
			}),
		);
	});

	it("should not use HTTPS agent when key/cert secret IDs are not set", async () => {
		const appContext = createAppContext();
		const body = "<soap>request</soap>";

		await appContext.postHttpRequest(appContext, body);

		expect(mockFetch).toHaveBeenCalledWith(
			"https://test-soap-url.com",
			expect.objectContaining({
				agent: undefined,
			}),
		);
	});

	it("should return the response body as text", async () => {
		const appContext = createAppContext();
		const body = "<soap>request</soap>";

		const result = await appContext.postHttpRequest(appContext, body);

		expect(result).toBe("mock-response-body");
		expect(mockResponseText).toHaveBeenCalled();
	});

	it("should proceed without auth headers and log a warning when Secrets Manager fetch fails", async () => {
		process.env.PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID = "token-secret-id";
		process.env.APP_ENV = "test";
		const fetchError = Object.assign(new Error("AccessDenied"), {
			name: "AccessDeniedException",
		});
		mockGetSecretString.mockRejectedValueOnce(fetchError);

		const appContext = createAppContext();
		const body = "<soap>request</soap>";

		await appContext.postHttpRequest(appContext, body);

		const lastFetchCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
		const lastFetchOptions = lastFetchCall[1] as {
			headers: Record<string, string>;
		};
		expect(lastFetchOptions.headers).not.toHaveProperty("Authorization");
		expect(lastFetchOptions.headers).not.toHaveProperty("Authentication");
		expect(appContext.logger.warn).toHaveBeenCalledWith(
			"Failed to read token from Secrets Manager",
			{
				secretId: "token-secret-id",
				errorName: "AccessDeniedException",
				errorMessage: "AccessDenied",
			},
		);
	});
});

describe("postHttpRequest timeout and retry", () => {
	const okResponse = (body: string) => ({
		text: jest.fn().mockResolvedValue(body),
	});

	const originalEnv = process.env;

	beforeEach(() => {
		jest.clearAllMocks();
		process.env = { ...originalEnv };
		process.env.SOAP_URL = "https://test-soap-url.com";
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it("passes an abort signal to fetch", async () => {
		mockFetch.mockResolvedValueOnce(okResponse("ok"));
		const appContext = createAppContext();

		await appContext.postHttpRequest(appContext, "<soap/>");

		expect(mockFetch).toHaveBeenCalledWith(
			"https://test-soap-url.com",
			expect.objectContaining({ signal: expect.any(AbortSignal) }),
		);
	});

	it("does not retry on a successful response", async () => {
		mockFetch.mockResolvedValueOnce(okResponse("ok"));
		const appContext = createAppContext();

		const result = await appContext.postHttpRequest(appContext, "<soap/>");

		expect(result).toBe("ok");
		expect(mockFetch).toHaveBeenCalledTimes(1);
		expect(appContext.logger.warn).not.toHaveBeenCalled();
	});

	it("retries once on a network error and returns the second response", async () => {
		const netErr = Object.assign(new Error("ECONNRESET"), {
			name: "FetchError",
		});
		mockFetch
			.mockRejectedValueOnce(netErr)
			.mockResolvedValueOnce(okResponse("recovered"));
		const appContext = createAppContext();

		const result = await appContext.postHttpRequest(appContext, "<soap/>");

		expect(result).toBe("recovered");
		expect(mockFetch).toHaveBeenCalledTimes(2);
		expect(appContext.logger.warn).toHaveBeenCalledTimes(1);
		expect(appContext.logger.warn).toHaveBeenCalledWith(
			"Pay.gov request failed; retrying",
			expect.objectContaining({
				event: "paygov_retry",
				attempt: 1,
				maxAttempts: 2,
				errorName: "FetchError",
				errorMessage: "ECONNRESET",
			}),
		);
	});

	it("retries when reading the response body fails mid-stream (re-POSTs the request)", async () => {
		const bodyErr = Object.assign(new Error("Premature close"), {
			name: "FetchError",
		});
		mockFetch
			.mockResolvedValueOnce({
				text: jest.fn().mockRejectedValue(bodyErr),
			})
			.mockResolvedValueOnce(okResponse("recovered"));
		const appContext = createAppContext();

		const result = await appContext.postHttpRequest(appContext, "<soap/>");

		expect(result).toBe("recovered");
		expect(mockFetch).toHaveBeenCalledTimes(2);
		expect(appContext.logger.warn).toHaveBeenCalledTimes(1);
		expect(appContext.logger.warn).toHaveBeenCalledWith(
			"Pay.gov request failed; retrying",
			expect.objectContaining({
				errorName: "FetchError",
				errorMessage: "Premature close",
			}),
		);
	});

	it("throws after two failed attempts and warns each time", async () => {
		const netErr = Object.assign(new Error("ECONNREFUSED"), {
			name: "FetchError",
		});
		mockFetch.mockRejectedValue(netErr);
		const appContext = createAppContext();

		await expect(
			appContext.postHttpRequest(appContext, "<soap/>"),
		).rejects.toBe(netErr);
		expect(mockFetch).toHaveBeenCalledTimes(2);
		expect(appContext.logger.warn).toHaveBeenCalledTimes(2);
		expect(appContext.logger.warn).toHaveBeenLastCalledWith(
			"Pay.gov request failed; no retries remaining",
			expect.objectContaining({
				event: "paygov_retry_exhausted",
				attempt: 2,
				maxAttempts: 2,
			}),
		);
	});

	it("does not retry a server/client HTTP error (node-fetch resolves it, so it never reaches the retry path)", async () => {
		mockFetch.mockResolvedValueOnce(okResponse("<soap:Fault>500</soap:Fault>"));
		const appContext = createAppContext();

		const result = await appContext.postHttpRequest(appContext, "<soap/>");

		expect(result).toBe("<soap:Fault>500</soap:Fault>");
		expect(mockFetch).toHaveBeenCalledTimes(1);
		expect(appContext.logger.warn).not.toHaveBeenCalled();
	});

	it("does not retry on a non-network/non-timeout error", async () => {
		const otherErr = Object.assign(new Error("boom"), { name: "TypeError" });
		mockFetch.mockRejectedValue(otherErr);
		const appContext = createAppContext();

		await expect(
			appContext.postHttpRequest(appContext, "<soap/>"),
		).rejects.toBe(otherErr);
		expect(mockFetch).toHaveBeenCalledTimes(1);
		expect(appContext.logger.warn).not.toHaveBeenCalled();
	});

	it("aborts after the timeout and retries", async () => {
		jest.useFakeTimers();
		mockFetch.mockImplementation(
			(_url: string, opts: { signal: AbortSignal }) =>
				new Promise((_resolve, reject) => {
					opts.signal.addEventListener("abort", () =>
						reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
					);
				}),
		);
		const appContext = createAppContext();

		// Attach handlers up front so the rejection is never momentarily unhandled.
		const settled = appContext
			.postHttpRequest(appContext, "<soap/>")
			.then(() => ({ rejected: false, err: undefined }))
			.catch((err) => ({ rejected: true, err }));
		await jest.advanceTimersByTimeAsync(10_000); // first attempt times out
		await jest.advanceTimersByTimeAsync(10_000); // retry times out

		expect(await settled).toMatchObject({
			rejected: true,
			err: { name: "AbortError" },
		});
		expect(mockFetch).toHaveBeenCalledTimes(2);
		expect(appContext.logger.warn).toHaveBeenCalledTimes(2);
		jest.useRealTimers();
	});

	it("retries a timeout via the abort signal even when the error name is mangled (minify-safe)", async () => {
		jest.useFakeTimers();
		mockFetch.mockImplementation(
			(_url: string, opts: { signal: AbortSignal }) =>
				new Promise((_resolve, reject) => {
					opts.signal.addEventListener("abort", () =>
						// Simulates a minified build where constructor.name is no longer "AbortError".
						reject(Object.assign(new Error("aborted"), { name: "e" })),
					);
				}),
		);
		const appContext = createAppContext();

		const settled = appContext
			.postHttpRequest(appContext, "<soap/>")
			.then(() => ({ rejected: false }))
			.catch(() => ({ rejected: true }));
		await jest.advanceTimersByTimeAsync(10_000);
		await jest.advanceTimersByTimeAsync(10_000);

		expect(await settled).toEqual({ rejected: true });
		expect(mockFetch).toHaveBeenCalledTimes(2);
		expect(appContext.logger.warn).toHaveBeenCalledTimes(2);
		jest.useRealTimers();
	});
});

describe("getUseCases", () => {
	it("should return an object with initPayment, processPayment, and getDetails", () => {
		const appContext = createAppContext();
		const useCases = appContext.getUseCases();

		expect(useCases).toHaveProperty("initPayment");
		expect(useCases).toHaveProperty("processPayment");
		expect(useCases).toHaveProperty("getDetails");
	});

	it("should return functions for all use cases", () => {
		const appContext = createAppContext();
		const useCases = appContext.getUseCases();

		expect(typeof useCases.initPayment).toBe("function");
		expect(typeof useCases.processPayment).toBe("function");
		expect(typeof useCases.getDetails).toBe("function");
	});
});
