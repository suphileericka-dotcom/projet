import {
  buildCountryAccessError,
  clearStoredCountry,
  storeCountryAccessError,
} from "../config/countryAccess";

export const AUTH_STATE_CHANGE_EVENT = "ameya:auth-state-change";
export const POST_LOGIN_REDIRECT_KEY = "postLoginRedirect";

const AUTH_STORAGE_KEYS = ["authToken", "userId", "username", "avatar"] as const;

function notifyAuthStateChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(AUTH_STATE_CHANGE_EVENT));
}

export function clearAuthSession() {
  for (const key of AUTH_STORAGE_KEYS) {
    localStorage.removeItem(key);
  }

  clearStoredCountry();
  notifyAuthStateChanged();
}

export function rememberPostLoginRedirect(target?: string) {
  if (typeof window === "undefined") return;

  const nextTarget =
    typeof target === "string" && target.startsWith("/")
      ? target
      : `${window.location.pathname}${window.location.search}`;

  window.sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, nextTarget);
}

export function clearAuthSessionForCountry(message?: string) {
  storeCountryAccessError(message || buildCountryAccessError());
  clearAuthSession();
}
