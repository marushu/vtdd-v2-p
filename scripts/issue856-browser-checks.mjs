// These functions run via Playwright page.evaluate on the rendered, twice-bundled
// Worker. They do not inspect CSS variable names as a proxy for rendered contrast.
export function renderedTextContrast() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  function rgba(value) {
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    const bytes = [...context.getImageData(0, 0, 1, 1).data];
    return [...bytes.slice(0, 3), bytes[3] / 255];
  }
  function over(front, back) {
    const alpha = front[3] + back[3] * (1 - front[3]);
    if (!alpha) return [0, 0, 0, 0];
    return [0, 1, 2].map(i => (front[i] * front[3] + back[i] * back[3] * (1 - front[3])) / alpha).concat(alpha);
  }
  function luminance(color) {
    return color.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
      .reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
  }
  const selectors = 'body,p,label,small,.small,.muted,.pill,summary,button,.button,.button-link,input:not([type=hidden]),textarea,.notice,.warning,.hero,.composer-status,#connection';
  return [...document.querySelectorAll(selectors)].filter(element => !element.matches(':disabled,[aria-disabled="true"]') && element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && element.getBoundingClientRect().height > 0)
    .map(element => {
      const own = getComputedStyle(element);
      let foreground = rgba(own.color), background = [0, 0, 0, 0];
      for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor), layer = rgba(style.backgroundColor);
        foreground = over(foreground, layer);
        background = over(background, layer);
        foreground[3] *= Number(style.opacity);
        background[3] *= Number(style.opacity);
      }
      foreground = over(foreground, [255, 255, 255, 1]);
      background = over(background, [255, 255, 255, 1]);
      const a = luminance(foreground), b = luminance(background);
      return { element: element.id || element.className || element.tagName, foregroundCss: own.color, backgroundCss: own.backgroundColor, foreground, background, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
    });
}

// Simulate the two visualViewport dimensions that innerHeight resizing misses.
// Insets are CSS variables backed by env() in production, overridden only here.
export function simulateVisualViewport({ height, offsetTop, safeTop = 20, safeBottom = 34 }) {
  const viewport = window.visualViewport;
  if (!viewport) throw new Error('This browser does not expose visualViewport');
  Object.defineProperty(viewport, 'height', { configurable: true, value: height });
  Object.defineProperty(viewport, 'offsetTop', { configurable: true, value: offsetTop });
  document.documentElement.style.setProperty('--butler-safe-top', `${safeTop}px`);
  document.documentElement.style.setProperty('--butler-safe-bottom', `${safeBottom}px`);
  viewport.dispatchEvent(new Event('resize'));
  viewport.dispatchEvent(new Event('scroll'));
}
export function resetVisualViewport() {
  delete window.visualViewport.height;
  delete window.visualViewport.offsetTop;
  document.documentElement.style.removeProperty('--butler-safe-top');
  document.documentElement.style.removeProperty('--butler-safe-bottom');
  window.visualViewport.dispatchEvent(new Event('resize'));
}
