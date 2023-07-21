import Joi from "joi";
import { XMLBuilder, XMLParser } from "fast-xml-parser";
import { RawStartOnlineCollectionRequest } from "../types/RawStartOnlineCollectionRequest";
import { AppContext } from "../types/AppContext";
import { StartOnlineCollectionResponse } from "../types/StartOnlineCollectionResponse";

export const startOnlineCollectionSchema = Joi.object({
  agencyTrackingId: Joi.string().required(),
  tcsAppId: Joi.string().required(),
  transactionAmount: Joi.number().required(),
  urlCancel: Joi.string().required(),
  urlSuccess: Joi.string().required(),
});

export class StartOnlineCollectionRequest {
  public agencyTrackingId: string;
  public transactionAmount: string;
  public tcsAppId: string;
  public urlCancel: string;
  public urlSuccess: string;
  public transactionType: string = "Sale";
  public language: string = "en";

  constructor(request: RawStartOnlineCollectionRequest) {
    this.agencyTrackingId = request.agencyTrackingId;
    this.tcsAppId = request.tcsAppId;
    this.transactionAmount = (
      Math.round(request.transactionAmount * 100) / 100
    ).toFixed(2);
    this.urlCancel = request.urlCancel;
    this.urlSuccess = request.urlSuccess;
  }

  makeSoapRequest(
    appContext: AppContext
  ): Promise<StartOnlineCollectionResponse> {
    switch (process.env.FLAG_SOAP_CLIENT) {
      case "http":
        return this.useHttp(appContext);
      case "soap":
        return this.useSoap(appContext);
      default:
        throw new Error("Invalid flag");
    }
  }

  async useSoap(
    appContext: AppContext
  ): Promise<StartOnlineCollectionResponse> {
    const client = await appContext.getSoapClient();

    return new Promise((resolve, reject) => {
      client.startOnlineCollection(
        {
          startOnlineCollectionRequest: {
            agency_tracking_id: this.agencyTrackingId,
            transaction_amount: this.transactionAmount,
            tcs_app_id: this.tcsAppId,
            url_cancel: this.urlCancel,
            url_success: this.urlSuccess,
            transaction_type: this.transactionType,
            language: this.language,
          },
        },
        (
          err: Error,
          result: {
            startOnlineCollectionResponse: {
              token: string;
            };
          }
        ) => {
          if (err) {
            reject(err);
          } else {
            resolve(
              result.startOnlineCollectionResponse as StartOnlineCollectionResponse
            );
          }
        }
      );
    });
  }

  async useHttp(
    appContext: AppContext
  ): Promise<StartOnlineCollectionResponse> {
    const xmlOptions = {
      ignoreAttributes: false,
      attributeNamePrefix: "@",
      format: true,
    };

    const startOnlineCollectionRequest = {
      tcs_app_id: this.tcsAppId,
      agency_tracking_id: this.agencyTrackingId,
      transaction_type: this.transactionType,
      transaction_amount: this.transactionAmount,
      language: this.language,
      url_success: this.urlSuccess,
      url_cancel: this.urlCancel,
    };

    const reqObj = {
      "soapenv:Envelope": {
        "soapenv:Header": {},
        "soapenv:Body": {
          "tcs:startOnlineCollection": {
            startOnlineCollectionRequest,
          },
        },
        "@xmlns:soapenv": "http://schemas.xmlsoap.org/soap/envelope/",
        "@xmlns:tcs": "http://fms.treas.gov/services/tcsonline_3_1",
      },
    };

    const builder = new XMLBuilder(xmlOptions);
    const xmlBody = builder.build(reqObj);

    const result = await appContext.postHttpRequest(appContext, xmlBody);

    const parser = new XMLParser(xmlOptions);
    const data = await result.text();
    console.log(data);
    const response = parser.parse(data);
    const tokenResponse = response["S:Envelope"]["S:Body"][
      "ns2:startOnlineCollectionResponse"
    ].startOnlineCollectionResponse as StartOnlineCollectionResponse;
    return tokenResponse;
  }
}
