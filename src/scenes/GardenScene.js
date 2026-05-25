import Phaser from 'phaser'
import * as saveManager from '../saveManager.js'
import { getFlowerById, getUnlockedFlowers } from '../data/flowers.js'
import { GARDEN_CONSUMABLES } from '../data/consumables.js'
import { GAME, PROGRESSION } from '../constants.js'
import { DIALOGUE as TUTORIAL_DIALOGUE } from './TutorialScene.js'
import { track, resetDailyGoals } from '../missionManager.js'
import { attachGoalsButton } from '../ui/MissionsModal.js'
import { playSfx, playBgMusic, attachMuteButton } from '../audioManager.js'
import { createRoundedFillCentered } from '../ui/roundedUi.js'
import { addPressEffect } from '../ui/buttonEffects.js'
import { Scrollbar } from '../ui/scrollbar.js'
import { addCoinText, COIN_EMOJI } from '../ui/coinLabel.js'
import { fadeToScene, fadeInScene } from '../ui/sceneTransition.js'
import { animateCoinHud } from '../ui/animateCoinHud.js'

// ---------- fixed layout constants (do not depend on screen height) ----------
const HUD_H = 80
const NAV_H = 70
const PLOT_SIZE = 120
const PLOT_GAP = 12
const PLOT_RADIUS = 12
const SCROLL_ZONE_TOP = HUD_H + 50

const COLOR = {
  navGreen: 0x8aaa64,
  hudShadow: '#5a7a32',
  brown: '#5a3e2b',
  brownMute: '#8a6e5a',
  pink: 0xc96b9a,
  pinkText: '#c96b9a',
  white: '#ffffff',
  // Inventory panel
  invBg: 0xfef8f2,
  invStroke: 0xe0c8b0,
  invCardBg: 0xfff8f0,
  // Modal
  panelStroke: 0xc8a882,
  cancelBg: 0xd4b8a8,
  // Plot palette
  dirtEmpty: 0xc8a070,
  dirtGrowing: 0xb8905c,
  dirtHighlight: 0xd4ac7c,
  dirtBorder: 0x8a6040,
  gold: 0xf0c040,
  inactiveTab: '#d4eebc',
}

function getEffectiveGrowTimeMs(flower) {
  return flower.growTimeMs
}

