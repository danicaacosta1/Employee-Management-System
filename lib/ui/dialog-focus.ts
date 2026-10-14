/** Keyboard handling for the existing modal and slide-over panels. Event-time only. */
export function handleDialogKey(event: KeyboardEvent, panel: HTMLElement | null,
  active: Element | null, onClose: () => void) {
  if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
  if (event.key !== "Tab" || !panel) return;
  const focusable = [...panel.querySelectorAll<HTMLElement>(
    'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
  )].filter(element => element.tabIndex >= 0 && !element.matches(":disabled") && element.getClientRects().length > 0);
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!first) { event.preventDefault(); panel.focus(); return; }
  if (event.shiftKey && (active === first || active === panel || !panel.contains(active))) {
    event.preventDefault(); last?.focus();
  } else if (!event.shiftKey && (active === last || active === panel || !panel.contains(active))) {
    event.preventDefault(); first.focus();
  }
}
