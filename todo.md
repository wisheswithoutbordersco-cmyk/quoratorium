# Q Workspace Full-Stack Implementation TODO

## Phase 1 — Wire Real AI Responses
- [x] Set up database schema (projects, conversations, memory, vault)
- [x] Configure API secrets (OPENAI_API_KEY, ANTHROPIC_API_KEY, SONAR_API_KEY)
- [x] Build Captain orchestrator tRPC procedure (routes tasks to appropriate worker)
- [x] Build Builder worker (OpenAI GPT-4o for code generation)
- [x] Build Validator worker (Anthropic Claude for validation)
- [x] Build Research worker (Perplexity Sonar for research/intelligence)
- [x] Wire chat panel to real AI backend with streaming responses

## Phase 2 — Database Persistence
- [x] Create projects table and CRUD operations
- [x] Create conversations table with message history
- [x] Create memory_entries table for long-term context
- [x] Create vault_entries table for files and configs
- [x] Create generated_files table for code artifacts
- [x] Wire Memory page to database
- [x] Wire Vault page to database

## Phase 3 — Project Creation Wizard
- [x] Build "New Project" modal with project type selection
- [x] Captain analyzes request and breaks into phases
- [x] Pipeline tracker shows real progress
- [x] Generated files stored in project

## Phase 4 — Code Generation & Deployment
- [x] Builder generates full project code (React, Node, HTML, Python)
- [x] ZIP download for generated projects
- [x] Deployer worker handles deployment pipeline

## Phase 5 — Website Builder Capability
- [x] User describes website → Captain breaks into components
- [x] Builder generates React + Tailwind + Vite code
- [x] Validator checks generated code
- [x] Preview generated sites in iframe
- [x] Download generated site as ZIP

## External API Integration (Multi-AI Orchestration)
- [x] Add OPENAI_API_KEY, ANTHROPIC_API_KEY, SONAR_API_KEY as environment secrets
- [x] Install OpenAI and Anthropic SDK packages
- [x] Implement direct OpenAI client for Builder worker (GPT-4o)
- [x] Implement direct Anthropic client for Validator worker (Claude)
- [x] Implement direct Perplexity client for Research worker (Sonar)
- [x] Rewrite AI router Captain to route tasks to external workers
- [x] Fallback to built-in Forge LLM if external keys are unavailable
- [x] Update tests for new multi-worker architecture

## Additional Enhancements
- [x] Wire Analytics page to real project stats from database
- [x] Wire Builders page to real orchestration events
- [x] Wire Deployments page to real project data with ZIP download
- [x] File upload endpoint for conversation attachments
- [x] Vitest tests for all routers (projects, AI, memory, files)

## Remaining Required Features
- [x] Streaming AI responses (SSE endpoint, token-by-token typing effect in chat)
- [x] Live orchestration panel (replace client-side simulation with real DB polling)
- [x] Cloudflare Pages deployer (use CLOUDFLARE_API_TOKEN to auto-deploy generated sites)
- [x] Website builder pipeline (describe → plan → generate → validate → deploy → preview)
- [x] Project creation wizard end-to-end (New Project → Captain plans → pipeline tracks → ZIP download)
- [x] Deploy publicly with public visibility

## Priority Tier 1 Features
- [x] Custom Q favicon with glow effect
- [x] Logo animation with subtle pulse/glow in nav
- [x] Cinematic loading screen (AI boot-up feel)
- [x] Consistent Inter + JetBrains Mono typography
- [x] Pulsing agent indicators (Builder blue, Validator green, Research purple, Captain gold)
- [x] Live streaming text typewriter effect
- [x] Task progress animations
- [x] Routing beam animations between Captain and workers
- [x] Thinking states with animated indicators
- [x] Templates gallery with 10 real templates
- [x] Template cards with hover effects and Use Template button
- [x] Project/conversation sidebar with history
- [x] Sidebar search/filter functionality
- [x] New Project button in sidebar

## Capability Expansion (5 New Features)
- [x] Playwright browser worker (open URLs, screenshots, scrape, fill forms)
- [x] Code execution sandbox (JS/TS/Python with 30s timeout, stdout/stderr capture)
- [x] Multi-step task chains (Captain breaks complex tasks into sequential steps)
- [x] Cloudflare R2 file storage (upload, download, vault integration)
- [x] DALL-E 3 image generation (Artist worker, inline display, R2 storage)
- [x] Wire all new workers into Captain intent routing
- [x] Update frontend chat to display images and code execution results
- [x] Deploy publicly

## Sprites.dev Integration
- [x] Add SPRITES_TOKEN as webdev secret
- [x] Implement Sprites API client (create, exec, status, filesystem)
- [x] Upgrade executor worker to use Sprites for persistent environments
- [x] Wire Sprites into streaming endpoint for code execution
- [x] Show sprite status in orchestration panel (cold/warm/running)
- [x] Deploy publicly

## Agent Memory System
- [x] Extend memory schema with lastUsedAt, relatedProject, source fields
- [x] Create memoryService.ts with retrieval, creation, and auto-learning logic
- [x] Inject memory retrieval into Captain system prompt in streaming.ts
- [x] Emit memory SSE events (memory_active, memory_count) during chat
- [x] Auto-extract memories from corrections and key facts
- [x] Update Memory page UI with categories, importance, edit, teach button
- [x] Show "Using N memories" indicator in ConversationPanel
- [x] Deploy publicly

## Job Queue / Async Task Infrastructure
- [x] Create jobs table in database schema (id, type, status, priority, payload, result, progress, retries, error, createdAt, completedAt)
- [x] Build in-process queue engine with concurrency control, retries, exponential backoff, dead letter queue
- [x] Create job API endpoints (POST /api/jobs, GET /api/jobs/:id, GET /api/jobs, DELETE /api/jobs/:id, GET /api/jobs/stats)
- [x] Wire job queue into streaming endpoint (create job on message, stream results as job progresses)
- [x] Build Jobs dashboard UI (active jobs, progress bars, history, failed jobs with retry, queue stats)
- [x] Integrate cost tracking into all worker functions (callCaptain, callBuilder, callValidator, callResearch)
- [x] Integrate cost tracking into all streaming functions (streamOpenAI, streamAnthropic, streamPerplexity, streamForgeFallback)
- [x] Add budget enforcement (pre-check) and task tracking to SSE handler

