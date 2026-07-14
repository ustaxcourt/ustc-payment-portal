export const xmlOptions = {
	ignoreAttributes: false,
	attributeNamePrefix: "@",
	format: true,
	// Pay.gov tracking ids contain whitespace; trimming corrupts the round-trip.
	trimValues: false,
};
