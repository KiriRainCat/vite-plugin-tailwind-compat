// Serializing one self-contained function keeps the injected runtime independent of the bundle format.
export const runtimeScript = `(${selectStylesheetMode.toString()})();`;

function selectStylesheetMode(): void {
  const polyfills = [...document.querySelectorAll<HTMLLinkElement>("link[data-tailwind-polyfill]")];
  if (polyfills.length === 0) return;

  const supportsModernCss =
    typeof CSS.registerProperty === "function" &&
    CSS.supports("color", "oklch(0.5 0.1 180)") &&
    CSS.supports("color", "color-mix(in oklab,rgb(0 0 0),rgb(255 255 255))");

  if (supportsModernCss) {
    polyfills.forEach((link) => link.remove());
    return;
  }

  // Modern and polyfill CSS are mutually exclusive; mixing both changes cascade and custom-property semantics.
  const modernUrls = new Set(
    polyfills.map((link) => new URL(link.getAttribute("data-tailwind-modern-href") || "", document.baseURI).href),
  );

  const disableModernCss = () => {
    document.querySelectorAll<HTMLLinkElement>("link[rel=stylesheet]").forEach((link) => {
      if (modernUrls.has(link.href) && !link.hasAttribute("data-tailwind-polyfill")) {
        link.disabled = true;
        link.media = "not all";
        link.setAttribute("data-tailwind-modern", "");
      }
    });
  };

  disableModernCss();
  polyfills.forEach((link) => (link.media = "all"));

  // Vite appends code-split stylesheets to <head> after dynamic imports.
  new MutationObserver(disableModernCss).observe(document.head, { childList: true });
}
