// jsdom doesn't implement HTMLElement.innerText, but our DOM helpers use it
// (deliberately — on real pages innerText is the *visible* text). Mirror it to
// textContent so the page helpers are exercisable under jsdom.
Object.defineProperty(HTMLElement.prototype, 'innerText', {
  configurable: true,
  get(): string {
    return this.textContent ?? '';
  },
  set(value: string) {
    this.textContent = value;
  },
});
