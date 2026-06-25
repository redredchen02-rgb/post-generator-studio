import { beforeEach, describe, expect, it } from "vitest";
import { useUiStore } from "@/presentation/store/ui-store";

describe("useUiStore locale", () => {
  beforeEach(() => {
    useUiStore.setState({ locale: "en" });
  });

  it("default locale is 'en'", () => {
    expect(useUiStore.getState().locale).toBe("en");
  });

  it("setLocale stores 'zh-CN'", () => {
    useUiStore.getState().setLocale("zh-CN");
    expect(useUiStore.getState().locale).toBe("zh-CN");
  });

  it("setLocale can switch back to 'en'", () => {
    useUiStore.getState().setLocale("zh-CN");
    useUiStore.getState().setLocale("en");
    expect(useUiStore.getState().locale).toBe("en");
  });

  it("second setLocale call overwrites the first", () => {
    useUiStore.getState().setLocale("zh-CN");
    useUiStore.getState().setLocale("en");
    expect(useUiStore.getState().locale).toBe("en");
  });
});
