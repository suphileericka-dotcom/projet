type AnalyticsValue = string | number | boolean | null | undefined;

declare global {
  interface Window {
    dataLayer: unknown[][];
    gtag?: (...args: unknown[]) => void;
  }
}

const DEFAULT_GA_MEASUREMENT_ID = "G-NTC0Z9Y3ZV";
const GA_MEASUREMENT_ID =
  import.meta.env.VITE_GA_MEASUREMENT_ID?.trim() || DEFAULT_GA_MEASUREMENT_ID;

let analyticsInitialized = false;
let lastTrackedPage = "";

function isAnalyticsEnabled() {
  return typeof window !== "undefined" && Boolean(GA_MEASUREMENT_ID);
}

function getGtag() {
  if (!isAnalyticsEnabled() || typeof window.gtag !== "function") {
    return null;
  }

  return window.gtag;
}

export function initAnalytics() {
  if (!isAnalyticsEnabled() || analyticsInitialized) {
    return;
  }

  window.dataLayer = window.dataLayer || [];
  window.gtag =
    window.gtag ||
    function gtag(...args: unknown[]) {
      window.dataLayer.push(args);
    };

  const existingScript = document.querySelector<HTMLScriptElement>(
    `script[data-ga-measurement-id="${GA_MEASUREMENT_ID}"]`
  );

  if (!existingScript) {
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(
      GA_MEASUREMENT_ID
    )}`;
    script.dataset.gaMeasurementId = GA_MEASUREMENT_ID;
    document.head.appendChild(script);
  }

  window.gtag("js", new Date());
  window.gtag("config", GA_MEASUREMENT_ID, {
    anonymize_ip: true,
    send_page_view: false,
  });

  analyticsInitialized = true;
}

export function trackPageView(path: string) {
  const gtag = getGtag();
  const normalizedPath = path || "/";

  if (!gtag || lastTrackedPage === normalizedPath) {
    return;
  }

  lastTrackedPage = normalizedPath;

  gtag("event", "page_view", {
    page_location: window.location.href,
    page_path: normalizedPath,
    page_title: document.title,
  });
}

export function trackAnalyticsEvent(
  eventName: string,
  params: Record<string, AnalyticsValue> = {}
) {
  const gtag = getGtag();

  if (!gtag) {
    return;
  }

  const sanitizedParams = Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined)
  );

  gtag("event", eventName, sanitizedParams);
}
