# Project-specific Square backend: required before taking live payments

The frontend now keeps the selected `projectId` and signed agreement separate for each website. The existing deployed `square-subscriptions` Supabase Edge Function is **not provided in this ZIP**, so its behavior has not been changed. Do not assume the new checkout works until the server is updated and tested.

## Required Edge Function contract

For `create-checkout`, accept `{action:'create-checkout',projectId,agreementId,planKey,returnUrl}`. Authenticate with Supabase JWT. Fetch `portal_website_projects` server-side and require `user_id = auth.uid()` and `status = 'awaiting_payment'`. Fetch `portal_project_agreements` server-side and require the same user/project ID, `acknowledged = true`, and exact agreement version `2026-10-14-project-v1`. Map `website-development` to one-time $100, `standard-monthly` to $20 monthly and `backend-monthly` to $30 monthly. Never accept client-supplied amounts. Create a new checkout with the verified project/user/purpose association stored securely in a **server-owned** database table or Square metadata. Prevent one website's checkout from being assigned to another. Return `{checkoutUrl, checkoutId, projectId, agreementId, purpose}` where purpose is `development`, `standard`, or `backend` (the frontend checks for the kind used to initiate checkout).

For `verify-checkout`, accept `{action:'verify-checkout',checkoutId,projectId,purpose}` (purpose `development` or `hosting`). Fetch the server-owned checkout record and confirm authenticated user, project ID, purpose, plan and verified Square payment state. For hosting, confirm the actual subscription is active. Return `{verified:boolean,projectId,purpose}`. Never trust user-editable `portal_project_purchase_drafts` or session IDs as payment proof.

**Current frontend:** for hosting checkout `create-checkout` expects the returned `purpose` to be the original plan kind (`standard` or `backend`); `verify-checkout` expects logical purpose `hosting`. Backend must map both consistently.

Other changes: enforce idempotency to avoid accidental duplicate charges, handle Square return/webhooks, protect checkout records using server-only writes and authenticated reads, and allow independent subscriptions/cancellation per project. Store a durable versioned PDF/HTML copy of the signed agreement and timestamps before production use.

Run `PROJECT_PURCHASE_SETUP.sql` once in Supabase SQL Editor. Replace only the corresponding web files. Test with two separate draft websites/accounts and a test Square environment before enabling live charges.

## Optional codes in the onboarding popup

The payment popup now accepts a code separately for development and hosting. Applying a code stages it in memory; it does not change prices or mark a payment verified. `create-checkout` includes optional `promoCode`. The backend must validate the code for the authenticated user, project, agreement, payment purpose and selected plan, calculate the amount server-side, and create the discounted Square checkout. Reject invalid/expired/ineligible codes without creating a checkout. Return `promoCodeAccepted: true` only when the code has actually been applied to the returned checkout. The frontend will not open a coded checkout without that acknowledgment. Requests without a code retain the existing contract. Clients can enter a different code before opening another checkout. Each checkout must keep its own server-validated code and amount.

This repository does not contain the deployed Edge Function; its code validation and response support must be deployed separately before live code redemption works.

## Repeated checkout links

The onboarding popup requests a fresh `create-checkout` link on every payment click, even if other unpaid checkouts exist. Every attempt opens in a new tab; opening a link never marks it paid. The popup stores all attempt IDs in the project draft's `checkoutHistory` and verifies earlier links as well as the latest. Old drafts with only `checkoutSessions` remain supported. A valid verified payment from any recorded attempt satisfies the step, and its reference/receipt is used for confirmation. The backend must retain each attempt's user/project/purpose association when creating a later link. Idempotency should cover retries of the same server request without treating an unpaid checkout as a permanent lock on new attempts.
