import { XMLBuilder, XMLParser } from "fast-xml-parser";
import { AppContext } from "../types/AppContext";

type RawStartOnlineCollectionRequest = {
  tcsAppId: string;
  token: string;
};

type CompleteOnlineCollectionResponse = {
  paygov_tracking_id: string;
};

export class CompleteOnlineCollectionRequest {
  public token: string;
  public tcsAppId: string;

  constructor(request: RawStartOnlineCollectionRequest) {
    this.tcsAppId = request.tcsAppId;
    this.token = request.token;
  }

  makeSoapRequest = async (
    appContext: AppContext
  ): Promise<CompleteOnlineCollectionResponse> => {
    return this.useHttp(appContext);
  };

  useHttp = async (
    appContext: AppContext
  ): Promise<CompleteOnlineCollectionResponse> => {
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
          <tcs_app_id>${this.tcsAppId}</tcs_app_id>
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
    ].completeOnlineCollectionResponse as CompleteOnlineCollectionResponse;
    return responseData;
  };
}
