# Steady Hands Client Portal — Authentication Setup

This repo hosts `https://portal.steadyhandsop.com` and uses Supabase project `glonbvrcudwuzjundrii`.

## Pages
- `login.html`: login, registration, Google OAuth, remember email (email only), passwordless one-time login link, forgot password
- `reset-password.html`: reset password from email recovery link
- `onboarding.html`: first-time profile creation in `portal_profiles`
- `index.html`: authenticated portal with empty client-service states until company verification and service integrations exist

## Required configuration (no SQL or Edge Functions for these steps)
1. Supabase > Authentication > Providers > Email: enable Email provider and configure confirmation email and reliable outbound SMTP.
2. Supabase > Authentication > Providers > Google: enable Google and set OAuth client ID + secret. Google's authorized redirect URI is `https://glonbvrcudwuzjundrii.supabase.co/auth/v1/callback`.
3. Supabase > Authentication > URL Configuration: add `https://portal.steadyhandsop.com/**` to Additional Redirect URLs. Keep redirects for any other apps on this shared project.
4. GitHub Pages: ensure CNAME is `portal.steadyhandsop.com` and HTTPS is enforced.
5. Test signup → confirm email → onboarding → signed-in portal; logout → login; Google; magic link; password reset; second user must not see first user's profile.

**Security:** Keep the Supabase service_role / secret keys out of this repository. `config.js` contains only the public publishable key. New signups do NOT gain verified-company membership or access to CRM / Square records. Company linking belongs in the next batch.

**Demo cleanup:** Hard-coded example business / dflandscape data, fake invoice and sample referrals were removed from application code. The old `app.js` is an unused compatibility stub.

**Remember email:** Stores only the email address on this device when the user opts in; never the password.

**One-time link:** Existing accounts only (`shouldCreateUser:false`) and subject to Supabase Auth email limits and configured SMTP.

## Separate website setup cards (October 16, 2026)

Each draft or awaiting-payment website has separate Make a Site, Agreement, Website Design, and Hosting cards. Clients can complete the existing questionnaire or review and approve an assigned/claimed preview without answering the questionnaire. Approval requires an explicit acknowledgment after reviewing the selected preview. It saves the preview code and design approval in the project's existing `details` JSON and moves draft projects to `awaiting_payment`. Agreement signatures and Square payment verification remain separate.

No new SQL migration or Edge Function deployment is required by this change. It reuses `portal_website_projects` (`details`, `preview_code`, `status`, `submitted_at`), existing preview reads/claims, and `portal_project_agreements`. The existing database setup, RLS policies and Square checkout backend must already be configured. Preview approval is a design decision, never payment verification. Hosting checkout still checks the signed agreement and verified development payment.

## Public Sites preview catalog

The approval selector includes every website folder containing `sites/<folder>/index.html` (or `index.htm`) in the public `Merci-Chi/Steadyhandsop` repository, plus previews already assigned to the signed-in client. A plain file such as `sites/test` is not treated as a website. New website folders appear automatically after a refresh; the catalog is cached per browser tab for five minutes. Current published previews remain available during a temporary catalog outage. This uses public repository reads and requires no SQL migration, GitHub token, or database permission changes.
