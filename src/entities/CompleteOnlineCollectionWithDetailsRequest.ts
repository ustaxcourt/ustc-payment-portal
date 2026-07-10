import type { AppContext } from "@appTypes/AppContext";
import type { RawCompleteOnlineCollectionRequest } from "@appTypes/RawCompleteOnlineCollectionRequest";
import { type RequestType, SoapRequest } from "./SoapRequest";
import {
	type CompleteOnlineCollectionWithDetailsResponse,
	CompleteOnlineCollectionWithDetailsResponseSchema,
} from "@schemas/CompleteOnlineCollectionWithDetailsResponse.schema";

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
				console.error(
					"completeOnlineCollectionWithDetails schema validation failed",
					JSON.stringify({ raw, errors: parsed.error.issues }),
				);
				throw parsed.error;
			}
			return parsed.data;
		} else {
			throw this.handleFault(responseBody["S:Fault"]);
		}
	};
}
