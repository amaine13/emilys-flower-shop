import Phaser from 'phaser'
import * as saveManager from '../saveManager.js'
import { CUSTOMERS } from '../data/customers.js'
import { getFlowerById } from '../data/flowers.js'
import { GAME, SHOP, PROGRESSION } from '../constants.js'
import { track } from '../missionManager.js'
import { attachGoalsButton } from '../ui/MissionsModal.js'
import { playSfx, playBgMusic, attachMuteButton } from '../audioManager.js'
import { createRoundedFillCentered } from '../ui/roundedUi.js'
import { addPressEffect } from '../ui/buttonEffects.js'
import { Scrollbar } from '../ui/scrollbar.js'
import { addCoinText, COIN_EMOJI } from '../ui/coinLabel.js'

// ---------- layout constants ----------
const HUD_H = 80 // HUD ends at y=80
const NAV_H = 70
const TITLE_PILL_Y = 115 // "Orders" pill center
const SUBTITLE_Y = 155 // subtitle center
const FIRST_CARD_TOP = 185 // first order card top edge
const SCROLL_ZONE_TOP = FIRST_CARD_TOP

const CARD_W = 340
const CARD_GAP = 16
const CARD_PADDING_TOP = 16
const CARD_PADDING_BOTTOM = 16
const CARD_PADDING_X = 20
const GAP_EXPIRY_BTN = 12
const GAP_REWARD_EXPIRY = 16
const GAP_AFTER_REQS = 16
const FLOWER_ROW_H = 40
const FLOWER_ROW_GAP = 8
const FLOWER_SPRITE_SIZE = 28
const FLOWER_SPRITE_NAME_GAP = 8
const HEADER_LINE_H = 20
const NEED_LABEL_H = 16
const GAP_HEADER_NEED = 4
const GAP_NEED_REQS = 10
const REWARD_LINE_H = 20
const EXPIRY_LINE_H = 15
const FULFILL_BTN_H = 52

