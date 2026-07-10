import { APIGatewayProxyResult } from "aws-lambda";

export const getDashboardCorsHeaders = () => {
	const origin = process.env.DASHBOARD_ALLOWED_ORIGIN;
	if (!origin) {
		throw new Error("DASHBOARD_ALLOWED_ORIGIN env var is required but not set");
	}
	return {
		"Access-Control-Allow-Origin": origin,
		"Access-Control-Allow-Methods": "GET,OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type",
	};
};

export const dashboardOk = (body: unknown): APIGatewayProxyResult => ({
	statusCode: 200,
	headers: { "Content-Type": "application/json", ...getDashboardCorsHeaders() },
	body: JSON.stringify(body),
});

export const dashboardError = (
	statusCode: number,
	message: string,
): APIGatewayProxyResult => ({
	statusCode,
	headers: { "Content-Type": "application/json", ...getDashboardCorsHeaders() },
	body: JSON.stringify({ message }),
});
