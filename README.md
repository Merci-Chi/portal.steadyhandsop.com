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