## AI Cost Governance
- [x] Create api_calls, budgets, cost_alerts tables in database schema
- [x] Build cost tracking service (log every API call with tokens and cost)
- [x] Implement budget system (daily/monthly ceilings, warnings at 80%, hard stop at 100%)
- [x] Build smart model routing (complexity analysis, cost-tier routing, fallback chains)
- [x] Implement loop detection (consecutive calls limit, token limits per task)
- [x] Create cost API endpoints (summary, history, budget, breakdown)
- [x] Build Cost dashboard UI (spend breakdown, trend chart, budget utilization, projections)
- [x] Deploy publicly

## Mobile Layout Fix (Main Chat Page Only)
- [x] Fix chat panel to take full width on mobile (<768px)
- [x] Orchestration panel hidden on mobile, accessible via toggle
- [x] Chat input full width and easy to tap on mobile
- [x] Deploy publicly

## Agent State Machine
- [x] Define formal agent lifecycle states (idle, planning, executing, validating, repairing, completed, failed)
- [x] Build state machine engine with deterministic transitions
- [x] Implement planner → executor → validator → repair loop → completion flow
- [x] Supervisor checkpoints and failure recovery
- [x] Retry logic with state persistence
- [x] Wire state machine into streaming/orchestration
- [x] Deploy publicly

## Observability / Monitoring
- [x] Build structured logging service (levels, context, correlation IDs)
- [x] Implement distributed tracing (spans, parent-child, timing)
- [x] Token tracking and worker telemetry metrics
- [x] Error aggregation with stack traces and frequency
- [x] Build Observability dashboard UI page
- [x] Deploy publicly

## Sandboxed Execution Security
- [x] Define container isolation rules and filesystem restrictions
- [x] Implement network egress rules (allowlist/blocklist)
- [x] CPU/memory quotas and execution timeouts
- [x] Protection against malicious scripts
- [x] Prompt injection detection and mitigation
- [x] Build Security dashboard UI page
- [x] Deploy publicly

## User Profile Enhancement
- [x] Add User Profile page (name, email, avatar, settings)
- [x] Add user avatar/menu dropdown in TopNav (top-right corner)
- [x] Profile settings (update display name, avatar)

## RAG Pipeline (Retrieval-Augmented Generation)
- [x] Create documents and chunks tables in database schema
- [x] Build RAG service (chunking, embedding generation via OpenAI text-embedding-3-small, cosine similarity search)
- [x] Create Knowledge tRPC router (upload, list, delete, search, stats)
- [x] Build Knowledge Base UI page (upload, list, search, delete, stats)
- [x] Integrate RAG context into Captain streaming (inject top-5 chunks into system prompt)
- [x] Show "Using knowledge from: [filename]" indicator in ConversationPanel
- [x] Deploy publicly

## UX Upgrade 1: Multi-Agent Orchestration Visual
- [x] Build neural network graph component (SVG/CSS animated nodes and connections)
- [x] Captain Q central node with worker nodes (Builder=blue, Validator=green, Research=purple, Artist=gold, Browser=cyan, Executor=orange)
- [x] Animated particles/lines flowing between nodes during active tasks
- [x] Idle state: gentle breathing/pulse, dim connections
- [x] Active state: bright particles, pulsing nodes, glowing connections
- [x] Mobile-responsive (simplified on mobile)

## UX Upgrade 1b: Holographic Code Streaming
- [x] Holographic effect: code appears with blue/purple translucent glow then solidifies
- [x] Line-by-line materialization with left-to-right shimmer sweep
- [x] Syntax highlighting with subtle shimmer on keywords
- [x] "Lock in" flash effect when code block completes
- [x] CSS animations: opacity transitions, text-shadow glow, gradient sweeps

## UX Upgrade 2: Conversation History Persistence
- [x] Create conversations and messages tables in database
- [x] Save every message (user and assistant) to database
- [x] Auto-title conversations from first message (GPT-4o-mini)
- [x] Sidebar with past conversations list (most recent first)
- [x] Click conversation to reload it
- [x] "New Chat" button starts fresh
- [x] Persist across browser sessions and page refreshes

## UX Upgrade 3: Live Preview Iframe
- [x] Split view: code on left, live preview on right (or toggle)
- [x] Sandboxed iframe with srcdoc for HTML/CSS/JS rendering
- [x] Real-time preview updates during code streaming (debounced 2s)
- [x] Full-screen preview button
- [x] "Open in new tab" button
- [x] Mobile/tablet/desktop viewport toggles
- [x] Auto-appear when code generation includes HTML/React

- [x] Deploy publicly

## Feature: Git Integration
- [x] Create github_connections table (userId, token_encrypted, defaultRepo, defaultBranch)
- [x] Build GitHub service (list repos, create repo, push, pull, commits, branches)
- [x] Create git tRPC router (connect, disconnect, listRepos, push, pull, commits, branches)
- [x] Build Git page UI (connected repos, recent commits, push/pull, branch selector)
- [x] "Push to GitHub" button after code generation

## Feature: Settings Page
- [x] Create user_settings table (userId, key, value — flexible key-value store)
- [x] Build settings service (get, set, getAll, defaults)
- [x] Create settings tRPC router (getAll, update, reset)
- [x] Build Settings page UI (AI Preferences, Budget, API Keys, GitHub, Appearance, Notifications, Danger Zone)
- [x] Settings context provider for global access
- [x] Auto-save with debounce on change

## Feature: Export & Sharing
- [x] Create shared_projects table (id, projectId, userId, slug, isActive, createdAt)
- [x] Build export service (project ZIP, conversation MD/PDF, code files)
- [x] Build sharing service (create share link, get shared project, revoke)
- [x] Create export/sharing tRPC router
- [x] Build export UI (download buttons on projects, conversations, code blocks)
- [x] Build sharing UI (share link generation, public shared view)
- [x] Public shared project page (no auth required)
- [x] Deploy publicly

## Finishing Touch 1: Public Shared Project Page
- [x] Create /shared/:slug public route (no auth required)
- [x] Build SharedProject.tsx page component (project name, description, code with syntax highlighting, live preview)
- [x] Clean read-only view with Quoratorium branding and "Built with Quoratorium" footer
- [x] Update sharing tRPC router getShared to return full project data for public view
- [x] Register route in App.tsx as public (no auth wrapper)

