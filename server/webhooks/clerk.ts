/**
 * Clerk Webhook Handler
 * Handles user.created and user.updated events from Clerk.
 * - user.created: Creates user in Supabase + sends welcome email
 * - user.updated: Updates user record in Supabase
 */
import { Router, Request, Response } from "express";
import { Webhook } from "svix";
import { sendWelcomeEmail } from "../services/email";
import { getSupabaseAdmin } from "../supabase";

const router = Router();

interface ClerkUserEvent {
  data: {
    id: string;
    email_addresses: Array<{
      email_address: string;
      id: string;
    }>;
    first_name: string | null;
    last_name: string | null;
    image_url: string | null;
    created_at: number;
    updated_at: number;
  };
  type: string;
}

/**
 * POST /api/webhooks/clerk
 * Receives Clerk webhook events and processes them.
 * Signature verification is always enforced using CLERK_WEBHOOK_SECRET.
 */
router.post("/", async (req: Request, res: Response) => {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    console.error("[Clerk Webhook] CLERK_WEBHOOK_SECRET is not configured");
    return res.status(500).json({ error: "Webhook secret not configured" });
  }

  const svixId = req.headers["svix-id"] as string;
  const svixTimestamp = req.headers["svix-timestamp"] as string;
  const svixSignature = req.headers["svix-signature"] as string;

  if (!svixId || !svixTimestamp || !svixSignature) {
    console.error("[Clerk Webhook] Missing svix headers");
    return res.status(400).json({ error: "Missing svix headers" });
  }

  try {
    const wh = new Webhook(WEBHOOK_SECRET);
    wh.verify(JSON.stringify(req.body), {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    });
  } catch (err) {
    console.error("[Clerk Webhook] Signature verification failed:", err);
    return res.status(401).json({ error: "Invalid signature" });
  }

  const event = req.body as ClerkUserEvent;
  const eventType = event.type;

  console.log(`[Clerk Webhook] Received event: ${eventType}`);

  try {
    switch (eventType) {
      case "user.created":
        await handleUserCreated(event);
        break;
      case "user.updated":
        await handleUserUpdated(event);
        break;
      default:
        console.log(`[Clerk Webhook] Unhandled event type: ${eventType}`);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error(`[Clerk Webhook] Error processing ${eventType}:`, err);
    return res.status(500).json({ error: "Internal error" });
  }
});

async function handleUserCreated(event: ClerkUserEvent) {
  const { data } = event;
  const email = data.email_addresses?.[0]?.email_address;
  const name = [data.first_name, data.last_name].filter(Boolean).join(" ") || null;
  const clerkId = data.id;

  console.log(`[Clerk Webhook] Creating user: ${clerkId} (${email})`);

  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not available");

  // Check if user already exists
  const { data: existing } = await supabase
    .from("users")
    .select("id")
    .eq("clerk_id", clerkId)
    .single();

  if (existing) {
    console.log(`[Clerk Webhook] User ${clerkId} already exists, skipping creation`);
    return;
  }

  // Create user in Supabase
  const { error } = await supabase.from("users").insert({
    clerk_id: clerkId,
    email: email || null,
    name: name,
    role: "user",
    login_method: "clerk",
  });

  if (error) {
    console.error("[Clerk Webhook] Failed to create user in Supabase:", error);
    throw error;
  }

  console.log(`[Clerk Webhook] User created in Supabase: ${clerkId}`);

  // Send welcome email (fire-and-forget, don't block webhook response)
  if (email) {
    sendWelcomeEmail(email, name || "Captain").catch((err) => {
      console.error("[Clerk Webhook] Failed to send welcome email:", err);
    });
  }
}

async function handleUserUpdated(event: ClerkUserEvent) {
  const { data } = event;
  const email = data.email_addresses?.[0]?.email_address;
  const name = [data.first_name, data.last_name].filter(Boolean).join(" ") || null;
  const clerkId = data.id;

  console.log(`[Clerk Webhook] Updating user: ${clerkId}`);

  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not available");

  const { error } = await supabase
    .from("users")
    .update({
      email: email || undefined,
      name: name || undefined,
      updated_at: new Date().toISOString(),
    })
    .eq("clerk_id", clerkId);

  if (error) {
    console.error("[Clerk Webhook] Failed to update user in Supabase:", error);
    throw error;
  }

  console.log(`[Clerk Webhook] User updated in Supabase: ${clerkId}`);
}

export { router as clerkWebhookRouter };
