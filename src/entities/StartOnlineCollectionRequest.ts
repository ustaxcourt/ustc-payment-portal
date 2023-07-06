import Joi from 'joi';
import { XMLBuilder, XMLParser } from "fast-xml-parser";
import { RawStartOnlineCollectionRequest } from "../types/RawStartOnlineCollectionRequest";
import { AppContext } from "../types/AppContext";
import { StartOnlineCollectionResponse } from "../types/StartOnlineCollectionResponse";

export const startOnlineCollectionSchema = Joi.object({
  agency_tracking_id: Joi.string().required(),
  tcs_app_id: Joi.string().required(),
  transaction_amount: Joi.number().required(),
  url_cancel: Joi.string().required(),
  url_success: Joi.string().required(),
})

export class StartOnlineCollectionRequest {
  public agency_tracking_id: string;
  public transaction_amount: string;
  public tcs_app_id: string;
  public url_cancel: string;
  public url_success: string;
  public transaction_type: string = "Sale";
  public language: string = "en";

  constructor(request: RawStartOnlineCollectionRequest) {
    this.agency_tracking_id = request.agency_tracking_id;
    this.tcs_app_id = request.tcs_app_id;
    this.transaction_amount = (
      Math.round(request.transaction_amount * 100) / 100
    ).toFixed(2);
    this.url_cancel = request.url_cancel;
    this.url_success = request.url_success;
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
        throw "Invalid flag";
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
            agency_tracking_id: this.agency_tracking_id,
            transaction_amount: this.transaction_amount,
            tcs_app_id: this.tcs_app_id,
            url_cancel: this.url_cancel,
            url_success: this.url_success,
            transaction_type: this.transaction_type,
            language: this.language,
          },
        },
        function (
          err: Error,
          result: {
            startOnlineCollectionResponse: {
              token: string;
            };
          }
        ) {
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
      tcs_app_id: this.tcs_app_id,
      agency_tracking_id: this.agency_tracking_id,
      transaction_type: this.transaction_type,
      transaction_amount: this.transaction_amount,
      language: this.language,
      url_success: this.url_success,
      url_cancel: this.url_cancel,
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
        "@xmlns:tcs": "http://fms.treas.gov/services/tcsonline_3_1"
      },
    };

    const builder = new XMLBuilder(xmlOptions);
    const xmlBody = builder.build(reqObj);

    const result = await appContext.postHttpRequest(appContext, xmlBody);

    console.log(result);
    const parser = new XMLParser(xmlOptions);
    const data = await result.text();
    // console.log(data);

    const response = parser.parse(data);
    console.log(response["S:Envelope"]);
    const tokenResponse = response["S:Envelope"]["S:Body"][
      "ns2:startOnlineCollectionResponse"
    ]["startOnlineCollectionResponse"] as StartOnlineCollectionResponse;
    console.log(tokenResponse);
    return tokenResponse;
  }
}
