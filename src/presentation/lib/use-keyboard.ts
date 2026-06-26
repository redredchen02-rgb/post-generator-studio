"use client";

import * as React from "react";

type KeyBinding = {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: () => void;
};

export function useKeyboard(bindings: KeyBinding[]): void {
  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target;
      const isEditor = target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement;
      for (const binding of bindings) {
        const ctrlMatch = binding.ctrl ? event.ctrlKey || event.metaKey : true;
        const shiftMatch = binding.shift ? event.shiftKey : true;
        const altMatch = binding.alt ? event.altKey : true;
        const keyMatch = event.key.toLowerCase() === binding.key.toLowerCase();

        if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
          if (isEditor && binding.key === "Escape") return;
          event.preventDefault();
          binding.handler();
          return;
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [bindings]);
}
