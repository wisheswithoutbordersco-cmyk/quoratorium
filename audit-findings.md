# Tool Stack Audit Findings

## Summary

The codebase has ALL features implemented in code. The main issue is that **all protected tRPC routes require authentication** (via `protectedProcedure` → `ctx.user`), but **Clerk is currently bypassed** on the frontend (useAuth returns stub). This means:

1. **Sprites Executor** — FULLY IMPLEMENTED and wired into streaming.ts. When `SPRITES_TOKEN` env var is set, `executeCode()` in `codeExecutor.ts` routes to Sprites first, falls back to local. The streaming endpoint at `/api/stream/chat` handles `execute` intent and calls Sprites. **WORKING** for guest users via SSE (no auth required for the SSE endpoint).

2. **Push to GitHub** — FULLY IMPLEMENTED. `PushToGitHub.tsx` component renders after code generation in chat. It calls `trpc.git.push` which is a **protectedProcedure**. **BROKEN** because `ctx.user` is null (Clerk bypassed), so the tRPC call returns UNAUTHORIZED.

3. **Live Preview** — FULLY IMPLEMENTED. `LivePreview.tsx` renders in ConversationPanel when HTML code blocks are detected. It uses `srcdoc` iframe approach (local preview of generated markup). **WORKING** for guests.

4. **Agent Memory** — FULLY IMPLEMENTED in `memoryService.ts` and `supabaseMemoryService.ts`. Memory retrieval/persistence is wired into streaming.ts BUT only for authenticated users (`if (!isGuest && userId)`). **NOT WORKING** for guests (by design — memory requires user identity).

5. **DALL-E/Artist** — IMPLEMENTED in `imageWorker.ts`. Uses OpenAI API key. **BROKEN** because OPENAI_API_KEY is over quota. Need to route through OpenRouter or use the built-in image generation helper.

6. **Browser/Playwright** — IMPLEMENTED in `browserWorker.ts`. Requires Chromium in deployment env. **MAY NOT WORK** in production (Cloud Run may not have Chromium).

7. **Deploy to Platform** — IMPLEMENTED in `platformDeployService.ts` and `deploy` router. All **protectedProcedure** — **BROKEN** without auth.

8. **Multi-step Task Chains** — IMPLEMENTED in `taskChain.ts`. Wired into streaming.ts for `complex` intent. **WORKING** for guests via SSE.

## Root Cause

The SSE streaming endpoint (`/api/stream/chat`) is the ONLY path that works for guests. It handles:
- Chat (DeepSeek via OpenRouter) ✅
- Build (DeepSeek via OpenRouter) ✅  
- Research (Gemini via OpenRouter) ✅
- Validate (Gemini via OpenRouter) ✅
- Code Execution (Sprites) ✅
- Browser tasks ⚠️ (env-dependent)
- Image generation ❌ (OpenAI key broken)
- Multi-step chains ✅

BUT the **real build pipeline** (plan → generate → persist files → validate → deploy) lives in `server/routers/ai.ts` as `ai.build` — a **protectedProcedure** that is NOT accessible without auth.

## What Needs Fixing

### Critical (to make Captain Q actually BUILD things):

1. **Wire the build pipeline into the SSE chat flow** — When Captain Q detects a build intent, it should:
   - Generate code (already works via streaming)
   - Parse files from the response (extractFilesFromMarkdown exists in ai.ts)
   - Execute/deploy via Sprites (already works)
   - Show live preview (already works for HTML)
   - Offer "Push to GitHub" (already shows, but push fails without auth)

2. **Fix image generation** — Route DALL-E through OpenRouter or use the built-in `generateImage` helper from `_core/imageGeneration.ts`

3. **Make GitHub push work without Clerk** — Either:
   a. Create a "guest mode" GitHub connection using env var (GITHUB_TOKEN from wisheswithoutbordersco-cmyk)
   b. Or bypass protectedProcedure for git routes when owner token is available

4. **Make deploy work without Clerk** — Same approach: use system tokens (VERCEL_TOKEN, NETLIFY_TOKEN, RAILWAY_TOKEN) as fallback when no user auth

### Nice to Have:
- Browser worker may need Chromium installed in Cloud Run
- Memory only works for authenticated users (acceptable)