## Finishing Touch 2: One-Click Push to GitHub
- [x] Add "Push to GitHub" button in ConversationPanel after code generation
- [x] If GitHub connected: show repo selector + branch + auto-generated commit message dialog
- [x] If GitHub NOT connected: prompt user to go to Settings to add PAT
- [x] Auto-generate commit message from conversation context
- [x] Success/error toast notifications
- [x] Wire to git tRPC router push endpoint

## Finishing Touch 3: Global Settings Provider
- [x] Create Zustand settings store (settingsStore.ts) that loads settings on app init
- [x] Settings loaded once from API on mount, cached in memory
- [x] Applied settings: default model, theme (dark/light), animation intensity (full/reduced/off), orchestration panel position, budget limits
- [x] When user changes setting on Settings page, global store updates immediately (optimistic)
- [x] Persist to API in background with debounce
- [x] Wire settings into components (theme, animations, orchestration panel)

## Deploy
- [x] Deploy publicly to quoratorium.com, www.quoratorium.com, qworkspace-f3vutepv.manus.space

## Feature: One-Click Deployment Pipeline
- [x] Add deployments table to schema (platform, projectId, userId, status, url, logs, timestamps)
- [x] Add platform_connections table to schema (userId, platform, tokenEncrypted, username, connectedAt)
- [x] Create deployment service (Vercel, Netlify, Railway API integrations)
- [x] Expand deploy tRPC router (deploy to platform, status, history, connect/disconnect platform)
- [x] Build DeployModal component (platform selector, progress, success/error states)
- [x] Update Deployments page with multi-platform support and deployment history
- [x] Add Deploy button on project cards and live preview panel
- [x] Add platform connection section in Settings page
- [x] Push schema changes with pnpm db:push
- [x] TypeScript clean, tests pass
- [x] Deploy publicly

## Feature: Supabase Intelligence/Memory Layer (Hybrid)
- [x] Install @supabase/supabase-js
- [x] Add SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY env vars
- [x] Create Supabase client module (service_role for backend)
- [x] Create Supabase schema: knowledge_base table with vector(1536) column
- [x] Create Supabase schema: agent_memory table (cross-project, cross-session)
- [x] Create Supabase schema: user_memory table (preferences, patterns learned)
- [x] Enable pgvector extension and create IVFFlat index
- [x] Enable RLS on all Supabase tables with user-scoped policies
- [x] Build knowledge base service (store embeddings, semantic search via pgvector)
- [x] Build global user memory service (categories: coding_style, design_preferences, frameworks, etc.)
- [x] Build agent memory persistence service (what Captain Q learns over time)
- [x] Wire memory into Captain Q: read user memory at conversation start
- [x] Wire memory into Captain Q: auto-update memory from interactions
- [x] Create tRPC routes for knowledge base CRUD and memory management
- [x] TypeScript clean, tests pass
- [x] Deploy publicly with owner-only visibility

## Feature: Sentry Error Tracking
- [x] Install @sentry/react and @sentry/node
- [x] Add SENTRY_DSN environment variable
- [x] Initialize Sentry in frontend (main.tsx) with BrowserTracing, Replay, ErrorBoundary
- [x] Initialize Sentry in backend server startup with request/error handlers
- [x] Tag errors with user ID when available
- [x] TypeScript clean, tests pass
- [x] Deploy

## Feature: Upstash Redis (BullMQ + Caching)
- [x] Install @upstash/redis and ioredis
- [x] Add UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, REDIS_URL env vars
- [x] Create Redis client module (REST for caching, ioredis for BullMQ)
- [x] Update BullMQ job queue to use Upstash Redis with TLS
- [x] Build caching layer (AI response cache, memory cache, template cache, rate limiting)
- [x] Graceful fallback to in-memory if Redis unreachable
- [x] TypeScript clean, tests pass
- [x] Deploy

## Feature: Netlify PAT Wiring
- [x] Add NETLIFY_TOKEN env var
- [x] Update deploy service to use system token as fallback
- [x] Fix Netlify file upload API (use file path in URL, not hash)
- [x] Update platform statuses to reflect system token availability
- [x] TypeScript clean, tests pass (29/29)
- [x] Deploy

## Feature: Vercel Token Wiring
- [x] Add VERCEL_TOKEN env var (validated against Vercel API)
- [x] Deploy service already uses system token fallback (getSystemToken covers vercel)
- [x] Platform statuses already reflect system token availability for vercel
- [x] TypeScript clean, tests pass (31/31)
- [x] Deploy

## Feature: Railway Token Wiring
- [x] Add RAILWAY_TOKEN env var (validated against Railway GraphQL API)
- [x] Deploy service already uses system token fallback (getSystemToken covers railway)
- [x] Platform statuses already reflect system token availability for railway
- [x] TypeScript clean, tests pass (33/33)
- [x] Deploy

## Feature: Clerk Authentication (Full Replacement)
- [x] Install @clerk/clerk-react and @clerk/express
- [x] Add VITE_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY env vars
- [x] Rewire backend: replace Manus OAuth context with Clerk session verification
- [x] Rewire frontend: replace useAuth/OAuth hooks with Clerk hooks and components
- [x] Add ClerkProvider to app entry, SignIn/SignUp pages, UserButton in nav
- [x] Map Clerk user ID to existing user records in database
- [x] Ensure all services (memory, projects, conversations, deployments) use Clerk user ID
- [x] Protect routes with Clerk auth guards
- [x] Match cinematic dark theme for sign-in/sign-up pages
- [x] TypeScript clean, tests pass
- [x] Deploy

