// LuminAAC dialog guard (v0.14.2).
// A modal <dialog> makes the rest of the page inert. If the dialog sits inside a
// hidden view (for example a game dialog that lives in Talk while Play is showing)
// it opens invisibly: the page still scrolls but every button is dead.
// This guard moves a dialog to <body> before it opens, so it can always be seen,
// and closes any modal that still has no size, so the page can never lock up.
(() => {
  if (!window.HTMLDialogElement || HTMLDialogElement.prototype.__lumGuard) return;
  const proto = HTMLDialogElement.prototype, show = proto.showModal;
  proto.__lumGuard = true;
  proto.showModal = function (...a) {
    if (this.open) return; // a second tap must not throw or stack
    if (this.parentElement !== document.body && document.body) document.body.append(this);
    show.apply(this, a);
    requestAnimationFrame(() => { if (this.open && !this.getClientRects().length) this.close(); });
  };
})();
