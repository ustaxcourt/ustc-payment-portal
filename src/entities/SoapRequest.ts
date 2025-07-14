import { XMLBuilder, XMLParser } from "fast-xml-parser";
import { RawCompleteOnlineCollectionRequest } from "../types/RawCompleteOnlineCollectionRequest";
import { RawStartOnlineCollectionRequest } from "../types/RawStartOnlineCollectionRequest";
import {
  GetRequestRequestParams,
  RawGetDetailsRequest,
} from "./GetDetailsRequest";
import { xmlOptions } from "../xmlOptions";
import { CompleteOnlineCollectionWithDetailsRequestParams } from "./CompleteOnlineCollectionWithDetailsRequest";
import { StartOnlineCollectionRequestParams } from "./StartOnlineCollectionRequest";
import { AppContext } from "../types/AppContext";

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
    requestType: RequestType
  ) {
    const xmlBody = this.buildXml(params, requestType);

    console.log("makeRequest", xmlBody);
    const result = await appContext.postHttpRequest(appContext, xmlBody);
    console.log("makeRequest", result);
    const responseBody = this.parseXml(result);
    return responseBody;
  }
}
