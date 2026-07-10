import { XMLBuilder, XMLParser } from "fast-xml-parser";
import type { RawCompleteOnlineCollectionRequest } from "@appTypes/RawCompleteOnlineCollectionRequest";
import type { RawStartOnlineCollectionRequest } from "@appTypes/RawStartOnlineCollectionRequest";
import type {
	GetRequestRequestParams,
	RawGetDetailsRequest,
} from "./GetDetailsRequest";
import { xmlOptions } from "../xmlOptions";
import type { CompleteOnlineCollectionWithDetailsRequestParams } from "./CompleteOnlineCollectionWithDetailsRequest";
import type { StartOnlineCollectionRequestParams } from "./StartOnlineCollectionRequest";
import type { AppContext } from "@appTypes/AppContext";
import { FailedTransactionError } from "@errors/failedTransaction";

export type RawSoapRequest =
	| RawStartOnlineCollectionRequest
	| RawCompleteOnlineCollectionRequest
	| RawGetDetailsRequest;

export type RequestParams =
	| CompleteOnlineCollectionWithDetailsRequestParams
	| StartOnlineCollectionRequestParams
	| GetRequestRequestParams;

export type RequestType =
	| "getDetails"
	| "startOnlineCollection"
	| "completeOnlineCollectionWithDetails"
	| "completeOnlineCollection";

export class SoapRequest {
	public tcsAppId: string;

	constructor(request: RawSoapRequest) {
		this.tcsAppId = request.tcsAppId;
	}

	buildXml(params: RequestParams, requestType: RequestType): string {
		const outerKey = `tcs:${requestType}`;
		const innerKey = `${requestType}Request`;

		const formattedRequest = {
			[outerKey]: {
				[innerKey]: params,
			},
		};

		const respObj = {
			"soapenv:Envelope": {
				"soapenv:Header": {},
				"soapenv:Body": formattedRequest,
				"@xmlns:tcs": "http://fms.treas.gov/services/tcsonline_3_3",
				"@xmlns:soapenv": "http://schemas.xmlsoap.org/soap/envelope/",
			},
		};

		const builder = new XMLBuilder(xmlOptions);
		return builder.build(respObj);
	}

	parseXml(xml: string) {
		const parser = new XMLParser(xmlOptions);
		const response = parser.parse(xml);
		return response["S:Envelope"]["S:Body"];
	}

	async makeRequest(
		appContext: AppContext,
		params: RequestParams,
		requestType: RequestType,
	) {
		const xmlBody = this.buildXml(params, requestType);

		appContext.logger.debug("Sending Pay.gov SOAP request", { requestType });
		const result = await appContext.postHttpRequest(appContext, xmlBody);
		const responseBody = this.parseXml(result);
		return responseBody;
	}

	handleFault(fault: ProcessorFault): FailedTransactionError {
		if (!fault) {
			return new FailedTransactionError(
				"Unexpected response from Pay.gov: no fault detail returned",
			);
		}

		if (!fault.detail || !fault.detail["ns2:TCSServiceFault"]) {
			return new FailedTransactionError(
				"Pay.gov returned a fault without error details",
			);
		}

		return new FailedTransactionError(
			fault.detail["ns2:TCSServiceFault"].return_detail,
			Number(fault.detail["ns2:TCSServiceFault"].return_code),
		);
	}
}

type ProcessorFault =
	| {
			faultcode: string;
			faultstring: string;
			detail?: {
				"ns2:TCSServiceFault"?: {
					return_code: string;
					return_detail: string;
				};
			};
	  }
	| undefined;
