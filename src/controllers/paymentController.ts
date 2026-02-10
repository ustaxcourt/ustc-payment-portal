import {
  Body,
  Controller,
  Get,
  Path,
  Post,
  Route,
  Security,
  SuccessResponse,
  Response,
  Tags,
} from "tsoa";
import { createAppContext } from "../appContext";
import {
  InitPaymentRequest,
  InitPaymentResponse,
  ProcessPaymentRequest,
  ProcessPaymentResponse,
  GetDetailsResponse,
  ErrorResponse,
} from "./types";

const appContext = createAppContext();

@Route("")
@Tags("Payments")
export class PaymentController extends Controller {
  /**
   * Creates a new payment session with Pay.gov and returns a redirect URL for the user to complete payment.
   * @summary Initialize a payment
   */
  @Post("init")
  @Security("ApiKeyAuth")
  @SuccessResponse(200, "Payment initialized successfully")
  @Response<ErrorResponse>(400, "Invalid request payload")
  @Response<ErrorResponse>(401, "Unauthorized - invalid or missing API key")
  @Response<ErrorResponse>(500, "Internal server error")
  public async initPayment(
    @Body() request: InitPaymentRequest
  ): Promise<InitPaymentResponse> {
    const result = await appContext
      .getUseCases()
      .initPayment(appContext, request);
    return result;
  }

  /**
   * Completes a payment transaction after the user has authorized it on Pay.gov. Returns the transaction status and tracking information.
   * @summary Process a payment
   */
  @Post("process")
  @Security("ApiKeyAuth")
  @SuccessResponse(200, "Payment processed (check transactionStatus for result)")
  @Response<ErrorResponse>(400, "Invalid request payload")
  @Response<ErrorResponse>(401, "Unauthorized - invalid or missing API key")
  @Response<ErrorResponse>(500, "Internal server error")
  public async processPayment(
    @Body() request: ProcessPaymentRequest
  ): Promise<ProcessPaymentResponse> {
    const result = await appContext
      .getUseCases()
      .processPayment(appContext, request);
    return result as ProcessPaymentResponse;
  }

  /**
   * Retrieves the current status and details of a payment transaction by its tracking ID.
   * @summary Get transaction details
   */
  @Get("details/{appId}/{payGovTrackingId}")
  @Security("ApiKeyAuth")
  @SuccessResponse(200, "Transaction details retrieved successfully")
  @Response<ErrorResponse>(400, "Invalid request - missing required parameters")
  @Response<ErrorResponse>(401, "Unauthorized - invalid or missing API key")
  @Response<ErrorResponse>(404, "Transaction not found")
  @Response<ErrorResponse>(500, "Internal server error")
  public async getDetails(
    @Path() appId: string,
    @Path() payGovTrackingId: string
  ): Promise<GetDetailsResponse> {
    const result = await appContext
      .getUseCases()
      .getDetails(appContext, { appId, payGovTrackingId });
    return result;
  }
}
