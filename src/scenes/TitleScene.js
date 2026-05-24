import Phaser from 'phaser'
import * as saveManager from '../saveManager.js'
import { GAME } from '../constants.js'
import { playBgMusic } from '../audioManager.js'
import { createRoundedFillCentered } from '../ui/roundedUi.js'
import { addPressEffect } from '../ui/buttonEffects.js'
import { fadeToScene, fadeInScene } from '../ui/sceneTransition.js'

// Cozy title screen: plain cream backdrop (placeholder), wooden sign, flower accents, and a Play button.
export default class TitleScene extends Phaser.Scene {
  constructor() {
    super('TitleScene')
  }

  create() {
    fadeInScene(this)
    this.scale.on('resize', () => {
      this.input.setDefaultCursor('default')
      if (!this._resizeScheduled) {
        this._resizeScheduled = true
        this.time.delayedCall(100, () => {
          this._resizeScheduled = false
          this.scene.restart()
        })
      }
    })

    const { width, height } = this.scale

    const bg = this.add.image(width / 2, height / 2, 'bg-title')
    bg.setDisplaySize(width, height)

    const panelSideMargin = 16
    const panelW = Math.min(340, width - panelSideMargin * 2)
    const panelH = 230
    const panelX = width / 2
    const panelY = height / 2 - 40
    const titleInnerPad = 20
    const titleMaxW = panelW - titleInnerPad * 2
    const titleFontSize = width < 360 ? 24 : width < 400 ? 28 : width < 440 ? 32 : 36

    const panelShadow = this.add.graphics()
    panelShadow.fillStyle(0xe8c898, 1)
    panelShadow.fillRoundedRect(
      panelX - panelW / 2 + 6,
      panelY - panelH / 2 + 6,
      panelW,
      panelH,
      20,
    )

    const panel = this.add.graphics()
    panel.fillStyle(0xfef8f2, 1)
    panel.lineStyle(4, 0xc8a882, 1)
    panel.fillRoundedRect(panelX - panelW / 2, panelY - panelH / 2, panelW, panelH, 20)
    panel.strokeRoundedRect(panelX - panelW / 2, panelY - panelH / 2, panelW, panelH, 20)

    this.add
      .text(panelX, panelY - 44, "Emily's Flower Shop", {
        fontFamily: 'Georgia',
        fontSize: `${titleFontSize}px`,
        color: '#5a3e2b',
        align: 'center',
        wordWrap: { width: titleMaxW },
        lineSpacing: 4,
      })
      .setOrigin(0.5)

    this.add
      .text(panelX, panelY + 26, 'A cozy little world, just for you', {
        fontFamily: 'Georgia',
        fontStyle: 'italic',
        fontSize: '17px',
        color: '#8a7a6a',
        align: 'center',
      })
      .setOrigin(0.5)

    this.buildPlayButton(width / 2, panelY + panelH / 2 + 50)
  }

  // Play button: a plain Rectangle (bg + hit area) with a Text on top — no
  // Container, so the full surface is reliably tappable.
  buildPlayButton(cx, cy) {
    const w = 240
    const h = 56

    const playGraphics = createRoundedFillCentered(this, cx, cy, w, h, 0xc96b9a)
    const playHitRect = this.add.rectangle(cx, cy, w, h, 0x000000, 0.001)
    playHitRect.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, w, h),
      Phaser.Geom.Rectangle.Contains,
    )
    addPressEffect(this, playHitRect, playGraphics)

    this.add
      .text(cx, cy, '✿ Play', {
        fontFamily: 'Georgia',
        fontSize: '22px',
        color: '#ffffff',
      })
      .setOrigin(0.5)

    this.input.setDefaultCursor('default')
    playHitRect.on('pointerover', () => this.input.setDefaultCursor('pointer'))
    playHitRect.on('pointerout', () => this.input.setDefaultCursor('default'))

    playHitRect.on('pointerdown', () => {
      const save = saveManager.init()
      this.input.setDefaultCursor('default')
      playBgMusic(this, save)
      if (!save.tutorialComplete) {
        fadeToScene(this, 'TutorialScene', { save })
      } else {
        fadeToScene(this, 'GardenScene', { save })
      }
    })
  }
}
