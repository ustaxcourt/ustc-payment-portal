/**
 * This file is the home for business-logic constants shared across multiple modules.
 * Keep values here stable and well-documented.
 */

import type { PayGovReturnCodes } from "./payGovReturnCodes";

export const MAX_TOKEN_AGE_MS = 10800000; // 3 Hours in MS, Token TTL per Pay.gov Documentation

/**
 * Pay.gov TCS return code reference, transcribed from Pay.gov's TCS Interface
 * Specification "Return Codes" section (ranges 1000-5000).
 *
 * Notes on transcription decisions:
 * - `auth_response_code` is intentionally omitted; we don't use it.
 * - The 6000 (batch) range is omitted: those rows describe a `batch_status`
 *   value, not `transaction_status`, and we don't process batch codes yet.
 * - The doc spells the cancellation status "Canceled" (one L); normalized here
 *   to "Cancelled" to match `PayGovTransactionStatus` in ../types/TransactionStatus.ts.
 * - return_code 4019 is listed twice in the doc for two unrelated conditions
 *   (an agency/app lookup failure, and a duplicate-batch failure). Combined
 *   into one entry below since a return_code can only map to one record here;
 *   note the duplicate-batch case actually returns transaction_status
 *   "Batch Failed", not "Failed".
 * - return_code 4144 was printed twice in the doc with identical text; kept
 *   once.
 */
