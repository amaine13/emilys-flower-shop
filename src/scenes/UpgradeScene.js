import Phaser from 'phaser'
import { FLOWERS } from '../data/flowers.js'
import { CONSUMABLES } from '../data/consumables.js'
import { PROGRESSION } from '../constants.js'
import * as saveManager from '../saveManager.js'
import { track } from '../missionManager.js'
import { attachGoalsButton } from '../ui/MissionsModal.js'
import { playSfx, playBgMusic, attachMuteButton } from '../audioManager.js'
import { createRoundedFillCentered } from '../ui/roundedUi.js'
import { addPressEffect } from '../ui/buttonEffects.js'
import { Scrollbar } from '../ui/scrollbar.js'
import { addCoinText, COIN_EMOJI } from '../ui/coinLabel.js'

const HUD_H = 80
const NAV_H = 70
const MAX_PLOTS = 12
const PLOT_BUY_AMOUNT = 2
const PLOT_BUY_COST = 150

const CARD_W = 340
const CARD_SIDE_MARGIN = 16
/** Title pill top (clears HUD with ~20px gap). */
const TITLE_PILL_TOP = HUD_H + 20
const TITLE_PILL_W = 200
const TITLE_PILL_H = 42
const GAP_TITLE_TO_CARD = 16
const GAP_CARD = 20
const GAP_LAST_TO_NAV = 20
const CARD_PAD_X = 16
const CARD_PAD_Y = 16

const SEED_ROW_H = 75
const SEED_VISIBLE_ROWS = 4
const TOOL_ROW_MIN_H = 96
const TOOL_BTN_W = 118
const TOOL_BTN_H = 34
const SEED_DIVIDER_COLOR = 0xe0c8b0

const COLOR = {
  green: 0x8aaa64,
  panel: 0xfef8f2,
  panelStroke: 0xe0c8b0,
  warmStroke: 0xc8a882,
  brown: '#5a3e2b',
  muted: '#8a7a6a',
  mutedButton: 0xc0a090,
  mutedButtonText: '#c0a090',
  pink: 0xc96b9a,
  success: '#4a8a4a',
  danger: '#cc6060',
  inactiveTab: '#d4eebc',
  shadow: '#5a7a32',
  white: '#ffffff',
}

