# Project-specific Square backend: required before taking live payments

The frontend now keeps the selected `projectId` and signed agreement separate for each website. The existing deployed `square-subscriptions` Supabase Edge Function is **not provided in this ZIP**, so its behavior has not been changed. Do not assume the new checkout works until the server is updated and tested.

## Required Edge Function contract

For `create-checkout`, accept `{action:'create-checkout',projectId,agreementId,planKey,returnUrl}`. Authenticate with Supabase JWT. Fetch `portal_website_projects` server-side and require `user_id = auth.uid()` and `status = 'awaiting_payment'`. Fetch `portal_project_agreements` server-side and require the same user/project ID, `acknowledged = true`, and exact agreement version `2026-10-14-project-v1`. Map `website-development` to one-time $100, `standard-monthly` to $20 monthly and `backend-monthly` to $30 monthly. Never accept client-supplied amounts. Create a new checkout with the verified project/user/purpose association stored securely in a **server-owned** database table or Square metadata. Prevent one website's checkout from being assigned to another. Return `{checkoutUrl, checkoutId, projectId, agreementId, purpose}` where purpose is `development`, `standard`, or `backend` (the frontend checks for the kind used to initiate checkout).

For `verify-checkout`, accept `{action:'verify-checkout',checkoutId,projectId,purpose}` (purpose `development` or `hosting`). Fetch the server-owned checkout record and confirm authenticated user, project ID, purpose, plan and verified Square payment state. For hosting, confirm the actual subscription is active. Return `{verified:boolean,projectId,purpose}`. Never trust user-editable `portal_project_purchase_drafts` or session IDs as payment proof.

**Current frontend:** for hosting checkout `create-checkout` expects the returned `purpose` to be the original plan kind (`standard` or `backend`); `verify-checkout` expects logical purpose `hosting`. Backend must map both consistently.

Other changes: enforce idempotency to avoid accidental duplicate charges, handle Square return/webhooks, protect checkout records using server-only writes and authenticated reads, and allow independent subscriptions/cancellation per project. Store a durable versioned PDF/HTML copy of the signed agreement and timestamps before production use.

Run `PROJECT_PURCHASE_SETUP.sql` once in Supabase SQL Editor. Replace only the corresponding web files. Test with two separate draft websites/accounts and a test Square environment before enabling live charges.

## Optional codes in the onboarding popup

Development codes waive the $100 development fee rather than discounting a Square checkout. Apply calls the existing authenticated `portal-promo` service with `{action:'redeem',purpose:'development_bypass',code,projectId,agreementId}`, then calls `{action:'status',projectId,agreementId}`. The existing `valid` redemption flag and `developmentBypass` status flag must both be `true` before the popup moves directly to hosting. If returned, `projectId` must match the selected website. Code values are never embedded in source, saved to browser storage, or stored as payment proof. The secret is compared inside the Edge Function, not in browser JavaScript.

The popup reloads the waiver from server status, rechecks it before creating hosting checkout and before final submission, and labels development as “$0 · Waived by code” rather than “Paid.” Normal Square development payments remain supported. Hosting is still required and verified separately. `square-subscriptions` must recognize the same server-owned waiver when enforcing development prerequisites; browser metadata must never authorize a waiver.

Hosting discount codes retain their existing separate path: optional `promoCode` in `create-checkout`, server-calculated pricing and `promoCodeAccepted: true` before opening the coded Square link.

The deployed `portal-promo` and portal-specific `square-subscriptions` sources are absent from this repository. The redemption purpose `development_bypass` matches the original portal integration in commit `39a1616`; `local_development` is not supported. Live testing requires access to that function to confirm its secret variable name, accepted purpose, durable waiver status and hosting prerequisite checks. Do not paste the secret value into this repository.

## Repeated checkout links

The onboarding popup requests a fresh `create-checkout` link on every payment click, even if other unpaid checkouts exist. Every attempt opens in a new tab; opening a link never marks it paid. The popup stores all attempt IDs in the project draft's `checkoutHistory` and verifies earlier links as well as the latest. Old drafts with only `checkoutSessions` remain supported. A valid verified payment from any recorded attempt satisfies the step, and its reference/receipt is used for confirmation. The backend must retain each attempt's user/project/purpose association when creating a later link. Idempotency should cover retries of the same server request without treating an unpaid checkout as a permanent lock on new attempts.
