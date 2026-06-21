// Mock ComfyUI globals that the codebase depends on at module evaluation time.
// jsdom provides standard browser APIs (document, window, etc.).
// This file adds ComfyUI-specific globals on top.

// ComfyUI app singleton — many modules check window.app
window.app = {
  graph: null,
  canvas: {
    ds: { scale: 1, offset: [0, 0] },
    canvas: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) },
  },
};

// Theme / palette globals
window.xcpDerpThemeConfig = null;
window.xcpActivePalette = { palettes: [] };
window.xcpDerpLocaleData = {};
window.xcpDerpSettings = { useAnimations: false };
window.xcpDerpSignals = {};
window._xcpDerpSession = 'test-session';
window._xcpWidgetPaletteWarnings = {};

// happy-dom doesn't support canvas 2D context — mock it for measureTextWidth
const origGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function (type, ...args) {
  if (type === '2d') {
    return {
      font: '',
      measureText: (text) => ({ width: String(text || '').length * 8 }),
      fillText: () => {},
      strokeText: () => {},
      fillRect: () => {},
      strokeRect: () => {},
      clearRect: () => {},
      beginPath: () => {},
      closePath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      arc: () => {},
      rect: () => {},
      clip: () => {},
      save: () => {},
      restore: () => {},
      translate: () => {},
      scale: () => {},
      rotate: () => {},
      setTransform: () => {},
      drawImage: () => {},
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
      createPattern: () => null,
      getImageData: () => ({ data: new Uint8ClampedArray() }),
      putImageData: () => {},
    };
  }
  return origGetContext.call(this, type, ...args);
};
