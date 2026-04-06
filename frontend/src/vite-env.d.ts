/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_GA_MEASUREMENT_ID?: string;
  readonly VITE_STRIPE_DM_ONE_TIME_PRICE_ID?: string;
  readonly VITE_STRIPE_DM_SUBSCRIPTION_PRICE_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
