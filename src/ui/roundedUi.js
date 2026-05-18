/** Standard corner radius for pill-shaped buttons (clamped to half min side). */
export const UI_BUTTON_RADIUS = 24

/**
 * Graphics with a center-anchored filled rounded rect. Position is (cx, cy).
 * Draws in local coords so moving the object moves the shape.
 */
export function createRoundedFillCentered(scene, cx, cy, w, h, fillColor, fillAlpha = 1) {
  const r = Math.min(UI_BUTTON_RADIUS, w / 2, h / 2)
  const g = scene.add.graphics()
  g.setPosition(cx, cy)
  g.fillStyle(fillColor, fillAlpha)
  g.fillRoundedRect(-w / 2, -h / 2, w, h, r)
  return g
}

/**
 * Stroked + filled rounded rect, top-left at (x, y) in scene/world space (graphics at 0,0).
 */
export function createRoundedFillTopLeft(
  scene,
  x,
  y,
  w,
  h,
  fillColor,
  fillAlpha,
  strokeColor,
  strokeWidth,
) {
  const r = Math.min(UI_BUTTON_RADIUS, w / 2, h / 2)
  const g = scene.add.graphics()
  g.fillStyle(fillColor, fillAlpha)
  g.fillRoundedRect(x, y, w, h, r)
  if (strokeColor != null && strokeWidth > 0) {
    g.lineStyle(strokeWidth, strokeColor, 1)
    g.strokeRoundedRect(x, y, w, h, r)
  }
  return g
}
