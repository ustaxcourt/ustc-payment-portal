import type { AppContext } from "@appTypes/AppContext";
import type { RawStartOnlineCollectionRequest } from "@appTypes/RawStartOnlineCollectionRequest";
import {
	type StartOnlineCollectionResponse,
	StartOnlineCollectionResponseSchema,
} from "@schemas/StartOnlineCollectionResponse.schema";
import { type RequestType, SoapRequest } from "./SoapRequest";

export type StartOnlineCollectionRequestParams = {
	tcs_app_id: string;
	agency_tracking_id: string;
	transaction_type: string;
	transaction_amount: string;
	language: string;
	url_success: string;
	url_cancel: string;
};

export class StartOnlineCollectionRequest extends SoapRequest {
	public agencyTrackingId: string;
	public transactionAmount: string;
	public urlCancel: string;
	public urlSuccess: string;
	public transactionType: string = "Sale";
	public language: string = "en";
	private requestType: RequestType = "startOnlineCollection";

	constructor(request: RawStartOnlineCollectionRequest) {
		super(request);

		this.agencyTrackingId = request.agencyTrackingId;
		this.transactionAmount = (
			Math.round(request.transactionAmount * 100) / 100
		).toFixed(2);
		this.urlCancel = request.urlCancel;
		this.urlSuccess = request.urlSuccess;
	}

	makeSoapRequest(
		appContext: AppContext,
	): Promise<StartOnlineCollectionResponse> {
		return this.useHttp(appContext);
	}

	async useHttp(
		appContext: AppContext,
	): Promise<StartOnlineCollectionResponse> {
		const params: StartOnlineCollectionRequestParams = {
			tcs_app_id: this.tcsAppId,
			agency_tracking_id: this.agencyTrackingId,
			transaction_type: this.transactionType,
			transaction_amount: this.transactionAmount,
			language: this.language,
			url_success: this.urlSuccess,
			url_cancel: this.urlCancel,
		};

		const responseBody = await SoapRequest.prototype.makeRequest(
			appContext,
			params,
			this.requestType,
		);

		if (responseBody["ns2:startOnlineCollectionResponse"]) {
			const raw =
				responseBody["ns2:startOnlineCollectionResponse"]
					.startOnlineCollectionResponse;
			const parsed = StartOnlineCollectionResponseSchema.safeParse(raw);
			if (!parsed.success) {
				// Do not log `raw` — the token is session-equivalent and may be present
				// even when validation fails. Log only the length for diagnostics.
				const tokenLength =
					typeof raw?.token === "string" ? raw.token.length : null;
				appContext.logger.error(
					"startOnlineCollection schema validation failed",
					{ tokenLength, errors: parsed.error.issues },
				);
				throw parsed.error;
			}
			return parsed.data;
		}

		throw this.handleFault(responseBody["S:Fault"]);
	}
}
