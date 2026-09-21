// A held press uses the existing Shift-copy handlers, on release (user activation).
(() => {
  const selector = '.copy-team, #copy-link, #marker-share';
  let press = null, copiedPress = null;
  const buttonAt = event => event.target.closest?.(selector);
  const cancel = () => { press = null; };
  document.addEventListener('pointerdown', event => {
    cancel();
    copiedPress = null;
    const button = buttonAt(event);
    if (!button || button.disabled || !event.isPrimary || event.button !== 0) return;
    press = {button, id:event.pointerId, x:event.clientX, y:event.clientY, start:event.timeStamp};
  }, true);
  document.addEventListener('pointermove', event => {
    if (press?.id === event.pointerId && Math.hypot(event.clientX-press.x, event.clientY-press.y) > 10) cancel();
  }, true);
  document.addEventListener('pointerup', event => {
    if (press?.id !== event.pointerId) return;
    if (buttonAt(event) !== press.button) { cancel(); return; }
    const held = press;
    cancel();
    if (event.timeStamp - held.start < 600) return;
    held.button.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, shiftKey:true}));
    copiedPress = {button:held.button, released:event.timeStamp};
  }, true);
  document.addEventListener('pointercancel', cancel, true);
  document.addEventListener('scroll', cancel, true);
  window.addEventListener('blur', cancel);
  document.addEventListener('contextmenu', event => {
    if (buttonAt(event)) event.preventDefault();
  });
  document.addEventListener('click', event => {
    const copied = copiedPress;
    copiedPress = null;
    cancel();
    if (!copied || event.detail === 0 || buttonAt(event) !== copied.button || event.timeStamp-copied.released > 1000) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
})();
