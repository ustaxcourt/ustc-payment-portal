Here’s a fun, narrative-style story that includes **DAWSON** (the U.S. Tax Court’s electronic filing and case management system) and the **USTC Payment Portal** you’re working with. Let's keep it light, imaginative, and grounded in real facts about DAWSON and how the payment system works.

***

# 📘 *“The Case of the Missing Filing Fee”*

*A short story featuring DAWSON and the USTC Payment Portal*

Mickey Mouse rubbed his eyes and blinked at the DAWSON dashboard glowing on his monitor. Ever since the U.S. Tax Court launched **DAWSON — the Docket Access Within a Secure Online Network** — back in 2020, it had become the beating heart of the Court’s electronic filing and case management world. It handled petitions, filings, docket searches, and housed decades of opinions and orders in a clean, modern interface. [\[irs.gov\]](https://www.irs.gov/pub/irs-ccdm/cc-2021-002.pdf)

But tonight, it was missing something important.

A *filing fee.*

Somewhere out there, a petitioner had successfully uploaded documents to DAWSON, received their brand‑new docket number, and then… abandoned ship right before paying the required petition filing fee. The docket showed the petition, the attached documents, even a clean timestamp. But the payment status glared back at him:

> **Payment: Pending (No Completed Transaction Found)**

Mickey sighed. Time to put the **USTC Payment Portal** to work.

***

## 🔄 A Journey Through the API

DAWSON itself wasn’t built to handle payments directly. It handled **documents, cases, and filings** — the legal guts of the process — but fees required a secure, Pay.gov–linked workflow. That’s where the **USTC Payment Portal API** came in: a shared backend service designed to handle payment initialization, redirects to Pay.gov, finalization, and status verification.

It was the perfect companion.

Mickey clicked the “Reconcile Payment” button inside DAWSON, which quietly performed a `GET /details/{appId}/{transactionReferenceId}` call under the hood. The Payment Portal checked for any completed transactions tied to the petitioner’s unique reference ID. If Pay.gov had a result, it would pull it in. If not, the status would remain *Pending* until the petitioner completed the checkout flow.

Tonight, the API returned:

```json
{
  "paymentStatus": "Pending",
  "transactions": []
}
```

Not great — but not unsalvageable.

***

## 🧭 Following the Trail

Mickey imagined the petitioner sitting at home, with a half‑finished payment screen open. Perhaps they got distracted. Maybe their card rejected. Maybe their dog needed dinner.

Luckily, DAWSON had already created the petition and stored the docket number. And the USTC Payment Portal had already created a Pay.gov session token, just waiting to be redeemed.

He copied the **paymentRedirect** URL from the prior `/init` call and crafted a reminder message:

> “Your petition is awaiting payment. Please return to the payment page to complete the filing process.”

He hit send.

***

## 💳 Completing the Loop

An hour later, DAWSON lit up with a new log entry.

The petitioner had clicked the link. Pay.gov had processed their credit card. The **USTC Payment Portal’s** `/process` endpoint received the callback token and verified the transaction. Finally, DAWSON polled the payment details again:

```json
{
  "paymentStatus": "Success",
  "transactions": [
    {
      "transactionStatus": "Success",
      "paymentMethod": "Credit/Debit Card",
      "returnDetail": "Transaction completed successfully"
    }
  ]
}
```

A satisfying green badge appeared on the docket:

> **Paid in Full**

Mickey leaned back in his chair, smiling. For all its complexity — the filings, the metadata, the cross‑system coordination — it worked. DAWSON managed the legal half. The USTC Payment Portal managed the financial half. Together they formed a seamless pipeline from petition to payment, just as the Tax Court intended when DAWSON modernized its electronic filing system starting in late 2020. [\[library.law.unc.edu\]](https://library.law.unc.edu/2025/10/using-dawson-to-access-federal-tax-court-records/)

Another case saved.
Another petitioner helped.
Another tiny victory for a smooth government tech system.

Mickey closed his laptop for the night.

***

## Want another story?

I can write one in a different tone — humorous, dramatic, sci‑fi, noir, or even as a courtroom comedy. Just tell me the style!
