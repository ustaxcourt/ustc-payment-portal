# Accessibility Guidelines
USTC Payment Portal

This document outlines accessibility expectations for systems that integrate with, or rely on, the **USTC Payment Portal**. Although the portal itself is not a user‑facing application, its behavior has direct downstream effects on citizen-facing applications. These guidelines ensure accessibility is upheld across redirect flows, error handling, and integration points.

---

## 1. Scope

The Payment Portal:

- **Does not render user-facing UI**, forms, or screens.
- **Does not collect payment details**; Pay.gov provides the payment interface.
- **Does influence user experiences** through:
  - Redirect URLs
  - Error-handling flows
  - Timing and reliability of the payment journey
  - Integration requirements for USTC applications

This document sets expectations for making the full payment flow accessible, including components outside this repository.

---

## 2. Accessibility Standards

Partner systems integrating with the Payment Portal **must comply** with:

- **WCAG 2.1 AA** accessibility guidelines
- **Section 508** (if applicable to your environment)
- USTC accessibility policies for public‑facing services

While the Portal does not handle UI rendering, upstream applications that initiate payment flows **must** ensure:

- Accessible UI for initiating payments
- Accessible UI for handling success/cancel returns
- Clear instructions, feedback, and error-recovery states
- Keyboard navigability
- Proper ARIA usage when appropriate
- No reliance solely on color or complex gestures

---

## 3. Redirect Flow Accessibility

Since the Portal provides redirect URLs that lead users to Pay.gov:

### A. Success & Cancel Routes
Your application must ensure:

- Success and cancel landing pages are **fully accessible**, including:
  - Clear headings
  - Operable without a mouse
  - Understandable instructions
  - Screen‑reader compatibility

- **Focus management**:
  When the user returns from Pay.gov, keyboard focus should move to a reasonable starting point (e.g., main heading).

- **Accessible notification patterns**:
  - Use semantic alerts (e.g., `role="alert"`) where appropriate.
  - Describe the payment result in text, not only with visuals.

### B. URL Structure
The Portal will append query parameters on return. Your application must:

- Parse them in a way that does **not** break screen reader navigation.
- Avoid exposing confusing or overly technical error messages.
- Provide a clear, human-readable summary of the outcome.

---

## 4. Error Handling & Messaging

Because the Portal returns structured API errors, client-facing UIs must:

- Convert **machine-readable error codes** into **plain‑language messages**
- Avoid exposing internal system details or correlation IDs to users
- Provide accessible remediation steps (e.g., “Try again later”, “Contact support”)

Examples:

| Portal Error | Accessible User Message |
|--------------|-------------------------|
| `DOWNSTREAM_ERROR` | “We’re having trouble communicating with the payment processor. Please try again shortly.” |
| `VALIDATION_ERROR` | “We couldn’t start the payment. Please check the information and try again.” |
| `CONFLICT` | “This payment request has already been processed.” |

Ensure that all visible error messages:

- Are announced by screen readers
- Use semantic markup (e.g., `<p role="alert"> … </p>`)
- Provide next steps

---

## 5. Focus & Timing Considerations

### A. Avoid Forced Timeouts
The Portal does not time out user flows, but Pay.gov sessions might.
Your application should:

- Provide clear messaging if the user returns after a timeout
- Not automatically redirect without giving users adequate time to understand context

### B. Progressive Disclosure
Don’t overload the user with unnecessary technical details; expose only what they need.

---

## 6. Logs, Diagnostics, and Accessibility

Although logs are not user-facing, accessibility considerations apply when logs are used to **power support staff tools**. Systems consuming portal logs must:

- Avoid displaying raw tokens, secrets, or overly technical content
- Provide concise, human-readable summaries for support personnel
- Be compatible with assistive technologies used by internal staff (e.g., screen readers)

---

## 7. Testing Requirements

Before releasing changes to applications that interact with the Portal, teams should:

- Test success and cancel routes with:
  - Keyboard-only navigation
  - Screen readers (NVDA/JAWS/VoiceOver)
  - High-contrast display modes
  - Zoom/magnification tools

- Validate:
  - All messages are read correctly by screen readers
  - Focus is placed in predictable, meaningful locations
  - No essential information is conveyed solely by color

- Confirm the entire payment flow is operational with:
  - **USTC Pay Test Server**
    https://github.com/ustaxcourt/ustc-pay-gov-test-server

---

## 8. Roles & Responsibilities

### A. Payment Portal Maintainers
- Provide stable, predictable redirect behaviors
- Ensure consistent API error formats
- Document changes that may affect user‑facing UIs
- Avoid introducing new user-visible states without notifying integrators

### B. Integrating Applications
- Provide accessible UIs for initiating payments
- Provide accessible UIs for handling post‑redirect flows
- Translate Portal errors into user-safe messages
- Ensure full WCAG 2.1 AA compliance

---

## 9. Continuous Improvement

Accessibility should be revisited whenever:

- The payment flow changes
- API fields change in a way that affects user-visible outcomes
- Success/cancel sequences gain new logic
- Error codes or messages are added
- New features introduce new states or redirects

Teams should continuously evaluate the end-to-end user journey from an accessibility perspective.

---

## 10. Feedback & Contact

If you identify accessibility issues:

1. For UI or flow issues in your application:
   → Use your internal issue tracker.

2. For redirect behavior, Portal API issues, or unclear documentation:
   → Open a **Documentation Update** or **Bug Report** in the repository.

3. For any accessibility concern related to Pay.gov:
   → Contact Pay.gov support through their official channels.

---

## Thank You

Accessibility is a continuous, shared effort.
Ensuring inclusive experiences for every user is fundamental to all services that rely on the Payment Portal.
