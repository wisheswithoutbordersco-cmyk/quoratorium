import { TRPCError } from "@trpc/server";
import { ENV } from "./env";
import { getSupabaseAdmin } from "../supabase";

export type NotificationPayload = {
  title: string;
  content: string;
};

const TITLE_MAX_LENGTH = 1200;
const CONTENT_MAX_LENGTH = 20000;

const trimValue = (value: string): string => value.trim();
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const buildEndpointUrl = (baseUrl: string): string => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};

const validatePayload = (input: NotificationPayload): NotificationPayload => {
  if (!isNonEmptyString(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required.",
    });
  }
  if (!isNonEmptyString(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required.",
    });
  }

  const title = trimValue(input.title);
  const content = trimValue(input.content);

  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`,
    });
  }

  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`,
    });
  }

  return { title, content };
};

/** Exposes deployment capability, never credential existence or credential values. */
export function getNotificationDeliveryStatus(): {
  configured: boolean;
  detail: string;
} {
  const configured = Boolean(ENV.forgeApiUrl && ENV.forgeApiKey);
  return {
    configured,
    detail: configured
      ? "In-app notification delivery is configured."
      : "In-app notification delivery is unavailable because this deployment has not configured the notification service.",
  };
}

/**
 * Looks up a user opt-in immediately before dispatching. If the database or
 * delivery configuration is unavailable, it intentionally returns false rather
 * than pretending that a notification was delivered.
 */
export async function notifyUserIfEnabled(
  userId: number,
  preferenceKey:
    | "notifications.jobCompletion"
    | "notifications.budgetWarnings"
    | "notifications.errorAlerts",
  payload: NotificationPayload
): Promise<boolean> {
  const db = getSupabaseAdmin();
  if (!db || !getNotificationDeliveryStatus().configured) return false;

  try {
    const { data, error } = await db
      .from("user_settings")
      .select("value")
      .eq("user_id", userId)
      .eq("key", preferenceKey)
      .maybeSingle();
    if (error || data?.value === "false") return false;
    return await notifyOwner(payload);
  } catch (error) {
    console.warn(
      "[Notification] Unable to check user notification preference:",
      error
    );
    return false;
  }
}

/**
 * Dispatches a project-owner notification through the Manus Notification Service.
 * Returns `true` if the request was accepted, `false` when the upstream service
 * cannot be reached (callers can fall back to email/slack). Validation errors
 * bubble up as TRPC errors so callers can fix the payload.
 */
export async function notifyOwner(
  payload: NotificationPayload
): Promise<boolean> {
  const { title, content } = validatePayload(payload);

  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured.",
    });
  }

  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured.",
    });
  }

  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1",
      },
      body: JSON.stringify({ title, content }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${
          detail ? `: ${detail}` : ""
        }`
      );
      return false;
    }

    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}
