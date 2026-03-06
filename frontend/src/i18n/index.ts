import fr from "./fr";
import en from "./en";
import es from "./es";
import de from "./de";
import it from "./it";

export type TranslationDict = Record<string, string>;

const translations: Record<string, TranslationDict> = {
  fr,
  en,
  es,
  de,
  it,
};

export function translate(key: string, lang: string): string {
  const dict = translations[lang] ?? translations.fr;
  return dict[key] ?? key;
}
