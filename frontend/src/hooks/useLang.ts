import { useEffect, useState } from "react";
import { translate, type TranslationParams } from "../i18n";

export type Lang = "fr" | "en" | "es" | "de" | "it";

const DEFAULT_LANG: Lang = "fr";
const VALID_LANGS: Lang[] = ["fr", "en", "es", "de", "it"];
export const LANGUAGE_CHANGE_EVENT = "ameya:language-change";

function getStoredLang(): Lang {
  const stored = localStorage.getItem("language");
  if (stored && VALID_LANGS.includes(stored as Lang)) {
    return stored as Lang;
  }
  return DEFAULT_LANG;
}

export function isValidLang(value: string | null | undefined): value is Lang {
  return !!value && VALID_LANGS.includes(value as Lang);
}

export function useLang() {
  const [lang, setLangState] = useState<Lang>(getStoredLang());

  useEffect(() => {
    function syncLang() {
      setLangState(getStoredLang());
    }

    window.addEventListener("storage", syncLang);
    window.addEventListener(LANGUAGE_CHANGE_EVENT, syncLang);

    return () => {
      window.removeEventListener("storage", syncLang);
      window.removeEventListener(LANGUAGE_CHANGE_EVENT, syncLang);
    };
  }, []);

  function setLang(newLang: Lang) {
    if (!VALID_LANGS.includes(newLang)) return;

    localStorage.setItem("language", newLang);
    setLangState(newLang);
    window.dispatchEvent(new Event(LANGUAGE_CHANGE_EVENT));
  }

  function t(key: string, params?: TranslationParams): string {
    return translate(key, lang, params);
  }

  return { t, lang, setLang };
}
