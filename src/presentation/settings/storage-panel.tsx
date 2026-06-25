"use client";

import { Header } from "./settings-workspace";

export function StoragePanel(): React.ReactElement {
  return (
    <div className="grid gap-4">
      <Header title="Storage & Security" description="默认本地数据目录为 ~/.post-generator，可通过 POST_GENERATOR_HOME 覆盖。" />
      <div className="grid gap-3 rounded-lg border p-4 text-sm">
        <p>API Keys are encrypted server-side and stored under the local secrets directory.</p>
        <p>Browser LocalStorage only stores UI preferences such as editor mode and font size.</p>
        <p>Exports are written to the local exports directory and can also be downloaded from the browser.</p>
      </div>
    </div>
  );
}
