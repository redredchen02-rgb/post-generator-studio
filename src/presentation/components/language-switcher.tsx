"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/presentation/store/ui-store";
import { useUiStore } from "@/presentation/store/ui-store";

const LOCALE_COOKIE = "NEXT_LOCALE";
const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

const activeClass =
  "text-foreground font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded";
const inactiveClass =
  "text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded";

export function LanguageSwitcher(): React.ReactElement {
  const { locale, setLocale } = useUiStore();
  const router = useRouter();
  const [mounted, setMounted] = React.useState(false);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const refreshTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    setMounted(true);
    // Sync Zustand locale from cookie in case localStorage was cleared independently
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]+)`));
    const cookieLocale = match?.[1];
    if (cookieLocale === "en" || cookieLocale === "zh-CN") {
      setLocale(cookieLocale);
    }
  }, [setLocale]);

  React.useEffect(() => {
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []);

  function switchLocale(next: Locale): void {
    if (isRefreshing) return;
    setIsRefreshing(true);
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
    setLocale(next);
    router.refresh();
    // Reset guard after 1s — sufficient for RSC refresh to settle
    refreshTimerRef.current = setTimeout(() => setIsRefreshing(false), 1000);
  }

  if (!mounted) {
    return (
      <div className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-sm" aria-busy="true">
        <span className={inactiveClass}>EN</span>
        <span className="text-muted-foreground">/</span>
        <span className={inactiveClass}>中文</span>
      </div>
    );
  }

  return (
    <div className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-sm">
      <button
        type="button"
        onClick={() => switchLocale("en")}
        className={locale === "en" ? activeClass : inactiveClass}
        aria-label="Switch to English"
        aria-current={locale === "en" ? "true" : undefined}
        disabled={isRefreshing}
      >
        EN
      </button>
      <span className="text-muted-foreground">/</span>
      <button
        type="button"
        onClick={() => switchLocale("zh-CN")}
        className={locale === "zh-CN" ? activeClass : inactiveClass}
        aria-label="切換為中文"
        aria-current={locale === "zh-CN" ? "true" : undefined}
        disabled={isRefreshing}
      >
        中文
      </button>
    </div>
  );
}