function formatGrowTime(ms) {
  if (ms <= 0) return 'Ready!'
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

function formatGrowTimeLabel(ms) {
  const totalSec = Math.round(ms / 1000)
  if (totalSec < 60) return `${totalSec}s`
  const minutes = Math.floor(totalSec / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const r = minutes % 60
  return r === 0 ? `${hours}h` : `${hours}h ${r}m`
}

function fitImage(img, w, h) {
  const s = Math.min(w / img.width, h / img.height)
  img.setScale(s)
  return img
}

function hudRow1TextStyle() {
  return {
    fontFamily: 'Georgia',
    fontSize: '17px',
    color: '#ffffff',
    shadow: {
      offsetX: 1,
      offsetY: 1,
      color: COLOR.hudShadow,
      blur: 0,
      fill: true,
    },
  }
}

function hudRow2TextStyle() {
  return {
    fontFamily: 'Georgia',
    fontSize: '16px',
    color: '#ffffff',
    shadow: {
      offsetX: 1,
      offsetY: 1,
      color: COLOR.hudShadow,
      blur: 0,
      fill: true,
    },
  }
}

function formatHudStarsLine(save) {
  const stars = save.totalStars ?? 0
  const lv = save.shopLevel ?? 1
  return `✿ ${stars} stars — Level ${lv}`
}

export default class GardenScene extends Phaser.Scene {
  constructor() {
    super('GardenScene')
  }

  init(data) {
    this.save = data && data.save ? data.save : saveManager.init()
    this.tutorialMode = !!(data && data.tutorialMode)
    this.tutorialStep =
      data && typeof data.tutorialStep === 'number' ? data.tutorialStep : null
  }

  create() {
    fadeInScene(this)
    // Derive layout from actual canvas size so the game fills any screen.
    const W = this.scale.width
    const H = this.scale.height

    // Height-dependent layout constants stored as instance vars for use in
    // event handlers and helper methods called after create().
    this.INVENTORY_PANEL_TOP = H - 160 - NAV_H
    this.SCROLL_ZONE_H = this.INVENTORY_PANEL_TOP - SCROLL_ZONE_TOP
    this.SEED_PICKER_MAX_PANEL_H = H - 180

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

    this.input.setTopOnly(false)
    playBgMusic(this, this.save)

    const bg = this.add.image(W / 2, H / 2, 'bg-garden')
    bg.setDisplaySize(W, H)

    this.plotCount = this.save.unlockedPlots
    this.plotSize = PLOT_SIZE
    this.plotLayout = []
    this.plotPositions = []
    this.plotVisuals = Array.from({ length: this.plotCount }, () => [])
    this.plotState = Array.from({ length: this.plotCount }, () => null)
    this.wateringCanPositions = {}

    this.inventoryObjects = []
    this.toolsObjects = []
    this.modalObjects = []
    this.modalOpen = false
    this.modalWarn = null

    this.gardenScrollY = 0
    this.scrollMax = 0
    this.dragStartY = 0
    this.dragStartScroll = 0
    this.dragMoved = false
    this.dragStartTime = 0
    this.dragActive = false
    this.lastTapTime = 0
    this.lastTapIdx = -1

    this.inventoryContainer = null
    this.inventoryMaskGfx = null
    this.inventoryScrollX = 0
    this.inventoryScrollMax = 0
    this.inventoryScrollHit = null
    this.inventoryDragStartX = null

    resetDailyGoals(this.save)

    this.buildHud()
    this.buildGardenLabel()
    this.buildPlots()
    this.buildToolsTray()
    this.buildInventory()
    this.buildNav()
    this.bindGardenInput()

    this.gardenScrollbar = new Scrollbar(this, {
      x: W - 8,
      y: SCROLL_ZONE_TOP,
      height: this.SCROLL_ZONE_H,
      orientation: 'vertical',
    })
    this.inventoryScrollbar = new Scrollbar(this, {
      x: 16,
      y: H - NAV_H - 12,
      height: W - 32,
      orientation: 'horizontal',
    })
    this.updateGardenScrollbar()
    this.updateInventoryScrollbar()

    if (this.tutorialMode) this.applyTutorialOverlay()

    this.escKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC)
    this.escKey.on('down', () => {
      if (this.modalOpen) {
        this.closeSeedPicker()
      }
    })

    this.tickEvent = this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: this.tickPlots,
      callbackScope: this,
    })

    this.time.addEvent({
      delay: 2000,
      loop: true,
      callback: this.tickGrowEffects,
      callbackScope: this,
    })

    this._seedPickerRestoreTimer = null

    this.events.once('shutdown', () => {
      if (this._seedPickerRestoreTimer) {
        this._seedPickerRestoreTimer.remove()
        this._seedPickerRestoreTimer = null
      }
      if (this.gardenMaskGfx) this.gardenMaskGfx.destroy()
      if (this.inventoryMaskGfx) this.inventoryMaskGfx.destroy()
      if (this.gardenScrollbar) this.gardenScrollbar.destroy()
      if (this.inventoryScrollbar) this.inventoryScrollbar.destroy()
      if (this.seedPickerScrollbar) this.seedPickerScrollbar.destroy()
    })
  }

  // ---------- HUD ----------
  buildHud() {
    const row1Y = 22
    const row2LabelY = 55
    const cx = this.scale.width / 2
    const starBarW = 180
    const starBarH = 6
    const starBarLeft = cx - starBarW / 2
    const starBarTop = 68

    this.add
      .rectangle(0, 0, this.scale.width, HUD_H, COLOR.navGreen)
      .setOrigin(0, 0)

    this.hudStarsBarBg = this.add.graphics()
    this.hudStarsBarBg.fillStyle(0x5a7a32, 1)
    this.hudStarsBarBg.fillRoundedRect(
      starBarLeft,
      starBarTop,
      starBarW,
      starBarH,
      starBarH / 2,
    )

    this.hudStarsBarFill = this.add.graphics()

    this.hudCoinIcon = this.add.image(48, row1Y, 'coin-gfx').setDisplaySize(18, 18)
    this.hudCoins = this.add
      .text(64, row1Y, `${this.save.coins}`, hudRow1TextStyle())
      .setOrigin(0, 0.5)
      .setShadow(1, 1, '#000000', 2)
    this._coinTarget = this.save.coins
    this.hudDay = this.add
      .text(cx, row1Y, `Day ${this.save.day}`, hudRow1TextStyle())
      .setOrigin(0.5)
      .setShadow(1, 1, '#000000', 2)

    this.hudStarsLabel = this.add
      .text(cx, row2LabelY, formatHudStarsLine(this.save), hudRow2TextStyle())
      .setOrigin(0.5, 0.5)
      .setShadow(1, 1, '#000000', 2)

    attachMuteButton(this, this.save, saveManager, row1Y)
    this.goalsButton = attachGoalsButton(this, this.save)

    this.redrawHudStarsBar(starBarLeft, starBarTop, starBarW, starBarH)
  }

  redrawHudStarsBar(barLeft, barTop, barW, barH) {
    const pct =
      (this.save.totalStars % PROGRESSION.STARS_PER_LEVEL) / PROGRESSION.STARS_PER_LEVEL
    this.hudStarsBarFill.clear()
    if (pct > 0) {
      const fillW = Math.max(barH, Math.round(barW * pct))
      this.hudStarsBarFill.fillStyle(0xffffff, 0.8)
      this.hudStarsBarFill.fillRoundedRect(barLeft, barTop, fillW, barH, barH / 2)
    }
  }

  refreshHud() {
    const newCoins = this.save.coins
    const oldCoins = this._coinTarget ?? newCoins
    this._coinTarget = newCoins
    if (oldCoins !== newCoins) {
      animateCoinHud(this, oldCoins, newCoins)
    }
    this.hudDay.setText(`Day ${this.save.day}`)
    this.hudStarsLabel.setText(formatHudStarsLine(this.save))
    const cx = this.scale.width / 2
    const starBarW = 180
    const starBarH = 6
    this.redrawHudStarsBar(cx - starBarW / 2, 68, starBarW, starBarH)
  }

  buildGardenLabel() {
    const cx = this.scale.width / 2
    const pillCy = HUD_H + 24
    const pillW = 200
    const pillH = 36
    const pill = this.add.graphics()
    pill.fillStyle(0xfef8f2, 0.85)
    pill.fillRoundedRect(cx - pillW / 2, pillCy - pillH / 2, pillW, pillH, 10)

    this.add
      .text(cx, HUD_H + 12, 'My Garden', {
        fontFamily: 'Georgia',
        fontSize: '22px',
        color: COLOR.brown,
      })
      .setOrigin(0.5, 0)
  }

  // ---------- Plots ----------
  buildPlots() {
    const W = this.scale.width
    const cols = 2
    const totalRows = Math.ceil(this.plotCount / cols)

    this.gardenContentHeight = totalRows * (PLOT_SIZE + PLOT_GAP)
    this.scrollMax = Math.max(0, this.gardenContentHeight - this.SCROLL_ZONE_H)

    const gridW = cols * PLOT_SIZE + (cols - 1) * PLOT_GAP
    const startX = (W - gridW) / 2 + PLOT_SIZE / 2
    const startY = SCROLL_ZONE_TOP + PLOT_SIZE / 2 + 8

    this.plotLayout = []
    this.plotPositions = []
    for (let idx = 0; idx < this.plotCount; idx++) {
      const col = idx % cols
      const row = Math.floor(idx / cols)
      const cx = Math.round(startX + col * (PLOT_SIZE + PLOT_GAP))
      const naturalCy = Math.round(startY + row * (PLOT_SIZE + PLOT_GAP))
      this.plotLayout.push({ cx, naturalCy, idx })
      this.plotPositions.push({ cx, cy: naturalCy + this.gardenScrollY, idx })
    }

    const maskGfx = this.make.graphics({ x: 0, y: 0, add: false })
    maskGfx.fillStyle(0xffffff, 1)
    maskGfx.fillRect(0, SCROLL_ZONE_TOP, W, this.SCROLL_ZONE_H)
    this.gardenMaskGfx = maskGfx

    for (let idx = 0; idx < this.plotCount; idx++) {
      this.renderPlot(idx)
    }
    this.updateGardenScrollbar()
  }

  updateGardenScrollbar() {
    if (!this.gardenScrollbar) return
    this.gardenScrollbar.update(
      this.gardenScrollY,
      this.scrollMax,
      this.SCROLL_ZONE_H,
      this.gardenContentHeight || this.SCROLL_ZONE_H,
    )
  }

  applyGardenPlotMask(obj) {
    if (this.gardenMaskGfx) {
      obj.setMask(new Phaser.Display.Masks.GeometryMask(this, this.gardenMaskGfx))
    }
  }

  redrawAllPlots() {
    for (let i = 0; i < this.plotPositions.length; i++) {
      this.plotPositions[i].cy = this.plotLayout[i].naturalCy + this.gardenScrollY
    }
    for (let idx = 0; idx < this.plotCount; idx++) {
      this.renderPlot(idx)
    }
    this.updateGardenScrollbar()
  }

  renderPlot(idx) {
    if (this.plotVisuals[idx]) {
      this.plotVisuals[idx].forEach((o) => o.destroy())
    }
    this.plotVisuals[idx] = []
    this.plotState[idx] = null
    delete this.wateringCanPositions[idx]

    const layout = this.plotLayout[idx]
    if (!layout) return
    const cx = layout.cx
    const cy = layout.naturalCy + this.gardenScrollY
    const plant = this.save.garden.find((p) => p.plotIndex === idx)

    if (!plant) {
      this.drawEmptyPlot(idx, cx, cy)
      this.plotState[idx] = { kind: 'empty' }
      return
    }

    const flower = getFlowerById(plant.flowerId)
    if (!flower) return

    const growTimeMs = getEffectiveGrowTimeMs(flower)
    const remainingMs = (plant.plantedAt + growTimeMs) - Date.now()

    if (remainingMs > 0) {
      const timer = this.drawGrowingPlot(idx, cx, cy, flower, remainingMs, !!plant.watered)
      this.plotState[idx] = { kind: 'growing', timer }
      return
    }

    this.drawReadyPlot(idx, cx, cy, flower)
    this.plotState[idx] = { kind: 'ready' }
  }

  drawEmptyPlot(idx, cx, cy) {
    const half = PLOT_SIZE / 2
    const inset = 8
    const innerSize = PLOT_SIZE - inset * 2
    const innerHalf = innerSize / 2

    const card = this.add.graphics()
    card.fillStyle(COLOR.dirtEmpty, 1)
    card.fillRoundedRect(cx - half, cy - half, PLOT_SIZE, PLOT_SIZE, PLOT_RADIUS)
    card.lineStyle(3, COLOR.dirtBorder, 1)
    card.strokeRoundedRect(cx - half, cy - half, PLOT_SIZE, PLOT_SIZE, PLOT_RADIUS)

    const highlight = this.add.graphics()
    highlight.fillStyle(COLOR.dirtHighlight, 0.4)
    highlight.fillRoundedRect(
      cx - innerHalf,
      cy - innerHalf,
      innerSize,
      innerSize,
      PLOT_RADIUS - 4,
    )

    const plus = this.add
      .text(cx, cy, '+', {
        fontFamily: 'Georgia',
        fontSize: '38px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setShadow(1, 1, '#000000', 3)

    ;[card, highlight, plus].forEach((o) => this.applyGardenPlotMask(o))
    this.plotVisuals[idx].push(card, highlight, plus)
  }

  drawGrowingPlot(idx, cx, cy, flower, remaining, watered) {
    const half = PLOT_SIZE / 2

    const card = this.add.graphics()
    card.fillStyle(COLOR.dirtGrowing, 1)
    card.fillRoundedRect(cx - half, cy - half, PLOT_SIZE, PLOT_SIZE, PLOT_RADIUS)
    card.lineStyle(3, COLOR.dirtBorder, 1)
    card.strokeRoundedRect(cx - half, cy - half, PLOT_SIZE, PLOT_SIZE, PLOT_RADIUS)

    const pot = this.add.image(cx, cy - 12, 'flower-pot-red').setScale(1.1)
    // Pot gently bobs up and down while growing
    this.tweens.add({
      targets: pot,
      y: { from: cy - 12, to: cy - 18 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })

    const name = this.add
      .text(cx, cy + 28, flower.name, {
        fontFamily: 'Georgia',
        fontSize: '13px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setShadow(1, 1, '#000000', 3)

    const timer = this.add
      .text(cx, cy + 42, formatGrowTime(remaining), {
        fontFamily: 'Georgia',
        fontSize: '12px',
        color: '#f0e8d8',
      })
      .setOrigin(0.5)
      .setShadow(1, 1, '#000000', 3)

    ;[card, pot, name, timer].forEach((o) => this.applyGardenPlotMask(o))
    this.plotVisuals[idx].push(card, pot, name, timer)

    if (!watered) {
      const wcx = cx + 46
      const wcy = cy + 46
      const wcRadius = 19
      // Draw circle at local (0,0) so scale tweens animate around the circle center
      const wcBg = this.add.graphics({ x: wcx, y: wcy }).setDepth(10)
      wcBg.fillStyle(0x3ba8d8, 1)
      wcBg.fillCircle(0, 0, wcRadius)
      wcBg.lineStyle(3, 0xffffff, 0.9)
      wcBg.strokeCircle(0, 0, wcRadius)
      const wcIcon = this.add
        .text(wcx, wcy - 1, '💧', { fontFamily: 'Arial, sans-serif', fontSize: '19px' })
        .setOrigin(0.5)
        .setDepth(11)
      // Gentle pulse so the button catches the eye
      this.tweens.add({
        targets: [wcBg, wcIcon],
        scaleX: { from: 1, to: 1.18 },
        scaleY: { from: 1, to: 1.18 },
        duration: 700,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })
      this.applyGardenPlotMask(wcBg)
      this.applyGardenPlotMask(wcIcon)
      this.plotVisuals[idx].push(wcBg, wcIcon)
      this.wateringCanPositions[idx] = { cx: wcx, cy: wcy, radius: wcRadius + 8 }
    }

    return timer
  }

  tickGrowEffects() {
    for (let i = 0; i < this.plotState.length; i++) {
      if (this.plotState[i]?.kind !== 'growing') continue
      // Stagger plots slightly so they don't all burst at the same instant
      this.time.delayedCall(i * 160, () => this.emitGrowEffect(i))
    }
  }

  emitGrowEffect(idx) {
    const layout = this.plotLayout[idx]
    if (!layout) return
    const cx = layout.cx
    const cy = layout.naturalCy + this.gardenScrollY
    if (cy < SCROLL_ZONE_TOP - 20 || cy > SCROLL_ZONE_TOP + this.SCROLL_ZONE_H + 20) return

    switch (Phaser.Math.Between(0, 3)) {
      case 0: {
        // Sparkle burst — 5 colorful dots pop outward from around the pot
        const burstColors = [0xf0c040, COLOR.pink, 0x8aaa64, 0xffffff, 0xb8e070]
        for (let i = 0; i < 5; i++) {
          const angle = (i / 5) * Math.PI * 2
          const sx = cx + Math.cos(angle) * 7
          const sy = cy - 14 + Math.sin(angle) * 7
          const dot = this.add.circle(sx, sy, 2.5, burstColors[i], 1).setDepth(5)
          this.tweens.add({
            targets: dot,
            x: sx + Math.cos(angle) * 24,
            y: sy + Math.sin(angle) * 24 - 6,
            alpha: { from: 1, to: 0 },
            scaleX: { from: 1, to: 0.3 },
            scaleY: { from: 1, to: 0.3 },
            duration: Phaser.Math.Between(500, 650),
            ease: 'Cubic.easeOut',
            onComplete: () => dot.destroy(),
          })
        }
        break
      }
      case 1: {
        // Rising wisps — 3 soft green circles float up one after another
        for (let i = 0; i < 3; i++) {
          this.time.delayedCall(i * 200, () => {
            const sx = cx + Phaser.Math.Between(-12, 12)
            const sy = cy - Phaser.Math.Between(8, 18)
            const wisp = this.add.circle(sx, sy, Phaser.Math.Between(2, 4), 0x90d0a0, 0.85).setDepth(5)
            this.tweens.add({
              targets: wisp,
              y: sy - Phaser.Math.Between(30, 45),
              x: sx + Phaser.Math.Between(-8, 8),
              alpha: { from: 0.85, to: 0 },
              scaleX: { from: 1, to: 0.35 },
              scaleY: { from: 1, to: 0.35 },
              duration: Phaser.Math.Between(850, 1050),
              ease: 'Sine.easeOut',
              onComplete: () => wisp.destroy(),
            })
          })
        }
        break
      }
      case 2: {
        // Soil puff — a ring expands from the base of the pot and fades
        const puff = this.add.circle(cx, cy + 2, 6, COLOR.dirtHighlight, 0).setDepth(5)
        puff.setStrokeStyle(2, 0xd4b870, 0.9)
        this.tweens.add({
          targets: puff,
          scaleX: { from: 0.5, to: 3.2 },
          scaleY: { from: 0.5, to: 3.2 },
          alpha: { from: 1, to: 0 },
          duration: 750,
          ease: 'Cubic.easeOut',
          onComplete: () => puff.destroy(),
        })
        break
      }
      case 3: {
        // Leaf drift — a single larger green circle drifts up and sideways slowly
        const lx = cx + Phaser.Math.Between(-14, 14)
        const ly = cy - Phaser.Math.Between(6, 16)
        const leaf = this.add.circle(lx, ly, Phaser.Math.Between(3, 5), 0x6ab840, 1).setDepth(5)
        this.tweens.add({
          targets: leaf,
          y: ly - Phaser.Math.Between(36, 50),
          x: lx + Phaser.Math.Between(-16, 16),
          alpha: { from: 1, to: 0 },
          duration: Phaser.Math.Between(1000, 1300),
          ease: 'Sine.easeOut',
          onComplete: () => leaf.destroy(),
        })
        break
      }
    }
  }

  drawReadyPlot(idx, cx, cy, flower) {
    const half = PLOT_SIZE / 2

    const glow = this.add.graphics()
    glow.lineStyle(8, COLOR.gold, 0.3)
    glow.strokeRoundedRect(cx - half, cy - half, PLOT_SIZE, PLOT_SIZE, PLOT_RADIUS)

    const card = this.add.graphics()
    card.fillStyle(COLOR.dirtEmpty, 1)
    card.fillRoundedRect(cx - half, cy - half, PLOT_SIZE, PLOT_SIZE, PLOT_RADIUS)
    card.lineStyle(3, COLOR.gold, 1)
    card.strokeRoundedRect(cx - half, cy - half, PLOT_SIZE, PLOT_SIZE, PLOT_RADIUS)

    const sprite = this.add.image(cx, cy - 8, flower.sprite)
    fitImage(sprite, 52, 52)
    const baseScale = sprite.scaleX
    this.tweens.add({
      targets: sprite,
      scaleX: baseScale * 1.1,
      scaleY: baseScale * 1.1,
      duration: 450,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })

    const ready = this.add
      .text(cx, cy + 46, '✿ Ready!', {
        fontFamily: 'Georgia',
        fontSize: '13px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setShadow(1, 1, '#000000', 3)
      .setShadow(2, 2, '#000000', 6)

    ;[glow, card, sprite, ready].forEach((o) => this.applyGardenPlotMask(o))
    this.plotVisuals[idx].push(glow, card, sprite, ready)
  }

  handlePlotTap(idx) {
    if (this.modalOpen) return
    if (this.tutorialMode && idx !== 0) return
    const state = this.plotState[idx]
    if (!state) return
    if (state.kind === 'empty') this.openSeedPicker(idx)
    else if (state.kind === 'ready') this.harvest(idx)
  }

  bindGardenInput() {
    this.input.on('pointerdown', (pointer) => {
      if (this.modalOpen) return
      if (pointer.y >= this.INVENTORY_PANEL_TOP) return
      if (pointer.y < SCROLL_ZONE_TOP || pointer.y > SCROLL_ZONE_TOP + this.SCROLL_ZONE_H) return
      this.dragActive = true
      this.dragStartY = pointer.y
      this.dragStartScroll = this.gardenScrollY
      this.dragMoved = false
      this.dragStartTime = Date.now()
    })

    this.input.on('pointermove', (pointer) => {
      if (!this.dragActive) return
      if (!pointer.isDown) return
      if (this.modalOpen) return
      const dy = pointer.y - this.dragStartY
      if (Math.abs(dy) > 10) {
        this.dragMoved = true
        this.gardenScrollY = Phaser.Math.Clamp(
          this.dragStartScroll + dy,
          -this.scrollMax,
          0,
        )
        this.redrawAllPlots()
      }
    })

    this.input.on('pointerup', (pointer) => {
      if (this.modalOpen) return
      if (!this.input.enabled) return
      if (!this.dragActive) return
      this.dragActive = false
      if (this.dragMoved) return

      const gameX = pointer.x
      const gameY = pointer.y
      const halfSize = this.plotSize / 2

      for (const idxStr of Object.keys(this.wateringCanPositions)) {
        const wc = this.wateringCanPositions[idxStr]
        const dx = gameX - wc.cx
        const dy = gameY - wc.cy
        if (dx * dx + dy * dy <= wc.radius * wc.radius) {
          this.waterPlot(parseInt(idxStr, 10))
          return
        }
      }

      for (const plot of this.plotPositions) {
        if (
          gameX >= plot.cx - halfSize &&
          gameX <= plot.cx + halfSize &&
          gameY >= plot.cy - halfSize &&
          gameY <= plot.cy + halfSize
        ) {
          const now = Date.now()
          if (plot.idx === this.lastTapIdx && now - this.lastTapTime < 500) {
            break
          }
          this.lastTapTime = now
          this.lastTapIdx = plot.idx
          this.handlePlotTap(plot.idx)
          break
        }
      }
    })

    this.input.on('wheel', (_pointer, _go, _dx, dy) => {
      if (this.modalOpen) return
      if (this.tutorialMode) return
      if (this.scrollMax === 0) return
      const newScroll = Phaser.Math.Clamp(
        this.gardenScrollY - dy,
        -this.scrollMax,
        0,
      )
      if (newScroll !== this.gardenScrollY) {
        this.gardenScrollY = newScroll
        this.redrawAllPlots()
      }
    })
  }

  repositionInventory() {
    if (this.inventoryContainer) {
      this.inventoryContainer.x = this.inventoryScrollX
    }
    this.updateInventoryScrollbar()
  }

  updateInventoryScrollbar() {
    if (!this.inventoryScrollbar) return
    const W = this.scale.width
    this.inventoryScrollbar.update(
      this.inventoryScrollX,
      this.inventoryScrollMax,
      W - 32,
      this.inventoryContentWidth || W - 32,
    )
  }

  tickPlots() {
    const now = Date.now()
    for (let i = 0; i < this.plotState.length; i++) {
      const s = this.plotState[i]
      if (!s || s.kind !== 'growing') continue
      const plant = this.save.garden.find((p) => p.plotIndex === i)
      if (!plant) {
        this.renderPlot(i)
        continue
      }
      const flower = getFlowerById(plant.flowerId)
      if (!flower) continue
      const growTimeMs = getEffectiveGrowTimeMs(flower)
      const remainingMs = (plant.plantedAt + growTimeMs) - now
      if (now >= plant.plantedAt + growTimeMs) {
        this.renderPlot(i)
      } else {
        if (s.timer) s.timer.setText(formatGrowTime(remainingMs))
      }
    }
  }

  // ---------- Consumable tools tray ----------
  buildToolsTray() {
    this.refreshToolsTray()
  }

  refreshToolsTray() {
    this.toolsObjects.forEach((o) => o.destroy())
    this.toolsObjects = []

    const owned = GARDEN_CONSUMABLES.filter(
      (tool) => (this.save.consumables[tool.id] || 0) > 0,
    )
    if (owned.length === 0) return

    const W = this.scale.width
    const gridW = 2 * PLOT_SIZE + PLOT_GAP
    const gridRightX = Math.round((W - gridW) / 2 + gridW)
    const gutterW = W - 8 - gridRightX  // space between grid right edge and scrollbar
    const isMobile = W < 600
    const buttonSize = isMobile ? 44 : Math.max(44, Math.min(56, gutterW - 4))
    const gap = isMobile ? 6 : 8
    const bx = Math.round(gridRightX + gutterW / 2)
    // Center the stack vertically between the HUD bottom and the inventory tray top
    const totalH = owned.length * buttonSize + (owned.length - 1) * gap
    const startY = Math.round((HUD_H + this.INVENTORY_PANEL_TOP) / 2 - totalH / 2)

    owned.forEach((tool, index) => {
      const by = startY + index * (buttonSize + gap)
      const cy = by + buttonSize / 2
      const x = bx - buttonSize / 2

      const bg = this.add.graphics().setDepth(18)
      bg.fillStyle(COLOR.invBg, 0.98)
      bg.lineStyle(2, COLOR.invStroke, 1)
      const trayR = Math.min(20, buttonSize / 2)
      bg.fillRoundedRect(x, by, buttonSize, buttonSize, trayR)
      bg.strokeRoundedRect(x, by, buttonSize, buttonSize, trayR)

      const hit = this.add.rectangle(bx, cy, buttonSize, buttonSize, 0x000000, 0.001)
        .setDepth(19)
      hit.setInteractive(
        new Phaser.Geom.Rectangle(0, 0, buttonSize, buttonSize),
        Phaser.Geom.Rectangle.Contains,
      )
      addPressEffect(this, hit, bg)
      hit.on('pointerdown', () => this.useGardenTool(tool.id))

      const iconFontSize = Math.round(buttonSize * 0.50)
      const nameFontSize = Math.max(9, Math.round(buttonSize * 0.20))
      const icon = this.add
        .text(bx, by + Math.round(buttonSize * 0.34), tool.icon, { fontSize: `${iconFontSize}px` })
        .setOrigin(0.5)
        .setDepth(20)
      const name = this.add
        .text(bx, by + Math.round(buttonSize * 0.76), tool.name.split(' ')[0], {
          fontFamily: 'Georgia',
          fontSize: `${nameFontSize}px`,
          color: COLOR.brownMute,
        })
        .setOrigin(0.5)
        .setDepth(20)

      const badgeR = Math.max(8, Math.round(buttonSize * 0.19))
      const badge = this.add.circle(x + buttonSize - badgeR + 2, by + badgeR - 2, badgeR, COLOR.pink)
        .setDepth(21)
      const badgeFontSize = Math.max(8, badgeR - 2)
      const badgeText = this.add
        .text(badge.x, badge.y, `x${this.save.consumables[tool.id] || 0}`, {
          fontFamily: 'Georgia',
          fontSize: `${badgeFontSize}px`,
          color: COLOR.white,
        })
        .setOrigin(0.5)
        .setDepth(22)

      this.toolsObjects.push(bg, hit, icon, name, badge, badgeText)
    })
  }

  useGardenTool(id) {
    if (this.modalOpen) return
    if ((this.save.consumables[id] || 0) <= 0) return

    if (id === 'instantBloom') this.openInstantBloomSelector()
    if (id === 'harvestAll') this.useHarvestAll()
    if (id === 'plantAll') this.openSeedPicker(null, 'plantAll')
  }

  isPlotReady(plant) {
    const flower = getFlowerById(plant.flowerId)
    if (!flower) return false
    const growTimeMs = getEffectiveGrowTimeMs(flower)
    return Date.now() >= plant.plantedAt + growTimeMs
  }

  useHarvestAll() {
    const readyPlants = this.save.garden.filter((plant) => this.isPlotReady(plant))
    if (readyPlants.length === 0) {
      this.flashMessage('No ready flowers yet 🌱', '#8a6e5a')
      return
    }

    readyPlants.forEach((plant) => {
      const flower = getFlowerById(plant.flowerId)
      if (flower) {
        this.save.inventory[flower.id] = (this.save.inventory[flower.id] || 0) + 1
      }
    })
    const readyIndexes = new Set(readyPlants.map((plant) => plant.plotIndex))
    this.save.garden = this.save.garden.filter(
      (plant) => !readyIndexes.has(plant.plotIndex),
    )
    this.save.consumables.harvestAll -= 1
    saveManager.save(this.save)

    readyIndexes.forEach((idx) => this.renderPlot(idx))
    this.refreshInventory()
    this.refreshToolsTray()
    playSfx(this, 'sfx-snip', 0.6, this.save)
    playSfx(this, 'sfx-coin', 0.5, this.save)
    track(this.save, 'harvest', readyPlants.length)
    track(this.save, 'harvest_all_plots', 1)
    this.trackInventoryGoals()
    if (this.goalsButton) this.goalsButton.refreshBadge()
    this.flashMessage('🌿 All flowers harvested!', '#4a8a4a')
  }

  openInstantBloomSelector() {
    const growingPlants = this.save.garden.filter((plant) => !this.isPlotReady(plant))
    if (growingPlants.length === 0) {
      this.flashMessage('No growing flowers 🌱', '#8a6e5a')
      return
    }

    const W = this.scale.width
    const H = this.scale.height

    this.modalOpen = true
    const dim = this.add
      .rectangle(0, 0, W, H, 0x000000, 0.55)
      .setOrigin(0, 0)
      .setDepth(100)
    dim.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, W, H),
      Phaser.Geom.Rectangle.Contains,
    )
    this.modalObjects.push(dim)

    const hint = this.add
      .text(W / 2, HUD_H + 42, 'Tap a growing plot to bloom it ⚡', {
        fontFamily: 'Georgia',
        fontSize: '18px',
        color: COLOR.white,
      })
      .setOrigin(0.5)
      .setDepth(102)
      .setShadow(1, 1, '#000000', 3)
    this.modalObjects.push(hint)

    growingPlants.forEach((plant) => {
      const pos = this.plotPositions[plant.plotIndex]
      if (!pos) return
      const { cx, cy } = pos
      if (cy < SCROLL_ZONE_TOP || cy > SCROLL_ZONE_TOP + this.SCROLL_ZONE_H) return

      const hit = this.add.rectangle(cx, cy, PLOT_SIZE, PLOT_SIZE, 0xffffff, 0.1)
        .setDepth(103)
      hit.setStrokeStyle(3, COLOR.gold)
      hit.setInteractive(
        new Phaser.Geom.Rectangle(0, 0, PLOT_SIZE, PLOT_SIZE),
        Phaser.Geom.Rectangle.Contains,
      )
      hit.on('pointerdown', () => this.instantBloomPlot(plant.plotIndex))
      this.modalObjects.push(hit)
    })

    const cancel = this.add
      .text(W / 2, H - NAV_H - 24, 'Cancel', {
        fontFamily: 'Georgia',
        fontSize: '18px',
        color: COLOR.white,
      })
      .setOrigin(0.5)
      .setDepth(104)
    cancel.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, 120, 60),
      Phaser.Geom.Rectangle.Contains,
    )
    cancel.on('pointerdown', () => this.closeSeedPicker())
    this.modalObjects.push(cancel)
  }

  instantBloomPlot(plotIdx) {
    const plant = this.save.garden.find((p) => p.plotIndex === plotIdx)
    if (!plant) return
    const flower = getFlowerById(plant.flowerId)
    if (!flower) return

    plant.plantedAt = Date.now() - getEffectiveGrowTimeMs(flower)
    this.save.consumables.instantBloom -= 1
    saveManager.save(this.save)
    this.closeSeedPicker()
    this.renderPlot(plotIdx)
    this.refreshToolsTray()
    this.flashMessage('⚡ Instant bloom!', '#4a8a4a')
  }

  removeSeedPickerScrollInput() {
    if (this._seedPickerListDown) {
      this.input.off('pointerdown', this._seedPickerListDown)
      this.input.off('pointermove', this._seedPickerListMove)
      this.input.off('pointerup', this._seedPickerListUp)
      this._seedPickerListDown = null
      this._seedPickerListMove = null
      this._seedPickerListUp = null
    }
    if (this._seedPickerWheel) {
      this.input.off('wheel', this._seedPickerWheel)
      this._seedPickerWheel = null
    }
    if (this.seedPickerScrollbar) {
      this.seedPickerScrollbar.destroy()
      this.seedPickerScrollbar = null
    }
    this.seedPickerScrollMeta = null
    this.seedPickerScrollZone = null
    this.seedPickerListScrollMin = 0
    this.seedPickerListContainer = null
    this.seedPickerListRows = null
    this.listScrollY = 0
    this.listDragStartY = 0
    this.listScrollYAtDragStart = 0
    this.seedPickerListDragging = false
  }

  applySeedPickerListScroll() {
    if (!this.seedPickerListRows) return
    for (const row of this.seedPickerListRows) {
      for (const part of row.parts) {
        part.obj.setPosition(part.x, part.baseY + this.listScrollY)
      }
    }
    this.updateSeedPickerScrollbar()
  }

  updateSeedPickerScrollbar() {
    if (!this.seedPickerScrollbar || !this.seedPickerScrollMeta) return
    const m = this.seedPickerScrollMeta
    this.seedPickerScrollbar.update(
      this.listScrollY,
      m.scrollMax,
      m.scrollViewportH,
      m.listNaturalH,
    )
  }

  // ---------- Seed picker modal ----------
  openSeedPicker(plotIdx, mode = 'single') {
    if (this.modalOpen) return
    this.removeSeedPickerScrollInput()
    if (this._seedPickerRestoreTimer) {
      this._seedPickerRestoreTimer.remove()
      this._seedPickerRestoreTimer = null
    }
    this.modalOpen = true
    this.input.enabled = false

    const { width, height } = this.scale
    const cx = width / 2
    const cy = height / 2

    const dim = this.add
      .rectangle(cx, cy, width, height, 0x000000, 0.45)
      .setDepth(100)
    this.modalObjects.push(dim)

    const unlocked = getUnlockedFlowers(this.save.unlockedFlowers)
    const panelW = 340
    const rowH = 72
    const headerH = 70
    const cancelZoneH = 58
    const listNaturalH = unlocked.length * rowH
    const naturalPanelH = headerH + listNaturalH + cancelZoneH
    const panelH = Math.min(this.SEED_PICKER_MAX_PANEL_H, naturalPanelH)
    const scrollViewportH = panelH - headerH - cancelZoneH
    const scrollMax = Math.max(0, listNaturalH - scrollViewportH)

    const panelTop = cy - panelH / 2
    const panel = this.add
      .rectangle(cx, cy, panelW, panelH, 0xffffff)
      .setStrokeStyle(2, COLOR.panelStroke)
      .setDepth(101)
    this.modalObjects.push(panel)

    const titleY = panelTop + 22
    const title = this.add
      .text(cx, titleY, 'Choose a seed 🌱', {
        fontFamily: 'Georgia',
        fontSize: '20px',
        color: COLOR.brown,
      })
      .setOrigin(0.5)
      .setDepth(102)
    this.modalObjects.push(title)

    this.modalWarnY = titleY + 22
    this.modalWarnParts = null

    const listLeft = cx - panelW / 2
    const listViewportTop = panelTop + headerH
    const listContainer = this.add.container(listLeft, listViewportTop).setDepth(102)

    const listMaskGfx = this.make.graphics({ x: 0, y: 0, add: false })
    listMaskGfx.fillStyle(0xffffff, 1)
    listMaskGfx.fillRect(listLeft, listViewportTop, panelW, scrollViewportH)
    listContainer.setMask(new Phaser.Display.Masks.GeometryMask(this, listMaskGfx))

    const seedPickerButtons = []
    const seedPickerListRows = []

    unlocked.forEach((flower, i) => {
      const baseCy = i * rowH + rowH / 2
      const rowX0 = 14
      const parts = []

      const spriteImg = this.add.image(0, 0, flower.sprite)
      fitImage(spriteImg, 40, 40)
      listContainer.add(spriteImg)
      const spriteX = rowX0 + 24
      spriteImg.setPosition(spriteX, baseCy)
      parts.push({ obj: spriteImg, x: spriteX, baseY: baseCy })

      const name = this.add
        .text(0, 0, flower.name, {
          fontFamily: 'Georgia',
          fontSize: '18px',
          color: COLOR.brown,
        })
        .setOrigin(0, 0.5)
      listContainer.add(name)
      const nameX = rowX0 + 56
      const nameY = baseCy - 14
      name.setPosition(nameX, nameY)
      parts.push({ obj: name, x: nameX, baseY: nameY })

      const metaX = rowX0 + 56
      const metaY = baseCy + 8
      const metaContainer = this.add.container(metaX, metaY)
      listContainer.add(metaContainer)
      addCoinText(this, {
        x: 0,
        y: 0,
        text: `${formatGrowTimeLabel(getEffectiveGrowTimeMs(flower))}    ${COIN_EMOJI} ${flower.seedCost}`,
        style: { fontFamily: 'Georgia', fontSize: '15px', color: COLOR.brownMute },
        originX: 0,
        originY: 0.5,
        container: metaContainer,
      })
      parts.push({ obj: metaContainer, x: metaX, baseY: metaY })

      const btnW = 86
      const btnH = 40
      const btnX = panelW - btnW / 2 - 14
      const btn = createRoundedFillCentered(this, 0, 0, btnW, btnH, COLOR.pink)
      listContainer.add(btn)
      btn.setPosition(btnX, baseCy)
      parts.push({ obj: btn, x: btnX, baseY: baseCy })

      const btnHit = this.add.rectangle(0, 0, btnW, btnH, 0x000000, 0.001)
      listContainer.add(btnHit)
      btnHit.setPosition(btnX, baseCy)
      seedPickerButtons.push({
        hit: btnHit,
        visual: btn,
        w: btnW,
        h: btnH,
        onTap: () => {
          if (mode === 'plantAll') this.tryPlantAll(flower)
          else this.tryPlant(plotIdx, flower)
        },
      })
      parts.push({ obj: btnHit, x: btnX, baseY: baseCy })

      const btnLabel = this.add
        .text(0, 0, 'Plant', {
          fontFamily: 'Georgia',
          fontSize: '17px',
          color: COLOR.white,
        })
        .setOrigin(0.5)
      listContainer.add(btnLabel)
      btnLabel.setPosition(btnX, baseCy)
      parts.push({ obj: btnLabel, x: btnX, baseY: baseCy })

      seedPickerListRows.push({ parts })
    })

    this.seedPickerListRows = seedPickerListRows
    this.listScrollY = 0
    this.modalObjects.push(listContainer)

    if (scrollMax > 0) {
      const fadeH = 28
      const fadeTop = listViewportTop + scrollViewportH - fadeH
      const fadeGfx = this.add.graphics().setDepth(105)
      const steps = 6
      const stepH = fadeH / steps
      for (let s = 0; s < steps; s++) {
        const a = ((s + 1) / steps) * 0.55
        fadeGfx.fillStyle(0xffffff, a)
        fadeGfx.fillRect(listLeft + 4, fadeTop + s * stepH, panelW - 8, stepH + 0.5)
      }
      this.modalObjects.push(fadeGfx)
    }

    const cancelW = 220
    const cancelH = 44
    const cancelX = cx
    const cancelY = panelTop + panelH - 30
    const cancel = createRoundedFillCentered(this, cancelX, cancelY, cancelW, cancelH, COLOR.cancelBg).setDepth(106)
    const cancelHit = this.add
      .rectangle(cancelX, cancelY, cancelW, cancelH, 0x000000, 0.001)
      .setDepth(106)
    seedPickerButtons.push({
      hit: cancelHit,
      visual: cancel,
      w: cancelW,
      h: cancelH,
      onTap: () => this.closeSeedPicker(),
    })
    const cancelLbl = this.add
      .text(cancelX, cancelY, 'Cancel', {
        fontFamily: 'Georgia',
        fontSize: '17px',
        color: COLOR.white,
      })
      .setOrigin(0.5)
      .setDepth(107)
    this.modalObjects.push(cancel, cancelHit, cancelLbl)

    this.modalObjects.push(listMaskGfx)

    this.seedPickerListContainer = listContainer
    this.seedPickerScrollZone = {
      left: listLeft,
      top: listViewportTop,
      right: listLeft + panelW,
      bottom: listViewportTop + scrollViewportH,
    }
    const listScrollMin = -scrollMax
    this.seedPickerListScrollMin = listScrollMin
    this.seedPickerScrollMeta = {
      scrollMax,
      scrollViewportH,
      listNaturalH,
    }
    if (this.seedPickerScrollbar) this.seedPickerScrollbar.destroy()
    this.seedPickerScrollbar = new Scrollbar(this, {
      x: cx + panelW / 2 - 8,
      y: listViewportTop,
      height: scrollViewportH,
      orientation: 'vertical',
    })
    this.seedPickerScrollbar.bar.setDepth(108)

    this._seedPickerListDown = (pointer) => {
      if (!this.modalOpen || !this.seedPickerScrollZone) return
      const z = this.seedPickerScrollZone
      if (pointer.x < z.left || pointer.x > z.right || pointer.y < z.top || pointer.y > z.bottom) return
      this.listDragStartY = pointer.y
      this.listScrollYAtDragStart = this.listScrollY
      this.seedPickerListDragging = true
    }
    this._seedPickerListMove = (pointer) => {
      if (!this.modalOpen || !this.seedPickerListDragging) return
      if (!pointer.isDown) return
      const dy = pointer.y - this.listDragStartY
      this.listScrollY = Phaser.Math.Clamp(
        this.listScrollYAtDragStart - dy,
        listScrollMin,
        0,
      )
      this.applySeedPickerListScroll()
    }
    this._seedPickerListUp = () => {
      this.seedPickerListDragging = false
    }
    this._seedPickerWheel = (pointer, _go, _dx, dy) => {
      if (!this.modalOpen || !this.seedPickerScrollZone) return
      if (scrollMax <= 0) return
      const z = this.seedPickerScrollZone
      if (pointer.x < z.left || pointer.x > z.right || pointer.y < z.top || pointer.y > z.bottom) return
      const next = Phaser.Math.Clamp(
        this.listScrollY - dy,
        this.seedPickerListScrollMin,
        0,
      )
      if (next !== this.listScrollY) {
        this.listScrollY = next
        this.applySeedPickerListScroll()
      }
    }
    this.input.on('pointerdown', this._seedPickerListDown)
    this.input.on('pointermove', this._seedPickerListMove)
    this.input.on('pointerup', this._seedPickerListUp)
    this.input.on('wheel', this._seedPickerWheel)

    this.time.delayedCall(0, () => {
      if (!this.modalOpen) return
      this.input.enabled = true
      seedPickerButtons.forEach(({ hit, visual, w, h, onTap }) => {
        if (!hit.active) return
        hit.setInteractive(
          new Phaser.Geom.Rectangle(0, 0, w, h),
          Phaser.Geom.Rectangle.Contains,
        )
        addPressEffect(this, hit, visual)
        hit.once('pointerup', () => onTap())
      })
    })
    this.updateSeedPickerScrollbar()
  }

  closeSeedPicker() {
    this.removeSeedPickerScrollInput()
    this.modalObjects.forEach((o) => o.destroy())
    this.modalObjects = []
    this.modalWarnParts = null
    this.modalOpen = false
    if (this._seedPickerRestoreTimer) {
      this._seedPickerRestoreTimer.remove()
    }
    this.input.enabled = false
    this._seedPickerRestoreTimer = this.time.delayedCall(0, () => {
      this.input.enabled = true
      this._seedPickerRestoreTimer = null
    })
  }

  flashModalWarn(message) {
    const cx = this.scale.width / 2
    this.clearModalWarn()
    const warnStyle = { fontFamily: 'Georgia', fontSize: '14px', color: '#c0392b' }
    const layout = message.includes(COIN_EMOJI)
      ? addCoinText(this, {
          x: cx,
          y: this.modalWarnY,
          text: message,
          style: warnStyle,
          originX: 0.5,
          originY: 0.5,
          depth: 102,
        })
      : {
          objects: [
            this.add
              .text(cx, this.modalWarnY, message, warnStyle)
              .setOrigin(0.5)
              .setDepth(102),
          ],
        }
    this.modalWarnParts = layout.objects
    this.modalObjects.push(...layout.objects)
    this.tweens.killTweensOf(this.modalWarnParts)
    this.modalWarnParts.forEach((o) => o.setAlpha(1))
    this.tweens.add({
      targets: this.modalWarnParts,
      alpha: 0,
      delay: 1200,
      duration: 400,
    })
  }

  clearModalWarn() {
    if (!this.modalWarnParts) return
    this.modalWarnParts.forEach((o) => {
      const i = this.modalObjects.indexOf(o)
      if (i !== -1) this.modalObjects.splice(i, 1)
      o.destroy()
    })
    this.modalWarnParts = null
  }

  /** Pop ring, seed burst, and sparkles when a plot is planted. */
  playPlantEffect(plotIdx, flower) {
    const layout = this.plotLayout[plotIdx]
    if (!layout || !flower?.sprite) return

    const cx = layout.cx
    const cy = layout.naturalCy + this.gardenScrollY
    const depth = 90

    // 1. Expanding ring — starts compact, bursts outward
    const ring = this.add
      .circle(cx, cy, 18, COLOR.pink, 0)
      .setStrokeStyle(5, COLOR.pink, 1)
      .setDepth(depth)
    this.tweens.add({
      targets: ring,
      scaleX: { from: 0.3, to: 4.0 },
      scaleY: { from: 0.3, to: 4.0 },
      alpha: { from: 1, to: 0 },
      duration: 500,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    })

    // 2. Flower sprite — fitImage FIRST to get target scale, then reset to near-zero so it pops
    const pop = this.add
      .image(cx, cy - 4, flower.sprite)
      .setOrigin(0.5)
      .setDepth(depth + 1)
    fitImage(pop, 52, 52)
    const popEndX = pop.scaleX
    const popEndY = pop.scaleY
    pop.setScale(0.01)
    this.tweens.add({
      targets: pop,
      scaleX: { from: 0.01, to: popEndX * 1.4 },
      scaleY: { from: 0.01, to: popEndY * 1.4 },
      y: { from: cy - 4, to: cy - 28 },
      alpha: { from: 1, to: 0 },
      duration: 580,
      ease: 'Back.easeOut',
      onComplete: () => pop.destroy(),
    })

    // 3. Seed emoji — pops from tiny and floats up
    const seed = this.add
      .text(cx, cy + 10, '🌱', { fontFamily: 'Arial, sans-serif', fontSize: '28px' })
      .setOrigin(0.5)
      .setAlpha(1)
      .setDepth(depth + 2)
    seed.setScale(0.01)
    this.tweens.add({
      targets: seed,
      scaleX: { from: 0.01, to: 1.3 },
      scaleY: { from: 0.01, to: 1.3 },
      y: { from: cy + 10, to: cy - 20 },
      alpha: { from: 1, to: 0 },
      duration: 520,
      ease: 'Back.easeOut',
      onComplete: () => seed.destroy(),
    })

    // 4. Colored sparkle circles — evenly distributed burst
    const sparkleColors = [0xf0c040, COLOR.pink, 0x8aaa64, 0xffffff]
    for (let i = 0; i < 14; i++) {
      const angle = (i / 14) * Math.PI * 2
      const endR = Phaser.Math.Between(44, 68)
      const sx = cx + Math.cos(angle) * 8
      const sy = cy + Math.sin(angle) * 8
      const r = Phaser.Math.Between(3, 6)
      const spark = this.add
        .circle(sx, sy, r, sparkleColors[i % sparkleColors.length], 1)
        .setDepth(depth + 2)
      this.tweens.add({
        targets: spark,
        x: sx + Math.cos(angle) * endR,
        y: sy + Math.sin(angle) * endR - Phaser.Math.Between(12, 30),
        alpha: { from: 1, to: 0 },
        scaleX: { from: 1, to: 0.2 },
        scaleY: { from: 1, to: 0.2 },
        duration: Phaser.Math.Between(450, 650),
        ease: 'Cubic.easeOut',
        onComplete: () => spark.destroy(),
      })
    }

    // 5. Soil burst — bright high-contrast dots so they read against dark dirt
    const dirtColors = [0xfff8e8, 0xf5e090, 0xffffff, 0xddc880]
    for (let i = 0; i < 8; i++) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2)
      const px = cx + Phaser.Math.Between(-10, 10)
      const py = cy + Phaser.Math.Between(-10, 10)
      const dot = this.add
        .circle(px, py, Phaser.Math.Between(3, 6), dirtColors[i % dirtColors.length], 1)
        .setDepth(depth + 1)
      this.tweens.add({
        targets: dot,
        x: px + Math.cos(angle) * Phaser.Math.Between(28, 52),
        y: py + Math.sin(angle) * Phaser.Math.Between(28, 52) - Phaser.Math.Between(10, 24),
        alpha: { from: 1, to: 0 },
        scaleX: { from: 1, to: 0.3 },
        scaleY: { from: 1, to: 0.3 },
        duration: Phaser.Math.Between(320, 480),
        ease: 'Quad.easeOut',
        onComplete: () => dot.destroy(),
      })
    }
  }

  tryPlant(plotIdx, flower) {
    if (this.save.coins < flower.seedCost) {
      this.flashModalWarn('Not enough coins 🪙')
      return
    }
    this.save.coins -= flower.seedCost

    let plantedAt = Date.now()
    if (this.tutorialMode && this.tutorialStep === 1) {
      const effectiveMs = getEffectiveGrowTimeMs(flower)
      plantedAt -= Math.max(0, effectiveMs - 3000)
    }

    this.save.garden.push({
      plotIndex: plotIdx,
      flowerId: flower.id,
      plantedAt,
    })
    saveManager.save(this.save)
    this.refreshHud()
    this.closeSeedPicker()
    this.playPlantEffect(plotIdx, flower)
    this.time.delayedCall(0, () => this.renderPlot(plotIdx))

    playSfx(this, 'sfx-coin', 0.4, this.save)
    playSfx(this, 'sfx-snip', 0.6, this.save)

    track(this.save, 'plant', 1)
    if (flower.tier >= 2) track(this.save, 'plant_tier2', 1)
    if (flower.tier >= 3) track(this.save, 'plant_tier3', 1)
    if (this.goalsButton) this.goalsButton.refreshBadge()

    if (this.tutorialMode && this.tutorialStep === 1) {
      this.save.tutorialStep = 2
      saveManager.save(this.save)
      fadeToScene(this, 'TutorialScene', { save: this.save, step: 2 })
    }
  }

  tryPlantAll(flower) {
    const emptyPlots = []
    for (let idx = 0; idx < this.plotCount; idx++) {
      const occupied = this.save.garden.some((plant) => plant.plotIndex === idx)
      if (!occupied) emptyPlots.push(idx)
    }

    if (emptyPlots.length === 0) {
      this.flashModalWarn('No empty plots 🌱')
      return
    }

    const totalCost = flower.seedCost * emptyPlots.length
    if (this.save.coins < totalCost) {
      this.flashModalWarn('Not enough coins 🪙')
      return
    }

    const plantedAt = Date.now()
    this.save.coins -= totalCost
    emptyPlots.forEach((plotIndex) => {
      this.save.garden.push({
        plotIndex,
        flowerId: flower.id,
        plantedAt,
      })
    })
    this.save.consumables.plantAll -= 1
    saveManager.save(this.save)
    this.refreshHud()
    this.closeSeedPicker()
    emptyPlots.forEach((idx, i) => {
      this.time.delayedCall(i * 70, () => {
        this.playPlantEffect(idx, flower)
        this.time.delayedCall(0, () => this.renderPlot(idx))
      })
    })
    this.refreshToolsTray()

    playSfx(this, 'sfx-coin', 0.4, this.save)
    playSfx(this, 'sfx-snip', 0.6, this.save)
    track(this.save, 'plant', emptyPlots.length)
    if (flower.tier >= 2) track(this.save, 'plant_tier2', emptyPlots.length)
    if (flower.tier >= 3) track(this.save, 'plant_tier3', 1)
    if (this.goalsButton) this.goalsButton.refreshBadge()
    this.flashMessage('🌱 All plots planted!', '#4a8a4a')
  }

  trackInventoryGoals() {
    const totalFlowers = Object.values(this.save.inventory).reduce(
      (sum, qty) => sum + qty,
      0,
    )
    track(this.save, 'inventory_count', totalFlowers)
    const uniqueTypes = Object.keys(this.save.inventory).filter(
      (k) => this.save.inventory[k] > 0,
    ).length
    track(this.save, 'inventory_types', uniqueTypes)
  }

  harvest(plotIdx) {
    const i = this.save.garden.findIndex((p) => p.plotIndex === plotIdx)
    if (i === -1) return
    const plant = this.save.garden[i]
    const flower = getFlowerById(plant.flowerId)
    this.save.garden.splice(i, 1)
    if (flower) {
      this.save.inventory[flower.id] = (this.save.inventory[flower.id] || 0) + 1
    }
    saveManager.save(this.save)
    this.renderPlot(plotIdx)
    this.refreshInventory()

    playSfx(this, 'sfx-harvest', 0.6, this.save)

    track(this.save, 'harvest', 1)
    this.trackInventoryGoals()
    if (this.goalsButton) this.goalsButton.refreshBadge()

    if (this.tutorialMode && this.tutorialStep === 4) {
      this.save.tutorialStep = 5
      saveManager.save(this.save)
      fadeToScene(this, 'TutorialScene', { save: this.save, step: 5 })
    }
  }

  waterPlot(idx) {
    const plant = this.save.garden.find((p) => p.plotIndex === idx)
    if (!plant || plant.watered) return
    const flower = getFlowerById(plant.flowerId)
    if (!flower) return
    const growTimeMs = getEffectiveGrowTimeMs(flower)
    plant.plantedAt -= growTimeMs * 0.28
    plant.watered = true
    saveManager.save(this.save)
    this.playWateringEffect(idx)
    this.renderPlot(idx)
  }

  playWateringEffect(idx) {
    const layout = this.plotLayout[idx]
    if (!layout) return
    const cx = layout.cx
    const cy = layout.naturalCy + this.gardenScrollY
    const depth = 90

    // Expanding blue ring
    const ring = this.add
      .circle(cx, cy, 18, 0x3ba8d8, 0)
      .setStrokeStyle(4, 0x3ba8d8, 0.9)
      .setDepth(depth)
    this.tweens.add({
      targets: ring,
      scaleX: { from: 0.3, to: 3.8 },
      scaleY: { from: 0.3, to: 3.8 },
      alpha: { from: 0.9, to: 0 },
      duration: 550,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    })

    // Water droplets raining down
    for (let i = 0; i < 9; i++) {
      this.time.delayedCall(i * 40, () => {
        const sx = cx + Phaser.Math.Between(-30, 30)
        const sy = cy - Phaser.Math.Between(25, 45)
        const drop = this.add
          .circle(sx, sy, Phaser.Math.Between(2, 4), 0x3ba8d8, 0.9)
          .setDepth(depth + 1)
        this.tweens.add({
          targets: drop,
          y: sy + Phaser.Math.Between(35, 60),
          x: sx + Phaser.Math.Between(-6, 6),
          alpha: { from: 0.9, to: 0 },
          scaleX: { from: 1, to: 0.3 },
          scaleY: { from: 1.4, to: 0.3 },
          duration: Phaser.Math.Between(380, 620),
          ease: 'Quad.easeIn',
          onComplete: () => drop.destroy(),
        })
      })
    }

    // Floating "+28%" speed-up label
    const label = this.add
      .text(cx, cy - 36, '+28% ⚡', {
        fontFamily: 'Georgia',
        fontSize: '14px',
        color: '#3ba8d8',
      })
      .setOrigin(0.5)
      .setDepth(depth + 2)
      .setShadow(1, 1, '#000000', 3)
    this.tweens.add({
      targets: label,
      y: cy - 68,
      alpha: { from: 1, to: 0 },
      duration: 1100,
      ease: 'Cubic.easeOut',
      onComplete: () => label.destroy(),
    })
  }

  // ---------- Inventory panel (fixed at bottom) ----------
  buildInventory() {
    this.refreshInventory()
  }

  refreshInventory() {
    this.inventoryObjects.forEach((o) => o.destroy())
    this.inventoryObjects = []
    if (this.inventoryMaskGfx) {
      this.inventoryMaskGfx.destroy()
      this.inventoryMaskGfx = null
    }
    if (this.inventoryContainer) {
      this.inventoryContainer.destroy(true)
      this.inventoryContainer = null
    }
    this.inventoryScrollX = 0
    this.inventoryScrollMax = 0
    this.inventoryScrollHit = null
    this.inventoryDragStartX = null

    const top = this.INVENTORY_PANEL_TOP
    const h = 150 // INVENTORY_PANEL_H
    const w = this.scale.width

    const panel = this.add.graphics()
    panel.fillStyle(COLOR.invBg, 0.75)
    panel.fillRoundedRect(0, top, w, h, { tl: 16, tr: 16, bl: 0, br: 0 })
    this.inventoryObjects.push(panel)

    const stroke = this.add
      .rectangle(w / 2, top, w, 1, COLOR.invStroke)
      .setOrigin(0.5, 0)
    this.inventoryObjects.push(stroke)

    const label = this.add
      .text(16, top + 8, 'My Inventory', {
        fontFamily: 'Georgia',
        fontSize: '15px',
        color: COLOR.brown,
      })
      .setOrigin(0, 0)
    this.inventoryObjects.push(label)

    const entries = getUnlockedFlowers(this.save.unlockedFlowers)
      .map((flower) => [flower.id, this.save.inventory[flower.id] || 0])
      .sort((a, b) => b[1] - a[1])

    if (entries.length === 0) {
      const empty = this.add
        .text(w / 2, top + h / 2 + 6, 'Harvest flowers to see them here', {
          fontFamily: 'Georgia',
          fontStyle: 'italic',
          fontSize: '15px',
          color: '#8a7a6a',
        })
        .setOrigin(0.5)
      this.inventoryObjects.push(empty)
      return
    }

    this.inventoryContainer = this.add.container(0, 0)
    const maskGfx = this.make.graphics({ x: 0, y: 0, add: false })
    maskGfx.fillStyle(0xffffff, 1)
    maskGfx.fillRect(0, top, w, h)
    this.inventoryMaskGfx = maskGfx
    this.inventoryContainer.setMask(
      new Phaser.Display.Masks.GeometryMask(this, maskGfx),
    )

    const cardW = 75
    const cardH = 95
    const stride = 82
    const startX = 16
    const cardY = top + 35

    entries.forEach(([flowerId, qty], i) => {
      const flower = getFlowerById(flowerId)
      if (!flower) return

      const x = startX + i * stride
      const cardCx = x + cardW / 2

      const card = this.add.graphics()
      card.fillStyle(COLOR.invCardBg, 1)
      card.fillRoundedRect(x, cardY, cardW, cardH, 10)
      card.lineStyle(2, COLOR.invStroke, 1)
      card.strokeRoundedRect(x, cardY, cardW, cardH, 10)

      const sprite = this.add.image(cardCx, cardY + 30, flower.sprite)
      fitImage(sprite, 44, 44)

      const name = this.add
        .text(cardCx, cardY + 72, flower.name, {
          fontFamily: 'Georgia',
          fontSize: '13px',
          color: COLOR.brown,
        })
        .setOrigin(0.5)

      if (qty <= 0) {
        sprite.setAlpha(0.5)
        name.setAlpha(0.5)
      }

      const badgeX = x + cardW - 8
      const badgeY = cardY + 8
      const badge = this.add.circle(badgeX, badgeY, 12, COLOR.pink)
      const badgeText = this.add
        .text(badgeX, badgeY, `${qty}`, {
          fontFamily: 'Georgia',
          fontSize: '12px',
          color: COLOR.white,
        })
        .setOrigin(0.5)

      this.inventoryContainer.add([card, sprite, name, badge, badgeText])
    })

    const contentRight = startX + (entries.length - 1) * stride + cardW
    const visibleRight = w - startX
    this.inventoryScrollMax = Math.max(0, contentRight - visibleRight)
    this.inventoryContentWidth = contentRight

    if (this.inventoryScrollMax > 0) {
      const fadeTop = top + 30
      const fadeH = h - 30
      const steps = 5
      const stepW = 4

      const leftFade = this.add.graphics()
      for (let i = 0; i < steps; i++) {
        leftFade.fillStyle(COLOR.invBg, (steps - i) / steps)
        leftFade.fillRect(i * stepW, fadeTop, stepW, fadeH)
      }
      this.inventoryObjects.push(leftFade)

      const rightFade = this.add.graphics()
      for (let i = 0; i < steps; i++) {
        rightFade.fillStyle(COLOR.invBg, (steps - i) / steps)
        rightFade.fillRect(w - (i + 1) * stepW, fadeTop, stepW, fadeH)
      }
      this.inventoryObjects.push(rightFade)

      const inventoryHitRect = this.add
        .rectangle(w / 2, top + h / 2, w, h, 0x000000, 0.001)
        .setDepth(17)
      inventoryHitRect.setInteractive(
        new Phaser.Geom.Rectangle(0, 0, w, h),
        Phaser.Geom.Rectangle.Contains,
      )
      inventoryHitRect.on('pointerdown', (pointer) => {
        this.inventoryDragStartX = pointer.x
        this.inventoryDragStartScroll = this.inventoryScrollX
      })
      inventoryHitRect.on('pointermove', (pointer) => {
        if (this.inventoryDragStartX === null) return
        if (!pointer.isDown) return
        const dx = pointer.x - this.inventoryDragStartX
        this.inventoryScrollX = Phaser.Math.Clamp(
          this.inventoryDragStartScroll + dx,
          -this.inventoryScrollMax,
          0,
        )
        this.repositionInventory()
      })
      inventoryHitRect.on('pointerup', () => {
        this.inventoryDragStartX = null
      })
      this.inventoryScrollHit = inventoryHitRect
      this.inventoryObjects.push(inventoryHitRect)
    }
    this.updateInventoryScrollbar()
  }

  // ---------- Bottom nav ----------
  buildNav() {
    const { width, height } = this.scale
    this.add
      .rectangle(0, height - NAV_H, width, NAV_H, COLOR.navGreen)
      .setOrigin(0, 0)

    const tabs = [
      { key: 'garden', emoji: '🌱', label: 'Garden', active: true },
      {
        key: 'shop',
        emoji: '🏪',
        label: 'Shop',
        active: false,
        onTap: () => fadeToScene(this, 'ShopScene', { save: this.save }),
      },
      {
        key: 'orders',
        emoji: '📋',
        label: 'Orders',
        active: false,
        onTap: () => fadeToScene(this, 'OrderScene', { save: this.save }),
      },
      {
        key: 'upgrades',
        emoji: '⭐',
        label: 'Upgrades',
        active: false,
        onTap: () => fadeToScene(this, 'UpgradeScene', { save: this.save }),
      },
    ]
    const tabW = width / tabs.length
    tabs.forEach((t, i) => {
      const cx = tabW * i + tabW / 2
      const cy = height - NAV_H / 2

      const hit = this.add.rectangle(cx, cy, tabW, NAV_H, 0x000000, 0)
      hit.setInteractive(
        new Phaser.Geom.Rectangle(0, 0, tabW, NAV_H),
        Phaser.Geom.Rectangle.Contains,
      )
      if (t.onTap && !this.tutorialMode) hit.on('pointerdown', t.onTap)

      const color = t.active ? '#ffffff' : COLOR.inactiveTab
      this.add.text(cx, cy - 12, t.emoji, { fontSize: '24px' }).setOrigin(0.5).setShadow(1, 2, '#000000', 4)
      this.add
        .text(cx, cy + 14, t.label, {
          fontFamily: 'Georgia',
          fontSize: '14px',
          color,
        })
        .setOrigin(0.5)
        .setShadow(1, 2, '#000000', 4)
      if (t.active) {
        this.add.rectangle(cx, cy + 28, 30, 2, 0xffffff)
      }
    })
  }

  // ---------- Tutorial overlay (steps 1 + 4) ----------
  applyTutorialOverlay() {
    if (this.tutorialStep === 1) {
      this.drawPlotSpotlight(0)
      this.drawTutorialTooltip(TUTORIAL_DIALOGUE.plantPrompt)
    } else if (this.tutorialStep === 4) {
      this.drawPlotSpotlight(0)
    }
  }

  drawPlotSpotlight(plotIdx) {
    const pos = this.plotPositions && this.plotPositions[plotIdx]
    if (!pos) return
    const { cx, cy } = pos
    const pad = 12
    const half = PLOT_SIZE / 2 + pad
    const left = cx - half
    const right = cx + half
    const top = cy - half
    const bottom = cy + half
    const dimAlpha = 0.6
    const w = this.scale.width
    const h = this.scale.height
    const depth = 50

    if (top > 0) {
      this.add
        .rectangle(0, 0, w, top, 0x000000, dimAlpha)
        .setOrigin(0, 0)
        .setDepth(depth)
    }
    if (bottom < h) {
      this.add
        .rectangle(0, bottom, w, h - bottom, 0x000000, dimAlpha)
        .setOrigin(0, 0)
        .setDepth(depth)
    }
    if (left > 0) {
      this.add
        .rectangle(0, top, left, bottom - top, 0x000000, dimAlpha)
        .setOrigin(0, 0)
        .setDepth(depth)
    }
    if (right < w) {
      this.add
        .rectangle(right, top, w - right, bottom - top, 0x000000, dimAlpha)
        .setOrigin(0, 0)
        .setDepth(depth)
    }

    const baseY = top - 20
    const arrow = this.add
      .text(cx, baseY - 10, '↓', {
        fontFamily: 'Georgia',
        fontSize: '30px',
        color: '#c96b9a',
      })
      .setOrigin(0.5)
      .setDepth(depth + 2)
      .setShadow(0, 0, '#ffffff', 4)
    this.tweens.add({
      targets: arrow,
      y: baseY + 10,
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
  }

  drawTutorialTooltip(text) {
    const cx = this.scale.width / 2
    const cardW = 280
    const cy = this.INVENTORY_PANEL_TOP - 50
    const padding = 10

    const label = this.add
      .text(cx, cy, text, {
        fontFamily: 'Georgia',
        fontSize: '16px',
        color: '#5a3e2b',
        align: 'center',
        wordWrap: { width: cardW - padding * 2 },
      })
      .setOrigin(0.5)
      .setDepth(52)

    const cardH = label.height + padding * 2
    const bg = this.add.graphics().setDepth(51)
    bg.fillStyle(0xfef8f2, 1)
    bg.lineStyle(2, 0xe0c8b0, 1)
    bg.fillRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 12)
    bg.strokeRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 12)
  }
}
