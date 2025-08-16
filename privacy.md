# Privacy Policy — Signal Sight (Chrome Extension)

**Effective date:** 2025-08-16  
**Last updated:** 2025-08-16

Signal Sight (“we,” “our,” or “us”) is a Chrome extension that generates a clean, on-device report of your CodeSignal assessment results. This policy explains what information the extension accesses, how it is used, and your choices.

---

## Overview

- **No account required. No personal data collected.**  
  The extension does not ask for or collect names, emails, or other personally identifiable information.

- **On-device only.**  
  Parsing of CodeSignal pages happens locally in your browser. By default, parsed content and settings remain on your device and are not transmitted to us.

- **No ads. No tracking.**  
  We do not run analytics, tracking pixels, or behavioral profiling.

- **Payments handled by a third party.**  
  Licensing and payments are handled by **ExtensionPay** (and its payment processor, e.g., Stripe). We do not receive your payment card data.

---

## What the Extension Accesses

The extension operates only on CodeSignal pages you visit and uses Chrome permissions to function:

### Host access (CodeSignal domains)
- **Why:** To read the already-rendered assessment information (status, scores, timing, etc.) so we can display a consolidated report.
- **Scope:** Limited to CodeSignal domains (e.g., `codesignal.com` and subdomains) as configured in the extension manifest.
- **How:** Read-only access to page content in your active tab. No keylogging, no network interception.

### `activeTab`
- **Why:** To interact with the currently open CodeSignal tab at your request (e.g., when you open the popup).
- **How:** Grants temporary access to the active tab you initiate actions on; it does not allow reading your browsing history.

### `storage`
- **Why:** To store lightweight preferences (e.g., UI settings) and, optionally, a **local cache** of parsed assessment data for faster rendering.
- **Scope:** Stored only on your device (Chrome storage). You can clear this at any time (see “Your Choices”).

> **We do not collect:**  
> Names, emails, passwords, authentication tokens, payment card numbers, browsing history, keystrokes, or location data.

---

## Payments & Licensing

We use **ExtensionPay** to manage licensing and payments. When you purchase or activate a license:
- The extension may contact ExtensionPay’s servers to verify license status.
- Any payment information (e.g., card number) is entered into and processed by the payment processor (e.g., Stripe) **directly**; we do not receive or store your card details.
- The extension stores only what is necessary to remember your license status on your device (e.g., a non-personal license flag or token).

Please review the third parties’ policies for details:
- ExtensionPay: https://extensionpay.com/home  
- Stripe: https://stripe.com/privacy

---

## Data Sharing & Sale

- **We do not sell, rent, or trade personal information.**  
- **We do not share data with advertisers or data brokers.**  
- Limited data exchanges occur only for **license verification** with ExtensionPay. We do not transmit your assessment content to our own servers.

---

## Children’s Privacy

Signal Sight is not directed to children under 13. We do not knowingly collect personal information from children.

---

## Security

- All processing is performed locally in your browser where possible.  
- For licensing, network requests are made over HTTPS to trusted payment/licensing endpoints.  
- We do not maintain backend servers that store user data.

---

## Your Choices

- **Disable or remove the extension:** At any time via `chrome://extensions`.  
- **Clear local data:** In Chrome, you can remove extension data by removing/reinstalling the extension or clearing site/extension storage.  
- **Opt out of purchase:** If you do not purchase a license, the extension will not unlock paid features, but no personal information is collected regardless.

---

## International Transfers

We do not run servers for this product. Payment and license verification may be processed by third parties that operate globally; their privacy policies govern any associated transfers.

---

## Changes to This Policy

We may update this policy to reflect product, legal, or operational changes. Material changes will be reflected by an updated “Effective date.” Continued use after changes constitutes acceptance.

---

## Contact

Questions or concerns? Reach us at:  
**Email:** support@extramedium.dev  
*(Replace with your preferred contact method if you fork or rebrand this project.)*
