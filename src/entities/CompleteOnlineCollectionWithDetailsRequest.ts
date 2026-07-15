import type { AppContext } from "@appTypes/AppContext";
import type { RawCompleteOnlineCollectionRequest } from "@appTypes/RawCompleteOnlineCollectionRequest";
import {
	type CompleteOnlineCollectionWithDetailsResponse,
	CompleteOnlineCollectionWithDetailsResponseSchema,
} from "@schemas/CompleteOnlineCollectionWithDetailsResponse.schema";
import { type RequestType, SoapRequest } from "./SoapRequest";

export type CompleteOnlineCollectionWithDetailsRequestParams = {
	tcs_app_id: string;
	token: string;
};

export class CompleteOnlineCollectionWithDetailsRequest extends SoapRequest {
	public token: string;
	private requestType: RequestType = "completeOnlineCollectionWithDetails";

	constructor(request: RawCompleteOnlineCollectionRequest) {
		super(request);
		this.token = request.token;
	}

	makeSoapRequest = async (
		appContext: AppContext,
	): Promise<CompleteOnlineCollectionWithDetailsResponse> => {
		return this.useHttp(appContext);
	};

	useHttp = async (
		appContext: AppContext,
	): Promise<CompleteOnlineCollectionWithDetailsResponse> => {
		const params: CompleteOnlineCollectionWithDetailsRequestParams = {
			tcs_app_id: this.tcsAppId,
			token: this.token,
		};
		const responseBody = await SoapRequest.prototype.makeRequest(
			appContext,
			params,
			this.requestType,
		);

		if (responseBody["ns2:completeOnlineCollectionWithDetailsResponse"]) {
			const raw =
				responseBody["ns2:completeOnlineCollectionWithDetailsResponse"]
					.completeOnlineCollectionWithDetailsResponse;
			const parsed =
				CompleteOnlineCollectionWithDetailsResponseSchema.safeParse(raw);
			if (!parsed.success) {
				// Pay.gov's CompleteOnlineCollectionWithDetails response does not contain PCI data — payment_type is
				// a string like "ACH"/"PLASTIC_CARD" and tracking IDs are server-side
				// identifiers, not cardholder data. If that ever changes, redact before logging.
				appContext.logger.error(
					"completeOnlineCollectionWithDetails schema validation failed",
					{ raw, errors: parsed.error.issues },
				);
				throw parsed.error;
			}
			return parsed.data;
		} else {
			throw this.handleFault(responseBody["S:Fault"]);
		}
	};
}