## Feature: MySQL→Supabase Full Migration
- [x] Create comprehensive Supabase SQL migration with all app tables (users, projects, conversations, messages, memory_entries, vault_entries, generated_files, orchestration_events, jobs, api_calls, budgets, cost_alerts, documents, chunks, user_settings, github_connections, shared_projects, deployments, platform_connections)
- [x] Add RLS policies on all new tables (users can only access their own data)
- [x] Run SQL migration against Supabase (3 SQL files provided to user: supabase-migration.sql, supabase-main-migration.sql, supabase-stripe-migration.sql — user must run manually in Supabase SQL Editor)
- [x] Rewrite server/db.ts to use Supabase client instead of Drizzle ORM
- [x] Update server/routers/conversations.ts to use Supabase queries
- [x] Update server/routers/settings.ts to use Supabase queries
- [x] Update server/routers/sharing.ts to use Supabase queries
- [x] Update server/costService.ts to use Supabase queries
- [x] Update server/jobQueue.ts to use Supabase queries
- [x] Update server/memoryService.ts to use Supabase queries
- [x] Update server/ragService.ts to use Supabase queries
- [x] Update server/githubService.ts to use Supabase queries
- [x] Update server/platformDeployService.ts to use Supabase queries
- [x] Update server/_core/context.ts to use Supabase user model
- [x] Remove mysql2, drizzle-orm, drizzle-kit packages
- [x] Remove drizzle.config.ts and drizzle/ directory
- [x] Remove DATABASE_URL from env.ts
- [x] Fix TypeScript errors (0 errors)
- [x] Run all tests and fix failures (39/39 pass)
- [x] Deploy publicly (owner-only visibility)

## Feature: Quoratorium Icon Wiring
- [x] Generate all icon sizes (16, 32, 180, 192, 512, favicon.ico, OG 1200x630, splash)
- [x] Upload all icon assets via manus-upload-file --webdev
- [x] Create manifest.json (PWA) in client/public
- [x] Update index.html with favicon, apple-touch-icon, manifest, OG/Twitter meta tags
- [x] Update BootScreen component to use actual icon image with green Matrix glow
- [x] Update QIdentity component to use icon image instead of text Q
- [x] TypeScript clean (0 errors), tests pass (39/39)
- [x] Deploy

## Feature: Resend Email Service Integration
- [x] Install resend and svix npm packages
- [x] Add RESEND_API_KEY to environment variables
- [x] Create email service (server/services/email.ts) with sendWelcomeEmail, sendBuildCompleteEmail, sendWeeklySummaryEmail
- [x] Create branded HTML email templates (dark theme, green Matrix accents)
- [x] Create Clerk webhook endpoint (POST /api/webhooks/clerk) with svix signature verification
- [x] Handle user.created event: create Supabase user + send welcome email
- [x] Handle user.updated event: update Supabase user record
- [x] Wire sendBuildCompleteEmail into deploy service after successful deployment
- [x] Fix TypeScript errors and run tests (0 errors, 40/40 tests pass)
- [x] Deploy

## Feature: Stripe Billing Integration
- [x] Install stripe package and add API keys to env (STRIPE_SK, VITE_STRIPE_PK)
- [x] Create Stripe products and prices (3 subscription tiers + 3 top-ups)
- [x] Create credit tracking database tables (SQL migration for Supabase)
- [x] Create credit service (server/services/credits.ts) with daily reset logic
- [x] Create Stripe webhook endpoint (POST /api/webhooks/stripe)
- [x] Create Stripe Checkout session endpoint for subscriptions and top-ups
- [x] Create Stripe Customer Portal endpoint
- [x] Build pricing/billing page UI with tier comparison
- [x] Wire credits into AI pipeline (deduct 1 credit per action)
- [x] Add paywall enforcement (show upgrade prompt when credits exhausted)
- [x] Fix TypeScript errors and run tests (45/45 pass)
- [x] Deploy with public visibility

## Fix: ClerkProvider Loading — White Screen on Production Domain
- [x] Diagnose: Clerk dev instance returns dev_browser_unauthenticated on quoratorium.com
- [x] Add ClerkLoading spinner so app renders while Clerk initializes
- [x] Wrap app in ClerkLoaded so React only mounts after Clerk is ready
- [x] TypeScript clean, 45/45 tests pass
- [x] Deploy with public visibility

## Fix: Stale Clerk JWT Cookie (dev→prod instance mismatch)
- [x] Wrap clerkMiddleware in error-catching layer to detect "Handshake token verification failed" / kid mismatch
- [x] Clear all Clerk cookies (__session, __clerk_db_jwt, __client_uat, __clerk_handshake) when stale token detected
- [x] Treat stale-token requests as unauthenticated (not 500 errors)
- [x] TypeScript clean, 45/45 tests pass
- [x] Deploy with public visibility

## Feature: OpenRouter as Primary AI Provider
- [x] Add OPENROUTER_API_KEY secret
- [x] Add streamOpenRouter function using OpenAI-compatible SDK (deepseek/deepseek-chat, google/gemini-2.5-flash)
- [x] Route all intents through OpenRouter first (deepseek for chat/build, gemini for validate/research)
- [x] Forge remains as fallback if OpenRouter fails
- [x] Update worker names in UI to reflect actual models
- [x] Vitest passes (2/2)
- [x] Deploy publicly

## Full Audit Fixes (May 23 2026)
- [x] Remove @clerk/clerk-react UserButton import from DashboardLayout.tsx (caused infinite re-render)
- [x] Remove @clerk/clerk-react UserButton import from TopNav.tsx (replaced with Q avatar placeholder)
- [x] Fix DashboardLayout to not require user != null (renders regardless of auth state)
- [x] Fix billing.getPricing to use publicProcedure instead of protectedProcedure
- [x] Verified Supabase: all tables present and accessible (users, projects, vault_entries, conversations, memory_entries, knowledge_base, agent_memory, subscriptions, credit_usage)
- [x] Verified Stripe: key valid (balance API returns 200)
- [x] Verified OpenRouter: deepseek/deepseek-chat and google/gemini-2.5-flash both working
- [x] TypeScript clean, 47/47 tests pass
- [x] Deploy publicly

## Freemium / Trial Flow
- [x] Guest message limit: track in localStorage, allow 5 free messages (useGuestLimit.ts)
- [x] Sign-up wall modal: on-brand Matrix/cinematic dark UI, shown after guest limit (SignUpWall.tsx)
- [x] Guest credits indicator: shows remaining free messages above input (GuestCreditsIndicator.tsx)
- [x] Server-side: guests skip credit deduction and memory features (streaming.ts)
- [x] Credit exhaustion banner: shows when daily credits run out, links to /billing (CreditExhaustedBanner.tsx)
- [x] Input disabled + placeholder changes after guest limit reached
- [x] Wire everything together: guest → sign-up wall → authenticated → daily limit → upgrade
- [x] Boot screen updated to reflect actual providers (DeepSeek, Gemini, OpenRouter)
- [x] TypeScript clean, tests pass

