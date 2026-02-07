import { useEffect, useState } from "react";
import { translate } from "../i18n";

export type Lang = "fr" | "en" | "es" | "de" | "it";

export function useLang() {
  const [lang, setLang] = useState<Lang>(
    (localStorage.getItem("language") as Lang) || "fr"
  );

  useEffect(() => {
    function syncLang() {
      const stored = localStorage.getItem("language") as Lang;
      if (stored && stored !== lang) {
        setLang(stored);
      }
    }

    window.addEventListener("storage", syncLang);
    return () => window.removeEventListener("storage", syncLang);
  }, [lang]);

  function t(key: string): string {
    return translate(key, lang);
  }

  return { t, lang };
}
