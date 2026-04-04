const STRIPE_CHECKOUT_SESSION_PLACEHOLDER = "{CHECKOUT_SESSION_ID}";
const ONE_TIME_DM_PRICE_ID =
  import.meta.env.VITE_STRIPE_DM_ONE_TIME_PRICE_ID?.trim() || "";
const SUBSCRIPTION_DM_PRICE_ID =
  import.meta.env.VITE_STRIPE_DM_SUBSCRIPTION_PRICE_ID?.trim() || "";

export type DmPaymentOptionId = "one_time" | "subscription";

export type DmPaymentOption = {
  id: DmPaymentOptionId;
  title: string;
  priceLabel: string;
  billingLabel: string;
  description: string;
  checkoutMode: "payment" | "subscription";
  priceId?: string;
  featured?: boolean;
};

export const DM_PAYMENT_OPTIONS: DmPaymentOption[] = [
  {
    id: "one_time",
    title: "Chat unique",
    priceLabel: "4,99 EUR",
    billingLabel: "Paiement unique",
    description: "Debloque cette conversation privee avec ce profil uniquement.",
    checkoutMode: "payment",
    priceId: ONE_TIME_DM_PRICE_ID || undefined,
  },
  {
    id: "subscription",
    title: "DM illimites",
    priceLabel: "9,75 EUR",
    billingLabel: "Abonnement mensuel",
    description: "Active l'acces illimite aux chats prives tant que l'abonnement reste actif.",
    checkoutMode: "subscription",
    priceId: SUBSCRIPTION_DM_PRICE_ID || undefined,
    featured: true,
  },
];

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

export function getDmPaymentOption(
  optionId?: string | null
): DmPaymentOption | null {
  if (!optionId) return null;

  return DM_PAYMENT_OPTIONS.find((option) => option.id === optionId) ?? null;
}

export function buildDmPaymentCheckoutPayload(
  targetUserId: string,
  optionId: DmPaymentOptionId
) {
  const selectedOption = getDmPaymentOption(optionId);
  const { successUrl, cancelUrl } = buildDmCheckoutUrls(targetUserId);

  return {
    targetUserId,
    successUrl,
    cancelUrl,
    optionId,
    accessType: optionId,
    checkoutMode: selectedOption?.checkoutMode ?? "payment",
    ...(selectedOption?.priceId ? { priceId: selectedOption.priceId } : {}),
  };
}
