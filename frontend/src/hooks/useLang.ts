import { useEffect, useState } from "react";
import { translate } from "../i18n";

export type Lang = "fr" | "en" | "es" | "de" | "it";

const DEFAULT_LANG: Lang = "fr";
const VALID_LANGS: Lang[] = ["fr", "en", "es", "de", "it"];

function getStoredLang(): Lang {
  const stored = localStorage.getItem("language");
  if (stored && VALID_LANGS.includes(stored as Lang)) {
    return stored as Lang;
  }
  return DEFAULT_LANG;
}

export function useLang() {
  const [lang, setLangState] = useState<Lang>(getStoredLang());

  // Sync inter-onglets
  useEffect(() => {
    function syncLang() {
      setLangState(getStoredLang());
    }

    window.addEventListener("storage", syncLang);
    return () => window.removeEventListener("storage", syncLang);
  }, []);

  // Setter propre (à utiliser partout)
  function setLang(newLang: Lang) {
    if (!VALID_LANGS.includes(newLang)) return;

    localStorage.setItem("language", newLang);
    setLangState(newLang);
  }

  function t(key: string): string {
    return translate(key, lang);
  }

  return { t, lang, setLang };
}