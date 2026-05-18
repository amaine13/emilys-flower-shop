const BAR_SIZE = 8
const THUMB_COLOR = 0xffffff
const TRACK_COLOR = 0xffffff
const THUMB_ALPHA = 0.8
const TRACK_ALPHA = 0.2
const STROKE_COLOR = 0xc96b9a
const STROKE_ALPHA = 0.6

export class Scrollbar {
  constructor(scene, options) {
    // options: { x, y, height, orientation ('vertical'|'horizontal') }
    this.scene = scene
    this.options = options
    this.bar = null
    this.build()
  }

  build() {
    this.bar = this.scene.add.graphics()
    this.bar.setAlpha(0)
    this.bar.setDepth(200)
  }

  // Call this whenever scroll position changes
  // scrollOffset: current scroll offset (negative number)
  // scrollMax: maximum scroll amount
  // viewSize: visible area size
  // contentSize: total content size
  update(scrollOffset, scrollMax, viewSize, contentSize) {
    if (scrollMax <= 0) {
      this.bar.setAlpha(0)
      return
    }

    const { x, y, height, orientation } = this.options
    const ratio = viewSize / contentSize
    const thumbSize = Math.max(30, viewSize * ratio)
    const scrollProgress = Math.abs(scrollOffset) / scrollMax
    const radius = BAR_SIZE / 2

    this.bar.clear()

    if (orientation === 'vertical') {
      const trackHeight = height
      const barY = y + scrollProgress * (trackHeight - thumbSize)
      this.bar.fillStyle(TRACK_COLOR, TRACK_ALPHA)
      this.bar.fillRoundedRect(x, y, BAR_SIZE, trackHeight, radius)
      this.bar.fillStyle(THUMB_COLOR, THUMB_ALPHA)
      this.bar.fillRoundedRect(x, barY, BAR_SIZE, thumbSize, radius)
      this.bar.lineStyle(1, STROKE_COLOR, STROKE_ALPHA)
      this.bar.strokeRoundedRect(x, barY, BAR_SIZE, thumbSize, radius)
    } else {
      const trackWidth = height // reuse height as width for horizontal
      const barX = x + scrollProgress * (trackWidth - thumbSize)
      this.bar.fillStyle(TRACK_COLOR, TRACK_ALPHA)
      this.bar.fillRoundedRect(x, y, trackWidth, BAR_SIZE, radius)
      this.bar.fillStyle(THUMB_COLOR, THUMB_ALPHA)
      this.bar.fillRoundedRect(barX, y, thumbSize, BAR_SIZE, radius)
      this.bar.lineStyle(1, STROKE_COLOR, STROKE_ALPHA)
      this.bar.strokeRoundedRect(barX, y, thumbSize, BAR_SIZE, radius)
    }

    this.bar.setAlpha(1)
  }

  destroy() {
    if (this.bar) this.bar.destroy()
  }
}
