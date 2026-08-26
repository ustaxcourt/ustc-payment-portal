import type { AppContext } from "@appTypes/AppContext";
import type { ClientPermission } from "@appTypes/ClientPermission";
import type {
  ValidateClientRequest,
  ValidateClientResponse,
} from "@schemas/ValidateClient.schema";

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
 *
 * Fee validation lands in PAY-439 Phase 3. Until then this returns the registered
 * set as-is, which is already enough to confirm the caller's credentials resolve.
 */
export const validateClient: ValidateClient = async (_appContext, { client }) => {
  return {
    clientName: client.clientName,
    allowedFeeKeys: client.allowedFeeKeys,
  };
};
