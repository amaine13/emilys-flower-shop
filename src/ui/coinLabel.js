export const COIN_TEXTURE = 'coin-gfx'
export const COIN_EMOJI = '🪙'

/** Pixel size for coin-gfx to match Georgia text at the given font size. */
export function coinSizeForFont(fontSize) {
  const n = typeof fontSize === 'string' ? parseInt(fontSize, 10) : fontSize
  return Math.max(10, Math.round(n * 1.05))
}

function addToParent(parent, obj) {
  if (parent) parent.add(obj)
  return obj
}

/**
 * Lay out text with 🪙 replaced by coin-gfx. Supports multiple coin markers in one string.
 * @returns {{ objects: Phaser.GameObjects.GameObject[], width: number, height: number }}
 */
export function addCoinText(scene, options) {
  const {
    x,
    y,
    text,
    style = {},
    originX = 0,
    originY = 0.5,
    depth,
    container,
  } = options

  const fontFamily = style.fontFamily ?? 'Georgia'
  const fontSize = style.fontSize ?? '16px'
  const color = style.color ?? '#ffffff'
  const coinSize = coinSizeForFont(fontSize)
  const gap = Math.max(3, Math.round(coinSize * 0.22))

  const textStyle = { fontFamily, fontSize, color }
  if (style.fontStyle) textStyle.fontStyle = style.fontStyle

  const parent = container ?? null

  if (!text.includes(COIN_EMOJI)) {
    const single = addToParent(parent, scene.add.text(x, y, text, textStyle)).setOrigin(
      originX,
      originY,
    )
    if (depth != null) single.setDepth(depth)
    return { objects: [single], width: single.width, height: single.height }
  }

  const chunks = text.split(COIN_EMOJI)
  const items = []
  chunks.forEach((chunk, index) => {
    if (chunk) items.push({ kind: 'text', value: chunk })
    if (index < chunks.length - 1) items.push({ kind: 'coin' })
  })

  const widths = items.map((item) => {
    if (item.kind === 'text') {
      const probe = scene.add.text(-10000, y, item.value, textStyle).setOrigin(0, 0.5)
      const w = probe.width
      probe.destroy()
      return w
    }
    return coinSize
  })

  let totalW = widths.reduce((sum, w) => sum + w, 0) + gap * Math.max(0, items.length - 1)
  const totalH = coinSize

  let left = x
  if (originX === 0.5) left = x - totalW / 2
  else if (originX === 1) left = x - totalW

  const objects = []
  let cursor = left

  items.forEach((item, index) => {
    if (item.kind === 'text') {
      const t = addToParent(parent, scene.add.text(cursor, y, item.value, textStyle)).setOrigin(
        0,
        0.5,
      )
      objects.push(t)
      cursor += t.width
    } else {
      const coin = addToParent(
        parent,
        scene.add
          .image(cursor + coinSize / 2, y, COIN_TEXTURE)
          .setDisplaySize(coinSize, coinSize)
          .setOrigin(0.5, 0.5),
      )
      objects.push(coin)
      cursor += coinSize
    }
    if (index < items.length - 1) cursor += gap
  })

  if (depth != null) objects.forEach((o) => o.setDepth(depth))

  return { objects, width: totalW, height: totalH }
}

/** Measure width/height without leaving objects on screen. */
export function measureCoinText(scene, text, style = {}) {
  const layout = addCoinText(scene, {
    x: -10000,
    y: -10000,
    text,
    style,
    originX: 0,
    originY: 0,
  })
  const metrics = { width: layout.width, height: layout.height }
  layout.objects.forEach((o) => o.destroy())
  return metrics
}
