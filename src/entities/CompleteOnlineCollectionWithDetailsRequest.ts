import { XMLParser } from "fast-xml-parser";
import { AppContext } from "../types/AppContext";
import { CompleteOnlineCollectionRequest } from "./CompleteOnlineCollectionRequest";
import { TransactionStatus } from "../types/TransactionStatus";
import { RawCompleteOnlineCollectionRequest } from "../types/RawCompleteOnlineCollectionRequest";

type CompleteOnlineCollectionWithDetailsResponse = {
  paygov_tracking_id: string;
  transaction_status: TransactionStatus;
  agency_tracking_id: string;
  transaction_amount: string;
};

export class CompleteOnlineCollectionWithDetailsRequest extends CompleteOnlineCollectionRequest {
  public token: string;
  public tcsAppId: string;

  constructor(request: RawCompleteOnlineCollectionRequest) {
    super(request);
    this.tcsAppId = request.tcsAppId;
    this.token = request.token;
  }

  makeSoapRequest = async (
    appContext: AppContext
  ): Promise<CompleteOnlineCollectionWithDetailsResponse> => {
    switch (process.env.FLAG_SOAP_CLIENT) {
      case "http":
        return this.useHttp(appContext);
      case "soap":
        return this.useSoap(appContext);
      default:
        throw new Error(
          `Invalid FLAG_SOAP_CLIENT: (${process.env.FLAG_SOAP_CLIENT})`
        );
    }
  };

  useSoap = async (
    appContext: AppContext
  ): Promise<CompleteOnlineCollectionWithDetailsResponse> => {
    const client = await appContext.getSoapClient();

    return new Promise((resolve, reject) => {
      client.completeOnlineCollectionWithDetails(
        {
          completeOnlineCollectionWithDetailsRequest: {
            tcsAppId: this.tcsAppId,
            token: this.token,
          },
        },
        (
          err: Error,
          result: {
            completeOnlineCollectionWithDetailsResponse: {
              paygov_tracking_id: string;
              transaction_status: TransactionStatus;
              agency_tracking_id: string;
              transaction_amount: string;
            };
          }
        ) => {
          if (err) {
            reject(err);
          } else {
            resolve(result.completeOnlineCollectionWithDetailsResponse);
          }
        }
      );
    });
  };

  useHttp = async (
    appContext: AppContext
  ): Promise<CompleteOnlineCollectionWithDetailsResponse> => {
    const xmlOptions = {
      ignoreAttributes: false,
      attributeNamePrefix: "@",
      format: true,
    };

    const xmlBody = `
  <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tcs="http://fms.treas.gov/services/tcsonline_3_1">
    <soapenv:Header />
    <soapenv:Body>
      <tcs:completeOnlineCollectionWithDetails>
        <completeOnlineCollectionWithDetailsRequest>
          <tcs_app_id>${this.tcsAppId}</tcs_app_id>
          <token>${this.token}</token>
        </completeOnlineCollectionWithDetailsRequest>
      </tcs:completeOnlineCollectionWithDetails>
    </soapenv:Body>
  </soapenv:Envelope>`;

    const result = await appContext.postHttpRequest(appContext, xmlBody);

    const parser = new XMLParser(xmlOptions);
    const data = await result.text();
    console.log(data);

    const response = parser.parse(data);
    const responseData = response["S:Envelope"]["S:Body"][
      "ns2:completeOnlineCollectionWithDetailsResponse"
    ]
      .completeOnlineCollectionWithDetailsResponse as CompleteOnlineCollectionWithDetailsResponse;
    return responseData;
  };
}
