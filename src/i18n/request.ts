import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

const SUPPORTED_LOCALES = ["en", "zh-CN"] as const;
type Locale = (typeof SUPPORTED_LOCALES)[number];

export function isValidLocale(value: string | undefined): value is Locale {
  return SUPPORTED_LOCALES.includes(value as Locale);
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const raw = cookieStore.get("NEXT_LOCALE")?.value;
  const locale: Locale = isValidLocale(raw) ? raw : "en";

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default as Record<string, unknown>,
  };
});
