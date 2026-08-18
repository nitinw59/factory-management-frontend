// Browsers (Chrome/Firefox) natively increment/decrement a *focused*
// <input type="number">'s value when the user scrolls the mouse wheel while
// hovering over it — a well-known footgun (scrolling the page can silently
// mutate a qty/rate/amount field the cursor happens to pass over). This
// installs one page-lifetime listener that disables it everywhere, so no
// individual component needs its own onWheel handler.
//
// Only fires when the wheel event's target IS the currently-focused number
// input (hovering directly over it while it's focused) — matching exactly
// the native trigger condition, so scrolling the page elsewhere while some
// unrelated number input happens to still be focused is left untouched.
//
// Blurring (rather than e.preventDefault()) is the standard, cross-browser-
// reliable fix: removing focus before the browser applies the scroll delta
// means there's no value left for it to change.
export function disableNumberInputScrollGlobally() {
    document.addEventListener('wheel', (e) => {
        const el = e.target;
        if (el && el.tagName === 'INPUT' && el.type === 'number' && el === document.activeElement) {
            el.blur();
        }
    }, { passive: true });
}