export const payGovReturnCodes: PayGovReturnCodes = {
  // Return Code 1000 Range
  1001: {
    returnDetail:
      "Successful submission of ACH Debit. ACH transactions will stay in the Received status until Pay.gov gets the status update file from the Debit Gateway the next day.",
    transactionStatus: "Received",
  },
  1002: {
    returnDetail:
      "Successful submission of ACH Prenotification. ACH transactions will stay in the Received status until Pay.gov gets the status update file from the Debit Gateway the next day.",
    transactionStatus: "Received",
  },
  1003: {
    returnDetail: "Successful submission of ACH CancelTransaction",
    transactionStatus: "Cancelled",
  },
  1004: {
    returnDetail:
      "Successful submission of ACH Refund. ACH transactions will stay in the Received status until Pay.gov gets the status update file from the Debit Gateway the next day.",
    transactionStatus: "Received",
  },

  // Return Code 2000 Range
  2001: {
    returnDetail: "Successful submission of PC Auth",
    transactionStatus: "Success",
  },
  2002: {
    returnDetail: "Successful submission of PC Sale",
    transactionStatus: "Success",
  },
  2003: {
    returnDetail: "Successful submission of PC Force",
    transactionStatus: "Success",
  },
  2004: {
    returnDetail: "Successful submission of PC Refund",
    transactionStatus: "Success",
  },
  2005: {
    returnDetail: "Successful submission of PC CancelTransaction",
    transactionStatus: "Cancelled",
  },
  2006: {
    returnDetail: "Successful submission of PC PIN Less debit",
    transactionStatus: "Success",
  },
  2007: {
    returnDetail: "Successful submission of partial PC Auth",
    transactionStatus: "PartialAuth",
  },
  2009: {
    returnDetail: "Successful submission of create billing account request",
    transactionStatus: null,
  },
  2010: {
    returnDetail:
      "Successful submission of create access code request containing no email address",
    transactionStatus: null,
  },
  2011: {
    returnDetail: "Successful submission of cancel access code request",
    transactionStatus: null,
  },
  2012: {
    returnDetail:
      "Successful submission of create access code request containing an email address",
    transactionStatus: null,
  },
  2013: {
    returnDetail: "Successful submission of create bill request",
    transactionStatus: null,
  },
  2014: {
    returnDetail: "Successful submission of cancel bill request",
    transactionStatus: null,
  },
  2015: {
    returnDetail:
      "Successful submission of create bill request where another bill existed for this Agency Tracking ID and it was overlayed",
    transactionStatus: null,
  },
  2016: {
    returnDetail: "Successful submission of resent access code request",
    transactionStatus: null,
  },
  2017: {
    returnDetail: "Successful submission of recurring PC Sale",
    transactionStatus: "Success",
  },
  2018: {
    returnDetail: "Successful submission of deferred PC Sale",
    transactionStatus: "Success",
  },
  2019: {
    returnDetail: "Token was generated successfully",
    transactionStatus: null,
  },
  2020: {
    returnDetail: "Payment was successful",
    transactionStatus: "Received",
  },
  2021: {
    returnDetail: "Successful void of a recurring schedule",
    transactionStatus: "Cancelled",
  },
  2022: {
    returnDetail:
      "Successful submission of a Pay.gov Hosted Collection Pages authorization transaction",
    transactionStatus: "Success",
  },
  2023: {
    returnDetail:
      "Successful force of a Pay.gov Hosted Collection Pages transaction",
    transactionStatus: "Success",
  },
  2024: {
    returnDetail:
      "Successful submission of a Pay.gov Hosted Collection Pages sale transaction",
    transactionStatus: "Success",
  },

  // Return Code 3000 Range
  3001: {
    returnDetail:
      "The card has been declined; the transaction will not be processed.",
    transactionStatus: "Failed",
  },
  3002: {
    returnDetail: "ACH transaction has failed",
    transactionStatus: "Failed",
  },
  3003: {
    returnDetail: "ACH transaction has been retired.",
    transactionStatus: "Retired",
  },
  3004: {
    returnDetail: "ACH transaction settled",
    transactionStatus: "Settled",
  },
  3005: {
    returnDetail:
      "Payment was not completed because the user chose not to continue",
    transactionStatus: "Cancelled",
  },
  3006: {
    returnDetail:
      "The Pay.gov Hosted Collection Pages authorization transaction has been declined by the payment provider. Enter dollar amount $104.17 to trigger a Failed transaction status",
    transactionStatus: "Failed",
  },
  3007: {
    returnDetail:
      "The Pay.gov Hosted Collection Pages authorization could not be forced, the payment provider declined the transaction",
    transactionStatus: "Failed",
  },
  3008: {
    returnDetail: "The card has been declined; invalid PIN",
    transactionStatus: "Failed",
  },
  3009: {
    returnDetail: "The card has been declined; number of PIN attempts exceeded",
    transactionStatus: "Failed",
  },

  // Return Code 4000 Range
  4002: {
    returnDetail:
      "The request originated from an IP address not allowed by the agency application. [IP address supplied]",
    transactionStatus: "Failed",
  },
  4003: {
    returnDetail:
      "The agency and application supplied in the request do not support TCS.",
    transactionStatus: "Failed",
  },
  4004: {
    returnDetail:
      "The certificate user does not have proper access to the agency application supplied in the request",
    transactionStatus: "Failed",
  },
  4007: {
    returnDetail: "Invalid or missing transaction data",
    transactionStatus: "Failed",
  },
  4010: {
    returnDetail: "Pay.gov tracking ID does not exist.",
    transactionStatus: "Failed",
  },
  4011: {
    returnDetail: "Agency tracking ID does not exist.",
    transactionStatus: "Failed",
  },
  4012: {
    returnDetail: "Invalid transaction amount.",
    transactionStatus: "Failed",
  },
  4013: {
    returnDetail:
      "Invalid total installments. For Hosted Collection Pages, returned if a recurring payment schedule (weekly, biweekly, etc.) is specified but installments only = 1.",
    transactionStatus: "Failed",
  },
  4018: {
    returnDetail: "Invalid order tax amount.",
    transactionStatus: "Failed",
  },
  4019: {
    returnDetail:
      'No agency application found for given agency_id and tcs_app_id. / Batch failed because it was a potential duplicate batch and was not reprocessed (that case returns transaction_status "Batch Failed", not "Failed").',
    transactionStatus: "Failed",
  },
  4020: {
    returnDetail: "The application does not support payment type",
    transactionStatus: "Failed",
  },
  4022: {
    returnDetail: "The selected ACH Debit authorization cannot be canceled.",
    transactionStatus: "Failed",
  },
  4028: {
    returnDetail:
      "If payment type is prenotification, payment amount must be zero.",
    transactionStatus: "Failed",
  },
  4031: {
    returnDetail:
      "Agency application {0} does not support recurring ACH Debit payments. For Hosted Collection Pages, the cash flow application does not support recurring ACH payments, but the request has a payment frequency other than One Time, or a number of installments is specified.",
    transactionStatus: "Failed",
  },
  4032: {
    returnDetail:
      "There is not enough account data to complete the transaction",
    transactionStatus: "Failed",
  },
  4033: {
    returnDetail:
      "The application does not accept credit cards or the transaction exceeds the maximum daily limit for credit card transactions. The transaction will not be processed.",
    transactionStatus: "Failed",
  },
  4034: {
    returnDetail:
      "Please enter a different payment date. The payment date must be no earlier than tomorrow's date and must be within three years of the submission date.",
    transactionStatus: "Failed",
  },
  4035: {
    returnDetail:
      "Please enter a different payment date. The payment date must not be within two days and must be within three years of the submission date.",
    transactionStatus: "Failed",
  },
  4036: {
    returnDetail:
      "Please enter a different payment date. The payment date must not be within three days and must be within three years of the submission date.",
    transactionStatus: "Failed",
  },
  4037: {
    returnDetail:
      "Please enter a different payment date. The payment date must not be within four days and must be within three years of the submission date.",
    transactionStatus: "Failed",
  },
  4038: {
    returnDetail:
      "Please enter a different payment date. The payment date must not be within two days and must be within three years of the submission date.",
    transactionStatus: "Failed",
  },
  4039: {
    returnDetail:
      "Please enter a different payment date. The payment date must not be within three days and must be within three years of the submission date.",
    transactionStatus: "Failed",
  },
  4040: {
    returnDetail:
      "Please enter a different payment date. The payment date must be no earlier than tomorrow's date and must be within three years of the submission date.",
    transactionStatus: "Failed",
  },
  4041: {
    returnDetail:
      "Please enter a different payment date. The payment date must not be within two days and must be within three years of the submission date.",
    transactionStatus: "Failed",
  },
  4042: {
    returnDetail:
      "Please enter a different payment date. The payment date must not be within two days and must be within three years of the submission date.",
    transactionStatus: "Failed",
  },
  4043: {
    returnDetail:
      "Please enter a different payment date. The payment date selected is on a federal holiday, Saturday, or Sunday.",
    transactionStatus: "Failed",
  },
  4044: {
    returnDetail:
      "Please enter a different payment date. The payment date must not be within five days and must be within three years of the submission date.",
    transactionStatus: "Failed",
  },
  4045: {
    returnDetail:
      "The system cannot process your request. The transaction is detected as a duplicate collection.",
    transactionStatus: "Failed",
  },
  4046: {
    returnDetail:
      "Invalid value supplied for account number or routing transit number.",
    transactionStatus: "Failed",
  },
  4047: {
    returnDetail:
      "Force or refund amount exceeded authorized amount or the refund amount exceeded remainder amount.",
    transactionStatus: "Failed",
  },
  4048: {
    returnDetail: "Collection cannot be forced.",
    transactionStatus: "Failed",
  },
  4049: {
    returnDetail: "Refund for this transaction type is not allowed.",
    transactionStatus: "Failed",
  },
  4051: {
    returnDetail:
      "The value supplied for the agency_tracking_id is not unique.",
    transactionStatus: "Failed",
  },
  4054: {
    returnDetail:
      "For the account_number supplied, the value supplied for card_security_code is invalid.",
    transactionStatus: "Failed",
  },
  4058: {
    returnDetail:
      "The value supplied for transaction_amount exceeds the system limit for an individual payment",
    transactionStatus: "Failed",
  },
  4059: {
    returnDetail:
      "The number of items exceeds the maximum limit for a BatchWithResults request",
    transactionStatus: "Failed",
  },
  4060: {
    returnDetail:
      "The number of items exceeds the maximum limit for a BatchWithoutResults request",
    transactionStatus: "Failed",
  },
  4061: {
    returnDetail: "No data found for search criteria entered",
    transactionStatus: "Failed",
  },
  4062: {
    returnDetail:
      "A business name or first and last name is required when submitting this transaction type.",
    transactionStatus: "Failed",
  },
  4063: {
    returnDetail:
      "When an agency tracking ID is included in the request for this transaction type, it must match the agency tracking ID of the referenced transaction.",
    transactionStatus: "Failed",
  },
  4064: {
    returnDetail:
      "The transaction amount supplied with the cancel transaction request must match the transaction amount of the original transaction.",
    transactionStatus: "Failed",
  },
  4066: {
    returnDetail: "Account type is invalid.",
    transactionStatus: "Failed",
  },
  4067: {
    returnDetail:
      "Account type is valid but not supported by the agency application.",
    transactionStatus: "Failed",
  },
  4068: {
    returnDetail: "Required custom field missing.",
    transactionStatus: "Failed",
  },
  4069: {
    returnDetail:
      "The Pay.gov tracking ID supplied in the request is not associated with the application supplied in the request.",
    transactionStatus: "Failed",
  },
  4070: {
    returnDetail:
      "You can no longer perform a void because this transaction has already been sent for settlement. If you wish, you may choose to issue a refund. Please initiate a new search to find the transaction available for refund.",
    transactionStatus: "Failed",
  },
  4071: {
    returnDetail: "An ACH prenotification may not be canceled.",
    transactionStatus: "Failed",
  },
  4072: {
    returnDetail:
      "Card security code is a required field. Please provide a value for this entry and resubmit your transaction.",
    transactionStatus: "Failed",
  },
  4073: {
    returnDetail:
      "The force failed because the authorization is over thirty days",
    transactionStatus: "Failed",
  },
  4074: {
    returnDetail:
      "The transaction_type Refund without tracking ID is not supported by the supplied application.",
    transactionStatus: "Failed",
  },
  4075: {
    returnDetail: "The payment amount is invalid. Please try again.",
    transactionStatus: "Failed",
  },
  4076: {
    returnDetail: "The refund amount is invalid. Please try again.",
    transactionStatus: "Failed",
  },
  4077: {
    returnDetail: "This application is not set up to support payment options.",
    transactionStatus: "Failed",
  },
  4078: {
    returnDetail:
      "Applications set up to support recurring payments must include a payment frequency in the request.",
    transactionStatus: "Failed",
  },
  4079: {
    returnDetail:
      "One-time payments must not contain the number of installments.",
    transactionStatus: "Failed",
  },
  4080: {
    returnDetail:
      "Application does not support deferred payments. Payment date is not an allowed parameter. This applies even if the date is valid, such as the next business day.",
    transactionStatus: "Failed",
  },
  4081: {
    returnDetail:
      "Application does not support recurring payments; number_of_installments is not an allowed parameter.",
    transactionStatus: "Failed",
  },
  4082: {
    returnDetail:
      "Application does not support recurring payments; payment frequency must be OneTime",
    transactionStatus: "Failed",
  },
  4083: {
    returnDetail:
      "Payment date must be a valid ACH payment date. For Hosted Collection Pages Recurring ACH Payments, the payment_frequency is One Time but the payment_date is not a valid business day.",
    transactionStatus: "Failed",
  },
  4084: {
    returnDetail:
      "Applications set up to support deferred payments must include these payment options in the TCS ACH debit request: payment frequency and a valid payment date.",
    transactionStatus: "Failed",
  },
  4085: {
    returnDetail:
      "This transaction cannot be refunded because it has not been sent for settlement yet.",
    transactionStatus: "Failed",
  },
  4086: {
    returnDetail:
      "This transaction has multiple cards associated with it and cannot be partially forced or refunded via TCS.",
    transactionStatus: "Failed",
  },
  4087: {
    returnDetail:
      "Plastic card authorization cannot be canceled because it is too old.",
    transactionStatus: "Failed",
  },
  4088: {
    returnDetail:
      "The authorization cannot be canceled or forced because it is for $0.00.",
    transactionStatus: "Failed",
  },
  4089: {
    returnDetail:
      "The authorization cannot be canceled because it has already been forced or canceled.",
    transactionStatus: "Failed",
  },
  4090: {
    returnDetail: "Billing account does not exist",
    transactionStatus: null,
  },
  4091: {
    returnDetail: "Access code cannot be cancelled because it does not exist.",
    transactionStatus: null,
  },
  4093: {
    returnDetail:
      "Create billing account request failed because billing account already exists.",
    transactionStatus: null,
  },
  4094: {
    returnDetail: "Too many requests.",
    transactionStatus: null,
  },
  4095: {
    returnDetail:
      "Bill was not created because a completed bill with the same Agency Tracking ID was found within the same agency.",
    transactionStatus: null,
  },
  4096: {
    returnDetail:
      "Bill was not created because another transaction with the same Agency Tracking ID was found within the same agency.",
    transactionStatus: null,
  },
  4097: {
    returnDetail:
      "Bill cannot be canceled because it does not exist for the application or is not in the proper state.",
    transactionStatus: null,
  },
  4099: {
    returnDetail: "Billing account or dataflow ID does not exist.",
    transactionStatus: null,
  },

  // Return Code 4100 Range
  4100: {
    returnDetail: "Attachment is too large.",
    transactionStatus: null,
  },
  4101: {
    returnDetail: "File type of attachment is not supported.",
    transactionStatus: null,
  },
  4102: {
    returnDetail:
      "Access code cannot be canceled because it has been activated.",
    transactionStatus: null,
  },
  4103: {
    returnDetail:
      "Access code cannot be canceled because it has been deactivated.",
    transactionStatus: null,
  },
  4104: {
    returnDetail:
      "Access code cannot be canceled because it has been canceled.",
    transactionStatus: null,
  },
  4105: {
    returnDetail:
      "Access code cannot be canceled because it was created too long ago.",
    transactionStatus: null,
  },
  4106: {
    returnDetail: "Access code cannot be resent because it does not exist.",
    transactionStatus: null,
  },
  4107: {
    returnDetail: "Access code cannot be resent because it has been activated.",
    transactionStatus: null,
  },
  4108: {
    returnDetail:
      "Access code cannot be resent because it has been deactivated.",
    transactionStatus: null,
  },
  4109: {
    returnDetail: "Access code cannot be resent because it has been canceled.",
    transactionStatus: null,
  },
  4110: {
    returnDetail:
      "Access code cannot be resent because it was created too long ago.",
    transactionStatus: null,
  },
  4111: {
    returnDetail:
      "Access code cannot be resent because it has no email address.",
    transactionStatus: null,
  },
  4112: {
    returnDetail:
      "Bill was not created because a pending bill with the same Agency Tracking ID was found.",
    transactionStatus: null,
  },
  4113: {
    returnDetail:
      "Bill was not created because a paid bill with the same Agency Tracking ID was found within the same agency.",
    transactionStatus: null,
  },
  4114: {
    returnDetail: "Bill cannot be canceled because it was already paid.",
    transactionStatus: null,
  },
  4115: {
    returnDetail: "Invalid value for the billing_zip for the country provided.",
    transactionStatus: null,
  },
  4116: {
    returnDetail: "No payment options are supported by this application.",
    transactionStatus: null,
  },
  4117: {
    returnDetail:
      "Token does not exist, has been acted upon already, or is too old and be acted upon.",
    transactionStatus: null,
  },
  4118: {
    returnDetail:
      "Agency application does not support recurring plastic card payments.",
    transactionStatus: "Failed",
  },
  4119: {
    returnDetail:
      "Please enter a different payment date. The payment date must be no earlier than today's date and must be within 30 days of the submission date.",
    transactionStatus: "Failed",
  },
  4120: {
    returnDetail:
      "Please enter a different number of installments. The value entered exceeds the number of installments allowed for a plastic card payment.",
    transactionStatus: "Failed",
  },
  4121: {
    returnDetail:
      "A payment date must be specified for recurring plastic card payments.",
    transactionStatus: "Failed",
  },
  4122: {
    returnDetail:
      "All installments in the schedule of payments you are attempting to cancel have already been completed.",
    transactionStatus: "Failed",
  },
  4123: {
    returnDetail:
      "Agency application does not support deferred payments. For Hosted Collection Pages Recurring ACH Payments, the payment-date or allow_date_change was specified in the request, even though deferred payments are not supported.",
    transactionStatus: "Failed",
  },
  4124: {
    returnDetail:
      "The Pay.gov Tracking ID value provided is invalid or not associated with a recurring plastic card schedule.",
    transactionStatus: "Failed",
  },
  4125: {
    returnDetail: "The force request failed, incorrect or invalid formatting.",
    transactionStatus: "Failed",
  },
  4126: {
    returnDetail: "Card number is not allowed in the same field.",
    transactionStatus: "Failed",
  },
  4127: {
    returnDetail:
      "The supplied transaction type is not supported for this interface.",
    transactionStatus: "Failed",
  },
  4128: {
    returnDetail:
      "The supplied transaction type is not supported for this interface.",
    transactionStatus: "Failed",
  },
  4129: {
    returnDetail:
      "Bill was not created because a virus was detected in the attachment.",
    transactionStatus: "Failed",
  },
  4130: {
    returnDetail:
      "Bill was not created because the file scanning service is unavailable.",
    transactionStatus: "Failed",
  },
  4131: {
    returnDetail: "The EMV data is invalid",
    transactionStatus: "Failed",
  },
  4132: {
    returnDetail:
      "The required field {Missing Field} is missing from the EMV data.",
    transactionStatus: "Failed",
  },
  4133: {
    returnDetail: "The Magnetic Stripe Data is invalid.",
    transactionStatus: "Failed",
  },
  4134: {
    returnDetail:
      "The required field {Missing Field} is missing from the Magnetic Stripe Data.",
    transactionStatus: "Failed",
  },
  4135: {
    returnDetail: "The Account Holder Name is invalid",
    transactionStatus: "Failed",
  },
  4136: {
    returnDetail: "The application does not support Retail transactions.",
    transactionStatus: "Failed",
  },
  4137: {
    returnDetail:
      "Bill was not created because the sum of line item dollar amounts does not match the bill total dollar amount",
    transactionStatus: "Failed",
  },
  4138: {
    returnDetail:
      "Bill was not created because the custom line item field {CLIF_NAME} does not exist for this agency application or is not active",
    transactionStatus: "Failed",
  },
  4139: {
    returnDetail:
      "Bill was not created because the custom line item field {CLIF_NAME} does not allow a null or empty value",
    transactionStatus: "Failed",
  },
  4140: {
    returnDetail:
      "Bill was not created because the custom line item field {CLIF_NAME} does not allow the requested value",
    transactionStatus: "Failed",
  },
  4141: {
    returnDetail:
      "Bill was not created because a custom bill field does not allow a null or empty label",
    transactionStatus: "Failed",
  },
  4142: {
    returnDetail:
      "Bill was not created because the header comment {HEADER_NAME} does not exist for this agency application or is not active",
    transactionStatus: "Failed",
  },
  4143: {
    returnDetail:
      "Bill was not created because the footer comment {HEADER_NAME} does not exist for this agency application or is not active",
    transactionStatus: "Failed",
  },
  4144: {
    returnDetail:
      "Bill was not created because the bill logo {LOGO_NAME} does not exist for this agency or is not active",
    transactionStatus: "Failed",
  },
  4145: {
    returnDetail:
      "Bill was not created because a line item with an overridden amount was missing an override reason",
    transactionStatus: "Failed",
  },
  4146: {
    returnDetail:
      "Bill was not closed and replaced because no pending bills existed with this agency tracking ID",
    transactionStatus: "Failed",
  },
  4147: {
    returnDetail:
      "Bill was not closed and replaced because multiple pending bills existed with this agency tracking ID",
    transactionStatus: "Failed",
  },
  4148: {
    returnDetail:
      "Bill was not closed and replaced because the existing bill could not be updated to an overlayed status",
    transactionStatus: "Failed",
  },
  4149: {
    returnDetail:
      "Bill was not created because the required custom line item field {CLIF_NAME} was missing",
    transactionStatus: "Failed",
  },
  4150: {
    returnDetail:
      "Bill was not created because the bill total dollar amount is not within the allowed range of $0.00 to $999,999.99",
    transactionStatus: "Failed",
  },
  4151: {
    returnDetail:
      "Bill was not created because the line item dollar amount is not within the allowed range of $0.00 to $999,999.99",
    transactionStatus: "Failed",
  },
  4153: {
    returnDetail:
      "Used for Hosted Collection Pages service. The payment type selected in the payment_type element is not allowed for the application",
    transactionStatus: "Failed",
  },
  4154: {
    returnDetail:
      "Used for Hosted Collection Pages service. The transaction type is not allowed for the payment type value in the payment_type element. Returned if a payment_frequency, number_of_installments, or payment_date is specified when the payment_type is other than ACH.",
    transactionStatus: "Failed",
  },
  4155: {
    returnDetail:
      "Used for Hosted Collection Pages service. Application is not set up to accept at least one of the custom collection fields in this request. (Custom collection fields must be set up in the cash flow application's configuration before they can be used.)",
    transactionStatus: "Failed",
  },
  4156: {
    returnDetail:
      "The funding source CREDIT is not allowed for the payment type x where x is anything other than PayPal.",
    transactionStatus: "Failed",
  },
  4158: {
    returnDetail:
      "Value of expected_bill_total differs from bill amount in Pay.gov. Replacement bill not created.",
    transactionStatus: "Failed",
  },
  4159: {
    returnDetail:
      "Used for Hosted Collection Pages service. Number of installments is required if the payment frequency is more than One Time. Returned if the payment-frequency is not One Time and the number of installments is not specified in the request.",
    transactionStatus: "Failed",
  },
  4160: {
    returnDetail:
      "Used for Hosted Collection Pages Recurring ACH Payments. ONE_TIME payment cannot exceed 1 installment. Returned if payment_frequency equals ONE_TIME in the request but the number_of_installments is greater than 1.",
    transactionStatus: "Failed",
  },

  // Return Code 5000 Range
  5000: {
    returnDetail: "General exception encountered",
    transactionStatus: "Failed",
  },
  5001: {
    returnDetail:
      "Database error with message: {0} / Unable to communicate with Payment Provider at this time",
    transactionStatus: "Failed",
  },
  5002: {
    returnDetail:
      "Failed to retrieve the transaction data from {0} with query {1}. / Payment Provider unable to process request at this time",
    transactionStatus: "Failed",
  },
  5003: {
    returnDetail:
      "System error with message: {0}. / Initial Error with Payment Provider interface",
    transactionStatus: "Failed",
  },
  5004: {
    returnDetail:
      "Failed to generate response with error: {0} / Payment profile is not in a valid state",
    transactionStatus: "Failed",
  },
  5005: {
    returnDetail:
      "General database exception encountered / Payment account is not in a valid state",
    transactionStatus: "Failed",
  },
  5006: {
    returnDetail: "Unable to process the request at this time",
    transactionStatus: "Failed",
  },
  5007: {
    returnDetail: "Invalid Payment Account confirmation process called",
    transactionStatus: "Failed",
  },
  5008: {
    returnDetail: "TCS App, Profile and Payment account IDs do not match",
    transactionStatus: "Failed",
  },
  5009: {
    returnDetail: "PayGov token is not found or expired",
    transactionStatus: "Failed",
  },
  5010: {
    returnDetail: "Billing Agreement has been canceled",
    transactionStatus: "Failed",
  },
  5011: {
    returnDetail: "Input values for {Attribute} are invalid",
    transactionStatus: "Failed",
  },
};
