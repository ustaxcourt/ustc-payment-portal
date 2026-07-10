import { APIGatewayEvent, APIGatewayProxyResult } from "aws-lambda";
import { createAppContext } from "../appContext";
import { isValidPaymentStatus } from "@useCases/getTransactionsByStatus";
import { PaymentStatusSchema } from "@schemas/PaymentStatus.schema";
import { dashboardOk, dashboardError } from "@utils/dashboardHandlerUtils";

/**
 * GET /transactions/{paymentStatus}
 * Returns up to 100 transactions filtered by payment status.
 */
export const getTransactionsByStatusHandler = async (
	event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
	const appContext = createAppContext({ lambdaRequest: event });
	const paymentStatus = event.pathParameters?.paymentStatus;
	if (!paymentStatus) {
		return dashboardError(
			400,
			"Missing required path parameter: paymentStatus",
		);
	}
	if (!isValidPaymentStatus(paymentStatus)) {
		return dashboardError(
			400,
			`Invalid paymentStatus. Expected one of: ${PaymentStatusSchema.options.join(
				", ",
			)}`,
		);
	}
	try {
		const result = await appContext
			.getUseCases()
			.getTransactionsByStatus(appContext, {
				paymentStatus: paymentStatus as "pending" | "success" | "failed",
			});
		return dashboardOk(result);
	} catch (err) {
		console.error("[Dashboard] getTransactionsByStatus error:", err);
		return dashboardError(500, "Internal server error");
	}
};
