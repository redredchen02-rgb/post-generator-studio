"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useUiStore } from "@/presentation/store/ui-store";

const LOCALE_COOKIE = "NEXT_LOCALE";
const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export function LanguageSwitcher(): React.ReactElement {
  const { locale, setLocale } = useUiStore();
  const router = useRouter();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  function switchLocale(next: "en" | "zh-CN"): void {
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax`;
    setLocale(next);
    router.refresh();
  }

  const activeClass = "text-foreground font-medium";
  const inactiveClass = "text-muted-foreground hover:text-foreground";

  if (!mounted) {
    return (
      <div className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-sm">
        <span className={activeClass}>EN</span>
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
      >
        EN
      </button>
      <span className="text-muted-foreground">/</span>
      <button
        type="button"
        onClick={() => switchLocale("zh-CN")}
        className={locale === "zh-CN" ? activeClass : inactiveClass}
        aria-label="切换为中文"
      >
        中文
      </button>
    </div>
  );
}
