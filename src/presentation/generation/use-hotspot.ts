"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { getHotspotHealth } from "@/presentation/lib/api";

/**
 * Hotspot sidecar availability + topic seeding. Probes once at mount (no polling, per the
 * omniwm pattern) and exposes a manual retry. `onSeed` writes the chosen topic into the
 * form; a confirm guards against clobbering real user input.
 */
export function useHotspot(args: {
  title: string;
  sampleTitle: string;
  onSeed: (title: string, summary: string) => void;
}) {
  const { title, sampleTitle, onSeed } = args;
  const tHotspot = useTranslations("Hotspot");
  const [hotspotAvailable, setHotspotAvailable] = React.useState(false);

  const probeHotspot = React.useCallback(() => {
    getHotspotHealth().then(
      (h) => setHotspotAvailable(Boolean(h.ok && h.capabilities.hotspot)),
      () => setHotspotAvailable(false),
    );
  }, []);
  React.useEffect(() => probeHotspot(), [probeHotspot]);

  const handleSeedTopic = React.useCallback(
    (seedTitle: string, seedSummary: string): boolean => {
      const hasUserInput = title.trim() !== "" && title.trim() !== sampleTitle;
      if (hasUserInput && !window.confirm(tHotspot("overwriteConfirm"))) return false;
      onSeed(seedTitle, seedSummary);
      return true;
    },
    [title, sampleTitle, tHotspot, onSeed],
  );

  return { hotspotAvailable, probeHotspot, handleSeedTopic };
}
