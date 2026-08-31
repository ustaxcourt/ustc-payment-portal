/**
 * Types and accessors for the Pay.gov TCS return code reference. The data
 * itself (`payGovReturnCodes`) lives in ./constants.ts.
 */

import { payGovReturnCodes } from "./constants";

export type ReturnCodeTransactionStatus =
  | "Received"
  | "Success"
  | "Cancelled"
  | "PartialAuth"
  | "Failed"
  | "Retired"
  | "Settled";

export interface ReturnCode {
  returnCode: number;
  returnDetail: string;
  transactionStatus: ReturnCodeTransactionStatus | null;
}

type ReturnCodeDetails = Omit<ReturnCode, "returnCode">;

export interface PayGovReturnCodes {
  [returnCode: number]: ReturnCodeDetails;
}

/**
 * All return codes as full `ReturnCode` records, in ascending return_code order.
 */
export const getAllReturnCodes = (): ReturnCode[] =>
  Object.entries(payGovReturnCodes)
    .map(([returnCode, details]) => ({
      returnCode: Number(returnCode),
      ...details,
    }))
    .sort((a, b) => a.returnCode - b.returnCode);

/**
 * Looks up a single return code, or `undefined` if it's not in the reference table.
 */
export const getReturnCode = (returnCode: number): ReturnCode | undefined => {
  const details = payGovReturnCodes[returnCode];
  return details ? { returnCode, ...details } : undefined;
};
