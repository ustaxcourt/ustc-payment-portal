import type { AppContext } from "@appTypes/AppContext";
import type { ClientPermission } from "@appTypes/ClientPermission";
import type {
  ValidateClientRequest,
  ValidateClientResponse,
} from "@schemas/ValidateClient.schema";
import { getActiveFee } from "../config/fees";
import { FeeNotFoundError } from "@errors/feeNotFound";
import { ForbiddenError } from "@errors/forbidden";

/**
 * Single message for every fee-registration problem — a `*` wildcard, an empty
 * set, or a key that does not resolve. The status code is the diagnostic here:
 * a 403 from this function means the fees registered to the client are wrong,
 * as distinct from a 403 from API Gateway (signing/account) or from
 * `getClientByRoleArn` (role ARN not registered).
 */
export const MISCONFIGURED_FEES_MESSAGE =
  "Forbidden - authorized Fees was misconfigured.";

export type ValidateClient = (
  appContext: AppContext,
  params: {
    client: ClientPermission;
    request: ValidateClientRequest;
  },
) => Promise<ValidateClientResponse>;

/**
 * Confirms a client's registration before they go live on Prod.
 *
 * Reaching this function at all already proves a good deal: API Gateway accepted
 * the SigV4 signature, the caller's account is in the API resource policy, and
 * `lambdaHandler` resolved the signing role to a registered entry in the
 * client-permissions secret. Everything before this point is authentication; what
 * remains is confirming the fees registered to the client are real.
 *
 * `authorizeClient` is deliberately not used here. It answers "may this client use
 * this one fee", which needs a fee to ask about — this request carries none — and it
 * treats a `*` wildcard as a pass, the opposite of what this endpoint must do.
 */
export const validateClient: ValidateClient = async (appContext, { client }) => {
  const { clientName, allowedFeeKeys } = client;

  // Checked before the loop: `*` is not a fee key, so it would otherwise fall
  // through to `getActiveFee` and be reported as an unresolved key. Note that a
  // LOCAL_DEV caller is granted `["*"]`, and so is rejected here by design.
  if (allowedFeeKeys.includes("*")) {
    appContext.logger.info("Client registered with wildcard fee permission", {
      clientName,
    });
    throw new ForbiddenError(MISCONFIGURED_FEES_MESSAGE);
  }

  // A client that can pay for nothing is not correctly registered — catching
  // that before go-live is the point of this endpoint.
  if (allowedFeeKeys.length === 0) {
    appContext.logger.info("Client registered with no fee keys", {
      clientName,
    });
    throw new ForbiddenError(MISCONFIGURED_FEES_MESSAGE);
  }

  for (const feeKey of allowedFeeKeys) {
    try {
      // No date argument: the question is whether the registration is valid
      // today, not what a historical transaction was charged.
      getActiveFee(feeKey);
    } catch (err) {
      // An unknown key, or one whose only version has yet to activate, is a bad
      // registration — the client's problem to fix, hence 403. A
      // `FeeConfigurationError` is a malformed entry in our own fee config, so it
      // propagates untouched and `handleError` turns it into a generic 500.
      if (err instanceof FeeNotFoundError) {
        appContext.logger.info("Client registered with unresolvable fee key", {
          clientName,
          feeKey,
        });
        throw new ForbiddenError(MISCONFIGURED_FEES_MESSAGE);
      }
      throw err;
    }
  }

  return {
    clientName,
    allowedFeeKeys,
  };
};