const COLOR = {
  navGreen: 0x8aaa64,
  hudShadow: '#5a7a32',
  brown: '#5a3e2b',
  muted: '#8a7a6a',
  pinkText: '#c96b9a',
  cardBg: 0xfef8f2,
  cardStroke: 0xe0c8b0,
  pillBg: 0xfef8f2,
  fulfillBg: 0xc96b9a,
  fulfillDisabledBg: 0xc0a090,
  inactiveTab: '#d4eebc',
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

function fitImage(img, w, h) {
  const scale = Math.min(w / img.width, h / img.height)
  img.setScale(scale)
  return img
}

// CUSTOMERS.mood is a phrase like "Panicked 😰" — split off the trailing emoji.
function moodEmoji(mood) {
  if (!mood) return ''
  const parts = mood.split(' ')
  return parts[parts.length - 1]
}

function formatExpiry(expiresAt) {
  const ms = expiresAt - Date.now()
  if (ms <= 0) return 'Expired'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return `${h}h ${m}m remaining`
}

function aggregateNeeds(requirements) {
  const needs = {}
  requirements.forEach((r) => {
    needs[r.flowerId] = (needs[r.flowerId] || 0) + r.qty
  })
  return needs
}

function flowerRowsBlockHeight(reqCount) {
  if (reqCount <= 0) return 0
  return reqCount * FLOWER_ROW_H + (reqCount - 1) * FLOWER_ROW_GAP
}

function getOrderCardHeight(order) {
  const reqsBlockH = flowerRowsBlockHeight(order.requirements.length)
  return (
    CARD_PADDING_TOP +
    HEADER_LINE_H +
    GAP_HEADER_NEED +
    NEED_LABEL_H +
    GAP_NEED_REQS +
    reqsBlockH +
    GAP_AFTER_REQS +
    REWARD_LINE_H +
    GAP_REWARD_EXPIRY +
    EXPIRY_LINE_H +
    GAP_EXPIRY_BTN +
    FULFILL_BTN_H +
    CARD_PADDING_BOTTOM
  )
}

export default class OrderScene extends Phaser.Scene {
  constructor() {
    super('OrderScene')
  }

  init(data) {
    this.save = data && data.save ? data.save : saveManager.init()
  }

  create() {
    this.scale.on('resize', () => {
      this.input.setDefaultCursor('default')
      if (!this._resizeScheduled) {
        this._resizeScheduled = true
        this.time.delayedCall(100, () => {
          this._resizeScheduled = false
          this.scene.restart({ save: this.save })
        })
      }
    })
    this.input.setTopOnly(true)
    playBgMusic(this, this.save)

    const W = this.scale.width
    const H = this.scale.height
    this.SCROLL_ZONE_BOTTOM = H - NAV_H - 20
    this.SCROLL_ZONE_H = this.SCROLL_ZONE_BOTTOM - SCROLL_ZONE_TOP

    const bg = this.add.image(W / 2, H / 2, 'bg-shop')
    bg.setDisplaySize(W, H)
    this.add.rectangle(0, 0, W, H, 0x000000, 0.3).setOrigin(0, 0)

    // State buckets for cards + scroll behavior.
    this.cardVisuals = []
    this.cardHits = []
    this.cardPositions = []
    this.emptyObjects = []
    this.orderContainer = null
    this.orderMaskGfx = null

    this.scrollY = 0
    this.scrollMax = 0
    this.isDragging = false
    this.dragStartY = 0
    this.dragStartScroll = 0
    this.touchedButtonIdx = -1

    // Always prune expired orders before refresh / generation decisions.
    this.removeExpiredOrders()
    if (this.save.orderBoardNeedsRefresh) {
      this.save.orderBoardNeedsRefresh = false
      this.generateOrders()
    } else {
      this.refreshOrdersIfNeeded()
    }

    this.buildHud()
    this.buildTitle()
    this.buildOrders()
    this.orderScrollbar = new Scrollbar(this, {
      x: this.scale.width - 8,
      y: SCROLL_ZONE_TOP,
      height: this.SCROLL_ZONE_H,
      orientation: 'vertical',
    })
    this.updateOrderScrollbar()
    this.buildNav()
    this.bindInput()

    this.events.once('shutdown', () => {
      if (this.orderScrollbar) this.orderScrollbar.destroy()
    })

    // First-time arrival on Day 2 → show a one-shot tooltip card from the top.
    if (this.save.day === 2 && !this.save.ordersTooltipSeen) {
      this.showOrdersTooltip()
      this.save.ordersTooltipSeen = true
      saveManager.save(this.save)
    }

    this.events.once('shutdown', () => {
      if (this.orderMaskGfx) this.orderMaskGfx.destroy()
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

    this.add.rectangle(0, 0, this.scale.width, HUD_H, COLOR.navGreen).setOrigin(0, 0)

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
    this.hudCoins.setText(`${this.save.coins}`)
    this.hudDay.setText(`Day ${this.save.day}`)
    this.hudStarsLabel.setText(formatHudStarsLine(this.save))
    const cx = this.scale.width / 2
    const starBarW = 180
    const starBarH = 6
    this.redrawHudStarsBar(cx - starBarW / 2, 68, starBarW, starBarH)
  }

  buildTitle() {
    const cx = this.scale.width / 2

    // Each element placed at a fixed y — no container.
    const titlePillW = 200
    const titlePillH = 36
    const titlePill = this.add.graphics()
    titlePill.fillStyle(COLOR.pillBg, 0.85)
    titlePill.fillRoundedRect(
      cx - titlePillW / 2,
      TITLE_PILL_Y - titlePillH / 2,
      titlePillW,
      titlePillH,
      10,
    )

    this.add
      .text(cx, TITLE_PILL_Y, 'Orders', {
        fontFamily: 'Georgia',
        fontSize: '24px',
        color: COLOR.brown,
      })
      .setOrigin(0.5, 0.5)

    const subtitlePillW = 280
    const subtitlePillH = 22
    const subtitlePill = this.add.graphics()
    subtitlePill.fillStyle(COLOR.pillBg, 0.85)
    subtitlePill.fillRoundedRect(
      cx - subtitlePillW / 2,
      SUBTITLE_Y - subtitlePillH / 2,
      subtitlePillW,
      subtitlePillH,
      10,
    )

    this.add
      .text(cx, SUBTITLE_Y, 'Special requests from customers', {
        fontFamily: 'Georgia',
        fontStyle: 'italic',
        fontSize: '15px',
        color: COLOR.muted,
      })
      .setOrigin(0.5, 0.5)
  }

  // ---------- Order data ----------
  removeExpiredOrders() {
    const now = Date.now()
    const before = this.save.orderBoard.length
    this.save.orderBoard = this.save.orderBoard.filter((o) => o.expiresAt > now)
    if (this.save.orderBoard.length !== before) {
      saveManager.save(this.save)
    }
  }

  refreshOrdersIfNeeded() {
    const dueByTime =
      Date.now() >= this.save.orderBoardLastRefresh + SHOP.ORDER_REFRESH_MS
    if (dueByTime || this.save.orderBoard.length === 0) {
      this.generateOrders()
    }
  }

  generateOrders() {
    this.save.orderBoard = []
    const count = SHOP.ORDER_BOARD_SLOTS
    for (let i = 0; i < count; i++) {
      const customer = CUSTOMERS[Phaser.Math.Between(0, CUSTOMERS.length - 1)]
      const available = this.save.unlockedFlowers
      if (!available || available.length === 0) break
      const flowerCount = Phaser.Math.Between(2, 3)
      const requirements = []
      for (let j = 0; j < flowerCount; j++) {
        const preferred = customer.preferredFlowers.filter((f) => available.includes(f))
        const usePreferred = preferred.length > 0 && Math.random() < 0.6
        const pool = usePreferred ? preferred : available
        const flowerId = pool[Phaser.Math.Between(0, pool.length - 1)]
        const existing = requirements.find((r) => r.flowerId === flowerId)
        if (existing) {
          existing.qty = Math.min(existing.qty + 1, 3)
        } else {
          requirements.push({ flowerId, qty: Phaser.Math.Between(1, 2) })
        }
      }
      const reward = requirements.reduce((sum, r) => {
        const flower = getFlowerById(r.flowerId)
        return sum + (flower ? flower.sellPrice * r.qty * 1.5 : 0)
      }, 0)
      this.save.orderBoard.push({
        id: `order_${Date.now()}_${i}`,
        customerId: customer.id,
        customerName: customer.name,
        customerMood: customer.mood,
        requirements,
        reward: Math.round(reward),
        expiresAt: Date.now() + 48 * 60 * 60 * 1000,
        fulfilled: false,
      })
    }
    this.save.orderBoardLastRefresh = Date.now()
    saveManager.save(this.save)
  }

  // ---------- Order rendering ----------
  buildOrders() {
    // Tear down anything from a previous render (e.g. after a fulfill).
    this.cardHits.forEach((entry) => {
      if (!entry) return
      if (entry.btn) entry.btn.destroy()
      if (entry.btnHit) entry.btnHit.destroy()
      if (entry.label) entry.label.destroy()
    })
    this.cardHits = []
    this.cardVisuals = [] // owned by orderContainer; destroyed below
    this.cardPositions = []
    this.emptyObjects.forEach((o) => o.destroy())
    this.emptyObjects = []
    if (this.orderMaskGfx) {
      this.orderMaskGfx.destroy()
      this.orderMaskGfx = null
    }
    if (this.orderContainer) {
      this.orderContainer.destroy(true)
      this.orderContainer = null
    }

    const orders = this.save.orderBoard

    if (orders.length === 0) {
      this.scrollMax = 0
      this.scrollY = 0
      this.orderTotalHeight = 0
      this.updateOrderScrollbar()
      this.showEmptyState()
      return
    }

    // Mask the scrollable card area so cards don't overdraw HUD/nav/title.
    this.orderContainer = this.add.container(0, 0)
    const maskGfx = this.make.graphics({ x: 0, y: 0, add: false })
    maskGfx.fillStyle(0xffffff, 1)
    maskGfx.fillRect(0, SCROLL_ZONE_TOP, this.scale.width, this.SCROLL_ZONE_H)
    this.orderMaskGfx = maskGfx
    this.orderContainer.setMask(
      new Phaser.Display.Masks.GeometryMask(this, maskGfx),
    )

    const cx = this.scale.width / 2
    let cardTop = FIRST_CARD_TOP
    orders.forEach((order, idx) => {
      const cardH = getOrderCardHeight(order)
      const naturalCy = cardTop + cardH / 2
      this.cardPositions.push({ naturalCx: cx, naturalCy, cardH })
      this.cardVisuals.push([])
      this.cardHits.push(null)
      this.renderOrderCard(idx, order)
      cardTop += cardH + CARD_GAP
    })

    const totalH = cardTop - FIRST_CARD_TOP + 24
    this.orderTotalHeight = totalH
    this.scrollMax = Math.max(0, totalH - this.SCROLL_ZONE_H)
    this.scrollY = 0
    this.orderContainer.y = 0
    this.updateOrderScrollbar()
  }

  updateOrderScrollbar() {
    if (!this.orderScrollbar) return
    this.orderScrollbar.update(
      this.scrollY,
      this.scrollMax,
      this.SCROLL_ZONE_H,
      this.orderTotalHeight || this.SCROLL_ZONE_H,
    )
  }

  renderOrderCard(idx, order) {
    const { naturalCx, naturalCy, cardH } = this.cardPositions[idx]
    const cardLeft = naturalCx - CARD_W / 2
    const cardTop = naturalCy - cardH / 2
    const contentLeft = cardLeft + CARD_PADDING_X
    const stockRight = cardLeft + CARD_W - CARD_PADDING_X

    const card = this.add.graphics()
    card.fillStyle(COLOR.cardBg, 0.97)
    card.fillRoundedRect(cardLeft, cardTop, CARD_W, cardH, 16)
    card.lineStyle(2, COLOR.cardStroke, 1)
    card.strokeRoundedRect(cardLeft, cardTop, CARD_W, cardH, 16)

    const headerText = `${order.customerName} ${moodEmoji(order.customerMood)}`
    const headerY = cardTop + CARD_PADDING_TOP
    const header = this.add
      .text(contentLeft, headerY, headerText, {
        fontFamily: 'Georgia',
        fontSize: '18px',
        color: COLOR.brown,
      })
      .setOrigin(0, 0)

    const needLabelY = headerY + HEADER_LINE_H + GAP_HEADER_NEED
    const needLabel = this.add
      .text(contentLeft, needLabelY, 'They need:', {
        fontFamily: 'Georgia',
        fontStyle: 'italic',
        fontSize: '15px',
        color: COLOR.muted,
      })
      .setOrigin(0, 0)

    const visuals = [card, header, needLabel]

    const reqStartY = needLabelY + NEED_LABEL_H + GAP_NEED_REQS
    const needs = aggregateNeeds(order.requirements)
    const spriteCenterX = contentLeft + FLOWER_SPRITE_SIZE / 2
    const nameX = contentLeft + FLOWER_SPRITE_SIZE + FLOWER_SPRITE_NAME_GAP

    order.requirements.forEach((req, j) => {
      const flower = getFlowerById(req.flowerId)
      if (!flower) return
      const rowTop = reqStartY + j * (FLOWER_ROW_H + FLOWER_ROW_GAP)
      const rowCy = rowTop + FLOWER_ROW_H / 2
      const sprite = this.add.image(spriteCenterX, rowCy, flower.sprite)
      fitImage(sprite, FLOWER_SPRITE_SIZE, FLOWER_SPRITE_SIZE)
      const hasStock = (this.save.inventory[req.flowerId] || 0) >= needs[req.flowerId]
      const inStock = this.save.inventory[req.flowerId] || 0
      const name = this.add
        .text(nameX, rowCy, `${flower.name} ×${req.qty}`, {
          fontFamily: 'Georgia',
          fontSize: '16px',
          color: hasStock ? '#2d6e2d' : '#8b0000',
        })
        .setOrigin(0, 0.5)
        .setShadow(1, 1, '#ffffff', 3)
      const stock = this.add
        .text(stockRight, rowCy, `(${inStock} in stock)`, {
          fontFamily: 'Georgia',
          fontSize: '15px',
          color: COLOR.muted,
        })
        .setOrigin(1, 0.5)
      visuals.push(sprite, name, stock)
    })

    const reqsBlockH = flowerRowsBlockHeight(order.requirements.length)
    const rewardY = reqStartY + reqsBlockH + GAP_AFTER_REQS
    const expiryY = rewardY + REWARD_LINE_H + GAP_REWARD_EXPIRY
    const btnTop = cardTop + cardH - CARD_PADDING_BOTTOM - FULFILL_BTN_H
    const btnCy = btnTop + FULFILL_BTN_H / 2

    const rewardLayout = addCoinText(this, {
      x: contentLeft,
      y: rewardY + REWARD_LINE_H / 2,
      text: `${COIN_EMOJI} ${order.reward} coins + ✿ 2 stars`,
      style: { fontFamily: 'Georgia', fontSize: '16px', color: COLOR.brown },
      originX: 0,
      originY: 0.5,
    })
    const expiry = this.add
      .text(contentLeft, expiryY, formatExpiry(order.expiresAt), {
        fontFamily: 'Georgia',
        fontSize: '14px',
        color: COLOR.muted,
      })
      .setOrigin(0, 0)
    visuals.push(...rewardLayout.objects, expiry)

    this.orderContainer.add(visuals)
    this.cardVisuals[idx] = visuals

    // Fulfill button: a single plain Rectangle (visual + hit) plus a Text
    // label on top, both added directly to the scene (no Container) so input
    // hits the full 300×52 surface reliably.
    const canFulfill = this.isFulfillable(order)
    const btnW = 300
    const btnY = btnCy + this.scrollY

    const btn = createRoundedFillCentered(
      this,
      naturalCx,
      btnY,
      btnW,
      FULFILL_BTN_H,
      canFulfill ? COLOR.fulfillBg : COLOR.fulfillDisabledBg,
    )
    const btnHit = this.add.rectangle(naturalCx, btnY, btnW, FULFILL_BTN_H, 0x000000, 0.001)
    const btnLabel = this.add
      .text(
        naturalCx,
        btnY,
        canFulfill ? 'Fulfill ✿' : 'Not enough flowers',
        {
          fontFamily: 'Georgia',
          fontSize: '18px',
          color: '#ffffff',
        },
      )
      .setOrigin(0.5)

    // Same geometry mask as the card container so buttons clip in the
    // scroll zone but the button visuals stay at scene level for input.
    const mask = new Phaser.Display.Masks.GeometryMask(this, this.orderMaskGfx)
    btn.setMask(mask)
    btnHit.setMask(mask)
    btnLabel.setMask(mask)

    if (canFulfill) {
      btnHit.setInteractive(
        new Phaser.Geom.Rectangle(0, 0, btnW, FULFILL_BTN_H),
        Phaser.Geom.Rectangle.Contains,
      )
      addPressEffect(this, btnHit, btn)
      btnHit.on('pointerdown', (pointer) => {
        if (pointer.y < SCROLL_ZONE_TOP || pointer.y > this.SCROLL_ZONE_BOTTOM) return
        if (this.touchedButtonIdx === -1) this.touchedButtonIdx = idx
      })
    }

    // Cached offset from the card's natural center; reposition uses it.
    this.cardHits[idx] = {
      btn,
      btnHit,
      label: btnLabel,
      cardOffsetY: btnCy - naturalCy,
    }
  }

  isFulfillable(order) {
    const needs = aggregateNeeds(order.requirements)
    return Object.entries(needs).every(
      ([fid, qty]) => (this.save.inventory[fid] || 0) >= qty,
    )
  }

  tryFulfill(idx) {
    const order = this.save.orderBoard[idx]
    if (!order) return
    if (!this.isFulfillable(order)) return

    const needs = aggregateNeeds(order.requirements)
    Object.entries(needs).forEach(([fid, qty]) => {
      this.save.inventory[fid] = Math.max(0, (this.save.inventory[fid] || 0) - qty)
    })

    this.save.coins += order.reward
    this.save.shopStats.totalOrdersFulfilled += 1
    this.save.dailyOrdersFulfilled = (this.save.dailyOrdersFulfilled || 0) + 1

    this.save.orderBoard.splice(idx, 1)
    saveManager.save(this.save)
    this.refreshHud()
    this.buildOrders()

    playSfx(this, 'sfx-fulfill', 0.6, this.save)
    playSfx(this, 'sfx-coin', 0.5, this.save)

    if (order.reward >= 400) track(this.save, 'big_delivery', 1)
    const hasTier3 = order.requirements.some((r) => {
      const flower = getFlowerById(r.flowerId)
      return flower && flower.tier >= 3
    })
    if (hasTier3) track(this.save, 'tier3_order', 1)

    track(this.save, 'fulfill_order', 1)
    track(this.save, 'earn_coins', order.reward)
    if (this.goalsButton) this.goalsButton.refreshBadge()

    this.flashMessage(`${COIN_EMOJI} +${order.reward} coins`, '#2d6e2d')
  }

  // ---------- Empty state ----------
  showEmptyState() {
    const cx = this.scale.width / 2
    const cy = SCROLL_ZONE_TOP + this.SCROLL_ZONE_H / 2
    const w = 320
    const h = 160
    const card = this.add.graphics()
    card.fillStyle(COLOR.cardBg, 0.97)
    card.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 16)
    card.lineStyle(2, COLOR.cardStroke, 1)
    card.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 16)
    const title = this.add
      .text(cx, cy - 14, '✿ All orders fulfilled!', {
        fontFamily: 'Georgia',
        fontSize: '22px',
        color: COLOR.brown,
      })
      .setOrigin(0.5)
    const sub = this.add
      .text(cx, cy + 22, 'Come back tomorrow for new orders', {
        fontFamily: 'Georgia',
        fontStyle: 'italic',
        fontSize: '15px',
        color: COLOR.muted,
      })
      .setOrigin(0.5)
    this.emptyObjects.push(card, title, sub)
  }

  // ---------- Flash message ----------
  flashMessage(text, color) {
    const cx = this.scale.width / 2
    const cy = this.scale.height - NAV_H - 50
    const flashStyle = { fontFamily: 'Georgia', fontSize: '19px', color }
    const layout = text.includes(COIN_EMOJI)
      ? addCoinText(this, {
          x: cx,
          y: cy,
          text,
          style: flashStyle,
          originX: 0.5,
          originY: 0.5,
          depth: 21,
        })
      : {
          objects: [
            this.add
              .text(cx, cy, text, { ...flashStyle, align: 'center' })
              .setOrigin(0.5)
              .setShadow(0, 0, '#ffffff', 4)
              .setDepth(21),
          ],
          width: 0,
          height: 0,
        }
    if (!text.includes(COIN_EMOJI)) {
      layout.width = layout.objects[0].width
      layout.height = layout.objects[0].height
    } else {
      layout.objects.forEach((o) => {
        if (o.setShadow) o.setShadow(0, 0, '#ffffff', 4)
      })
    }
    const padX = 16
    const padY = 10
    const pillW = layout.width + padX * 2
    const pillH = Math.max(40, layout.height + padY * 2)
    const pill = this.add.graphics().setDepth(20)
    pill.fillStyle(COLOR.pillBg, 0.92)
    pill.fillRoundedRect(cx - pillW / 2, cy - pillH / 2, pillW, pillH, 20)
    this.tweens.add({
      targets: [pill, ...layout.objects],
      alpha: 0,
      duration: 800,
      delay: 900,
      onComplete: () => {
        pill.destroy()
        layout.objects.forEach((o) => o.destroy())
      },
    })
  }

  // ---------- Scroll + tap routing ----------
  bindInput() {
    this.input.on('pointerdown', (pointer) => {
      if (pointer.y < SCROLL_ZONE_TOP || pointer.y > this.SCROLL_ZONE_BOTTOM) return
      this.dragStartY = pointer.y
      this.dragStartScroll = this.scrollY
      this.isDragging = false
    })

    this.input.on('pointermove', (pointer) => {
      if (!pointer.isDown) return
      if (this.scrollMax === 0) return
      const dy = pointer.y - this.dragStartY
      if (Math.abs(dy) > 5) {
        this.isDragging = true
        const newScroll = Phaser.Math.Clamp(
          this.dragStartScroll + dy,
          -this.scrollMax,
          0,
        )
        if (newScroll !== this.scrollY) {
          this.scrollY = newScroll
          this.repositionAllCards()
          this.updateOrderScrollbar()
        }
      }
    })

    this.input.on('pointerup', () => {
      if (!this.isDragging && this.touchedButtonIdx >= 0) {
        this.tryFulfill(this.touchedButtonIdx)
      }
      this.touchedButtonIdx = -1
      this.isDragging = false
    })

    this.input.on('wheel', (pointer, _go, _dx, dy) => {
      if (this.scrollMax === 0) return
      const newScroll = Phaser.Math.Clamp(
        this.scrollY - dy,
        -this.scrollMax,
        0,
      )
      if (newScroll !== this.scrollY) {
        this.scrollY = newScroll
        this.repositionAllCards()
        this.updateOrderScrollbar()
      }
    })
  }

  repositionAllCards() {
    if (this.orderContainer) this.orderContainer.y = this.scrollY
    for (let i = 0; i < this.cardHits.length; i++) {
      const entry = this.cardHits[i]
      if (!entry) continue
      const { naturalCy } = this.cardPositions[i]
      const y = naturalCy + entry.cardOffsetY + this.scrollY
      if (entry.btn) entry.btn.y = y
      if (entry.btnHit) entry.btnHit.y = y
      if (entry.label) entry.label.y = y
    }
  }

  // ---------- Nav ----------
  buildNav() {
    const W = this.scale.width
    const H = this.scale.height
    this.add
      .rectangle(0, H - NAV_H, W, NAV_H, COLOR.navGreen)
      .setOrigin(0, 0)

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
      { emoji: '📋', label: 'Orders', active: true },
      {
        emoji: '⭐',
        label: 'Upgrades',
        active: false,
        onTap: () => this.scene.start('UpgradeScene', { save: this.save }),
      },
    ]
    const tabW = W / tabs.length
    tabs.forEach((tab, i) => {
      const cx = i * tabW + tabW / 2
      const cy = H - NAV_H / 2
      const hit = this.add.rectangle(cx, cy, tabW, 80, 0x000000, 0.001)
      hit.setInteractive(
        new Phaser.Geom.Rectangle(0, 0, tabW, 80),
        Phaser.Geom.Rectangle.Contains,
      )
      if (tab.onTap) hit.on('pointerdown', tab.onTap)

      const color = tab.active ? '#ffffff' : COLOR.inactiveTab
      this.add.text(cx, cy - 12, tab.emoji, { fontSize: '24px' }).setOrigin(0.5)
      this.add
        .text(cx, cy + 14, tab.label, {
          fontFamily: 'Georgia',
          fontSize: '14px',
          color,
        })
        .setOrigin(0.5)
      if (tab.active) {
        this.add.rectangle(cx, cy + 28, 30, 2, 0xffffff)
      }
    })
  }

  // Day 2 first-arrival tooltip: a small pink-bordered card that slides down from
  // above the HUD, holds for 3s, then slides back up and tears itself down.
  showOrdersTooltip() {
    const cx = this.scale.width / 2
    const cardW = 320
    const text =
      '✿ Special orders have arrived! Fulfill them for bonus stars and coins!'

    // Build inside a container so we can tween a single y value.
    const container = this.add.container(cx, -120).setDepth(80)

    // Measure text first to size the card around it.
    const label = this.add
      .text(0, 0, text, {
        fontFamily: 'Georgia',
        fontSize: '16px',
        color: '#5a3e2b',
        align: 'center',
        wordWrap: { width: cardW - 28 },
      })
      .setOrigin(0.5, 0)
    const padding = 12
    const cardH = label.height + padding * 2

    const bg = this.add.graphics()
    bg.fillStyle(0xfef8f2, 1)
    bg.lineStyle(2, 0xc96b9a, 1)
    bg.fillRoundedRect(-cardW / 2, 0, cardW, cardH, 14)
    bg.strokeRoundedRect(-cardW / 2, 0, cardW, cardH, 14)

    label.setPosition(0, padding)

    container.add([bg, label])

    const finalY = HUD_H + 18

    this.tweens.add({
      targets: container,
      y: finalY,
      duration: 400,
      ease: 'Sine.easeOut',
      onComplete: () => {
        this.time.delayedCall(3000, () => {
          this.tweens.add({
            targets: container,
            y: -cardH - 30,
            duration: 400,
            ease: 'Sine.easeIn',
            onComplete: () => container.destroy(),
          })
        })
      },
    })
  }
}
