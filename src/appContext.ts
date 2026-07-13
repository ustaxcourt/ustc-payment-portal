import * as https from "node:https";
import type { AppContext } from "@appTypes/AppContext";
import { getSecretString } from "@clients/secretsClient";
import { getDetails } from "@useCases/getDetails";
import { getRecentTransactions } from "@useCases/getRecentTransactions";
import { getTransactionPaymentStatus } from "@useCases/getTransactionPaymentStatus";
import { getTransactionsByStatus } from "@useCases/getTransactionsByStatus";
import { initPayment } from "@useCases/initPayment";
import { processPayment } from "@useCases/processPayment";
import { createRequestLogger } from "@utils/logger";
import type { APIGatewayEvent } from "aws-lambda";
import fetch from "node-fetch";
import { isLocal } from "./config/appEnv";

let httpsAgentCache: https.Agent | undefined;

const PAYGOV_REQUEST_TIMEOUT_MS = 10_000;
const PAYGOV_MAX_ATTEMPTS = 2;
const RETRYABLE_ERROR_NAMES = new Set(["FetchError", "AbortError"]);

function isRetryablePaygovError(err: unknown): boolean {
	return err instanceof Error && RETRYABLE_ERROR_NAMES.has(err.name);
}

function normalizePem(pem: string): string {
	return `${pem.replace(/\r\n/g, "\n").trimEnd()}\n`;
}

type LocalRequestContext = {
	method: string;
	path: string;
	transactionReferenceId?: string;
};

type AppContextContext = {
	localRequest?: LocalRequestContext;
	lambdaRequest?: APIGatewayEvent;
};

export const createAppContext = (
	context: AppContextContext = {},
): AppContext => {
	const { localRequest, lambdaRequest } = context;
	const requestContext = localRequest
		? {
				httpMethod: localRequest.method,
				path: localRequest.path,
				transactionReferenceId: localRequest.transactionReferenceId,
			}
		: lambdaRequest
			? {
					httpMethod: lambdaRequest.httpMethod,
					awsRequestId: lambdaRequest.requestContext.requestId,
					path: lambdaRequest.path,
					clientArn: lambdaRequest.requestContext.identity.userArn ?? undefined,
					transactionReferenceId:
						lambdaRequest.queryStringParameters?.transactionReferenceId,
				}
			: {};

	const logger = createRequestLogger(requestContext);

	return {
		getHttpsAgent: async () => {
			if (!httpsAgentCache) {
				const keyId = process.env.PRIVATE_KEY_SECRET_ID;
				const certId = process.env.CERTIFICATE_SECRET_ID;
				const passId = process.env.CERT_PASSPHRASE_SECRET_ID; // optional

				// Only build an mTLS agent when both key and cert IDs are present (stg/prod)
				if (keyId && certId) {
					const [key, cert, passphrase] = await Promise.all([
						getSecretString(keyId),
						getSecretString(certId),
						passId ? getSecretString(passId) : Promise.resolve(undefined),
					]);

					httpsAgentCache = new https.Agent({
						keepAlive: true,
						maxFreeSockets: 10,
						timeout: 30_000,
						key: normalizePem(key),
						cert: normalizePem(cert),
						passphrase,
					});
				}
			}
			return httpsAgentCache;
		},
		postHttpRequest: async (
			appContext: AppContext,
			body: string,
		): Promise<string> => {
			const httpsAgent = await appContext.getHttpsAgent();

			const headers: {
				"Content-type": string;
				Authorization?: string;
				Authentication?: string;
			} = {
				"Content-type": "application/soap+xml",
			};

			const tokenSecretId = process.env.PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID;

			if (tokenSecretId) {
				if (isLocal()) {
					headers.Authorization = `Bearer ${tokenSecretId}`;
					headers.Authentication = headers.Authorization;
				} else {
					try {
						const token = await getSecretString(tokenSecretId);
						headers.Authorization = `Bearer ${token}`;
						headers.Authentication = headers.Authorization;
					} catch (err: any) {
						appContext.logger.warn(
							"Failed to read token from Secrets Manager",
							{
								secretId: tokenSecretId,
								errorName: err?.name,
								errorMessage: err?.message,
							},
						);
						// Proceed without Authorization header if token fetch fails
					}
				}
			}

			let lastError: unknown;
			for (let attempt = 1; attempt <= PAYGOV_MAX_ATTEMPTS; attempt++) {
				const controller = new AbortController();
				const timer = setTimeout(
					() => controller.abort(),
					PAYGOV_REQUEST_TIMEOUT_MS,
				);
				try {
					const result = await fetch(process.env.SOAP_URL as string, {
						method: "POST",
						headers,
						body,
						agent: httpsAgent,
						signal: controller.signal,
					});
					return await result.text();
				} catch (err) {
					const timedOut = controller.signal.aborted;
					if (!timedOut && !isRetryablePaygovError(err)) {
						throw err;
					}
					lastError = err;
					const willRetry = attempt < PAYGOV_MAX_ATTEMPTS;
					appContext.logger.warn(
						willRetry
							? "Pay.gov request failed; retrying"
							: "Pay.gov request failed; no retries remaining",
						{
							event: willRetry ? "paygov_retry" : "paygov_retry_exhausted",
							attempt,
							maxAttempts: PAYGOV_MAX_ATTEMPTS,
							errorName: err instanceof Error ? err.name : undefined,
							errorMessage: err instanceof Error ? err.message : String(err),
						},
					);
				} finally {
					clearTimeout(timer);
				}
			}
			throw lastError instanceof Error
				? lastError
				: new Error(`Pay.gov request failed: ${String(lastError)}`);
		},
		getUseCases: () => ({
			initPayment,
			processPayment,
			getDetails,
			getRecentTransactions,
			getTransactionPaymentStatus,
			getTransactionsByStatus,
		}),
		logger,
	};
};
