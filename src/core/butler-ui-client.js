// Standalone browser entry; precompiled at build time, never Function.toString().
const menu = document.querySelector('[data-butler-menu]');
const summary = menu?.querySelector('summary');
function closeMenu(restoreFocus = false) {
  if (!menu?.open) return;
  menu.open = false;
  if (restoreFocus) summary.focus({ preventScroll: true });
}
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menu?.open) { event.preventDefault(); closeMenu(true); }
});
document.addEventListener('pointerdown', event => {
  if (menu?.open && !menu.contains(event.target)) closeMenu(menu.contains(document.activeElement));
});
menu?.addEventListener('focusout', event => {
  // During SUMMARY -> A, activeElement can briefly be BODY before focusin.
  // relatedTarget describes the destination; never collapse an internal move.
  if (event.relatedTarget) {
    if (!menu.contains(event.relatedTarget)) closeMenu();
    return;
  }
  // Null destinations (window blur, removed elements) need settled focus.
  setTimeout(() => {
    if (!menu.contains(document.activeElement)) closeMenu();
  }, 0);
});
// Let links perform their native navigation. Closing on pointer/click can hide
// the target before the browser dispatches the click, especially on touch.
// Resize CSS only: no messaging, reconnecting, draft mutation or submission.
function resizeViewport() {
  const viewport = window.visualViewport;
  const height = viewport?.height || window.innerHeight;
  const top = viewport?.offsetTop || 0;
  const style = document.documentElement.style;
  style.setProperty('--butler-viewport-height', `${height}px`);
  style.setProperty('--butler-viewport-top', `${top}px`);
  const header = document.querySelector('[data-butler-header]');
  const headerHeight = header?.getBoundingClientRect().height || 64;
  const nav = document.querySelector('[data-butler-primary-nav]');
  const navHeight = nav?.getBoundingClientRect().height || 65;
  style.setProperty('--butler-header-reserve', `${headerHeight}px`);
  if (document.body.dataset.butlerShell === 'chat') {
    // Only cramped keyboard + safe-area layouts use a normal grid header;
    // the already-reviewed full-height layout keeps its floating chat controls.
    document.body.dataset.butlerCompact = height - headerHeight - navHeight < 230 ? 'true' : 'false';
  }
  if (menu?.open) {
    const menuTop = summary.getBoundingClientRect().bottom + 8;
    const available = top + height - navHeight - menuTop - 8;
    style.setProperty('--butler-menu-max-height', `${Math.max(0, available)}px`);
  }
}
menu?.addEventListener('toggle', resizeViewport);
window.visualViewport?.addEventListener('resize', resizeViewport);
window.visualViewport?.addEventListener('scroll', resizeViewport);
window.addEventListener('resize', resizeViewport);
resizeViewport();
