/**
 * Mock tracking ID generator for testing purposes.
 * @returns string - A mock tracking ID in the format "TRK{18 random alphanumeric chars}" with a total length of 21 characters.
 */
export const mockTrackingId = () => {
  const prefix = "TRK";
  const length = 18;

  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

  let randomPart = "";
  for (let i = 0; i < length; i++) {
    const index = Math.floor(Math.random() * chars.length);
    randomPart += chars[index];
  }

  return `${prefix}${randomPart}`;
};
