import Phaser from 'phaser'
import { GAME } from '../constants.js'

/** Public-folder asset path (respects Vite `base` for subfolder deploys). */
const asset = (path) => `${import.meta.env.BASE_URL}${path}`

// Loads every shared image/spritesheet then hands off to TitleScene.
export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene')
  }

  preload() {
    this.cameras.main.setBackgroundColor(GAME.BG_COLOR)
    this.buildLoadingUI()

    // BGM first so it is fully queued and decoded early (high practical priority).
    this.load.audio('music-bg', asset('assets/audio/music-bg.mp3'))

    this.load.image('tiles', asset('assets/bg/tiles.png'))
    this.load.image('plantation', asset('assets/bg/plantation.png'))
    this.load.image('interior', asset('assets/bg/interior.png'))
    this.load.image('wooden-grid', asset('assets/bg/wooden-grid.png'))
    this.load.image('bg-shop', asset('assets/bg/bg-shop.png'))
    this.load.image('bg-garden', asset('assets/bg/bg-garden.png'))
    this.load.image('bg-title', asset('assets/bg/bg-title.png'))
    this.load.image('flower-sheet', asset('assets/flowers/flower-sheet.png'))
    this.load.image('flower-pot-red', asset('assets/flowers/flower-pot-red.png'))
    this.load.image('flower-pot-empty', asset('assets/flowers/flower-pot-empty.png'))
    this.load.image('flower-1-pink', asset('assets/flowers/flower-1-pink.png'))
    this.load.image('flower-2-pink', asset('assets/flowers/flower-2-pink.png'))
    this.load.image('flower-3-pink', asset('assets/flowers/flower-3-pink.png'))
    this.load.image('flower-daisy', asset('assets/flowers/flower-daisy.png'))
    this.load.image('flower-sunflower', asset('assets/flowers/flower-sunflower.png'))
    this.load.image('flower-tulip', asset('assets/flowers/flower-tulip.png'))
    this.load.image('flower-rose', asset('assets/flowers/flower-rose.png'))
    this.load.image('flower-lavender', asset('assets/flowers/flower-lavender.png'))
    this.load.image('flower-carnation', asset('assets/flowers/flower-carnation.png'))
    this.load.image('flower-peony', asset('assets/flowers/flower-peony.png'))
    this.load.image('flower-ranunculus', asset('assets/flowers/flower-ranunculus.png'))
    this.load.image('flower-anemone', asset('assets/flowers/flower-anemone.png'))
    this.load.image('flower-protea', asset('assets/flowers/flower-protea.png'))
    this.load.image('flower-dahlia', asset('assets/flowers/flower-dahlia.png'))
    this.load.image('flower-sweetheart', asset('assets/flowers/flower-sweetheart.png'))
    this.load.image('flower-holly', asset('assets/flowers/flower-holly.png'))
    this.load.spritesheet('emily', asset('assets/characters/emily.png'), {
      frameWidth: 16,
      frameHeight: 16,
    })

    // Audio. plant/harvest are .ogg in raw assets; others .wav. Music is .mp3.
    this.load.audio('sfx-coin', asset('assets/audio/sfx-coin.wav'))
    this.load.audio('sfx-bell', asset('assets/audio/sfx-bell.wav'))
    this.load.audio('sfx-fulfill', asset('assets/audio/sfx-fulfill.wav'))
    this.load.audio('sfx-levelup', asset('assets/audio/sfx-levelup.wav'))
    this.load.audio('sfx-dig', asset('assets/audio/sfx-dig.ogg'))
    this.load.audio('sfx-snip', asset('assets/audio/sfx-snip.ogg'))
    this.load.audio('sfx-harvest', asset('assets/audio/sfx-harvest.wav'))
  }

  // Centered loading label plus a rounded progress pill that fills as assets load.
  buildLoadingUI() {
    const { width, height } = this.scale
    const cx = width / 2
    const cy = height / 2

    this.add
      .text(cx, cy - 40, "Loading Emily's Flower Shop...", {
        fontFamily: 'Georgia',
        fontSize: '20px',
        color: '#5a3e2b',
      })
      .setOrigin(0.5)

    const barWidth = 240
    const barHeight = 16
    const radius = barHeight / 2
    const barX = cx - barWidth / 2
    const barY = cy + 10

    const bg = this.add.graphics()
    bg.fillStyle(0xe0d0c0, 1)
    bg.fillRoundedRect(barX, barY, barWidth, barHeight, radius)

    const fill = this.add.graphics()
    const drawFill = (progress) => {
      fill.clear()
      const w = Math.max(barHeight, Math.floor(barWidth * progress))
      fill.fillStyle(0xc96b9a, 1)
      fill.fillRoundedRect(barX, barY, w, barHeight, radius)
    }
    drawFill(0)

    this.load.on('progress', drawFill)
    this.load.on('complete', () => drawFill(1))
  }

  create() {
    // Procedural gold coin — crisp on every device, no external image needed.
    const sz = 24
    const half = sz / 2
    const g = this.make.graphics({ x: 0, y: 0, add: false })
    g.fillStyle(0x9a6f00, 1)           // dark gold ring
    g.fillCircle(half, half, half)
    g.fillStyle(0xf0c030, 1)           // gold body
    g.fillCircle(half, half, half - 2)
    g.fillStyle(0xffd84d, 1)           // lighter face
    g.fillCircle(half, half - 1, half - 5)
    g.fillStyle(0xfff5a0, 0.85)        // shine spot
    g.fillCircle(half - 4, half - 4, 3)
    g.generateTexture('coin-gfx', sz, sz)
    g.destroy()

    this.scene.start('TitleScene')
  }
}