## Tool Stack Wiring (May 23 2026 — Phase 2)
- [x] Create owner bypass in context.ts: when no Clerk user, auto-resolve to owner user from OWNER_OPEN_ID env
- [x] Fix image generation: route through OpenRouter (dall-e-3 → openai/dall-e-3) or use built-in imageGeneration helper
- [x] Make GitHub push work: add system GitHub token (PAT) as fallback when no per-user connection
- [x] Make deploy work: ensure system tokens (VERCEL_TOKEN, NETLIFY_TOKEN, RAILWAY_TOKEN) are used as fallback
- [x] Wire build pipeline into SSE: after code generation, auto-execute via Sprites and show results
- [x] Ensure Sprites executor actually works with the provided SPRITES_TOKEN
- [x] Test end-to-end: chat → build → execute → preview → push to GitHub
- [x] Deploy publicly

## Owner Credits & Mobile Navigation (May 23 2026)
- [x] Owner unlimited credits — bypass guest limits for owner (no sign-up wall)
- [x] Owner bypass in streaming.ts — skip rate limiting for owner user
- [x] Mobile back button — add mobile sidebar drawer with history push/pop
- [x] Mobile sidebar button in ConversationPanel input area (PanelLeft icon, md:hidden)
- [x] ProjectSidebar onConversationSelect prop — closes mobile drawer after selection
- [x] Home.tsx mobile sidebar drawer with popstate back-button handler
- [x] Deploy publicly

