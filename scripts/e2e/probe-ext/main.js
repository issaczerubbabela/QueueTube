// Declared with world: "MAIN". Records which world it actually ran in, and what YouTube registers.
(() => {
  const world = typeof browser !== 'undefined' && browser.runtime ? 'isolated' : 'main';
  document.documentElement.setAttribute('data-probe-main-world', world);
  if (world !== 'main') return;
  const log = (s) => document.documentElement.setAttribute('data-probe-log', (document.documentElement.getAttribute('data-probe-log') || '') + s + ';');
  const set = MediaSession.prototype.setActionHandler;
  MediaSession.prototype.setActionHandler = function (action, handler) {
    log(`setActionHandler:${action}:${handler ? 'fn' : 'null'}@${Math.round(performance.now())}`);
    return set.call(this, action, handler);
  };
  const add = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, fn, opts) {
    if (type === 'keydown' || type === 'keypress') {
      const who = this === window ? 'window' : this === document ? 'document' : this.nodeName || String(this);
      const capture = typeof opts === 'boolean' ? opts : !!opts?.capture;
      log(`${type}:${who}:${capture ? 'capture' : 'bubble'}`);
    }
    return add.call(this, type, fn, opts);
  };
})();
