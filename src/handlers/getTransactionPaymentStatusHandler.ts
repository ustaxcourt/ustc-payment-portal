import { dashboardError, dashboardOk } from "@utils/dashboardHandlerUtils";
import type { APIGatewayEvent, APIGatewayProxyResult } from "aws-lambda";
import { createAppContext } from "../appContext";

/**
 * GET /transaction-payment-status
 * Returns aggregated counts per payment status.
 */
export const getTransactionPaymentStatusHandler = async (
	event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
	const appContext = createAppContext({ lambdaRequest: event });
	try {
		const result = await appContext
			.getUseCases()
			.getTransactionPaymentStatus(appContext);
		return dashboardOk(result);
	} catch (err) {
		console.error("[Dashboard] getTransactionPaymentStatus error:", err);
		return dashboardError(500, "Internal server error");
	}
};
