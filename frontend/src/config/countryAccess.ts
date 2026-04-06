export type AllowedCountry = {
  code: string;
  label: string;
  aliases: string[];
};

export const COUNTRY_STORAGE_KEY = "country";
export const COUNTRY_ACCESS_ERROR_STORAGE_KEY = "countryAccessError";

export const ALLOWED_COUNTRIES: AllowedCountry[] = [
  {
    code: "FR",
    label: "France",
    aliases: ["FR", "FRANCE"],
  },
  {
    code: "BE",
    label: "Belgique",
    aliases: ["BE", "BELGIQUE", "BELGIUM"],
  },
  {
    code: "CH",
    label: "Suisse",
    aliases: ["CH", "SUISSE", "SWITZERLAND"],
  },
  {
    code: "CA",
    label: "Canada",
    aliases: ["CA", "CANADA"],
  },
  {
    code: "HT",
    label: "Haiti",
    aliases: ["HT", "HAITI"],
  },
  {
    code: "US",
    label: "Amerique",
    aliases: [
      "US",
      "USA",
      "AMERIQUE",
      "AMERICA",
      "ETATS UNIS",
      "ETATS-UNIS",
      "UNITED STATES",
      "UNITED STATES OF AMERICA",
    ],
  },
  {
    code: "CG",
    label: "Congo-Brazzaville",
    aliases: [
      "CG",
      "CONGO BRAZZAVILLE",
      "CONGO-BRAZZAVILLE",
      "CONGO BRAAZAVILLE",
      "CONGO-BRAAZAVILLE",
      "REPUBLIQUE DU CONGO",
      "REPUBLIC OF THE CONGO",
    ],
  },
  {
    code: "IT",
    label: "Italie",
    aliases: ["IT", "ITALIE", "ITALY", "ITALI"],
  },
  {
    code: "PH",
    label: "Philippines",
    aliases: [
      "PH",
      "PHILIPPINES",
      "PHILIPPINE",
      "PHILIPINNE",
      "PHILIPINNES",
    ],
  },
  {
    code: "AE",
    label: "Dubai",
    aliases: [
      "AE",
      "UAE",
      "DUBAI",
      "EMIRATS ARABES UNIS",
      "EMIRATS-ARABES-UNIS",
      "UNITED ARAB EMIRATES",
    ],
  },
  {
    code: "RU",
    label: "Russie",
    aliases: ["RU", "RUSSIE", "RUSSIA", "RUSSI"],
  },
];

const COUNTRY_MAP = new Map(
  ALLOWED_COUNTRIES.flatMap((country) =>
    country.aliases.map((alias) => [normalizeCountryToken(alias), country.code] as const)
  )
);

function normalizeCountryToken(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

export function normalizeCountryCode(value?: string | null) {
  if (!value) return null;
  return COUNTRY_MAP.get(normalizeCountryToken(value)) ?? null;
}

export function isAllowedCountry(value?: string | null) {
  return normalizeCountryCode(value) !== null;
}

export function getAllowedCountryLabel(value?: string | null) {
  const code = normalizeCountryCode(value);
  return ALLOWED_COUNTRIES.find((country) => country.code === code)?.label ?? null;
}

export function getAllowedCountriesSentence() {
  return ALLOWED_COUNTRIES.map((country) => country.label).join(", ");
}

export function persistCountry(country?: string | null) {
  const code = normalizeCountryCode(country);
  if (code) {
    localStorage.setItem(COUNTRY_STORAGE_KEY, code);
    return code;
  }
  localStorage.removeItem(COUNTRY_STORAGE_KEY);
  return null;
}

export function readStoredCountry() {
  const storedCountry = localStorage.getItem(COUNTRY_STORAGE_KEY);
  return normalizeCountryCode(storedCountry);
}

export function clearStoredCountry() {
  localStorage.removeItem(COUNTRY_STORAGE_KEY);
}

export function buildCountryAccessError(country?: string | null) {
  const label = getAllowedCountryLabel(country);
  const baseMessage = `L'acces au site est reserve aux pays suivants: ${getAllowedCountriesSentence()}.`;
  if (!country) return baseMessage;
  if (label) return baseMessage;
  return `${country} n'a pas encore acces au site. ${baseMessage}`;
}

export function storeCountryAccessError(message: string) {
  localStorage.setItem(COUNTRY_ACCESS_ERROR_STORAGE_KEY, message);
}

export function consumeCountryAccessError() {
  const message = localStorage.getItem(COUNTRY_ACCESS_ERROR_STORAGE_KEY);
  if (message) {
    localStorage.removeItem(COUNTRY_ACCESS_ERROR_STORAGE_KEY);
  }
  return message;
}
