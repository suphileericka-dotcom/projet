const STRIPE_CHECKOUT_SESSION_PLACEHOLDER = "{CHECKOUT_SESSION_ID}";

export function buildPrivateChatPath(targetUserId?: string | null) {
  const normalizedTargetUserId = targetUserId?.trim();
  if (!normalizedTargetUserId) return "/private-chat";

  return `/private-chat/${encodeURIComponent(normalizedTargetUserId)}`;
}

export function buildDmCheckoutUrls(targetUserId?: string | null) {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "http://localhost:5173";

  const successUrl = new URL(buildPrivateChatPath(targetUserId), origin);
  successUrl.searchParams.set("paid", "1");
  successUrl.searchParams.set("checkout", "success");
  successUrl.searchParams.set(
    "session_id",
    STRIPE_CHECKOUT_SESSION_PLACEHOLDER
  );
  if (targetUserId?.trim()) {
    successUrl.searchParams.set("targetUserId", targetUserId.trim());
  }

  const cancelUrl = new URL("/match", origin);
  cancelUrl.searchParams.set("checkout", "cancelled");
  if (targetUserId?.trim()) {
    cancelUrl.searchParams.set("targetUserId", targetUserId.trim());
  }

  return {
    successUrl: successUrl.toString(),
    cancelUrl: cancelUrl.toString(),
  };
}
