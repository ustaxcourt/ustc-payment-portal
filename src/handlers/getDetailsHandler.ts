import { APIGatewayEvent, APIGatewayProxyResult } from "aws-lambda";
import { lambdaHandler } from "./lambdaHandler";
import { GetDetailsPathParamsSchema } from "@schemas/GetDetails.schema";
import { getDetails } from "@useCases/getDetails";

export const getDetailsHandler = (
	event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
	const transactionReferenceId = event.pathParameters?.transactionReferenceId;
	const rawRequest = JSON.stringify({
		transactionReferenceId: transactionReferenceId || null,
	});

	return lambdaHandler({
		schema: GetDetailsPathParamsSchema,
		event,
		rawRequest,
		callback: getDetails,
	});
};