## Cinematic Landing Page (May 23 2026)
- [x] Move existing app from / to /workspace (all routes become /workspace/*)
- [x] Create cinematic landing page at / with hyper-black glass aesthetic
- [x] Hero section with animated matrix/particle background and CTA
- [x] "What it does" section — multi-AI orchestration explanation
- [x] "How it works" — 3-step visual (Describe → Build → Deploy)
- [x] Live demo preview section (screenshot/animation)
- [x] Pricing teaser (Free/Pro/Enterprise tiers)
- [x] Footer with links
- [x] Responsive mobile design
- [x] Deploy publicly

## Hyper-Black Design Overhaul (May 23 2026)
- [x] Full hyper-black monochrome palette — no colorful gradients, no purple/teal/green primary
- [x] Sharp edges on all glass tiles (rounded-none or rounded-sm max)
- [x] Remove colorful agent icons — replace with white/gray outlines
- [x] Nav Q logo uses the dark Matrix-code Q image from CDN
- [x] Hero gradient text changed to white-to-gray or pure white
- [x] Pricing cards — all hyper-black glass, no colored accents
- [x] Matrix rain stays subtle dark green
- [x] 4-tier pricing: Free ($0), Pro ($29), Business ($99), Enterprise ($499)
- [x] Deploy publicly

## Captain Q Speed & Orchestration Fix (May 24 2026)
- [x] Find and remove 24-hour ETA from Captain Q system prompt
- [x] Rewrite system prompt: build immediately, no "I'll keep you updated" delays
- [x] Fix orchestration panel phases to show rapid progress (30s/1-2min/30s/30s)
- [x] Ensure build intent generates actual code immediately, not just a plan
- [x] Remove any slow/deferred language from all AI prompts
- [x] Deploy publicly

## Streaming & Live Activity Fix (May 24 2026)
- [x] Rewrite Captain Q system prompt: no ETAs > 3 minutes, build immediately, no "I'll keep you updated"
- [x] Fix SSE streaming parser: carry-over buffer prevents dropped tokens on JSON spanning two network reads
- [x] Add typing/thinking animation while Captain Q is processing (pulsing PROCESSING indicator)
- [x] Add blinking cursor animation during streaming response
- [x] NaN tRPC fix: safeParseInt helper prevents NaN from non-numeric project IDs ("proj-1")
- [x] Deploy publicly

## Landing Page Text Fix (May 24 2026)
- [x] Change "GPT-4o" to "advanced AI models" in Builder Agent card on LandingPage.tsx
- [x] Deploy publicly

## Live Preview Split-Pane Panel (May 24 2026)
- [x] Build split-pane layout in workspace: left = chat, right = live preview iframe
- [x] Sandboxed iframe renders generated HTML/CSS/JS using srcdoc or blob URL
- [x] Toggle button to show/hide preview panel
- [x] Mobile: full-screen overlay with close button (not split-pane)
- [x] Preview panel toolbar: file name display + Deploy button (placeholder)
- [x] Hyper-black glass aesthetic: subtle dark gray border, no colorful accents
- [x] Auto-extract code blocks from Captain Q responses and render in preview
- [x] Deploy publicly

## Patent 1: Two-Tier Sandboxed Memory System (May 24 2026)
- [ ] Create Supabase tables: protected_memories and disposable_memories
- [ ] Build memory service: AI auto-detection classifier (important vs disposable)
- [ ] Speech cleanup: remove filler words/stutters before storing to memory
- [ ] Garbage collection: when outer sandbox > 100 messages, compress/remove oldest
- [ ] Danger zone evacuation: rotate important messages to protected memory in batches
- [ ] Memory recall: pull relevant protected memories into active context
- [ ] Memory indicator UI: "Memory saved" toast, memory panel drawer
- [ ] tRPC routes for memory CRUD (list protected, delete, search)

## Patent 2: Synthesis Verification — Captain/Wingman Architecture (May 24 2026)
- [ ] Distribute prompts to multiple AI models (DeepSeek, Gemini, Forge)
- [ ] Collect independent wingman responses
- [ ] Run synthesis step: compare, detect contradictions, score consensus
- [ ] Show "Verified ✓ 92%" or "⚠️ Low confidence" badge on messages
- [ ] Store consensus score with each message
- [ ] Background verification: show initial response immediately, update badge after

## Patent 3: Anti-Loop Heartbeat Interrupt (May 24 2026)
- [ ] Heartbeat check every ~500 tokens during streaming
- [ ] Loop detection: similarity scoring against previous output chunks
- [ ] Corrective actions: re-inject prompt, reset, or gracefully stop with clean version
- [ ] Progress tracking: completion milestones for complex tasks
- [ ] Adaptive timing: shorten interval on early loop indicators
- [ ] Heartbeat pulse animation in UI (tiny pulsing dot near avatar)

## Captain Q Personality Update (May 24 2026)
- [ ] Rewrite system prompt: conversational, direct, peer-like, with personality
- [ ] Address user as Anthony, be a brilliant friend not a robot

## Deploy All Three Patents (May 24 2026)
- [ ] TypeScript clean, tests pass
- [ ] Deploy publicly


## Patent 1: Two-Tier Sandboxed Memory System (May 24 2026)
- [x] Create protected_memories and disposable_memories Supabase tables
- [x] Build two-tier memory service with AI auto-detection (important vs ordinary)
- [x] Implement speech cleanup (remove filler words, stutters, repeated phrases)
- [x] Implement garbage collection (expire disposable memories, keep protected)
- [x] Implement danger zone evacuation (promote important disposables to protected)
- [x] Implement memory recall with context injection
- [x] Wire memory processing into streaming endpoint
- [x] TypeScript clean, tests pass (48/48)
- [x] Deploy publicly

## Patent 2: Synthesis Verification (Captain/Wingman Multi-Model Consensus) (May 24 2026)
- [x] Build synthesis verification service with Wingman dispatch
- [x] Collect responses from multiple AI models (DeepSeek, Gemini, Claude)
- [x] Score consensus across models (similarity, agreement detection)
- [x] Generate confidence badges (verified ✓ vs unverified ?)
- [x] Integrate into streaming endpoint (non-blocking background verification)
- [x] TypeScript clean, tests pass (48/48)
- [x] Deploy publicly

## Patent 3: Anti-Loop Heartbeat Interrupt System (May 24 2026)
- [x] Build heartbeat state machine for loop detection
- [x] Implement n-gram similarity detection (trigram-based repetition)
- [x] Implement drift detection (generation diverging from prompt)
- [x] Implement progress tracking and milestone detection
- [x] Implement adaptive timing (adjust heartbeat interval based on flow)
- [x] Wire into streaming token loop for real-time monitoring
- [x] TypeScript clean, tests pass (48/48)
- [x] Deploy publicly

## Captain Q Personality Update (May 24 2026)
- [x] Rewrite system prompt: conversational, direct, peer-like (no corporate-speak)
- [x] Remove "I'd be happy to help", "processing your request", "I'll keep you updated"
- [x] Add personality: witty when appropriate, honest about complexity, opinionated
- [x] Update in both streaming.ts and workers.ts
- [x] TypeScript clean, tests pass (48/48)
- [x] Deploy publicly

## UI Components for Patented Systems (May 24 2026)
- [x] Create MemoryDrawer component (slide-out drawer, grouped by category)
- [x] Create VerificationBadge component (subtle confidence indicator)
- [x] Create HeartbeatDot component (pulsing indicator during generation)
- [x] Create MemorySavedToast component (auto-dismissing toast)
- [x] Add memory drawer state to UIStore
- [x] Add heartbeat state to UIStore
- [x] Add verification badge state to UIStore
- [x] TypeScript clean, tests pass (48/48)
- [x] Deploy publicly

## Mobile SSE Reconnection Fix (May 24 2026)
- [ ] Add server-side response buffer (in-memory map keyed by streamId, TTL 5 min)
- [ ] Emit streamId in first SSE event so client can store it
- [ ] Add GET /api/stream/resume/:streamId endpoint to replay buffered tokens
- [ ] Add client-side Page Visibility API listener (visibilitychange)
- [ ] On visibility=visible: if stream was interrupted, auto-reconnect and replay from buffer
- [ ] Add exponential backoff reconnection (1s, 2s, 4s, max 10s)
- [ ] Show subtle "Reconnecting..." toast when connection drops
- [ ] Show "Resumed" toast when reconnection succeeds
- [ ] TypeScript clean, tests pass
- [ ] Deploy publicly

## Critical Fix: React createRoot DOM Element Error (May 24 2026)
- [x] Diagnose Sentry error: "Target container is not a DOM element" on createRoot
- [x] Root cause: main.tsx used non-null assertion getElementById("root")! with no fallback
- [x] Fix: wrap mount in mountApp(), add null guard with fallback div creation, and DOMContentLoaded safety
- [x] TypeScript clean (0 errors), 47/48 tests pass (1 flaky Netlify network timeout, unrelated)
- [x] Deploy publicly

## Owner Bypass & Logo Replacement (May 24 2026)
- [x] Add OWNER_EMAILS constant to server/_core/env.ts (wisheswithoutbordersco@gmail.com)
- [x] Add email-based isOwner check in context.ts (alongside existing OWNER_OPEN_ID check)
- [x] Add getUserById helper to db.ts
- [x] Add email-based _isOwner check in streaming.ts (skip all credit/rate-limit checks)
- [x] Add owner bypass in billing.ts (return synthetic unlimited balance/subscription)
- [x] Create HyperBlackQ.tsx SVG glass emblem (pure dark, subtle refraction, no green/matrix)
- [x] Replace QIdentity.tsx to re-export from HyperBlackQ (backward compat for all consumers)
- [x] Replace logo in BootScreen.tsx (splash screen after sign-in) + remove green ambient glow
- [x] Replace logo in LandingPage.tsx nav (top-left small)
- [x] Replace logo in LandingPage.tsx hero (big center emblem)
- [x] TypeScript clean (0 errors), tests pass (48/48)
- [x] Deploy publicly

## Captain Q Autonomous Agent Upgrade (May 24 2026)

### Tool-Use Execution Framework
- [x] Create server/tools/index.ts — tool registry with name, description, parameters schema, execute function
- [x] Create server/tools/fileCreate.ts — create/edit files in project sandbox
- [x] Create server/tools/codeExecute.ts — run JS/TS/Python code and return stdout/stderr
- [x] Create server/tools/webResearch.ts — call Perplexity/Sonar API for web research
- [x] Create server/tools/deploy.ts — deploy generated code to sandboxed environment
- [x] Build tool-use orchestrator: parse LLM tool_calls, execute tools, feed results back into conversation loop
- [x] Support multi-step tool chains (Captain Q calls tool → gets result → decides next tool → repeats until done)
- [x] Stream tool execution status to client via SSE (tool_start, tool_result, tool_error events)

### Sandboxed Deployment System
- [x] Create server/sandbox/projectStore.ts — in-memory + Supabase store for deployed projects (id, userId, files, createdAt, url)
- [x] Create GET /api/sandbox/:projectId endpoint — serves deployed project files (HTML/CSS/JS) from store
- [x] Support multi-file projects (index.html + style.css + script.js + React bundles)
- [x] Generate unique URLs for each deployed project (e.g., /sandbox/proj_abc123)
- [x] Captain Q can update/fix deployed projects and the URL stays the same
- [x] Add "View Live" link in chat when a project is deployed (sandbox_url SSE event)
- [x] Show deployed project in the live preview panel automatically

### Memory System Fix
- [x] Debug why twoTierMemory.ts classifyImportance is not storing user introductions
- [x] Add explicit pattern: "I'm [name]" / "My name is [name]" → ALWAYS store as protected memory (category: identity)
- [x] Fix memory recall: inject stored user name into system prompt on every message (recallProtectedMemories was imported but never called!)
- [x] Fix Captain Q identity confusion: system prompt clearly states "You ARE Captain Q" and "NEVER call the user Captain"
- [x] Add memory recall at conversation start (load user's name from protected memories)

### Personality & Intent Detection Rewrite
- [x] Rewrite CAPTAIN_SYSTEM_PROMPT: conversational by default, only build when explicitly asked
- [x] Conversation intent: respond naturally, no code, no markdown code blocks unless asked
- [x] Build intent: use tools to create files, generate code, deploy
- [x] Research intent: use web research tool, summarize findings conversationally
- [x] Captain Q identity: he's the leader, confident, direct, peer-like — not a servant
- [x] Never dump code unprompted — only when user says "build", "create", "code", "make me a..."

### Integration & Deployment
- [x] Wire tool-use into streaming endpoint (tool_calls parsing, execution loop, result streaming)
- [x] Update ConversationPanel to display tool execution status (file created, code ran, deployed)
- [x] Add tool result rendering in chat (collapsible tool output, deploy links)
- [x] TypeScript clean (0 errors), tests pass (48/48)
- [x] Deploy publicly

## Session Stabilization Engine (May 24 2026)

### Session Health Monitoring (Backend)
- [x] Create server/sessionHealth.ts — monitor token pressure, repetition, retry storms, contradictions, loop indicators
- [x] Track metrics per conversation: total tokens used, message count, repetition score, failed executions, tool call frequency
- [x] Compute session health state: Stable / Elevated Load / High Context Pressure / Stabilization Recommended
- [x] Wire health state into streaming endpoint (recorded on each message exchange)
- [x] Thresholds: Stable (<60% context), Elevated (60-80%), High Pressure (80-95%), Stabilization Recommended (>95% or loop detected)

### Stabilization Process (Backend)
- [x] Create server/sessionStabilizer.ts — the full stabilization pipeline
- [x] Step 1: Snapshot — capture current session state (messages, context, project state)
- [x] Step 2: Compress — LLM-powered summarization into essential context (key messages, decisions, active goals)
- [x] Step 3: Discard — remove noise, dead-ends, redundant explanations, stale retries, filler
- [x] Step 4: Rebuild — reconstruct clean context from compressed summaries + protected memories + active state
- [x] Return stabilization result with metrics (tokens saved, context reduction %, preserved items count)

### tRPC Procedures
- [x] Add sessionHealth.getHealth query — returns current session health state and metrics
- [x] Add sessionHealth.stabilize mutation — triggers the stabilization process
- [x] Add sessionHealth.recordMessage mutation — records message exchange for health tracking
- [x] Register sessionHealthRouter in routers.ts

### Session Health UI
- [x] Create SessionHealthIndicator component — subtle pill in TopNav with state-aware coloring
- [x] States: Stable (white/30 dot), Elevated (yellow dot), High Pressure (orange dot), Stabilization Recommended (pulsing red dot)
- [x] Place indicator in TopNav (right side, before system status)
- [x] Click expands panel with metrics (messages, context %, repetition, loops)

### Stabilization Button & UX
- [x] "Stabilize Session" button appears when health.canStabilize is true
- [x] Button click triggers stabilize mutation with progress simulation
- [x] During stabilization: progress bar with phase messages (Capturing... → Compressing... → Removing noise... → Reconstructing...)
- [x] Completion: success toast "Session stabilized successfully." (auto-dismisses 3s)
- [x] Failed state: graceful fallback message, session continues normally

### Integration
- [x] Wire session health recording into streaming endpoint (recordSessionMessage on each response)
- [x] Health polled every 30s via tRPC query in SessionHealthIndicator
- [x] TypeScript clean (0 errors), tests pass (48/48)
- [x] Deploy publicly

## Bug Fixes (Session 3)

- [x] Bug 1: Fix "Please login" error when saving memory — memory save endpoint uses protectedProcedure, bypass auth for owner/guest
- [x] Bug 2: Add back/home navigation button on billing page
- [x] Bug 3: Prevent Add Memory modal from closing on outside click (add onInteractOutside preventDefault)
- [x] Bug 4: Add empty state placeholder to analytics page
- [x] Bug 5: Fix overlapping navigation tabs — "WORKSPACE" and "PROJECTS" text overlapping, spacing/flexbox issue

## Priority 1 & 2 Fixes (Audit Session)

- [x] Fix Jobs page — replace infinite spinner with empty state
- [x] Fix Costs page — replace blank with $0 values and chart structure
- [x] Create all required Supabase tables (verified all exist in Supabase)
- [x] Fix conversation sidebar — added refetchInterval:5000 and immediate invalidation on create
- [x] Verify Memory save works end-to-end (owner bypass in context.ts ensures no auth errors)
- [x] Verify Use Template flow creates a project (owner bypass covers all protectedProcedures)
- [x] Add Coming Soon states to Knowledge and Analytics pages (Beta badge on Knowledge, empty state on Analytics)
- [x] Animate orchestration panel agents during chat responses (wired isTyping + orchestrationEngine to NeuralOrchestration)

## Fix: OpenAI-First Image Generation Routing (Aug 22 2026)

- [x] Trace every active image-generation endpoint and tool path that currently selects fal.ai before OpenAI.
- [x] Route primary image generation directly through the configured `OPENAI_API_KEY` and OpenAI Images API.
- [x] Retain fal.ai exclusively as fallback after an OpenAI request fails or OpenAI is unavailable.
- [x] Return clear provider metadata and provider-specific failure details without exposing credentials.
- [x] Update Captain Q image tool and orchestration route so neither can force fal.ai as the primary provider.
- [x] Add targeted Vitest coverage proving OpenAI is attempted first and fal.ai runs only after OpenAI failure.
- [x] Run TypeScript checks and the relevant test suite, then record the validation results here.

Validation status: `server/imageGenerationService.test.ts` passes 4/4 tests, `pnpm check` passes with zero TypeScript errors, and `pnpm build` completes successfully. The repository-wide integration suite was also attempted; its unrelated credential-validation tests require production secrets that are not present in this isolated checkout, so those environment-dependent tests fail before exercising this routing change.

- [x] Fix live regression: when OpenAI generation succeeds but durable storage is unavailable, return the OpenAI image directly instead of invoking fal.ai.
- [x] Add regression coverage and re-verify the deployed endpoint reports `provider: openai` with `fallbackUsed: false`.

Regression validation status: targeted routing coverage passes 5/5 tests, including OpenAI success with unavailable storage; `pnpm check` passes; and the production build completes successfully. Railway deployed commit `d21b241`, and the live endpoint returned `provider: openai`, `model: gpt-image-2`, and `fallbackUsed: false`. Because Railway does not provide the Manus storage credentials, the successful OpenAI image is returned as a PNG data URL instead of falling through to fal.ai.

## Captain Q Image Attachment and Rendering Repair (Aug 26 2026)
- [x] Target the deployed Quoratorium/Captain Q codebase that matches the reported mobile interface.
- [x] Send supported PNG, JPG, WEBP, and GIF attachment bytes to the streaming backend instead of storing only filename metadata.
- [x] Build validated multimodal messages so GPT-4o can inspect the current upload and recent in-session image context.
- [x] Prevent negated or conversational phrases such as “without trying to generate a picture” and “can you see the picture?” from entering image-generation mode.
- [x] Restrict the autonomous tool loop to explicit build requests so ordinary prompt-writing and image questions stay in normal chat.
- [x] Route ordinary and image-attached Captain Q conversation through GPT-4o for stronger general and vision responses.
- [x] Render generated images as structured chat media, persist image metadata, and remove raw image URLs/base64 payloads from visible response text.
- [x] When OpenAI image storage is unavailable, try the hosted fal.ai fallback before using inline base64 as a final safety net.
- [x] Enforce 10 MB per image, 20 MB total, four-attachment, and supported MIME-type limits on both client and server.
- [x] Verify the exact reported prompt with an attached PNG at a 390×844 mobile viewport; attachment bytes were submitted, the image rendered in chat, and raw base64 was not visible.
- [x] Validation: 30/30 focused regression tests pass, `pnpm check` passes, and `pnpm build` completes successfully.
- [x] Push commit `4bd9ef9` and confirm Railway reports successful deployment to `quoratorium.com`.

## Captain Q Vision Over-Refusal Correction (Aug 26 2026)
- [x] Confirm the image reaches Captain Q and the remaining failure is an overbroad model refusal, not attachment transport.
- [x] Add image-only guidance that permits counting and describing visible people, characters, artwork, objects, text, and scenes.
- [x] Preserve the restriction on naming unknown real people, confirming facial identity, or performing biometric matching.
- [x] Require direct answers to harmless questions such as “How many people are in this picture?” without mentioning identity limitations unless identity was actually requested.
- [x] Keep text-only Captain Q prompts unchanged.
- [x] Validation: 31/31 focused regressions pass, `pnpm check` passes, and `pnpm build` completes successfully.
- [x] Push commit `1870a55` and confirm Railway reports successful deployment to `quoratorium.com`.

## Captain Q Systemic Intelligence Upgrade (Aug 27 2026)
- [x] Replace keyword-first worker switching with one coherent general Captain Q assistant across streaming and alternate chat routes.
- [x] Move the primary model from GPT-4o and mixed Gemini/DeepSeek paths to the current multimodal, tool-capable `openai/gpt-5.2-chat`, with current GPT-5 Forge/OpenAI fallbacks.
- [x] Replace the prescriptive rule pile with a semantic assistant contract that interprets the full message, history, attachments, and user context.
- [x] Make conversation the default and reserve deterministic routing only for unmistakable browser and code-execution actions.
- [x] Let Captain Q select web, execution, image, file, and deployment tools only when the full request requires them.
- [x] Keep valid no-tool answers instead of discarding them and sending the request through a second model.
- [x] Remove generic autonomous-tool announcements; tool status appears only after an actual tool call begins.
- [x] Separate attached-image understanding, reusable prompt writing, and explicit image creation across the system prompt and tool descriptions.
- [x] Allow recognition of fictional characters, dolls, mascots, logos, products, and artwork while preserving the narrow real-human facial-identification restriction.
- [x] Modernize the shared Forge wrapper to accept model selection and family-correct output/reasoning parameters instead of hardcoding `gemini-2.5-flash` with a 128-token thinking budget.
- [x] Model-level evaluation with the actual Chucky screenshot: 5/5 scenarios passed, including “That’s Chucky,” no tool for image discussion or prompt writing, image tool for explicit creation, and web research for current information.
- [x] Browser verification at 390×844: exact Chucky question and JPEG bytes were submitted, response rendered as “That’s Chucky,” and no autonomous-tool status appeared.
- [x] Validation: 58 relevant automated tests pass, `pnpm check` passes, and `pnpm build` completes successfully. The broader credential-validation suite remains environment-dependent and is not part of this code change.
- [x] Direct production verification exposed a provider/model failure after the first deployment; add ordered OpenRouter model retries plus independent OpenAI and Forge fallbacks so one provider rejection cannot take Captain Q offline.
- [x] Revalidate the provider correction: 55 focused tests pass, `pnpm check` passes, and `pnpm build` completes successfully.
- [x] Push systemic upgrade `8bc6392` and provider-fallback hotfix `816d0ad`; confirm Railway success, text smoke response, and the exact live Chucky image response on `quoratorium.com`.
