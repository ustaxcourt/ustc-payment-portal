import { getClientByRoleArn } from "@clients/permissionsClient";
import { parseAndValidate } from "@utils/parseAndValidate";
import type { APIGatewayEvent } from "aws-lambda";
import { z } from "zod";
import { createAppContext } from "../appContext";
import { extractCallerArn } from "../extractCallerArn";
import { handleError } from "../handleError";
import { testAppContext } from "../test/testAppContext";
import { lambdaHandler } from "./lambdaHandler";

jest.mock("../appContext", () => ({
	createAppContext: jest.fn(),
}));

jest.mock("../extractCallerArn", () => ({
	extractCallerArn: jest.fn(),
}));

jest.mock("../clients/permissionsClient", () => ({
	getClientByRoleArn: jest.fn(),
	getClientPermissions: jest.fn().mockResolvedValue([]),
}));

jest.mock("../utils/parseAndValidate", () => ({
	parseAndValidate: jest.fn(),
}));

jest.mock("../handleError", () => ({
	handleError: jest.fn(),
}));

const mockCreateAppContext = createAppContext as jest.MockedFunction<
	typeof createAppContext
>;
const mockExtractCallerArn = extractCallerArn as jest.MockedFunction<
	typeof extractCallerArn
>;
const mockGetClientByRoleArn = getClientByRoleArn as jest.MockedFunction<
	typeof getClientByRoleArn
>;
const mockParseAndValidate = parseAndValidate as jest.MockedFunction<
	typeof parseAndValidate
>;
const mockHandleError = handleError as jest.MockedFunction<typeof handleError>;

const mockEvent = {
	requestContext: {
		identity: {
			userArn:
				"arn:aws:sts::123456789012:assumed-role/dawson-client/session-123",
		},
	},
} as unknown as APIGatewayEvent;

describe("lambdaHandler", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockCreateAppContext.mockReturnValue(testAppContext);
	});

	it("returns 200 and invokes callback with client and parsed request", async () => {
		const parsedBody = { amount: 100 };
		const parsedRequest = { ok: true as const, value: parsedBody };
		const roleArn = "arn:aws:iam::123456789012:role/dawson-client";
		const client = {
			clientName: "Test Client",
			clientRoleArn: roleArn,
			allowedFeeKeys: ["PETITION_FILING_FEE"],
		};
		const callbackResult = { id: "abc-123" };

		mockParseAndValidate.mockReturnValue(parsedRequest);
		mockExtractCallerArn.mockReturnValue(roleArn);
		mockGetClientByRoleArn.mockResolvedValue(client);

		const callback = jest.fn().mockResolvedValue(callbackResult);

		const result = await lambdaHandler({
			schema: z.object({ amount: z.number() }),
			event: mockEvent,
			rawRequest: JSON.stringify(parsedBody),
			callback,
		});

		expect(result).toEqual({
			statusCode: 200,
			body: JSON.stringify(callbackResult),
		});
		expect(callback).toHaveBeenCalledWith(testAppContext, {
			client,
			request: parsedBody,
		});
		expect(mockParseAndValidate).toHaveBeenCalledTimes(1);
		expect(mockExtractCallerArn).toHaveBeenCalledWith(mockEvent.requestContext);
	});

	it("delegates to handleError when callback throws", async () => {
		const parsedBody = { amount: 100 };
		const parsedRequest = { ok: true as const, value: parsedBody };
		const roleArn = "arn:aws:iam::123456789012:role/dawson-client";
		const client = {
			clientName: "Test Client",
			clientRoleArn: roleArn,
			allowedFeeKeys: ["PETITION_FILING_FEE"],
		};
		const expectedErrorResponse = {
			statusCode: 500,
			body: JSON.stringify({ message: "failure", errors: [] }),
		};
		const callbackError = new Error("callback exploded");

		mockParseAndValidate.mockReturnValue(parsedRequest);
		mockExtractCallerArn.mockReturnValue(roleArn);
		mockGetClientByRoleArn.mockResolvedValue(client);
		mockHandleError.mockReturnValue(expectedErrorResponse);

		const callback = jest.fn().mockRejectedValue(callbackError);

		const result = await lambdaHandler({
			schema: z.object({ amount: z.number() }),
			event: mockEvent,
			rawRequest: JSON.stringify(parsedBody),
			callback,
		});

		expect(mockHandleError).toHaveBeenCalledWith(testAppContext, callbackError);
		expect(result).toEqual(expectedErrorResponse);
	});
});
