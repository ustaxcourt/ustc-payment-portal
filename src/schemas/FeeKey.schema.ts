import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// Extend Zod with OpenAPI support
extendZodWithOpenApi(z);

export const FeeKeySchema = z
	.enum(["PETITION_FILING_FEE", "NONATTORNEY_EXAM_REGISTRATION_FEE"])
	.openapi({
		description:
			"The stable fee identifier sent by the client. Available fee keys:\n\n" +
			"- `PETITION_FILING_FEE`: Filing fee for petitions in DAWSON ($60)\n" +
			"- `NONATTORNEY_EXAM_REGISTRATION_FEE`: Registration fee for nonattorney examination\n\n" +
			"Fee amounts are determined by the Payment Portal based on the fee key. " +
			"See the API documentation for more details on fee authorization and supported fees.",
		example: "PETITION_FILING_FEE",
	});

export type FeeKey = z.infer<typeof FeeKeySchema>;
