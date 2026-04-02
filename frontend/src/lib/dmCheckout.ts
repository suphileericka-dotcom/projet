const PENDING_DM_CHECKOUT_KEY = "pendingDmCheckout";
const STRIPE_CHECKOUT_SESSION_PLACEHOLDER = "{CHECKOUT_SESSION_ID}";

export type PendingDmCheckout = {
  targetUserId: string;
  targetName?: string;
  targetAvatar?: string;
  mode: "single" | "subscription";
  createdAt: number;
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function savePendingDmCheckout(payload: PendingDmCheckout) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(PENDING_DM_CHECKOUT_KEY, JSON.stringify(payload));
}

export function readPendingDmCheckout(maxAgeMs = 6 * 60 * 60 * 1000) {
  if (!canUseStorage()) return null;

  const rawValue = window.localStorage.getItem(PENDING_DM_CHECKOUT_KEY);
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(rawValue) as Partial<PendingDmCheckout>;
    if (
      typeof parsed.targetUserId !== "string" ||
      !parsed.targetUserId.trim() ||
      (parsed.mode !== "single" && parsed.mode !== "subscription") ||
      typeof parsed.createdAt !== "number"
    ) {
      window.localStorage.removeItem(PENDING_DM_CHECKOUT_KEY);
      return null;
    }

    if (Date.now() - parsed.createdAt > maxAgeMs) {
      window.localStorage.removeItem(PENDING_DM_CHECKOUT_KEY);
      return null;
    }

    return {
      targetUserId: parsed.targetUserId,
      targetName: parsed.targetName,
      targetAvatar: parsed.targetAvatar,
      mode: parsed.mode,
      createdAt: parsed.createdAt,
    } satisfies PendingDmCheckout;
  } catch {
    window.localStorage.removeItem(PENDING_DM_CHECKOUT_KEY);
    return null;
  }
}

export function clearPendingDmCheckout() {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(PENDING_DM_CHECKOUT_KEY);
}

export function buildDmCheckoutUrls(targetUserId?: string | null) {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "http://localhost:5173";

  const successUrl = new URL("/private-chat", origin);
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
