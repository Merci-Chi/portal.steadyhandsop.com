# Project-specific Square backend: required before taking live payments

The frontend now keeps the selected `projectId` and signed agreement separate for each website. The existing deployed `square-subscriptions` Supabase Edge Function is **not provided in this ZIP**, so its behavior has not been changed. Do not assume the new checkout works until the server is updated and tested.

## Required Edge Function contract

For `create-checkout`, accept `{action:'create-checkout',projectId,agreementId,planKey,returnUrl}`. Authenticate with Supabase JWT. Fetch `portal_website_projects` server-side and require `user_id = auth.uid()` and `status = 'awaiting_payment'`. Fetch `portal_project_agreements` server-side and require the same user/project ID, `acknowledged = true`, and exact agreement version `2026-10-14-project-v1`. Map `website-development` to one-time $100, `standard-monthly` to $20 monthly and `backend-monthly` to $30 monthly. Never accept client-supplied amounts. Create a new checkout with the verified project/user/purpose association stored securely in a **server-owned** database table or Square metadata. Prevent one website's checkout from being assigned to another. Return `{checkoutUrl, checkoutId, projectId, agreementId, purpose}` where purpose is `development`, `standard`, or `backend` (the frontend checks for the kind used to initiate checkout).

For `verify-checkout`, accept `{action:'verify-checkout',checkoutId,projectId,purpose}` (purpose `development` or `hosting`). Fetch the server-owned checkout record and confirm authenticated user, project ID, purpose, plan and verified Square payment state. For hosting, confirm the actual subscription is active. Return `{verified:boolean,projectId,purpose}`. Never trust user-editable `portal_project_purchase_drafts` or session IDs as payment proof.

**Current frontend:** for hosting checkout `create-checkout` expects the returned `purpose` to be the original plan kind (`standard` or `backend`); `verify-checkout` expects logical purpose `hosting`. Backend must map both consistently.

Other changes: enforce idempotency to avoid accidental duplicate charges, handle Square return/webhooks, protect checkout records using server-only writes and authenticated reads, and allow independent subscriptions/cancellation per project. Store a durable versioned PDF/HTML copy of the signed agreement and timestamps before production use.

Run `PROJECT_PURCHASE_SETUP.sql` once in Supabase SQL Editor. Replace only the corresponding web files. Test with two separate draft websites/accounts and a test Square environment before enabling live charges.
