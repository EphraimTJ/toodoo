import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { clearMocks } from "@tauri-apps/api/mocks";

// jsdom lacks ResizeObserver (needed by @tanstack/react-virtual) and
// scrollIntoView (used by cmdk).
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});

// jsdom reports 0x0 for every element, which makes @tanstack/react-virtual
// (offsetWidth/offsetHeight) render nothing. Give elements a plausible size.
Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, value: 800 });
Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, value: 600 });
Element.prototype.getBoundingClientRect = function getBoundingClientRect(): DOMRect {
  const rect = {
    width: 800,
    height: 600,
    top: 0,
    left: 0,
    bottom: 600,
    right: 800,
    x: 0,
    y: 0,
  };
  return { ...rect, toJSON: () => rect } as DOMRect;
};

afterEach(() => {
  cleanup();
  clearMocks();
});