function hudRow1TextStyle() {
  return {
    fontFamily: 'Georgia',
    fontSize: '17px',
    color: '#ffffff',
    shadow: {
      offsetX: 1,
      offsetY: 1,
      color: COLOR.shadow,
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
      color: COLOR.shadow,
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

function fitImage(img, w, h) {
  const scale = Math.min(w / img.width, h / img.height)
  img.setScale(scale)
  return img
}

function cardTextWrapWidth(cardW) {
  return cardW - CARD_PAD_X * 2
}

/** Horizontally center upgrade cards within the current game width. */
function getUpgradeCardLayout(scene) {
  const cardW = Math.min(CARD_W, scene.scale.width - CARD_SIDE_MARGIN * 2)
  const cardX = (scene.scale.width - cardW) / 2
  const cx = scene.scale.width / 2
  return { cardX, cardW, cx }
}

/** Centered body copy within card horizontal padding. */
function addCardCenteredText(scene, cx, y, content, cardW, style = {}) {
  return scene.add
    .text(cx, y, content, {
      fontFamily: 'Georgia',
      align: 'center',
      wordWrap: { width: cardTextWrapWidth(cardW) },
      ...style,
    })
    .setOrigin(0.5, 0)
}

/** Title emoji + label centered as one visual unit (avoids emoji width skew). */
function addCardTitleRow(scene, cx, y, emoji, label, style = {}) {
  const base = { fontFamily: 'Georgia', ...style }
  const emojiObj = scene.add.text(0, y, emoji, base).setOrigin(0, 0)
  const labelObj = scene.add.text(0, y, label, base).setOrigin(0, 0)
  const gap = 6
  const totalW = emojiObj.width + gap + labelObj.width
  const left = cx - totalW / 2
  emojiObj.setX(left)
  labelObj.setX(left + emojiObj.width + gap)
  return [emojiObj, labelObj]
}

/** Centered line with a trailing emoji/symbol outside the measured text run. */
function addCardCenteredTextWithSuffix(scene, cx, y, text, suffix, style = {}) {
  const base = { fontFamily: 'Georgia', ...style }
  const mainObj = scene.add.text(0, y, text, base).setOrigin(0, 0)
  const sufObj = scene.add.text(0, y, suffix, base).setOrigin(0, 0)
  const gap = 4
  const totalW = mainObj.width + gap + sufObj.width
  const left = cx - totalW / 2
  mainObj.setX(left)
  sufObj.setX(left + mainObj.width + gap)
  return [mainObj, sufObj]
}

export default class UpgradeScene extends Phaser.Scene {
  constructor() {
    super('UpgradeScene')
  }

  create() {
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
    this.save = this.scene.settings.data.save || saveManager.init()
    this.input.setTopOnly(true)
    playBgMusic(this, this.save)

    this.uiObjects = []
    this.seedScrollIndex = 0

    this.upgradeScrollY = 0
    this.upgradeScrollMax = 0
    this.upgradePageDragStartY = 0
    this.upgradePageDragStartScroll = 0
    this.upgradePageDragging = false
    this.seedShopCardBounds = null

    this.buildBackground()
    this.upgradeScrollContainer = this.add.container(0, 0)

    this.buildHud()
    this.bindUpgradeScroll()
    this.refreshContent()
    this.upgradeScrollbar = new Scrollbar(this, {
      x: this.scale.width - 8,
      y: HUD_H,
      height: this.scrollViewportHeight(),
      orientation: 'vertical',
    })
    this.updateUpgradeScrollbar()
    this.buildNav()

    this.events.once('shutdown', () => {
      if (this.upgradeScrollbar) this.upgradeScrollbar.destroy()
    })
  }

  updateUpgradeScrollbar() {
    if (!this.upgradeScrollbar) return
    const viewH = this.scrollViewportHeight()
    this.upgradeScrollbar.update(
      this.upgradeScrollY,
      this.upgradeScrollMax,
      viewH,
      this.upgradeContentHeight || viewH,
    )
  }

  scrollViewportHeight() {
    return this.scale.height - HUD_H - NAV_H
  }

  bindUpgradeScroll() {
    this.input.on('pointerdown', (pointer) => {
      if (pointer.y < HUD_H || pointer.y > this.scale.height - NAV_H) return
      this.upgradePageDragStartY = pointer.y
      this.upgradePageDragStartScroll = this.upgradeScrollY
      this.upgradePageDragging = false
    })

    this.input.on('pointermove', (pointer) => {
      if (!pointer.isDown) return
      if (pointer.y < HUD_H || pointer.y > this.scale.height - NAV_H) return
      if (this.upgradeScrollMax <= 0) return
      const dy = pointer.y - this.upgradePageDragStartY
      if (Math.abs(dy) > 5) {
        this.upgradePageDragging = true
        const next = Phaser.Math.Clamp(
          this.upgradePageDragStartScroll + dy,
          -this.upgradeScrollMax,
          0,
        )
        if (next !== this.upgradeScrollY) {
          this.upgradeScrollY = next
          this.upgradeScrollContainer.y = this.upgradeScrollY
          this.updateUpgradeScrollbar()
        }
      }
    })

    this.input.on('pointerup', () => {
      this.upgradePageDragging = false
    })

    this.input.on('wheel', (pointer, _go, _dx, dy) => {
      const b = this.seedShopCardBounds
      if (
        b &&
        pointer.y >= b.top &&
        pointer.y <= b.bottom &&
        this.canScrollSeedsWheel()
      ) {
        if (this.scrollSeeds(dy > 0 ? 1 : -1)) return
      }
      if (this.upgradeScrollMax <= 0) return
      const next = Phaser.Math.Clamp(
        this.upgradeScrollY - dy,
        -this.upgradeScrollMax,
        0,
      )
      if (next !== this.upgradeScrollY) {
        this.upgradeScrollY = next
        this.upgradeScrollContainer.y = this.upgradeScrollY
        this.updateUpgradeScrollbar()
      }
    })
  }

  canScrollSeedsWheel() {
    const lockedCount = FLOWERS.filter((f) => !this.save.unlockedFlowers.includes(f.id)).length
    return lockedCount > SEED_VISIBLE_ROWS
  }

  scrollSeeds(step) {
    const lockedCount = FLOWERS.filter(
      (flower) => !this.save.unlockedFlowers.includes(flower.id),
    ).length
    const nextIndex = Phaser.Math.Clamp(
      this.seedScrollIndex + step,
      0,
      Math.max(0, lockedCount - SEED_VISIBLE_ROWS),
    )
    if (nextIndex === this.seedScrollIndex) return false
    this.seedScrollIndex = nextIndex
    this.refreshContent()
    return true
  }

  addScroll(...objects) {
    objects.flat().forEach((o) => {
      if (o) this.upgradeScrollContainer.add(o)
    })
  }

  buildBackground() {
    const W = this.scale.width
    const H = this.scale.height
    const bg = this.add.image(W / 2, H / 2, 'bg-garden')
    bg.setDisplaySize(W, H)
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.35)
  }

  buildHud() {
    const row1Y = 22
    const row2LabelY = 55
    const cx = this.scale.width / 2
    const starBarW = 180
    const starBarH = 6
    const starBarLeft = cx - starBarW / 2
    const starBarTop = 68

    const hud = this.add.rectangle(0, 0, this.scale.width, HUD_H, COLOR.green).setOrigin(0, 0)

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
    this.hudDay = this.add
      .text(cx, row1Y, `Day ${this.save.day}`, hudRow1TextStyle())
      .setOrigin(0.5)
      .setShadow(1, 1, '#000000', 2)

    this.hudStarsLabel = this.add
      .text(cx, row2LabelY, formatHudStarsLine(this.save), hudRow2TextStyle())
      .setOrigin(0.5, 0.5)
      .setShadow(1, 1, '#000000', 2)

    this.uiObjects.push(
      hud,
      this.hudStarsBarBg,
      this.hudStarsBarFill,
      this.hudCoinIcon,
      this.hudCoins,
      this.hudDay,
      this.hudStarsLabel,
    )

    const muteHandle = attachMuteButton(this, this.save, saveManager, row1Y)
    this.uiObjects.push(muteHandle.label)

    this.goalsButton = attachGoalsButton(this, this.save)
    this.uiObjects.push(
      this.goalsButton.bg,
      this.goalsButton.label,
      this.goalsButton.badgeBg,
      this.goalsButton.badgeText,
    )

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
    this.hudCoins.setText(`${this.save.coins}`)
    this.hudDay.setText(`Day ${this.save.day}`)
    this.hudStarsLabel.setText(formatHudStarsLine(this.save))
    const cx = this.scale.width / 2
    const starBarW = 180
    const starBarH = 6
    this.redrawHudStarsBar(cx - starBarW / 2, 68, starBarW, starBarH)
  }

  refreshContent() {
    const prevScroll = this.upgradeScrollY
    this.seedShopCardBounds = null
    this.upgradeScrollContainer.removeAll(true)

    this.buildTitleInScroll()

    let y = TITLE_PILL_TOP + TITLE_PILL_H + GAP_TITLE_TO_CARD
    y += this.buildPlotsCardAt(y)
    y += GAP_CARD
    y += this.buildSeedShopCardAt(y)
    y += GAP_CARD
    y += this.buildToolsCardAt(y)

    const totalH = y + GAP_LAST_TO_NAV

    const scrollCatch = this.add.rectangle(0, 0, this.scale.width, totalH, 0x000000, 0.001)
    scrollCatch.setOrigin(0, 0)
    scrollCatch.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, this.scale.width, totalH),
      Phaser.Geom.Rectangle.Contains,
    )
    this.upgradeScrollContainer.addAt(scrollCatch, 0)

    this.upgradeContentHeight = totalH
    this.upgradeScrollMax = Math.max(0, totalH - this.scrollViewportHeight())
    this.upgradeScrollY = Phaser.Math.Clamp(prevScroll, -this.upgradeScrollMax, 0)
    this.upgradeScrollContainer.y = this.upgradeScrollY
    this.updateUpgradeScrollbar()
  }

  buildTitleInScroll() {
    const cx = this.scale.width / 2
    const top = TITLE_PILL_TOP
    const pill = this.add.graphics()
    pill.fillStyle(COLOR.panel, 0.9)
    pill.fillRoundedRect(cx - TITLE_PILL_W / 2, top, TITLE_PILL_W, TITLE_PILL_H, 12)
    const title = this.add
      .text(cx, top + TITLE_PILL_H / 2, 'Upgrades', {
        fontFamily: 'Georgia',
        fontSize: '24px',
        color: COLOR.brown,
      })
      .setOrigin(0.5)
    this.addScroll(pill, title)
  }

  buildPlotsCardAt(cardTop) {
    const { cardX, cardW, cx } = getUpgradeCardLayout(this)
    const pad = CARD_PAD_Y
    let innerY = cardTop + pad

    const title = addCardTitleRow(this, cx, innerY, '🌱', 'Garden Plots', {
      fontSize: '20px',
      color: COLOR.brown,
    })
    innerY += 28

    const current = addCardCenteredText(
      this,
      cx,
      innerY,
      `You have ${this.save.unlockedPlots} plots (max ${MAX_PLOTS})`,
      cardW,
      { fontSize: '16px', color: COLOR.muted },
    )
    innerY += 28

    if (this.save.unlockedPlots >= MAX_PLOTS) {
      const maxText = addCardCenteredTextWithSuffix(
        this,
        cx,
        innerY,
        'Garden is fully expanded!',
        '✿',
        { fontSize: '17px', color: '#c96b9a' },
      )
      innerY += 28
      innerY += pad
      const cardH = innerY - cardTop
      const cardG = this.drawCard(cardX, cardTop, cardW, cardH)
      this.addScroll(...title, current, ...maxText)
      this.upgradeScrollContainer.sendToBack(cardG)
      return cardH
    }

    const canAfford = this.save.coins >= PLOT_BUY_COST
    const btnCy = innerY + 28
    innerY += 56
    innerY += pad
    const cardH = innerY - cardTop

    const cardG = this.drawCard(cardX, cardTop, cardW, cardH)
    this.addScroll(...title, current)
    this.upgradeScrollContainer.sendToBack(cardG)
    this.createButton({
      x: cx,
      y: btnCy,
      w: 280,
      h: 56,
      hitH: 80,
      color: canAfford ? COLOR.pink : COLOR.mutedButton,
      label: canAfford
        ? `Buy ${PLOT_BUY_AMOUNT} more plots — 🪙 ${PLOT_BUY_COST}`
        : `Buy ${PLOT_BUY_AMOUNT} more plots — 🪙 ${PLOT_BUY_COST} (Need ${PLOT_BUY_COST} 🪙)`,
      fontSize: canAfford ? '18px' : '14px',
      onTap: () => this.buyPlots(),
    })
    return cardH
  }

  buildSeedShopCardAt(cardTop) {
    const { cardX, cardW, cx } = getUpgradeCardLayout(this)
    const pad = CARD_PAD_Y
    let innerY = cardTop + pad

    const title = addCardTitleRow(this, cx, innerY, '🌸', 'Seed Shop', {
      fontSize: '20px',
      color: COLOR.brown,
    })
    innerY += 30

    const lockedFlowers = FLOWERS.filter(
      (flower) => !this.save.unlockedFlowers.includes(flower.id),
    )
    this.seedScrollIndex = Phaser.Math.Clamp(
      this.seedScrollIndex,
      0,
      Math.max(0, lockedFlowers.length - SEED_VISIBLE_ROWS),
    )

    if (lockedFlowers.length === 0) {
      const done = addCardCenteredTextWithSuffix(
        this,
        cx,
        innerY + 8,
        "You've unlocked all flowers!",
        '✿',
        { fontSize: '17px', color: COLOR.muted },
      )
      innerY += 8 + done[0].height
      innerY += pad
      const cardH = innerY - cardTop
      const cardG = this.drawCard(cardX, cardTop, cardW, cardH)
      this.addScroll(...title, ...done)
      this.upgradeScrollContainer.sendToBack(cardG)
      this.seedShopCardBounds = { top: cardTop, bottom: cardTop + cardH }
      return cardH
    }

    const availableAtLevel = lockedFlowers.filter(
      (flower) => flower.unlockLevel <= this.save.shopLevel,
    )
    const headerExtras = []

    if (availableAtLevel.length === 0) {
      const nextLevel = Math.min(
        ...lockedFlowers.map((flower) => flower.unlockLevel),
        PROGRESSION.MAX_LEVEL,
      )
      const messageY = innerY
      const lockedMessage = addCardCenteredText(
        this,
        cx,
        messageY,
        `Next seeds unlock at Level ${nextLevel}`,
        cardW,
        { fontStyle: 'italic', fontSize: '15px', color: COLOR.muted },
      )
      headerExtras.push(lockedMessage)
      innerY = messageY + 22
      const separator = this.add.rectangle(
        cx,
        innerY,
        cardW - 60,
        1,
        SEED_DIVIDER_COLOR,
      )
      headerExtras.push(separator)
      innerY += 8
    }

    const listStartY = innerY + 12

    const visible = lockedFlowers.slice(
      this.seedScrollIndex,
      this.seedScrollIndex + SEED_VISIBLE_ROWS,
    )
    const innerEnd = listStartY + visible.length * SEED_ROW_H + pad
    const cardH = innerEnd - cardTop
    const cardG = this.drawCard(cardX, cardTop, cardW, cardH)

    this.addScroll(...title, ...headerExtras)

    visible.forEach((flower, index) => {
      if (index > 0) {
        const dividerY = listStartY + index * SEED_ROW_H
        const divider = this.add.rectangle(
          cardX + cardW / 2,
          dividerY,
          cardW - 32,
          1,
          SEED_DIVIDER_COLOR,
        )
        this.addScroll(divider)
      }
      const rowCenterY = listStartY + index * SEED_ROW_H + SEED_ROW_H / 2
      this.buildSeedRow(cardX, cardW, rowCenterY, flower)
    })

    this.upgradeScrollContainer.sendToBack(cardG)
    this.seedShopCardBounds = { top: cardTop, bottom: cardTop + cardH }
    return cardH
  }

  buildSeedRow(cardX, cardW, rowCenterY, flower) {
    const sprite = this.add.image(cardX + 32, rowCenterY, flower.sprite)
    fitImage(sprite, 40, 40)

    const nameY = rowCenterY - 17
    const name = this.add
      .text(cardX + 68, nameY, flower.name, {
        fontFamily: 'Georgia',
        fontSize: '17px',
        color: COLOR.brown,
      })
      .setOrigin(0, 0.5)

    const badgeW = 52
    const badgeH = 20
    const badgeLeftX = cardX + 68
    const badgeY = rowCenterY + 8
    const badge = this.add.graphics()
    badge.fillStyle(0xf5e6c8, 1)
    badge.fillRoundedRect(badgeLeftX, badgeY - badgeH / 2, badgeW, badgeH, 8)
    const badgeText = this.add
      .text(badgeLeftX + badgeW / 2, badgeY, `Tier ${flower.tier}`, {
        fontFamily: 'Georgia',
        fontSize: '13px',
        color: COLOR.brown,
      })
      .setOrigin(0.5)

    this.addScroll(sprite, name, badge, badgeText)

    if (flower.unlockLevel > this.save.shopLevel) {
      const lockedText = this.add
        .text(cardX + cardW - 16, rowCenterY, `Reach Level ${flower.unlockLevel}`, {
          fontFamily: 'Georgia',
          fontStyle: 'italic',
          fontSize: '14px',
          color: COLOR.mutedButtonText,
        })
        .setOrigin(1, 0.5)
      this.addScroll(lockedText)
      return
    }

    const cost = flower.seedCost * 10
    const canAfford = this.save.coins >= cost
    this.createButton({
      x: cardX + cardW - 72,
      y: rowCenterY,
      w: 124,
      h: 46,
      hitH: 58,
      color: canAfford ? COLOR.pink : COLOR.mutedButton,
      label: `Unlock — 🪙 ${cost}`,
      fontSize: '14px',
      onTap: () => this.buySeed(flower),
    })
  }

  buildToolsCardAt(cardTop) {
    const { cardX, cardW, cx } = getUpgradeCardLayout(this)
    const pad = CARD_PAD_Y
    let innerY = cardTop + pad

    const title = this.add
      .text(cx, innerY, "🧰 Emily's Tools", {
        fontFamily: 'Georgia',
        fontSize: '20px',
        color: COLOR.brown,
      })
      .setOrigin(0.5, 0)
    innerY += 28

    const listTop = innerY
    let rowY = listTop
    CONSUMABLES.forEach((item, index) => {
      if (index > 0) {
        const divider = this.add.rectangle(
          cardX + cardW / 2,
          rowY,
          cardW - 32,
          1,
          SEED_DIVIDER_COLOR,
        )
        this.addScroll(divider)
      }
      rowY += this.buildConsumableRow(cardX, cardW, rowY, item)
    })
    const cardH = rowY + pad - cardTop
    const cardG = this.drawCard(cardX, cardTop, cardW, cardH)

    this.addScroll(title)

    this.upgradeScrollContainer.sendToBack(cardG)
    return cardH
  }

  buildConsumableRow(cardX, cardW, rowTop, item) {
    const padLeft = 16
    const btnRightPad = 12
    const btnX = cardX + cardW - TOOL_BTN_W / 2 - btnRightPad
    const textColW = cardW - padLeft - TOOL_BTN_W - btnRightPad - 8

    const nameY = rowTop + 12
    const descY = rowTop + 34

    const iconName = this.add
      .text(cardX + padLeft, nameY, `${item.icon} ${item.name}`, {
        fontFamily: 'Georgia',
        fontSize: '17px',
        color: COLOR.brown,
      })
      .setOrigin(0, 0)
    const description = this.add
      .text(cardX + padLeft, descY, item.description, {
        fontFamily: 'Georgia',
        fontStyle: 'italic',
        fontSize: '13px',
        color: COLOR.muted,
        wordWrap: { width: textColW },
      })
      .setOrigin(0, 0)

    const stockCount = this.save.consumables[item.id] || 0
    const stockY = descY + description.height + 8
    const stockLabel = this.add
      .text(cardX + padLeft, stockY, `In stock: ${stockCount} uses`, {
        fontFamily: 'Georgia',
        fontSize: '13px',
        color: '#8a7a6a',
      })
      .setOrigin(0, 0)

    const canAfford = this.save.coins >= item.price
    const btnCenterY = nameY + TOOL_BTN_H / 2
    const perPurchaseText = this.add
      .text(btnX, stockY, `+${item.packSize} per purchase`, {
        fontFamily: 'Georgia',
        fontStyle: 'italic',
        fontSize: '13px',
        color: '#8a7a6a',
      })
      .setOrigin(0.5, 0)
    const btn = createRoundedFillCentered(
      this,
      btnX,
      btnCenterY,
      TOOL_BTN_W,
      TOOL_BTN_H,
      canAfford ? COLOR.pink : COLOR.mutedButton,
    )
    const hit = this.add.rectangle(btnX, btnCenterY, TOOL_BTN_W, 60, 0x000000, 0.001)
    hit.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, TOOL_BTN_W, 60),
      Phaser.Geom.Rectangle.Contains,
    )
    addPressEffect(this, hit, btn)
    hit.on('pointerdown', () => this.buyConsumable(item))
    const btnLabel = addCoinText(this, {
      x: btnX,
      y: btnCenterY,
      text: `Buy — ${COIN_EMOJI} ${item.price}`,
      style: { fontFamily: 'Georgia', fontSize: '12px', color: COLOR.white },
      originX: 0.5,
      originY: 0.5,
    })

    this.addScroll(iconName, description, stockLabel, perPurchaseText, btn, hit, ...btnLabel.objects)

    const rowBottom = Math.max(stockY + stockLabel.height, btnCenterY + TOOL_BTN_H / 2) + 12
    return Math.max(TOOL_ROW_MIN_H, rowBottom - rowTop)
  }

  drawCard(x, y, w, h) {
    const card = this.add.graphics()
    card.fillStyle(COLOR.panel, 0.95)
    card.lineStyle(2, COLOR.panelStroke, 1)
    card.fillRoundedRect(x, y, w, h, 16)
    card.strokeRoundedRect(x, y, w, h, 16)
    this.addScroll(card)
    return card
  }

  createButton({ x, y, w, h, hitH, color, label, fontSize, onTap }) {
    const visual = createRoundedFillCentered(this, x, y, w, h, color)
    const hit = this.add.rectangle(x, y, w, hitH, 0x000000, 0.001)
    hit.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, w, hitH),
      Phaser.Geom.Rectangle.Contains,
    )
    addPressEffect(this, hit, visual)
    hit.on('pointerdown', onTap)
    const labelStyle = {
      fontFamily: 'Georgia',
      fontSize,
      color: COLOR.white,
    }
    const labelLayout = label.includes(COIN_EMOJI)
      ? addCoinText(this, {
          x,
          y,
          text: label,
          style: labelStyle,
          originX: 0.5,
          originY: 0.5,
        })
      : {
          objects: [
            this.add
              .text(x, y, label, {
                ...labelStyle,
                align: 'center',
                wordWrap: { width: w - 16 },
              })
              .setOrigin(0.5),
          ],
        }
    this.addScroll(visual, hit, ...labelLayout.objects)
  }

  buyPlots() {
    if (this.save.unlockedPlots >= MAX_PLOTS) {
      this.flashMessage('Garden is fully expanded! ✿', '#c96b9a')
      return
    }
    if (this.save.coins < PLOT_BUY_COST) {
      this.flashMessage('Not enough coins 🪙', COLOR.danger)
      return
    }

    this.save.coins -= PLOT_BUY_COST
    this.save.unlockedPlots = Math.min(MAX_PLOTS, this.save.unlockedPlots + PLOT_BUY_AMOUNT)
    saveManager.save(this.save)
    this.refreshHud()
    this.refreshContent()

    playSfx(this, 'sfx-coin', 0.6, this.save)

    track(this.save, 'expand_garden', this.save.unlockedPlots)
    if (this.goalsButton) this.goalsButton.refreshBadge()

    this.flashMessage('✿ Unlocked!', COLOR.success)
  }

  buySeed(flower) {
    if (this.save.unlockedFlowers.includes(flower.id)) return
    if (flower.unlockLevel > this.save.shopLevel) return

    const cost = flower.seedCost * 10
    if (this.save.coins < cost) {
      this.flashMessage('Not enough coins 🪙', COLOR.danger)
      return
    }

    this.save.coins -= cost
    this.save.unlockedFlowers.push(flower.id)
    this.save.orderBoardNeedsRefresh = true
    saveManager.save(this.save)
    this.refreshHud()
    this.refreshContent()

    playSfx(this, 'sfx-coin', 0.6, this.save)
    playSfx(this, 'sfx-fulfill', 0.5, this.save)

    track(this.save, 'unlock_seed', 1)
    track(this.save, 'spend_coins', cost)
    if (this.goalsButton) this.goalsButton.refreshBadge()

    this.flashMessage('✿ Unlocked!', COLOR.success)
  }

  buyConsumable(item) {
    if (this.save.coins < item.price) {
      this.flashMessage('Not enough coins 🪙', COLOR.danger)
      return
    }

    this.save.coins -= item.price
    this.save.consumables[item.id] =
      (this.save.consumables[item.id] || 0) + item.packSize
    saveManager.save(this.save)
    this.refreshHud()
    this.refreshContent()

    playSfx(this, 'sfx-coin', 0.6, this.save)
    track(this.save, 'buy_consumable', 1)
    if (this.goalsButton) this.goalsButton.refreshBadge()

    this.flashMessage(`🧰 ${item.name} +${item.packSize}!`, COLOR.success)
  }

  clearFlash() {
    if (this.flashBg) {
      this.flashBg.destroy()
      this.flashBg = null
    }
    if (this.flashObjects) {
      this.flashObjects.forEach((o) => o.destroy())
      this.flashObjects = null
    }
  }

  flashMessage(message, color) {
    this.clearFlash()

    const cx = this.scale.width / 2
    const cy = this.scale.height - 110
    const padX = 16
    const padY = 10
    const flashStyle = { fontFamily: 'Georgia', fontSize: '20px', color }

    const layout = message.includes(COIN_EMOJI)
      ? addCoinText(this, {
          x: cx,
          y: cy,
          text: message,
          style: flashStyle,
          originX: 0.5,
          originY: 0.5,
          depth: 301,
        })
      : {
          objects: [
            this.add
              .text(cx, cy, message, { ...flashStyle, align: 'center' })
              .setOrigin(0.5)
              .setDepth(301),
          ],
          width: 0,
          height: 0,
        }
    if (!message.includes(COIN_EMOJI)) {
      layout.width = layout.objects[0].width
      layout.height = layout.objects[0].height
    }

    this.flashObjects = layout.objects
    const pillW = layout.width + padX * 2
    const pillH = layout.height + padY * 2

    this.flashBg = this.add.graphics()
    this.flashBg.fillStyle(0xfef8f2, 0.95)
    this.flashBg.fillRoundedRect(cx - pillW / 2, cy - pillH / 2, pillW, pillH, 20)
    this.flashBg.setDepth(300)

    this.tweens.add({
      targets: [this.flashBg, ...this.flashObjects],
      alpha: 0,
      duration: 800,
      onComplete: () => this.clearFlash(),
    })
  }

  buildNav() {
    const W = this.scale.width
    const H = this.scale.height
    const nav = this.add
      .rectangle(0, H - NAV_H, W, NAV_H, COLOR.green)
      .setOrigin(0, 0)
    this.uiObjects.push(nav)

    const tabs = [
      {
        emoji: '🌱',
        label: 'Garden',
        active: false,
        onTap: () => this.scene.start('GardenScene', { save: this.save }),
      },
      {
        emoji: '🏪',
        label: 'Shop',
        active: false,
        onTap: () => this.scene.start('ShopScene', { save: this.save }),
      },
      {
        emoji: '📋',
        label: 'Orders',
        active: false,
        onTap: () => this.scene.start('OrderScene', { save: this.save }),
      },
      { emoji: '⭐', label: 'Upgrades', active: true },
    ]
    const tabW = W / tabs.length
    tabs.forEach((tab, index) => {
      const cx = index * tabW + tabW / 2
      const cy = H - NAV_H / 2
      const hit = this.add.rectangle(cx, cy, tabW, 80, 0x000000, 0.001)
      hit.setInteractive(
        new Phaser.Geom.Rectangle(0, 0, tabW, 80),
        Phaser.Geom.Rectangle.Contains,
      )
      if (tab.onTap) hit.on('pointerdown', tab.onTap)

      const color = tab.active ? '#ffffff' : COLOR.inactiveTab
      const emoji = this.add.text(cx, cy - 12, tab.emoji, { fontSize: '24px' }).setOrigin(0.5)
      const label = this.add
        .text(cx, cy + 14, tab.label, {
          fontFamily: 'Georgia',
          fontSize: '14px',
          color,
        })
        .setOrigin(0.5)
      this.uiObjects.push(hit, emoji, label)

      if (tab.active) {
        const underline = this.add.rectangle(cx, cy + 28, 30, 2, 0xffffff)
        this.uiObjects.push(underline)
      }
    })
  }
}
