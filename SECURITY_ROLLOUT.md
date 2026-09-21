# Toríu Security Boundary Rollout

**Author:** Manus AI  
**Date:** 2026-09-21  
**Branch:** `security/restore-auth-boundary`

## Summary

This patch removes the fail-open owner identity that previously allowed an unauthenticated request to satisfy `protectedProcedure`. It also protects costly direct Express routes, replaces the client-only plaintext password gate with a signed server session, restricts shared GitHub and hosting credentials to the owner, disables application-host code execution in production, and enforces sandbox ownership. The legacy Cloudflare deploy route is owner-only.

The patch supports two verified workspace session mechanisms. Clerk remains the standard multi-user mechanism when its server keys are configured. The private owner workspace can also use a signed HTTP-only owner-access cookie created after a server-side code check. Clerk documents that `clerkMiddleware()` must run before other Express middleware; the server now follows that ordering.[1]

## Required Railway configuration

The existing `BUSINESS_ACTION_PIN` can serve as the owner access code, so a new access code is not required if that value is already configured and is at least eight characters. A separate `OWNER_ACCESS_CODE` may be set if workspace access and Shopify confirmation should use different codes.

| Variable | Requirement | Purpose |
|---|---|---|
| `OWNER_ACCESS_CODE` | Optional when `BUSINESS_ACTION_PIN` already exists | Server-verified owner workspace access code. |
| `OWNER_ACCESS_SESSION_SECRET` | Required unless another listed server signing secret supplies at least 32 characters | Signs the owner access cookie. A dedicated random value of at least 32 characters is preferred. The access code itself is never used as a signing key. |
| `BUSINESS_ACTION_PIN` | Existing value may be reused | Fallback owner access code and the separate business-action unlock code. |
| `BUSINESS_ACTION_SESSION_SECRET` | Keep configured at 32 or more characters | Signs the short-lived business-action confirmation session. The PIN itself is never used as a signing key. |
| `INTEGRATION_CREDENTIAL_KEY` | Strongly recommended | Primary key for versioned AES-256-GCM encryption of stored GitHub and deployment-platform credentials. Existing AES-CBC records remain readable through configured historical JWT or Clerk keys during migration. |
| `CLERK_SECRET_KEY` and `CLERK_PUBLISHABLE_KEY` | Optional for the owner-code path; required for Clerk sessions | Enables Clerk JWT verification through `clerkMiddleware()`. |
| `VITE_CLERK_PUBLISHABLE_KEY` | Required only when Clerk frontend sign-in is restored | Makes the Clerk publishable key available to the client build. |
| `SPRITES_TOKEN` | Required to enable production code execution | Without it, code execution returns an unavailable error. The application no longer falls back to a child process on the Railway host. |
| `STRIPE_WEBHOOK_SECRET` | Required when Stripe webhooks are enabled | Production Stripe webhook requests return `503` when signature verification is not configured. |
| `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` | Existing production requirement | Owner resolution, persistence, sandboxes, and other application data. |

Generate secrets outside the application and store them only in Railway variables. Do not commit them to the repository.

## Behavior changes

The old browser-local password marker and plaintext access code have been removed. The next visit after deployment will require the server-side owner code once. A successful unlock creates a strict, HTTP-only cookie that expires after twelve hours.

Anonymous requests now receive `401` from GitHub, deployment, code execution, image generation, agent, social, browser, sandbox metadata, and private storage routes. Public health, pricing, access status, and explicitly shared-project routes remain public.

The public `GET /api/pwa-icon` route remains available for browser and email branding, while `POST /api/settings/pwa-icon` requires a verified workspace session.

A non-owner authenticated user can use only that user’s stored GitHub or hosting connection. The application no longer lends the owner’s `GITHUB_TOKEN`, `RAILWAY_TOKEN`, `VERCEL_TOKEN`, `NETLIFY_TOKEN`, or Cloudflare credentials to another account.

New GitHub, Railway, Vercel, and Netlify credentials are encrypted with authenticated AES-256-GCM envelopes. Legacy AES-CBC records can still be decrypted with a configured historical key, so introducing `INTEGRATION_CREDENTIAL_KEY` does not require an immediate reconnect as long as the previous JWT or Clerk key remains configured during the transition.

Production code execution now requires Sprites. If Sprites is missing or unavailable, execution fails closed. Local child-process execution remains available only in development and test environments.

An explicit sandbox identifier must belong to the current user. Deployed sandbox URLs require a verified workspace session and are never served to another account. User-authored HTML is wrapped in a trusted page and executed only in an opaque-origin `sandbox="allow-scripts"` iframe with outbound connections, forms, navigation, workers, and objects blocked by Content Security Policy. Private storage proxy requests also require a verified workspace session.

Clerk and Stripe webhooks preserve their exact raw request bytes before JSON parsing. Clerk’s Svix signature is therefore checked against the payload that was actually received rather than a reserialized JSON value.

## Deployment procedure

First, confirm the Railway variables above. The current production `BUSINESS_ACTION_PIN` is already reported as configured, so it can unlock the owner workspace unless a separate `OWNER_ACCESS_CODE` is preferred.

Deploy the commit from `security/restore-auth-boundary`. After Railway reports the service healthy, open a private browser window and confirm that the owner gate appears. Enter the server-side code and verify that the workspace loads.

Then run the following read-only checks without a cookie. Each protected endpoint must return `401`:

```bash
curl -i https://quoratorium.com/api/trpc/git.status
curl -i https://quoratorium.com/api/trpc/deploy.status
curl -i -X POST https://quoratorium.com/api/execute \
  -H 'Content-Type: application/json' \
  --data '{"code":"console.log(1)","language":"javascript"}'
curl -i https://quoratorium.com/api/social/pending
```

The public access status endpoint should return `200` while reporting `authenticated: false`:

```bash
curl -i https://quoratorium.com/api/trpc/auth.accessStatus
```

After signing in, confirm GitHub status, deployment status, conversation loading, generated-image display, and a sandbox preview. If `SPRITES_TOKEN` is not configured, confirm that code execution reports that the isolated runtime is unavailable rather than running locally.

## Validation completed

| Check | Result |
|---|---|
| TypeScript type-check | Passed |
| Credential-independent automated suite | **178/178 tests passed across 33 files** |
| Focused final security suite | **27/27 tests passed across 9 files** |
| Production client/server build | Passed |
| Local production-mode anonymous smoke test | Passed: public access status `200`; GitHub, platform deployment, execution, image, social, storage, and sandbox routes denied; owner-only Cloudflare deploy returned `403` |
| Secret scan of the patch | No committed credential literal was introduced |

The repository’s complete default test command still includes live credential-validation tests. In this credential-free checkout, **178 tests passed and 26 tests failed across 14 files**. Every remaining failed file is a live-secret or external-service validation suite for Clerk, Supabase, Resend, GitHub, Redis, OpenRouter, Vercel, Sentry, Stripe, Sprites, Netlify, or Railway. The credential-independent suite is clean.

The client build still emits the pre-existing large-chunk warning. That warning is unrelated to this security patch.

## Rollback

A code rollback is technically possible by reverting the security commit, but doing so would restore the anonymous owner fallback and public high-impact routes. If the owner cannot sign in after deployment, correct `OWNER_ACCESS_CODE` or `BUSINESS_ACTION_PIN`, `OWNER_ACCESS_SESSION_SECRET`, `OWNER_OPEN_ID`, and Supabase configuration in Railway, then redeploy. Prefer configuration repair over reverting the boundary.

## References

[1]: https://clerk.com/docs/reference/express/clerk-middleware "Clerk Express clerkMiddleware reference"
