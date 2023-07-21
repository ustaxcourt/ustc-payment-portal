import { XMLBuilder, XMLParser } from "fast-xml-parser";
import { AppContext } from "../types/AppContext";

type RawStartOnlineCollectionRequest = {
  tcs_app_id: string;
  token: string;
};

type CompleteOnlineCollectionResponse = {
  paygov_tracking_id: string;
};

export class CompleteOnlineCollectionRequest {
  public token: string;
  public tcs_app_id: string;

  constructor(request: RawStartOnlineCollectionRequest) {
    this.tcs_app_id = request.tcs_app_id;
    this.token = request.token;
  }

  makeSoapRequest(
    appContext: AppContext
  ): Promise<CompleteOnlineCollectionResponse> {
    switch (process.env.FLAG_SOAP_CLIENT) {
      case "http":
        return this.useHttp(appContext);
      case "soap":
        return this.useSoap(appContext);
      default:
        throw `Invalid FLAG_SOAP_CLIENT: (${process.env.FLAG_SOAP_CLIENT})`;
    }
  }

  async useSoap(
    appContext: AppContext
  ): Promise<CompleteOnlineCollectionResponse> {
    const client = await appContext.getSoapClient();

    return new Promise((resolve, reject) => {
      client.completeOnlineCollection(
        {
          completeOnlineCollectionRequest: {
            tcs_app_id: this.tcs_app_id,
            token: this.token,
          },
        },
        function (
          err: Error,
          result: {
            completeOnlineCollectionResponse: {
              paygov_tracking_id: string;
            };
          }
        ) {
          if (err) {
            reject(err);
          } else {
            resolve(result.completeOnlineCollectionResponse);
          }
        }
      );
    });
  }

  async useHttp(
    appContext: AppContext
  ): Promise<CompleteOnlineCollectionResponse> {
    const xmlOptions = {
      ignoreAttributes: false,
      attributeNamePrefix: "@",
      format: true,
    };

    const xmlBody = `
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tcs="http://fms.treas.gov/services/tcsonline_3_1">
  <soapenv:Header />
  <soapenv:Body>
    <tcs:completeOnlineCollection>
      <completeOnlineCollectionRequest>
        <tcs_app_id>${this.tcs_app_id}</tcs_app_id>
        <token>${this.token}</token>
      </completeOnlineCollectionRequest>
    </tcs:completeOnlineCollection>
  </soapenv:Body>
</soapenv:Envelope>`;

    const result = await appContext.postHttpRequest(appContext, xmlBody);

    const parser = new XMLParser(xmlOptions);
    const data = await result.text();
    console.log(data);

    const response = parser.parse(data);
    const responseData = response["S:Envelope"]["S:Body"][
      "ns2:completeOnlineCollectionResponse"
    ]["completeOnlineCollectionResponse"] as CompleteOnlineCollectionResponse;
    return responseData;
  }
}
