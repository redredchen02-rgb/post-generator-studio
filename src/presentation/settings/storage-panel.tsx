"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Header } from "./settings-workspace";

export function StoragePanel(): React.ReactElement {
  const t = useTranslations("Settings.storage");

  return (
    <div className="grid gap-4">
      <Header title={t("title")} description={t("subtitle")} />
      <div className="grid gap-3 rounded-lg border p-4 text-sm">
        <p>{t("apiKeysInfo")}</p>
        <p>{t("localStorageInfo")}</p>
        <p>{t("exportsInfo")}</p>
      </div>
    </div>
  );
}
