import external from './../../externalModules.js';
import BaseBrushTool from './../base/BaseBrushTool.js';
import {
  getToolState,
  addToolState,
} from './../../stateManagement/toolState.js';
import store from './../../store/index.js';
import brushUtils from './../../util/brush/index.js';
import EVENTS from '../../events.js';
import { getLogger } from '../../util/logger.js';

const logger = getLogger('tools:BrushTool');

const { drawBrushPixels, getCircle } = brushUtils;

const brushModule = store.modules.brush;
const referencedToolDataName = BaseBrushTool.getReferencedToolDataName();

/**
 * @public
 * @class BrushTool
 * @memberof Tools.Brush
 * @classdesc Tool for drawing segmentations on an image.
 * @extends Tools.Base.BaseBrushTool
 */
export default class BrushTool extends BaseBrushTool {
  constructor(props = {}) {
    const defaultProps = {
      name: 'Brush',
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {},
    };

    super(props, defaultProps);

    this.touchDragCallback = this._paint.bind(this);
  }

  /**
   * Called by the event dispatcher to render the image.
   *
   * @param {Object} evt - The event.
   * @returns {void}
   */
  renderBrush(evt) {
    const eventData = evt.detail;
    const viewport = eventData.viewport;

    let mousePosition;

    if (this._drawing) {
      mousePosition = this._lastImageCoords;
    } else if (this._mouseUpRender) {
      mousePosition = this._lastImageCoords;
      this._mouseUpRender = false;
    } else {
      mousePosition = store.state.mousePositionImage;
    }

    if (!mousePosition) {
      return;
    }

    const { rows, columns } = eventData.image;
    const { x, y } = mousePosition;

    if (x < 0 || x > columns || y < 0 || y > rows) {
      return;
    }

    // Draw the hover overlay on top of the pixel data
    const radius = brushModule.state.radius;
    const context = eventData.canvasContext;
    const element = eventData.element;
    const drawId = brushModule.state.drawColorId;
    const color = this._getBrushColor(drawId);

    context.setTransform(1, 0, 0, 1, 0, 0);

    const { cornerstone } = external;

    const circleRadius = radius * viewport.scale;
    const mouseCoordsCanvas = cornerstone.pixelToCanvas(element, mousePosition);

    context.beginPath();
    context.strokeStyle = color;
    context.ellipse(
      mouseCoordsCanvas.x,
      mouseCoordsCanvas.y,
      circleRadius,
      circleRadius,
      0,
      0,
      2 * Math.PI
    );
    context.stroke();
  }

  /**
   * Paints the data to the canvas.
   *
   * @private
   * @param  {Object} evt The data object associated with the event.
   * @returns {void}
   */
  _paint(evt) {
    const eventData = evt.detail;
    const element = eventData.element;
    const { rows, columns } = eventData.image;
    const { x, y } = eventData.currentPoints.image;

    if (x < 0 || x > columns || y < 0 || y > rows) {
      return;
    }

    const { brushStackState, currentImageIdIndex } = this._getLabelMap(evt);

    const radius = brushModule.state.radius;
    const pointerArray = getCircle(radius, rows, columns, x, y);

    const shouldErase = _isCtrlDown(eventData);
    const segmentIndex = brushModule.state.drawColorId;

    // Draw / Erase the active color.
    drawBrushPixels(
      pointerArray,
      brushStackState.data[0],
      currentImageIdIndex,
      segmentIndex,
      columns,
      shouldErase
    );

    external.cornerstone.triggerEvent(
      evt.detail.element,
      EVENTS.MEASUREMENT_MODIFIED,
      evt.detail
    );

    logger.warn('update Image');

    external.cornerstone.updateImage(evt.detail.element);
  }

  _getLabelMap(evt) {
    const eventData = evt.detail;
    const element = eventData.element;
    const { rows, columns } = eventData.image;
    const stackState = getToolState(element, 'stack');
    let brushStackState = getToolState(
      element,
      BaseBrushTool.getReferencedToolDataName()
    );

    logger.warn(brushStackState);

    if (!brushStackState.data.length) {
      const numberOfFrames = stackState.data[0].imageIds.length;

      logger.warn(stackState);

      addToolState(element, referencedToolDataName, {
        buffer: new ArrayBuffer(rows * columns * numberOfFrames),
        labelMap2D: [],
        imageBitmapCache: null,
      });

      brushStackState = getToolState(
        element,
        BaseBrushTool.getReferencedToolDataName()
      );
    }

    logger.warn(brushStackState);

    const currentImageIdIndex = stackState.data[0].currentImageIdIndex;

    const brushStackData = brushStackState.data[0];

    if (!brushStackData.labelMap2D[currentImageIdIndex]) {
      brushStackData.labelMap2D[currentImageIdIndex] = {
        pixelData: new Uint8Array(
          brushStackData.buffer,
          currentImageIdIndex * rows * columns,
          rows * columns
        ),
        invalidated: true,
      };
      // Clear cache for this displaySet to avoid flickering.
      brushStackData.imageBitmapCache = null;
    }

    logger.warn(brushStackState);

    return {
      brushStackState,
      currentImageIdIndex,
    };
  }
}

function _isCtrlDown(eventData) {
  return (eventData.event && eventData.event.ctrlKey) || eventData.ctrlKey;
}
