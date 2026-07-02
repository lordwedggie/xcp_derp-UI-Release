import { describe, expect, it } from 'vitest';

import { masterPainter } from '../js/herbina/masterPainter.js';

function makeRecordingContext() {
  const ops = [];
  const stateStack = [];
  const ctx = {
    ops,
    save: () => {
      stateStack.push({
        shadowColor: ctx.shadowColor,
        shadowBlur: ctx.shadowBlur,
        shadowOffsetX: ctx.shadowOffsetX,
        shadowOffsetY: ctx.shadowOffsetY,
        fillStyle: ctx.fillStyle,
        strokeStyle: ctx.strokeStyle,
        lineWidth: ctx.lineWidth,
      });
      ops.push({ op: 'save' });
    },
    restore: () => {
      const state = stateStack.pop();
      if (state) Object.assign(ctx, state);
      ops.push({ op: 'restore' });
    },
    beginPath: () => ops.push({ op: 'beginPath' }),
    closePath: () => ops.push({ op: 'closePath' }),
    moveTo: (...args) => ops.push({ op: 'moveTo', args }),
    lineTo: (...args) => ops.push({ op: 'lineTo', args }),
    arcTo: (...args) => ops.push({ op: 'arcTo', args }),
    rect: (...args) => ops.push({ op: 'rect', args }),
    clip: (...args) => ops.push({ op: 'clip', args }),
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1 }),
    fill: (...args) => ops.push({
      op: 'fill',
      args,
      shadowColor: ctx.shadowColor,
      shadowBlur: ctx.shadowBlur,
      shadowOffsetX: ctx.shadowOffsetX,
      shadowOffsetY: ctx.shadowOffsetY,
      fillStyle: ctx.fillStyle,
    }),
    stroke: () => ops.push({ op: 'stroke' }),
    shadowColor: 'transparent',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
  };
  return ctx;
}

const shadowPaint = {
  fill: 'rgba(100, 100, 100, 0.5)',
  corners: [4, 4, 4, 4],
  shadow: {
    color: 'rgba(0, 0, 0, 0.8)',
    blur: 4,
    offsetX: 2,
    offsetY: 3,
  },
  shadowClip: 'c_shadowNone',
};

describe('masterPainter Canvas effects', () => {
  it('draws c_shadowNone as both outside and inside shadow passes like HTML', () => {
    const ctx = makeRecordingContext();

    masterPainter(ctx, {
      posX: 10,
      posY: 20,
      width: 80,
      height: 16,
      paintData: shadowPaint,
      color: shadowPaint.fill,
    });

    const shadowFills = ctx.ops.filter((op) => op.op === 'fill' && op.shadowColor !== 'transparent');

    expect(shadowFills).toHaveLength(2);
    expect(shadowFills[0]).toMatchObject({
      fillStyle: 'black',
      shadowBlur: 8,
      shadowOffsetX: 3,
      shadowOffsetY: 4.5,
    });
    expect(shadowFills[1]).toMatchObject({
      fillStyle: 'black',
      shadowBlur: 8,
      shadowOffsetX: 3,
      shadowOffsetY: 4.5,
    });
    expect(shadowFills[1].args).toEqual(['evenodd']);
  });

  it('applies the same blur and offset scaling to outside-only shadow passes', () => {
    const ctx = makeRecordingContext();

    masterPainter(ctx, {
      posX: 10,
      posY: 20,
      width: 80,
      height: 16,
      paintData: { ...shadowPaint, shadowClip: 'c_shadowOutside' },
      color: shadowPaint.fill,
    });

    const shadowFill = ctx.ops.find((op) => op.op === 'fill' && op.shadowColor !== 'transparent');

    expect(shadowFill).toMatchObject({
      fillStyle: 'black',
      shadowBlur: 8,
      shadowOffsetX: 3,
      shadowOffsetY: 4.5,
    });
  });

  it('scales Canvas shadow blur and offsets with the active transform', () => {
    const ctx = makeRecordingContext();
    ctx.getTransform = () => ({ a: 2, b: 0, c: 0, d: 2 });

    masterPainter(ctx, {
      posX: 10,
      posY: 20,
      width: 80,
      height: 16,
      paintData: { ...shadowPaint, shadowClip: 'c_shadowOutside' },
      color: shadowPaint.fill,
    });

    const shadowFill = ctx.ops.find((op) => op.op === 'fill' && op.shadowColor !== 'transparent');

    expect(shadowFill).toMatchObject({
      fillStyle: 'black',
      shadowBlur: 16,
      shadowOffsetX: 6,
      shadowOffsetY: 9,
    });
  });
});
