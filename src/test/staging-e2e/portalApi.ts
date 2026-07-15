import { GetDetailsResponseSchema } from "../../schemas/GetDetails.schema";
import {
  InitPaymentResponseSchema,
  type InitPaymentResponse,
} from "../../schemas/InitPayment.schema";
import {
  ProcessPaymentResponseSchema,
  type ProcessPaymentResponse,
} from "../../schemas/ProcessPayment.schema";
import { signedFetch } from "../integration/sigv4Helper";
import { getStagingE2EConfig } from "./config";
import {
  FAILURE_CODES,
  StagingE2EError,
  type FailureCode,
} from "./failureCodes";

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

type JsonObject = { [key: string]: JsonValue };

type InitPaymentResult = InitPaymentResponse & {
  transactionReferenceId: string;
};

const parseJsonResponse = async (response: Response): Promise<JsonValue> => {
  const responseText = await response.text();

  if (!responseText) {
    return {};
  }

  try {
    return JSON.parse(responseText) as JsonValue;
  } catch {
    throw new StagingE2EError(
      FAILURE_CODES.UNEXPECTED,
      "Expected JSON response from staging payment portal",
      { httpStatus: response.status },
    );
  }
};

const readMessage = (payload: JsonValue): string | undefined => {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const message = payload.message;
    return typeof message === "string" ? message : undefined;
  }

  return undefined;
};

const assertOk = (
  response: Response,
  payload: JsonValue,
  code: FailureCode,
  step: "init" | "process" | "details",
  transactionReferenceId?: string,
): void => {
  if (response.ok) {
    return;
  }

  throw new StagingE2EError(
    code,
    readMessage(payload) ??
      `Portal request failed with HTTP ${response.status}`,
    {
      httpStatus: response.status,
      step,
      transactionReferenceId,
    },
  );
};

const assertJsonObject = (
  payload: JsonValue,
  code: FailureCode,
  step: "init" | "process" | "details",
): JsonObject => {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return payload as JsonObject;
  }

  throw new StagingE2EError(
    code,
    "Portal response body was not a JSON object",
    {
      step,
    },
  );
};

export const initNonAttorneyPayment = async (): Promise<InitPaymentResult> => {
  const config = getStagingE2EConfig();
  const transactionReferenceId = crypto.randomUUID();

  const response = await signedFetch(`${config.baseUrl}/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      transactionReferenceId,
      fee: config.feeKey,
      urlSuccess: config.urlSuccess,
      urlCancel: config.urlCancel,
      metadata: config.metadata,
    }),
  });

  const payload = await parseJsonResponse(response);
  assertOk(
    response,
    payload,
    FAILURE_CODES.INIT_FAILED,
    "init",
    transactionReferenceId,
  );

  const parsed = InitPaymentResponseSchema.safeParse(
    assertJsonObject(payload, FAILURE_CODES.INIT_FAILED, "init"),
  );

  if (!parsed.success) {
    throw new StagingE2EError(
      FAILURE_CODES.INIT_FAILED,
      parsed.error.issues.map((issue) => issue.message).join(", "),
      { step: "init", transactionReferenceId },
    );
  }

  let paymentRedirect: URL;
  try {
    paymentRedirect = new URL(parsed.data.paymentRedirect);
  } catch {
    throw new StagingE2EError(
      FAILURE_CODES.INIT_BAD_REDIRECT,
      "Init payment response returned an invalid paymentRedirect URL",
      { step: "init", transactionReferenceId },
    );
  }

  if (paymentRedirect.hostname !== config.payGovHost) {
    throw new StagingE2EError(
      FAILURE_CODES.INIT_BAD_REDIRECT,
      `Expected paymentRedirect host ${config.payGovHost} but received ${paymentRedirect.hostname}`,
      { step: "init", transactionReferenceId },
    );
  }

  return {
    ...parsed.data,
    transactionReferenceId,
  };
};

export const processPayment = async (
  token: string,
): Promise<ProcessPaymentResponse> => {
  const config = getStagingE2EConfig();
  const response = await signedFetch(`${config.baseUrl}/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });

  const payload = await parseJsonResponse(response);
  assertOk(response, payload, FAILURE_CODES.PROCESS_FAILED, "process");

  const parsed = ProcessPaymentResponseSchema.safeParse(
    assertJsonObject(payload, FAILURE_CODES.PROCESS_FAILED, "process"),
  );

  if (!parsed.success) {
    throw new StagingE2EError(
      FAILURE_CODES.PROCESS_FAILED,
      parsed.error.issues.map((issue) => issue.message).join(", "),
      { step: "process", token },
    );
  }

  return parsed.data;
};

export const getDetails = async (transactionReferenceId: string) => {
  const config = getStagingE2EConfig();
  const response = await signedFetch(
    `${config.baseUrl}/details/${transactionReferenceId}`,
    { method: "GET" },
  );

  const payload = await parseJsonResponse(response);
  assertOk(
    response,
    payload,
    FAILURE_CODES.DETAILS_MISMATCH,
    "details",
    transactionReferenceId,
  );

  const parsed = GetDetailsResponseSchema.safeParse(
    assertJsonObject(payload, FAILURE_CODES.DETAILS_MISMATCH, "details"),
  );

  if (!parsed.success) {
    throw new StagingE2EError(
      FAILURE_CODES.DETAILS_MISMATCH,
      parsed.error.issues.map((issue) => issue.message).join(", "),
      { step: "details", transactionReferenceId },
    );
  }

  return parsed.data;
};
