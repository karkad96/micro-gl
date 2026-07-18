import { Geometry2d } from './Geometry2d.js';

/**
 * A filled arrow centered on the origin and pointing along the local +x axis.
 * Dimensions are expressed in world-space units before Shape2d transforms.
 * The shaft and head use CCW triangles for the default triangle-list topology.
 */
export class ArrowGeometry2d extends Geometry2d {
  constructor(
    length = 1,
    shaftWidth = 0.05,
    headLength = 0.25,
    headWidth = 0.2,
  ) {
    const halfLength = length / 2;
    const halfShaftWidth = shaftWidth / 2;
    const halfHeadWidth = headWidth / 2;
    const tailX = -halfLength;
    const headBaseX = halfLength - headLength;
    const tipX = halfLength;
    const minX = Math.min(tailX, headBaseX, tipX);
    const maxX = Math.max(tailX, headBaseX, tipX);
    const halfUvHeight = Math.max(
      Math.abs(halfShaftWidth),
      Math.abs(halfHeadWidth),
    );
    const uvWidth = maxX - minX;
    const uvHeight = halfUvHeight * 2;
    const toU = (x) => (uvWidth === 0 ? 0.5 : (x - minX) / uvWidth);
    const toV = (y) =>
      uvHeight === 0 ? 0.5 : (y + halfUvHeight) / uvHeight;
    const tailU = toU(tailX);
    const headBaseU = toU(headBaseX);
    const tipU = toU(tipX);
    const shaftVMin = toV(-halfShaftWidth);
    const shaftVMax = toV(halfShaftWidth);
    const headVMin = toV(-halfHeadWidth);
    const headVMax = toV(halfHeadWidth);

    // The shaft and head duplicate vertices at their shared seam so each
    // primitive keeps a straightforward rectangular UV projection.
    // prettier-ignore
    const vertices = [
      // position                         uv
      tailX, -halfShaftWidth,             tailU, shaftVMin,
      headBaseX, -halfShaftWidth,         headBaseU, shaftVMin,
      headBaseX, halfShaftWidth,          headBaseU, shaftVMax,
      tailX, halfShaftWidth,              tailU, shaftVMax,

      headBaseX, -halfHeadWidth,          headBaseU, headVMin,
      tipX, 0,                            tipU, 0.5,
      headBaseX, halfHeadWidth,           headBaseU, headVMax,
    ];
    const indices = [0, 1, 2, 0, 2, 3, 4, 5, 6];

    super(vertices, indices);

    this._tailX = tailX;
    this._headBaseX = headBaseX;
    this._tipX = tipX;
    this._halfShaftWidth = halfShaftWidth;
    this._halfHeadWidth = halfHeadWidth;
    this._headLength = headLength;
  }

  /** Exact test against the rectangular shaft and triangular head. */
  containsPoint(x, y) {
    if (
      x >= this._tailX &&
      x <= this._headBaseX &&
      Math.abs(y) <= this._halfShaftWidth
    ) {
      return true;
    }

    if (x < this._headBaseX || x > this._tipX || this._headLength === 0) {
      return false;
    }

    const headHalfWidthAtX =
      ((this._tipX - x) / this._headLength) * this._halfHeadWidth;
    return Math.abs(y) <= headHalfWidthAtX;
  }
}
