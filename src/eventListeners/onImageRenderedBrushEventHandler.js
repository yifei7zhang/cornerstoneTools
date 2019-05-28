import store from '../store/index.js';
import getActiveToolsForElement from '../store/getActiveToolsForElement.js';
import { getToolState } from '../stateManagement/toolState.js';
import external from '../externalModules.js';
import BaseBrushTool from './../tools/base/BaseBrushTool.js';
import {
  getNewContext,
  resetCanvasContextTransform,
  transformCanvasContext,
} from '../drawing/index.js';

import { getLogger } from '../util/logger.js';

const logger = getLogger('eventListeners:onImageRenderedBrushEventHandler');

/* Safari and Edge polyfill for createImageBitmap
 * https://developer.mozilla.org/en-US/docs/Web/API/WindowOrWorkerGlobalScope/createImageBitmap
 */

// TODO: Do we still need this? I've yanked the package for now
// It should be covered by @babel/runtime and plugin-transform-runtime:
// https://babeljs.io/docs/en/babel-plugin-transform-runtime
// @James, I think Babel should take care of this for us
// Import regeneratorRuntime from "regenerator-runtime";

if (!('createImageBitmap' in window)) {
  window.createImageBitmap = function(imageData) {
    return new Promise(resolve => {
      const img = document.createElement('img');

      img.addEventListener('load', function() {
        resolve(this);
      });

      const conversionCanvas = document.createElement('canvas');

      conversionCanvas.width = imageData.width;
      conversionCanvas.height = imageData.height;

      const conversionCanvasContext = conversionCanvas.getContext('2d');

      conversionCanvasContext.putImageData(
        imageData,
        0,
        0,
        0,
        0,
        conversionCanvas.width,
        conversionCanvas.height
      );
      img.src = conversionCanvas.toDataURL();
    });
  };
}

const { state, getters, setters } = store.modules.brush;

/**
 * Used to redraw the brush label map data per render.
 *
 * @private
 * @param {Object} evt - The event.
 * @returns {void}
 */
export default function(evt) {
  const eventData = evt.detail;
  const element = eventData.element;
  const maxSegmentations = BaseBrushTool.getNumberOfColors();

  const brushStackState = getToolState(
    element,
    BaseBrushTool.getReferencedToolDataName()
  );

  logger.warn('LABELMAP RENDER:');

  logger.warn(brushStackState);

  if (!brushStackState.data.length) {
    return;
  }

  const stackState = getToolState(element, 'stack');
  const currentImageIdIndex = stackState.data[0].currentImageIdIndex;

  for (let i = 0; i < brushStackState.data.length; i++) {
    const brushStackData = brushStackState.data[i];

    const labelMap2D = brushStackData.labelMap2D[currentImageIdIndex];

    if (labelMap2D) {
      const imageBitmapCache = brushStackData.imageBitmapCache;

      renderSegmentation(evt, brushStackData, labelMap2D, imageBitmapCache);
    }
  }
}

function renderSegmentation(evt, brushStackData, labelMap2D, imageBitmapCache) {
  // Draw previous image if cached.
  if (imageBitmapCache) {
    _drawImageBitmap(evt, imageBitmapCache);
  }

  if (labelMap2D.invalidated) {
    createNewBitmapAndQueueRenderOfSegmentation(
      evt,
      brushStackData,
      labelMap2D
    );
  }
}

function createNewBitmapAndQueueRenderOfSegmentation(
  evt,
  brushStackData,
  labelMap2D
) {
  const eventData = evt.detail;
  const element = eventData.element;
  const enabledElement = external.cornerstone.getEnabledElement(element);

  const pixelData = labelMap2D.pixelData;

  logger.warn(`createNewBitmapAndQueueRenderOfSegmentation`);
  logger.warn(state.colorLutTable);

  const imageData = new ImageData(
    eventData.image.width,
    eventData.image.height
  );
  const image = {
    stats: {},
    minPixelValue: 0,
    getPixelData: () => pixelData,
  };

  external.cornerstone.storedPixelDataToCanvasImageDataColorLUT(
    image,
    state.colorLutTable,
    imageData.data
  );

  window.createImageBitmap(imageData).then(newImageBitmap => {
    brushStackData.imageBitmapCache = newImageBitmap;
    labelMap2D.invalidated = false;

    external.cornerstone.updateImage(eventData.element);
  });
}

/**
 * Draws the ImageBitmap the canvas.
 *
 * @private
 * @param  {Object} evt description
 * @param {ImageBitmap} imageBitmap
 * @returns {void}
 */
function _drawImageBitmap(evt, imageBitmap) {
  const eventData = evt.detail;
  const context = getNewContext(eventData.canvasContext.canvas);

  const canvasTopLeft = external.cornerstone.pixelToCanvas(eventData.element, {
    x: 0,
    y: 0,
  });

  const canvasTopRight = external.cornerstone.pixelToCanvas(eventData.element, {
    x: eventData.image.width,
    y: 0,
  });

  const canvasBottomRight = external.cornerstone.pixelToCanvas(
    eventData.element,
    {
      x: eventData.image.width,
      y: eventData.image.height,
    }
  );

  const cornerstoneCanvasWidth = external.cornerstoneMath.point.distance(
    canvasTopLeft,
    canvasTopRight
  );
  const cornerstoneCanvasHeight = external.cornerstoneMath.point.distance(
    canvasTopRight,
    canvasBottomRight
  );

  const canvas = eventData.canvasContext.canvas;
  const viewport = eventData.viewport;

  context.imageSmoothingEnabled = false;
  context.globalAlpha = state.alpha;

  transformCanvasContext(context, canvas, viewport);

  const canvasViewportTranslation = {
    x: viewport.translation.x * viewport.scale,
    y: viewport.translation.y * viewport.scale,
  };

  context.drawImage(
    imageBitmap,
    canvas.width / 2 - cornerstoneCanvasWidth / 2 + canvasViewportTranslation.x,
    canvas.height / 2 -
      cornerstoneCanvasHeight / 2 +
      canvasViewportTranslation.y,
    cornerstoneCanvasWidth,
    cornerstoneCanvasHeight
  );

  context.globalAlpha = 1.0;

  resetCanvasContextTransform(context);
}
