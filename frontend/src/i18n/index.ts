import fr from "./fr";
import en from "./en";
import es from "./es";
import de from "./de";
import it from "./it";

export type TranslationDict = Record<string, string>;
export type TranslationParams = Record<
  string,
  string | number | boolean | null | undefined
>;

const translations: Record<string, TranslationDict> = {
  fr,
  en,
  es,
  de,
  it,
};

function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;

  return template.replace(/\{\{(\w+)\}\}/g, (_, token: string) => {
    const value = params[token];
    return value === undefined || value === null ? "" : String(value);
  });
}

export function translate(
  key: string,
  lang: string,
  params?: TranslationParams
): string {
  const dict = translations[lang] ?? translations.fr;
  const template = dict[key] ?? translations.fr[key] ?? key;
  return interpolate(template, params);
}
