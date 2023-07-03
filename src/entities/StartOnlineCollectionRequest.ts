import { XMLBuilder, XMLParser } from "fast-xml-parser";
import fetch from "node-fetch";
import { RawStartOnlineCollectionRequest } from "../types/RawStartOnlineCollectionRequest";
import { AppContext } from "../types/AppContext";
import { StartOnlineCollectionResponse } from "../types/StartOnlineCollectionResponse";

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
    const httpsAgent = appContext.getHttpsAgent();
    // const extraInformation = {
    //   account_holder_name: "Cindy Dillow",
    //   billing_address: "653 General Early Drive",
    //   billing_address2: "abc",
    //   billing_city: "Llanfairpwllgwyngyllgogerychwyrndr",
    //   billing_state: "IL",
    //   billing_zip: "25425",
    //   billing_country: "890",
    //   email_address: "cdillow@ains.com",
    // };

    const startOnlineCollectionRequest = {
      tcs_app_id: this.tcs_app_id,
      agency_tracking_id: this.agency_tracking_id,
      transaction_type: this.transaction_type,
      transaction_amount: this.transaction_amount,
      language: this.language,
      url_success: "https://google.com", // this.url_success,
      url_cancel: "https://amazon.com", // this.url_cancel,
      // ...extraInformation,
    };

    const reqObj = {
      "soapenv:Envelope": {
        "soapenv:Header": {},
        "soapenv:Body": {
          "tcs:startOnlineCollection": {
            startOnlineCollectionRequest,
            // "@xmlns:ns2": "http://fms.treas.gov/services/tcsonline",
          },
        },
        "@xmlns:soapenv": "http://schemas.xmlsoap.org/soap/envelope/",
        "@xmlns:tcs": "http://fms.treas.gov/services/tcsonline",
      },
    };

    const builder = new XMLBuilder(xmlOptions);
    const xmlBody = builder.build(reqObj);

    console.log(process.env.SOAP_URL)
    console.log(xmlBody);

    const result = await fetch(process.env.SOAP_URL, {
      agent: httpsAgent,
      method: "POST",
      headers: {
        "Content-type": "application/soap+xml",
      },
      body: xmlBody,
    });

    console.log(result);
    const parser = new XMLParser(xmlOptions);
    const data = await result.text();
    console.log(data);

    const response = parser.parse(data);
    const tokenResponse = response["S:Envelope"]["S:Body"][
      "ns2:startOnlineCollectionResponse"
    ]["startOnlineCollectionResponse"] as StartOnlineCollectionResponse;
    console.log(tokenResponse);
    return tokenResponse;
  }
}
