// Isolated content script at document_start: tries exportFunction and a <script src> injection.
const root = document.documentElement;
root.setAttribute('data-probe-iso', '1');
root.setAttribute('data-probe-exportfunction', typeof exportFunction === 'function' && window.wrappedJSObject ? 'available' : 'missing');
try {
  if (typeof exportFunction === 'function') {
    const page = window.wrappedJSObject;
    const proto = page.MediaSession.prototype;
    const original = proto.setActionHandler;
    exportFunction(function (action, handler) {
      root.setAttribute('data-probe-xray-calls', (root.getAttribute('data-probe-xray-calls') || '') + action + ',');
      return original.call(this, action, handler);
    }, proto, { defineAs: 'setActionHandler' });
    root.setAttribute('data-probe-xray', 'patched');
  }
} catch (e) {
  root.setAttribute('data-probe-xray', 'error: ' + e);
}
try {
  const s = document.createElement('script');
  s.src = browser.runtime.getURL('injected.js');
  s.onload = () => root.setAttribute('data-probe-script-load', 'loaded');
  s.onerror = () => root.setAttribute('data-probe-script-load', 'error');
  (document.head || document.documentElement).append(s);
} catch (e) {
  root.setAttribute('data-probe-script-load', 'threw: ' + e);
}
