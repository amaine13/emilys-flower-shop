import Phaser from 'phaser'
import { CUSTOMERS } from '../data/customers.js'
import { EMILY_HAS_STOCK, EMILY_MISSING_STOCK } from '../data/emilyResponses.js'
import { getFlowerById } from '../data/flowers.js'
import { SHOP_CONSUMABLES } from '../data/consumables.js'
import { GAME, SHOP, PROGRESSION } from '../constants.js'
import * as saveManager from '../saveManager.js'
import { DIALOGUE as TUTORIAL_DIALOGUE } from './TutorialScene.js'
import { track } from '../missionManager.js'
import { attachGoalsButton } from '../ui/MissionsModal.js'
import { playSfx, playBgMusic, attachMuteButton } from '../audioManager.js'
import { createRoundedFillCentered } from '../ui/roundedUi.js'
import { addPressEffect } from '../ui/buttonEffects.js'
import { addCoinText, measureCoinText, COIN_EMOJI } from '../ui/coinLabel.js'

const HUD_H = 80
const NAV_H = 70
/** Horizontal padding for shop chat row (full width − 32px). */
const SHOP_CONTENT_PAD_X = 16
const SHOP_BUBBLE_PAD_X = 12
const SHOP_BUBBLE_PAD_Y = 16
const SHOP_CUSTOMER_BUBBLE_TOP = 95
const SHOP_GAP_CUSTOMER_EMILY = 48
const SHOP_BTN_H = 60
const SHOP_GAP_FULFILL_SORRY = 12
const SHOP_GAP_SORRY_DOTS = 16
/** Gap from Emily bubble bottom to timer bar top (px). */
const SHOP_GAP_EMILY_TIMER_TOP = 20
const SHOP_TIMER_BAR_H = 14
const SHOP_DOTS_MARGIN_ABOVE_NAV = 28
/** Open Shop tray: boosts label + gap + button row height. */
const OPEN_SHOP_TRAY_BOOSTS_GAP = 10
const OPEN_SHOP_TRAY_BTN_H = 80
const OPEN_SHOP_TRAY_BTN_W = 130
const OPEN_SHOP_TRAY_BTN_GAP = 16
/** Must match label Y in buildShopToolsTray (row height includes this inset). */
const OPEN_SHOP_TRAY_LABEL_ROW_H = 20
const OPEN_SHOP_TRAY_LABEL_TOP_OFFSET = 10
const EMILY_BUBBLE_MAX_W = 280

const COLOR = {
  cream: 0xfdf6f0,
  green: 0x8aaa64,
  brown: '#5a3e2b',
  muted: '#8a7a6a',
  mutedBrown: '#8a6e5a',
  panel: 0xfef8f2,
  panelStroke: 0xc8a882,
  cardStroke: 0xe0c8b0,
  pink: 0xc96b9a,
  cancel: 0xd4b8a8,
  timerBg: 0xf0e0d0,
  success: '#4a8a4a',
  danger: '#cc6060',
  inactiveTab: '#d4eebc',
  shadow: '#5a7a32',
}

function generateCustomers(save) {
  const pool = CUSTOMERS.filter((c) => c.unlockDay <= save.day)
  const selected = []
  for (let i = 0; i < SHOP.WALK_IN_COUNT_PER_DAY; i++) {
    selected.push(pool[Phaser.Math.Between(0, pool.length - 1)])
  }
  return selected
}

function generateOrderForCustomer(customer, save) {
  const available = save.unlockedFlowers
  const preferred = customer.preferredFlowers.filter((f) => available.includes(f))
  const requirements = []
  const count = Phaser.Math.Between(1, 2)
  for (let i = 0; i < count; i++) {
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
  return requirements
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

function getEmilyBubbleLayout(scene) {
  const bubbleW = Math.min(EMILY_BUBBLE_MAX_W, scene.scale.width - 32)
  const bubbleLeft = Math.max(SHOP_CONTENT_PAD_X, scene.scale.width - SHOP_CONTENT_PAD_X - bubbleW)
  const innerW = bubbleW - SHOP_BUBBLE_PAD_X * 2
  return { bubbleW, bubbleLeft, innerW }
}

function emilyBodyFontSize(scene) {
  return scene.scale.height < 700 ? 13 : 15
}

export default class ShopScene extends Phaser.Scene {
  constructor() {
    super('ShopScene')
  }

  create() {
    this.scale.on('resize', () => {
      this.input.setDefaultCursor('default')
      if (this.tutorialMode) return
      if (!this._resizeScheduled) {
        this._resizeScheduled = true
        this.time.delayedCall(100, () => {
          this._resizeScheduled = false
          this.persistSession()
          this.scene.restart()
        })
      }
    })
    const data = this.scene.settings.data || {}
    this.save = data.save || saveManager.init()
    playBgMusic(this, this.save)
    this.input.setTopOnly(true)
    this.tutorialMode = !!data.tutorialMode

    this.sessionCoins = 0
    this.customersServed = 0
    this.customerIndex = 0
    this.customers = []
    this.currentOrders = []
    this.currentOrder = []
    this.currentCustomer = null
    this.isResolving = false
    this.salesRushActive = false
    this.salesRushRemaining = 0
    this.luckyDayActive = false
    this.activeBannerObjects = []
    this.serveStreak = 0
    this.customerStartTime = 0

    this.screenObjects = []
    this.sessionObjects = []
    this.progressGraphics = null
    this.timerTween = null
    this.timerFill = null
    this.timerBarBg = null
    this.timerBarFlower = null
    this.timerBarRedraw = null
    this.timerBarX = 30
    this.timerBarW = this.scale.width - 60
    this.timerBarH = 14
    this.timerBarY = 430
    this.emilyBubbleObjects = []
    this._emilyStockSnapshot = null
    this.sessionFulfillBtn = null
    this.sessionSorryBtn = null
    // Active-timer tracking for persistence: null when no tween is currently running.
    this.timerStartedAt = null
    this.timerDurationMs = null
    // If set by the resume branch, the next renderTimerBar() consumes this remaining ms.
    this.resumeTimerMs = null

    this.buildBackground()

    // Tutorial path skips the normal session/resume flow entirely.
    if (this.tutorialMode) {
      this.beginTutorialSession()
      return
    }

    const session = this.save.shopSession
    if (session && session.day === this.save.day) {
      // Resume the in-progress session for today.
      this.customers = session.customers
        .map((id) => CUSTOMERS.find((c) => c.id === id))
        .filter(Boolean)
      this.currentOrders = session.orders
      this.customerIndex = session.customerIndex
      this.sessionCoins = session.sessionCoins
      this.customersServed = session.customersServed
      this.salesRushActive = !!session.salesRushActive
      this.luckyDayActive = !!session.luckyDayActive
      this.salesRushRemaining =
        typeof session.salesRushRemaining === 'number'
          ? session.salesRushRemaining
          : session.salesRushActive
            ? 5
            : 0

      // Continue the customer's countdown from where it stood at persist time.
      if (
        typeof session.timerStartedAt === 'number' &&
        typeof session.timerDurationMs === 'number'
      ) {
        const elapsed = Date.now() - session.timerStartedAt
        const remaining = Math.max(0, session.timerDurationMs - elapsed)
        if (remaining === 0) {
          // Timer expired while the player was away → auto-Sorry, move to next customer.
          this.customerIndex += 1
        } else {
          this.resumeTimerMs = remaining
        }
      }

      this.startSession()
    } else {
      this.showOpenShop()
    }
  }

  buildBackground() {
    const W = this.scale.width
    const H = this.scale.height
    const bg = this.add.image(W / 2, H / 2, 'bg-shop')
    bg.setDisplaySize(W, H)
  }

  showOpenShop() {
    this.clearObjects(this.screenObjects)
    const cx = this.scale.width / 2
    const GAP = 16
    const panelW = 320
    const paddingY = 24

    const ownedTools = SHOP_CONSUMABLES.filter((tool) => {
      const active =
        (tool.id === 'salesRush' && this.salesRushActive) ||
        (tool.id === 'luckyDay' && this.luckyDayActive)
      return active || (this.save.consumables[tool.id] || 0) > 0
    })

    const boostsLabelH = ownedTools.length > 0 ? OPEN_SHOP_TRAY_LABEL_ROW_H : 0
    const TOOL_TRAY_BLOCK_H =
      ownedTools.length > 0
        ? boostsLabelH + OPEN_SHOP_TRAY_BOOSTS_GAP + OPEN_SHOP_TRAY_BTN_H
        : 0

    const titleStr = "Welcome to Emily's\nFlower Shop! 🌸"
    const titleStyle = {
      fontFamily: 'Georgia',
      fontSize: '24px',
      color: '#5a3e2b',
      align: 'center',
      wordWrap: { width: panelW - 32 },
    }
    const subStr = `Day ${this.save.day} · ${SHOP.WALK_IN_COUNT_PER_DAY} customers are waiting today`
    const subStyle = {
      fontFamily: 'Georgia',
      fontStyle: 'italic',
      fontSize: '17px',
      color: '#8a7a6a',
      align: 'center',
      wordWrap: { width: panelW - 32 },
    }
    const mTitle = this.add.text(0, -2000, titleStr, titleStyle).setOrigin(0.5, 0)
    const titleH = mTitle.height
    mTitle.destroy()
    const mSub = this.add.text(0, -2000, subStr, subStyle).setOrigin(0.5, 0)
    const subtitleH = mSub.height
    mSub.destroy()

    const openBtnH = 60
    const backBtnH = 48
    let panelContentH =
      paddingY + titleH + GAP + subtitleH + GAP + openBtnH

    if (ownedTools.length > 0) {
      panelContentH += GAP + TOOL_TRAY_BLOCK_H
    }
    panelContentH += GAP + backBtnH + paddingY

    const panelTop = (this.scale.height - panelContentH) / 2
    const panelH = panelContentH

    const panel = this.add.graphics()
    panel.fillStyle(COLOR.panel, 1)
    panel.lineStyle(4, COLOR.panelStroke, 1)
    panel.fillRoundedRect(cx - panelW / 2, panelTop, panelW, panelH, 20)
    panel.strokeRoundedRect(cx - panelW / 2, panelTop, panelW, panelH, 20)
    this.screenObjects.push(panel)

    let y = panelTop + paddingY
    const title = this.add
      .text(cx, y, titleStr, titleStyle)
      .setOrigin(0.5, 0)
    this.screenObjects.push(title)
    y += titleH + GAP

    const subtitle = this.add
      .text(cx, y, subStr, subStyle)
      .setOrigin(0.5, 0)
    this.screenObjects.push(subtitle)
    y += subtitleH + GAP

    const openShopTopY = y
    const openBtnCy = openShopTopY + openBtnH / 2
    this.createButton({
      x: cx,
      y: openBtnCy,
      w: 260,
      h: openBtnH,
      hitH: 80,
      color: COLOR.pink,
      label: 'Open Shop',
      fontSize: '22px',
      onTap: () => this.beginNewSession(),
      target: this.screenObjects,
    })
    const openBottomY = openShopTopY + openBtnH
    const backTopY = panelTop + panelH - paddingY - backBtnH

    if (ownedTools.length > 0) {
      const gapBetweenOpenAndBack = backTopY - openBottomY
      const boostsContentMidY =
        OPEN_SHOP_TRAY_LABEL_TOP_OFFSET +
        (TOOL_TRAY_BLOCK_H - OPEN_SHOP_TRAY_LABEL_TOP_OFFSET) / 2
      const traySectionTop =
        openBottomY + gapBetweenOpenAndBack / 2 - boostsContentMidY
      this.buildShopToolsTray(cx, traySectionTop, ownedTools)
    }

    const panelMidY = panelTop + panelH / 2
    const leftFlower = this.add.image(cx - panelW / 2 - 20, panelMidY, 'flower-daisy')
    fitImage(leftFlower, 62, 62)
    const rightFlower = this.add.image(cx + panelW / 2 + 20, panelMidY, 'flower-tulip')
    fitImage(rightFlower, 62, 62)
    this.screenObjects.push(leftFlower, rightFlower)

    const backW = 200
    const backCy = backTopY + backBtnH / 2
    const backBg = createRoundedFillCentered(this, cx, backCy, backW, backBtnH, COLOR.cancel)
    backBg.setInteractive(
      new Phaser.Geom.Rectangle(-backW / 2, -backBtnH / 2, backW, backBtnH),
      Phaser.Geom.Rectangle.Contains,
    )
    addPressEffect(this, backBg)
    const backLabel = this.add
      .text(cx, backCy, '← Back to Garden', {
        fontFamily: 'Georgia',
        fontSize: '18px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
    backBg.on('pointerdown', () => {
      this.scene.start('GardenScene', { save: this.save })
    })
    this.screenObjects.push(backBg, backLabel)
  }

  buildShopToolsTray(cx, traySectionTop, owned) {
    if (!owned || owned.length === 0) return

    const boostsLabel = this.add
      .text(cx, traySectionTop + OPEN_SHOP_TRAY_LABEL_TOP_OFFSET, "✨ Today's Boosts", {
        fontFamily: 'Georgia',
        fontStyle: 'italic',
        fontSize: '15px',
        color: '#8a7a6a',
      })
      .setOrigin(0.5, 0)
    this.screenObjects.push(boostsLabel)

    const btnTop =
      traySectionTop + OPEN_SHOP_TRAY_LABEL_ROW_H + OPEN_SHOP_TRAY_BOOSTS_GAP
    const btnW = OPEN_SHOP_TRAY_BTN_W
    const btnH = OPEN_SHOP_TRAY_BTN_H
    const gap = OPEN_SHOP_TRAY_BTN_GAP
    const totalW = owned.length * btnW + (owned.length - 1) * gap
    const startX = cx - totalW / 2

    owned.forEach((tool, index) => {
      const x0 = startX + index * (btnW + gap)
      const colCx = x0 + btnW / 2
      const active =
        (tool.id === 'salesRush' && this.salesRushActive) ||
        (tool.id === 'luckyDay' && this.luckyDayActive)

      const fillColor = 0xfef0e8
      const bg = this.add.graphics()
      bg.fillStyle(fillColor, 1)
      bg.lineStyle(2, 0xe0c8b0, 1)
      const r = Math.min(24, btnW / 2, btnH / 2)
      bg.fillRoundedRect(x0, btnTop, btnW, btnH, r)
      bg.strokeRoundedRect(x0, btnTop, btnW, btnH, r)

      const hit = this.add.rectangle(colCx, btnTop + btnH / 2, btnW, btnH, 0x000000, 0.001)
      hit.setInteractive(
        new Phaser.Geom.Rectangle(0, 0, btnW, btnH),
        Phaser.Geom.Rectangle.Contains,
      )
      addPressEffect(this, hit, bg)
      hit.on('pointerdown', () => this.activateShopTool(tool.id))

      const buttonCenterY = btnTop + btnH / 2
      const icon = this.add
        .text(colCx, buttonCenterY - 12, active ? '✓' : tool.icon, {
          fontSize: active ? '26px' : '30px',
        })
        .setOrigin(0.5)

      const nameText = active ? 'Active!' : tool.name
      const label = this.add
        .text(colCx, buttonCenterY + 16, nameText, {
          fontFamily: 'Georgia',
          fontSize: '15px',
          color: '#5a3e2b',
          align: 'center',
          wordWrap: { width: btnW - 10 },
        })
        .setOrigin(0.5, 0.5)

      const stockStr = `x${this.save.consumables[tool.id] || 0}`
      const stockMeasure = this.add
        .text(0, -2000, stockStr, {
          fontFamily: 'Georgia',
          fontSize: '13px',
          color: '#ffffff',
        })
        .setOrigin(0.5)
      const pillW = Math.max(36, stockMeasure.width + 14)
      stockMeasure.destroy()
      const pillH = 20
      const pillCx = colCx
      // Sit on the bottom stroke; a few px extend past the rect so the pill overlaps the border.
      const pillCy = btnTop + btnH - pillH / 2 + 5
      const pillGfx = this.add.graphics()
      pillGfx.fillStyle(COLOR.pink, 1)
      pillGfx.fillRoundedRect(pillCx - pillW / 2, pillCy - pillH / 2, pillW, pillH, pillH / 2)
      const badgeText = this.add
        .text(pillCx, pillCy, stockStr, {
          fontFamily: 'Georgia',
          fontSize: '13px',
          color: '#ffffff',
        })
        .setOrigin(0.5)

      this.screenObjects.push(bg, hit, icon, label, pillGfx, badgeText)
    })
  }

  activateShopTool(id) {
    if ((this.save.consumables[id] || 0) <= 0) return
    if (id === 'salesRush' && this.salesRushActive) return
    if (id === 'luckyDay' && this.luckyDayActive) return

    this.save.consumables[id] -= 1
    if (id === 'salesRush') {
      this.salesRushActive = true
      this.salesRushRemaining = 5
    }
    if (id === 'luckyDay') this.luckyDayActive = true
    saveManager.save(this.save)
    this.showOpenShop()
  }

  // Generate a fresh roster + pre-generated orders for a brand new day.
  beginNewSession() {
    this.customers = generateCustomers(this.save)
    this.currentOrders = this.customers.map((c) => generateOrderForCustomer(c, this.save))
    this.customerIndex = 0
    this.sessionCoins = 0
    this.customersServed = 0
    this.startSession()
  }

  // Tutorial-only session: a single forced Marcus order for daisy ×1.
  // The player is also gifted 1 daisy so they can actually fulfill it.
  beginTutorialSession() {
    const marcus = CUSTOMERS.find((c) => c.id === 'marcus') || CUSTOMERS[0]
    this.customers = [marcus]
    this.currentOrders = [[{ flowerId: 'daisy', qty: 1 }]]
    this.customerIndex = 0
    this.sessionCoins = 0
    this.customersServed = 0

    if ((this.save.inventory.daisy || 0) < 1) {
      this.save.inventory.daisy = 1
      saveManager.save(this.save)
    }

    this.showTutorialCustomerDialogue(() => this.startSession())
  }

  // Intro card shown above bg-shop before the tutorial session begins.
  showTutorialCustomerDialogue(onContinue) {
    const objs = []
    const cx = this.scale.width / 2
    const cy = this.scale.height / 2
    const cardW = 320
    const cardH = 260
    const cardTop = cy - cardH / 2
    const padding = 22

    const dim = this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.55)
      .setOrigin(0, 0)
      .setDepth(100)
    objs.push(dim)

    const card = this.add.graphics().setDepth(101)
    card.fillStyle(0xfef8f2, 1)
    card.lineStyle(2, 0xe0c8b0, 1)
    card.fillRoundedRect(cx - cardW / 2, cardTop, cardW, cardH, 20)
    card.strokeRoundedRect(cx - cardW / 2, cardTop, cardW, cardH, 20)
    objs.push(card)

    const emoji = this.add
      .text(cx, cardTop + padding + 16, '🌸', { fontSize: '34px' })
      .setOrigin(0.5)
      .setDepth(102)
    objs.push(emoji)

    const intro1 = this.add
      .text(cx, cardTop + padding + 50, TUTORIAL_DIALOGUE.customerIntro, {
        fontFamily: 'Georgia',
        fontSize: '17px',
        color: '#5a3e2b',
        align: 'center',
        wordWrap: { width: cardW - padding * 2 },
      })
      .setOrigin(0.5, 0)
      .setDepth(102)
    objs.push(intro1)

    const intro2 = this.add
      .text(
        cx,
        intro1.y + intro1.height + 14,
        TUTORIAL_DIALOGUE.customerIntro2,
        {
          fontFamily: 'Georgia',
          fontStyle: 'italic',
          fontSize: '16px',
          color: '#8a7a6a',
          align: 'center',
          wordWrap: { width: cardW - padding * 2 },
        },
      )
      .setOrigin(0.5, 0)
      .setDepth(102)
    objs.push(intro2)

    const hint = this.add
      .text(cx, cardTop + cardH - padding - 4, 'Tap to continue', {
        fontFamily: 'Georgia',
        fontStyle: 'italic',
        fontSize: '14px',
        color: '#8a7a6a',
      })
      .setOrigin(0.5)
      .setDepth(102)
    objs.push(hint)

    const hit = this.add
      .rectangle(cx, cardTop + cardH / 2, cardW, cardH, 0x000000, 0)
      .setDepth(103)
    hit.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, cardW, cardH),
      Phaser.Geom.Rectangle.Contains,
    )
    objs.push(hit)
    hit.on('pointerdown', () => {
      objs.forEach((o) => o.destroy())
      onContinue()
    })
  }

  // Tutorial finish handler: persist what was earned then hand control back.
  tutorialCustomerDone() {
    this.stopTimer()
    this.save.shopSession = null
    this.save.tutorialStep = 4
    saveManager.save(this.save)
    this.scene.start('TutorialScene', { save: this.save, step: 4 })
  }

  // Build the in-session UI; safe to call for both new and resumed sessions.
  startSession() {
    this.clearObjects(this.screenObjects)
    this.activeBannerObjects = []
    this.buildHud()
    this.buildNav()
    this.renderActiveBanners()
    this.loadNextCustomer()
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
    this.hudDay = this.add
      .text(cx, row1Y, `Day ${this.save.day}`, hudRow1TextStyle())
      .setOrigin(0.5)

    this.hudStarsLabel = this.add
      .text(cx, row2LabelY, formatHudStarsLine(this.save), hudRow2TextStyle())
      .setOrigin(0.5, 0.5)

    this.screenObjects.push(
      hud,
      this.hudStarsBarBg,
      this.hudStarsBarFill,
      this.hudCoinIcon,
      this.hudCoins,
      this.hudDay,
      this.hudStarsLabel,
    )

    const muteHandle = attachMuteButton(this, this.save, saveManager, row1Y)
    this.screenObjects.push(muteHandle.label)

    this.goalsButton = attachGoalsButton(this, this.save)
    this.screenObjects.push(
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

  buildNav() {
    const W = this.scale.width
    const H = this.scale.height
    const nav = this.add
      .rectangle(0, H - NAV_H, W, NAV_H, COLOR.green)
      .setOrigin(0, 0)
    this.screenObjects.push(nav)

    const tabs = [
      {
        emoji: '🌱',
        label: 'Garden',
        active: false,
        onTap: () => this.leaveToScene('GardenScene'),
      },
      { emoji: '🏪', label: 'Shop', active: true },
      {
        emoji: '📋',
        label: 'Orders',
        active: false,
        onTap: () => this.leaveToScene('OrderScene'),
      },
      {
        emoji: '⭐',
        label: 'Upgrades',
        active: false,
        onTap: () => this.leaveToScene('UpgradeScene'),
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
      // Tutorial mode locks the nav so the player can't bail out of the Marcus flow.
      if (tab.onTap && !this.tutorialMode) hit.on('pointerdown', tab.onTap)

      const color = tab.active ? '#ffffff' : COLOR.inactiveTab
      const emoji = this.add.text(cx, cy - 12, tab.emoji, { fontSize: '24px' }).setOrigin(0.5)
      const label = this.add
        .text(cx, cy + 14, tab.label, {
          fontFamily: 'Georgia',
          fontSize: '14px',
          color,
        })
        .setOrigin(0.5)
      this.screenObjects.push(hit, emoji, label)

      if (tab.active) {
        const underline = this.add.rectangle(cx, cy + 28, 30, 2, 0xffffff)
        this.screenObjects.push(underline)
      }
    })
  }

  loadNextCustomer() {
    this.clearCustomerObjects()
    this.isResolving = false

    if (this.customerIndex >= this.customers.length) {
      // Tutorial mode stops after Marcus and hands control back to TutorialScene
      // instead of running the normal end-of-day flow.
      if (this.tutorialMode) {
        this.tutorialCustomerDone()
      } else {
        this.endDay()
      }
      return
    }

    this.currentCustomer = this.customers[this.customerIndex]
    this.currentOrder = this.currentOrders[this.customerIndex] || []
    this.customerStartTime = Date.now()
    this.renderCustomerChat()
    this.renderTimerBar()
    this.renderActionButtons()
    this.renderProgressDots()

    playSfx(this, 'sfx-bell', 0.6, this.save)
  }

  renderCustomerChat() {
    const cust = this.currentCustomer
    if (!cust) return

    const bubbleLeft = 16
    const bubbleW = 300
    const bubblePadX = SHOP_BUBBLE_PAD_X
    const bubblePadY = SHOP_BUBBLE_PAD_Y
    const innerLeft = bubbleLeft + bubblePadX
    const innerW = bubbleW - bubblePadX * 2
    const MIN_BUBBLE_H = 180
    const MAX_BUBBLE_H = 280
    const strokeColor = 0xe0c8b0

    const orderRows = this.currentOrder
      .map((req) => {
        const flower = getFlowerById(req.flowerId)
        return flower ? { req, flower } : null
      })
      .filter(Boolean)

    const baseReward = this.calculateReward()
    const displayReward =
      this.salesRushRemaining > 0 ? Math.round(baseReward * 2) : Math.round(baseReward)
    const rewardStr = `${COIN_EMOJI} ${displayReward} coins`

    const measureInnerHeight = (greetFs, rowFs, rewardFs, tight) => {
      const gName = tight ? 6 : 8
      const gGreet = tight ? 8 : 10
      const gDiv = tight ? 6 : 8
      const gRow = tight ? 3 : 4
      const gPreReward = tight ? 6 : 8

      let h = bubblePadY
      const nameProbe = this.add
        .text(-3000, -3000, cust.name, {
          fontFamily: 'Georgia',
          fontSize: '17px',
          color: '#5a3e2b',
          fontStyle: 'bold',
        })
        .setOrigin(0, 0)
      h += nameProbe.height + gName
      nameProbe.destroy()

      const greetText = cust.greeting || ''
      const greetProbe = this.add
        .text(-3000, -3000, greetText, {
          fontFamily: 'Georgia',
          fontStyle: 'italic',
          fontSize: `${greetFs}px`,
          color: '#8a7a6a',
          wordWrap: { width: innerW },
        })
        .setOrigin(0, 0)
      h += greetProbe.height + gGreet
      greetProbe.destroy()

      h += 1 + gDiv

      orderRows.forEach((row, i) => {
        const t = this.add
          .text(-3000, -3000, `${row.flower.name} ×${row.req.qty}`, {
            fontFamily: 'Georgia',
            fontSize: `${rowFs}px`,
            color: '#5a3e2b',
          })
          .setOrigin(0, 0)
        h += Math.max(24, t.height)
        t.destroy()
        if (i < orderRows.length - 1) h += gRow
      })

      h += gDiv + 1 + gPreReward

      const rewMetrics = measureCoinText(this, rewardStr, {
        fontFamily: 'Georgia',
        fontSize: `${rewardFs}px`,
        color: '#5a3e2b',
      })
      h += rewMetrics.height + bubblePadY

      return {
        innerH: h,
        gaps: { gName, gGreet, gDiv, gRow, gPreReward },
      }
    }

    let greetFs = 15
    let rowFs = 16
    let rewardFs = 15
    let tight = false
    let { innerH, gaps } = measureInnerHeight(greetFs, rowFs, rewardFs, tight)

    while (innerH > MAX_BUBBLE_H) {
      if (greetFs > 11) greetFs -= 1
      else if (rowFs > 11) rowFs -= 1
      else if (rewardFs > 11) rewardFs -= 1
      else if (!tight) tight = true
      else if (rowFs > 10) rowFs -= 1
      else if (greetFs > 10) greetFs -= 1
      else if (rewardFs > 10) rewardFs -= 1
      else if (rowFs > 9) rowFs -= 1
      else if (greetFs > 9) greetFs -= 1
      else if (rewardFs > 9) rewardFs -= 1
      else break
      ;({ innerH, gaps } = measureInnerHeight(greetFs, rowFs, rewardFs, tight))
    }
    if (innerH > MAX_BUBBLE_H) {
      tight = true
      greetFs = 9
      rowFs = 9
      rewardFs = 9
      ;({ innerH, gaps } = measureInnerHeight(greetFs, rowFs, rewardFs, tight))
    }

    const bubbleH = Math.max(MIN_BUBBLE_H, Math.min(innerH, MAX_BUBBLE_H))

    const hasStockEm = this.hasEnoughStock()
    const poolEm = hasStockEm ? EMILY_HAS_STOCK : EMILY_MISSING_STOCK
    const emilyLine = Phaser.Math.RND.pick(poolEm)
    const emilyBubbleH = this.measureEmilyChatHeight(emilyLine)

    this._emilyBubbleBottomY =
      HUD_H + bubbleH + SHOP_GAP_CUSTOMER_EMILY + emilyBubbleH
    this.applyShopSessionLayout()

    const timerBarTop = this._layoutTimerCy - SHOP_TIMER_BAR_H / 2
    const totalBubblesHeight = bubbleH + SHOP_GAP_CUSTOMER_EMILY + emilyBubbleH
    const maxBubbleTop = timerBarTop - totalBubblesHeight - 8
    const bubbleTop = Math.max(
      HUD_H,
      Math.min(HUD_H + (timerBarTop - HUD_H - totalBubblesHeight) / 2, maxBubbleTop),
    )

    const bubble = this.add.graphics()
    bubble.fillStyle(0xfef8f2, 1)
    bubble.lineStyle(2, strokeColor, 1)
    bubble.fillRoundedRect(bubbleLeft, bubbleTop, bubbleW, bubbleH, 16)
    bubble.strokeRoundedRect(bubbleLeft, bubbleTop, bubbleW, bubbleH, 16)
    this.sessionObjects.push(bubble)

    const drawDivider = (gfx, y) => {
      gfx.lineStyle(1, strokeColor, 1)
      gfx.lineBetween(innerLeft, y, innerLeft + innerW, y)
    }
    const dividersGfx = this.add.graphics()
    this.sessionObjects.push(dividersGfx)

    let cy = bubbleTop + bubblePadY

    const nameText = this.add
      .text(innerLeft, cy, cust.name, {
        fontFamily: 'Georgia',
        fontSize: '17px',
        color: '#5a3e2b',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0)
    this.sessionObjects.push(nameText)
    cy += nameText.height + gaps.gName

    const greetingText = this.add
      .text(innerLeft, cy, cust.greeting || '', {
        fontFamily: 'Georgia',
        fontStyle: 'italic',
        fontSize: `${greetFs}px`,
        color: '#8a7a6a',
        wordWrap: { width: innerW },
      })
      .setOrigin(0, 0)
    this.sessionObjects.push(greetingText)
    cy += greetingText.height + gaps.gGreet

    drawDivider(dividersGfx, cy + 0.5)
    cy += 1 + gaps.gDiv

    orderRows.forEach((row, index) => {
      const { req, flower } = row
      const inv = this.save.inventory[req.flowerId] || 0
      const enough = inv >= req.qty
      const stockStr = enough ? `✓ ${inv}` : `✗ ${inv}`
      const stockColor = enough ? '#2d6e2d' : '#8b0000'

      const labelX = innerLeft + 12 + 12 + 6
      const rowProbe = this.add
        .text(-3000, -3000, `${flower.name} ×${req.qty}`, {
          fontFamily: 'Georgia',
          fontSize: `${rowFs}px`,
          color: '#5a3e2b',
        })
        .setOrigin(0, 0)
      const rowH = Math.max(24, rowProbe.height)
      rowProbe.destroy()

      const rowCenterY = cy + rowH / 2
      const img = this.add.image(innerLeft + 12, rowCenterY, flower.sprite)
      fitImage(img, 24, 24)
      img.setOrigin(0.5)
      this.sessionObjects.push(img)

      const rowLabel = this.add
        .text(labelX, rowCenterY, `${flower.name} ×${req.qty}`, {
          fontFamily: 'Georgia',
          fontSize: `${rowFs}px`,
          color: '#5a3e2b',
        })
        .setOrigin(0, 0.5)
      this.sessionObjects.push(rowLabel)

      const stockLabel = this.add
        .text(innerLeft + innerW, rowCenterY, stockStr, {
          fontFamily: 'Georgia',
          fontSize: `${rowFs}px`,
          color: stockColor,
        })
        .setOrigin(1, 0.5)
      this.sessionObjects.push(stockLabel)

      cy += rowH
      if (index < orderRows.length - 1) cy += gaps.gRow
    })

    cy += gaps.gDiv
    drawDivider(dividersGfx, cy + 0.5)
    cy += 1 + gaps.gPreReward

    const rewardStyle = {
      fontFamily: 'Georgia',
      fontSize: `${rewardFs}px`,
      color: '#5a3e2b',
    }
    const rewardMetrics = measureCoinText(this, rewardStr, rewardStyle)
    const rewardLayout = addCoinText(this, {
      x: innerLeft + innerW,
      y: cy + rewardMetrics.height / 2,
      text: rewardStr,
      style: rewardStyle,
      originX: 1,
      originY: 0.5,
    })
    this.sessionObjects.push(...rewardLayout.objects)

    this._customerBubbleBottomY = bubbleTop + bubbleH
    this.renderEmilyResponseBubble(emilyLine)
    this.applyShopSessionLayout()
  }

  clearEmilyBubbleOnly() {
    ;(this.emilyBubbleObjects || []).forEach((o) => {
      const i = this.sessionObjects.indexOf(o)
      if (i !== -1) this.sessionObjects.splice(i, 1)
      o.destroy()
    })
    this.emilyBubbleObjects = []
  }

  measureEmilyChatHeight(line) {
    const { innerW } = getEmilyBubbleLayout(this)
    const bubblePadY = SHOP_BUBBLE_PAD_Y
    const bodyFs = emilyBodyFontSize(this)

    const nameProbe = this.add
      .text(-3000, -3000, 'Emily', {
        fontFamily: 'Georgia',
        fontSize: '16px',
        color: '#5a3e2b',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0)
    const bodyProbe = this.add
      .text(-3000, -3000, line, {
        fontFamily: 'Georgia',
        fontStyle: 'italic',
        fontSize: `${bodyFs}px`,
        color: '#5a3e2b',
        wordWrap: { width: innerW },
      })
      .setOrigin(0, 0)
    const innerMeasured =
      bubblePadY + nameProbe.height + 8 + bodyProbe.height + bubblePadY
    nameProbe.destroy()
    bodyProbe.destroy()

    const MIN_EMILY_H = 100
    return Math.max(MIN_EMILY_H, innerMeasured)
  }

  renderEmilyResponseBubble(forcedLine) {
    const { bubbleW, bubbleLeft, innerW } = getEmilyBubbleLayout(this)
    const bubblePadX = SHOP_BUBBLE_PAD_X
    const bubblePadY = SHOP_BUBBLE_PAD_Y
    const bodyFs = emilyBodyFontSize(this)
    const emilyTop = (this._customerBubbleBottomY ?? SHOP_CUSTOMER_BUBBLE_TOP + 180) + SHOP_GAP_CUSTOMER_EMILY
    const strokeColor = 0xb8d8b8
    const fillColor = 0xf0faf0

    const hasStock = this.hasEnoughStock()
    const pool = hasStock ? EMILY_HAS_STOCK : EMILY_MISSING_STOCK
    const line =
      typeof forcedLine === 'string' ? forcedLine : Phaser.Math.RND.pick(pool)

    const pushEmily = (o) => {
      this.emilyBubbleObjects.push(o)
      this.sessionObjects.push(o)
    }

    const innerLeft = bubbleLeft + bubblePadX

    // Measure text heights off-screen so we can size and draw the bubble
    // background BEFORE the text — Phaser renders in add-order, so the
    // background must be added to the scene first or it paints over the text.
    const nameProbe = this.add
      .text(-9999, -9999, 'Emily', {
        fontFamily: 'Georgia',
        fontSize: '16px',
        color: '#5a3e2b',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0)
    const nameH = nameProbe.height
    nameProbe.destroy()

    const bodyProbe = this.add
      .text(-9999, -9999, line, {
        fontFamily: 'Georgia',
        fontStyle: 'italic',
        fontSize: `${bodyFs}px`,
        color: '#5a3e2b',
        wordWrap: { width: innerW },
      })
      .setOrigin(0, 0)
    const bodyH = bodyProbe.height
    bodyProbe.destroy()

    const bubbleH = bubblePadY + nameH + 8 + bodyH + bubblePadY

    // Background drawn first → sits behind text in the display list
    const bubble = this.add.graphics()
    bubble.fillStyle(fillColor, 1)
    bubble.lineStyle(2, strokeColor, 1)
    bubble.fillRoundedRect(bubbleLeft, emilyTop, bubbleW, bubbleH, 16)
    bubble.strokeRoundedRect(bubbleLeft, emilyTop, bubbleW, bubbleH, 16)
    pushEmily(bubble)

    // Text added after background → renders on top
    let ty = emilyTop + bubblePadY
    const nameText = this.add
      .text(innerLeft, ty, 'Emily', {
        fontFamily: 'Georgia',
        fontSize: '16px',
        color: '#5a3e2b',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0)
    pushEmily(nameText)
    ty += nameH + 8

    const bodyText = this.add
      .text(innerLeft, ty, line, {
        fontFamily: 'Georgia',
        fontStyle: 'italic',
        fontSize: `${bodyFs}px`,
        color: '#5a3e2b',
        wordWrap: { width: innerW },
      })
      .setOrigin(0, 0)
    pushEmily(bodyText)

    this._emilyBubbleBottomY = emilyTop + bubbleH
    this._emilyStockSnapshot = this.hasEnoughStock()
  }

  applyShopSessionLayout() {
    const zoneBottom = this.scale.height - NAV_H
    const dotsCy = zoneBottom - SHOP_DOTS_MARGIN_ABOVE_NAV
    const sorryCy = dotsCy - SHOP_GAP_SORRY_DOTS - 11 - SHOP_BTN_H / 2
    const fulfillCy = sorryCy - SHOP_BTN_H / 2 - SHOP_GAP_FULFILL_SORRY - SHOP_BTN_H / 2
    const fulfillTop = fulfillCy - SHOP_BTN_H / 2
    const emilyBottom =
      typeof this._emilyBubbleBottomY === 'number'
        ? this._emilyBubbleBottomY
        : (this._customerBubbleBottomY ?? SHOP_CUSTOMER_BUBBLE_TOP + 180) +
          SHOP_GAP_CUSTOMER_EMILY +
          100
    const minTimerCy =
      emilyBottom + SHOP_GAP_EMILY_TIMER_TOP + SHOP_TIMER_BAR_H / 2
    const relaxedTimerCy = (emilyBottom + SHOP_GAP_EMILY_TIMER_TOP + fulfillTop) / 2
    this._layoutTimerCy = Math.max(minTimerCy, relaxedTimerCy)
    this._layoutFulfillCy = fulfillCy
    this._layoutSorryCy = sorryCy
    this._layoutDotsCy = dotsCy
  }

  repositionSessionShopButtons() {
    const W = this.scale.width
    const w = W - 60
    const h = 60
    const br = Math.min(24, w / 2, h / 2)
    const cx = W / 2
    const place = (btn, y, color) => {
      if (!btn) return
      btn.text.setPosition(cx, y)
      btn.hit.setPosition(cx, y)
      btn.visual.clear()
      btn.visual.fillStyle(color, 1)
      btn.visual.fillRoundedRect(cx - w / 2, y - h / 2, w, h, br)
    }
    place(this.sessionFulfillBtn, this._layoutFulfillCy, COLOR.pink)
    place(this.sessionSorryBtn, this._layoutSorryCy, COLOR.cancel)
  }

  redrawTimerBarBackground() {
    if (!this.timerBarBg) return
    const x = this.timerBarX
    const y = this.timerBarY
    const w = this.timerBarW
    const h = this.timerBarH
    this.timerBarBg.clear()
    this.timerBarBg.fillStyle(COLOR.timerBg, 1)
    this.timerBarBg.fillRoundedRect(x, y - h / 2, w, h, h / 2)
  }

  repositionLowerShopUi() {
    this.applyShopSessionLayout()
    this.timerBarY = this._layoutTimerCy
    this.redrawTimerBarBackground()
    if (this.timerBarRedraw) this.timerBarRedraw()
    if (this.timerBarFlower) this.timerBarFlower.setPosition(this.timerBarX - 6, this.timerBarY)
    this.repositionSessionShopButtons()
    this.renderProgressDots()
  }

  refreshEmilyBubbleForStockChange() {
    if (!this.currentCustomer || this.isResolving) return
    if (!this.timerTween) return
    this.clearEmilyBubbleOnly()
    this.renderEmilyResponseBubble()
    this.repositionLowerShopUi()
  }

  update() {
    if (!this.timerTween || this.isResolving) return
    if (this.customerIndex >= this.customers.length) return
    if (!this.currentCustomer) return
    const has = this.hasEnoughStock()
    if (this._emilyStockSnapshot === has) return
    this.refreshEmilyBubbleForStockChange()
  }

  createSessionActionButton({
    x,
    y,
    w,
    h,
    hitH,
    color,
    label,
    fontSize,
    onTap,
    pressEffect = true,
  }) {
    const visual = this.add.graphics()
    visual.fillStyle(color, 1)
    const br = Math.min(24, w / 2, h / 2)
    visual.fillRoundedRect(x - w / 2, y - h / 2, w, h, br)

    const hit = this.add.rectangle(x, y, w, hitH, 0x000000, 0.001)
    hit.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, w, hitH),
      Phaser.Geom.Rectangle.Contains,
    )
    if (pressEffect) addPressEffect(this, hit, visual)
    hit.on('pointerdown', onTap)

    const text = this.add
      .text(x, y, label, {
        fontFamily: 'Georgia',
        fontSize: `${fontSize}`,
        color: '#ffffff',
      })
      .setOrigin(0.5)
    this.sessionObjects.push(visual, hit, text)
    return { visual, hit, text }
  }

  renderTimerBar() {
    const x = 30
    const y = this._layoutTimerCy ?? 430
    const w = this.scale.width - 60
    const h = 14
    this.timerBarX = x
    this.timerBarW = w
    this.timerBarH = h
    this.timerBarY = y

    const bg = this.add.graphics()
    this.timerBarBg = bg
    bg.fillStyle(COLOR.timerBg, 1)
    bg.fillRoundedRect(x, y - h / 2, w, h, h / 2)

    this.timerFill = this.add.graphics()
    const flower = this.add
      .text(x - 6, y, '✿', {
        fontFamily: 'Georgia',
        fontSize: '15px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
    this.timerBarFlower = flower

    // Resume tween duration + initial bar fraction if we restored mid-customer.
    const totalMs = SHOP.WALK_IN_TIMER_SECONDS * 1000
    const remainingMs =
      this.resumeTimerMs && this.resumeTimerMs > 0 ? this.resumeTimerMs : totalMs
    this.resumeTimerMs = null

    this.timerValue = { width: w * (remainingMs / totalMs) }
    const redraw = () => {
      this.timerFill.clear()
      this.timerFill.fillStyle(COLOR.pink, 1)
      const yy = this.timerBarY
      this.timerFill.fillRoundedRect(
        x,
        yy - h / 2,
        Math.max(0, this.timerValue.width),
        h,
        h / 2,
      )
    }
    this.timerBarRedraw = redraw
    redraw()

    this.timerStartedAt = Date.now()
    this.timerDurationMs = remainingMs

    this.timerTween = this.tweens.add({
      targets: this.timerValue,
      width: 0,
      duration: remainingMs,
      ease: 'Linear',
      onUpdate: redraw,
      onComplete: () => this.handleSorry(true),
    })
    this.sessionObjects.push(bg, this.timerFill, flower)
  }

  renderActionButtons() {
    const fulfillCy = this._layoutFulfillCy ?? 515
    const sorryCy = this._layoutSorryCy ?? 595
    const W = this.scale.width
    const cx = W / 2
    const btnW = W - 60
    this.sessionFulfillBtn = this.createSessionActionButton({
      x: cx,
      y: fulfillCy,
      w: btnW,
      h: 60,
      hitH: 80,
      color: COLOR.pink,
      label: 'Fulfill ✿',
      fontSize: '22px',
      onTap: () => this.handleFulfill(),
      pressEffect: false,
    })
    this.sessionSorryBtn = this.createSessionActionButton({
      x: cx,
      y: sorryCy,
      w: btnW,
      h: 60,
      hitH: 80,
      color: COLOR.cancel,
      label: 'Sorry...',
      fontSize: '22px',
      onTap: () => this.handleSorry(false),
    })
  }

  renderProgressDots() {
    if (!this.progressGraphics) {
      this.progressGraphics = this.add.graphics()
      this.sessionObjects.push(this.progressGraphics)
    }
    this.progressGraphics.clear()
    const gap = 24
    const totalW = gap * (SHOP.WALK_IN_COUNT_PER_DAY - 1)
    const startX = this.scale.width / 2 - totalW / 2
    const y = this._layoutDotsCy ?? 675

    for (let i = 0; i < SHOP.WALK_IN_COUNT_PER_DAY; i++) {
      const done = i < this.customerIndex
      const current = i === this.customerIndex
      const radius = current ? 11 : 8
      const color = done || current ? COLOR.pink : 0xe0d0d0
      this.progressGraphics.fillStyle(color, 1)
      this.progressGraphics.fillCircle(startX + i * gap, y, radius)
    }
  }

  clearActiveBannersOnly() {
    if (!this.activeBannerObjects || this.activeBannerObjects.length === 0) return
    const toRemove = new Set(this.activeBannerObjects)
    this.activeBannerObjects.forEach((o) => o.destroy())
    this.activeBannerObjects = []
    this.screenObjects = this.screenObjects.filter((o) => !toRemove.has(o))
  }

  renderActiveBanners() {
    this.clearActiveBannersOnly()
    const banners = []
    if (this.salesRushActive && this.salesRushRemaining > 0) {
      banners.push({
        text: `💰 Sales Rush Active! (${this.salesRushRemaining} left)`,
        bg: 0xf0c040,
        color: COLOR.brown,
      })
    }
    if (this.luckyDayActive) {
      banners.push({
        text: '✨ Lucky Day Active!',
        bg: COLOR.pink,
        color: '#ffffff',
      })
    }

    banners.forEach((banner, index) => {
      const y = 68 + index * 32
      const h = 28
      const label = this.add
        .text(this.scale.width / 2, y, banner.text, {
          fontFamily: 'Georgia',
          fontSize: '15px',
          color: banner.color,
        })
        .setOrigin(0.5)
      const w = Math.max(190, label.width + 24)
      const pill = this.add.graphics()
      pill.fillStyle(banner.bg, 0.95)
      pill.fillRoundedRect(this.scale.width / 2 - w / 2, y - h / 2, w, h, h / 2)
      this.screenObjects.push(pill, label)
      this.activeBannerObjects.push(pill, label)
    })
  }

  createButton({ x, y, w, h, hitH, color, label, fontSize, onTap, target }) {
    const visual = createRoundedFillCentered(this, x, y, w, h, color)
    const hit = this.add.rectangle(x, y, w, hitH, 0x000000, 0.001)
    hit.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, w, hitH),
      Phaser.Geom.Rectangle.Contains,
    )
    addPressEffect(this, hit, visual)
    hit.on('pointerdown', onTap)

    const text = this.add
      .text(x, y, label, {
        fontFamily: 'Georgia',
        fontSize: `${fontSize}`,
        color: '#ffffff',
      })
      .setOrigin(0.5)
    target.push(visual, hit, text)
  }

  playFulfillSuccessEffects() {
    const fulfillBtn = this.sessionFulfillBtn
    if (fulfillBtn) {
      const bx = fulfillBtn.text.x
      const by = fulfillBtn.text.y
      for (let i = 0; i < 3; i++) {
        const coin = this.add
          .image(bx + Phaser.Math.Between(-60, 60), by, 'coin-gfx')
          .setDisplaySize(20, 20)
          .setDepth(100)

        this.tweens.add({
          targets: coin,
          y: coin.y - Phaser.Math.Between(30, 50),
          alpha: 0,
          duration: 800,
          ease: 'Power2',
          delay: i * 80,
          onComplete: () => coin.destroy(),
        })
      }
    }

    const W = this.scale.width
    const H = this.scale.height
    const flash = this.add
      .rectangle(W / 2, H / 2, W, H, 0x90ee90, 0.25)
      .setDepth(99)
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 400,
      onComplete: () => flash.destroy(),
    })
  }

  handleFulfill() {
    if (this.isResolving) return
    if (!this.hasEnoughStock()) {
      this.flashMessage(
        [{ text: 'Not enough flowers 😔', color: '#8b0000' }],
        () => {},
      )
      return
    }

    this.isResolving = true
    this.playFulfillSuccessEffects()
    this.stopTimer()
    let reward = this.calculateReward()
    if (this.salesRushRemaining > 0) {
      reward *= 2
      this.salesRushRemaining -= 1
      if (this.salesRushRemaining === 0) {
        this.salesRushActive = false
      }
      this.renderActiveBanners()
    }
    this.deductOrderInventory()
    this.save.coins += reward
    this.sessionCoins += reward
    this.customersServed += 1

    let tip = 0
    const tipChance = this.luckyDayActive ? 1 : this.currentCustomer.tipChance
    if (Math.random() < tipChance) {
      tip = 10
      this.save.coins += tip
      this.sessionCoins += tip
    }

    saveManager.save(this.save)
    this.refreshHud()

    playSfx(this, 'sfx-coin', 0.6, this.save)
    if (tip > 0) playSfx(this, 'sfx-coin', 0.8, this.save)

    this.serveStreak = (this.serveStreak || 0) + 1
    track(this.save, 'serve_streak', this.serveStreak)

    const timeOnCustomer = Date.now() - this.customerStartTime
    if (timeOnCustomer <= 10000) track(this.save, 'quick_fulfill', 1)

    const totalFlowersInOrder = this.currentOrder.reduce((sum, r) => sum + r.qty, 0)
    if (totalFlowersInOrder >= 3) track(this.save, 'big_order', 1)

    track(this.save, 'serve_customer', 1)
    track(this.save, 'earn_coins', reward + tip)
    if (tip > 0) track(this.save, 'get_tip', 1)
    if (this.goalsButton) this.goalsButton.refreshBadge()

    const lines = [{ text: `✿ +${reward} coins!`, color: '#2d6e2d' }]
    if (tip > 0) {
      lines.push({ text: '+10 tip! 🌸', color: '#8b3a7a' })
    }
    this.flashMessage(lines, () => {
      this.customerIndex += 1
      this.loadNextCustomer()
    })
  }

  handleSorry(fromTimer) {
    if (this.isResolving) return
    this.isResolving = true
    this.serveStreak = 0
    if (!fromTimer) this.stopTimer()
    saveManager.save(this.save)
    this.flashMessage(
      [{ text: 'Maybe next time... 🌱', color: '#5a3e2b' }],
      () => {
        this.customerIndex += 1
        this.loadNextCustomer()
      },
    )
  }

  // Each line gets its own cream pill behind the text; pills and text fade out together.
  flashMessage(lines, onComplete) {
    const items = lines.map((line) => {
      const text = this.add
        .text(0, 0, line.text, {
          fontFamily: 'Georgia',
          fontSize: '21px',
          color: line.color,
          align: 'center',
        })
        .setOrigin(0.5)
        .setShadow(0, 0, '#ffffff', 4)
        .setDepth(21)

      const pillW = text.width + 32
      const pillH = 40
      const pill = this.add.graphics().setDepth(20)
      pill.fillStyle(0xfef8f2, 0.92)
      pill.fillRoundedRect(-pillW / 2, -pillH / 2, pillW, pillH, 20)

      return { text, pill }
    })

    // Stack lines vertically, centered near the bottom of the screen.
    const lineSpacing = 44
    const cy = this.scale.height - 55
    const startY = cy - ((items.length - 1) * lineSpacing) / 2
    items.forEach((item, i) => {
      const y = startY + i * lineSpacing
      item.text.setPosition(this.scale.width / 2, y)
      item.pill.setPosition(this.scale.width / 2, y)
    })

    const targets = items.flatMap((it) => [it.pill, it.text])
    this.tweens.add({
      targets,
      alpha: 0,
      duration: 800,
      onComplete: () => {
        items.forEach((it) => {
          it.text.destroy()
          it.pill.destroy()
        })
        onComplete()
      },
    })
  }

  hasEnoughStock() {
    const needs = this.getAggregatedNeeds()
    return Object.entries(needs).every(
      ([flowerId, qty]) => (this.save.inventory[flowerId] || 0) >= qty,
    )
  }

  hasEnoughOfFlower(flowerId) {
    const needs = this.getAggregatedNeeds()
    return (this.save.inventory[flowerId] || 0) >= (needs[flowerId] || 0)
  }

  getAggregatedNeeds() {
    const needs = {}
    this.currentOrder.forEach((req) => {
      needs[req.flowerId] = (needs[req.flowerId] || 0) + req.qty
    })
    return needs
  }

  deductOrderInventory() {
    const needs = this.getAggregatedNeeds()
    Object.entries(needs).forEach(([flowerId, qty]) => {
      this.save.inventory[flowerId] = Math.max(0, (this.save.inventory[flowerId] || 0) - qty)
    })
  }

  calculateReward() {
    const base = this.currentOrder.reduce((sum, req) => {
      const flower = getFlowerById(req.flowerId)
      return sum + (flower ? flower.sellPrice * req.qty : 0)
    }, 0)
    return base
  }

  stopTimer() {
    if (this.timerTween) {
      this.timerTween.stop()
      this.timerTween = null
    }
    this.timerStartedAt = null
    this.timerDurationMs = null
  }

  clearCustomerObjects() {
    this.stopTimer()
    this.clearObjects(this.sessionObjects)
    this.sessionObjects = []
    this.emilyBubbleObjects = []
    this.sessionFulfillBtn = null
    this.sessionSorryBtn = null
    this.timerBarBg = null
    this.timerBarFlower = null
    this.timerBarRedraw = null
    this.progressGraphics = null
    this.timerFill = null
    this._emilyStockSnapshot = null
  }

  clearObjects(objects) {
    objects.forEach((obj) => obj.destroy())
    objects.length = 0
  }

  // Persist the in-progress session so create() can resume it next time, then navigate.
  leaveToScene(sceneKey) {
    this.persistSession()
    this.scene.start(sceneKey, { save: this.save })
  }

  persistSession() {
    if (this.customers.length === 0) return
    if (this.customerIndex >= this.customers.length) return

    // Snapshot the current customer's countdown so create() can resume it.
    let remainingMs = SHOP.WALK_IN_TIMER_SECONDS * 1000
    if (this.timerStartedAt !== null && this.timerDurationMs !== null) {
      const elapsed = Date.now() - this.timerStartedAt
      remainingMs = Math.max(0, this.timerDurationMs - elapsed)
    }

    this.save.shopSession = {
      customers: this.customers.map((c) => c.id),
      orders: this.currentOrders,
      customerIndex: this.customerIndex,
      sessionCoins: this.sessionCoins,
      customersServed: this.customersServed,
      salesRushActive: this.salesRushActive,
      salesRushRemaining: this.salesRushRemaining,
      luckyDayActive: this.luckyDayActive,
      day: this.save.day,
      timerStartedAt: Date.now(),
      timerDurationMs: remainingMs,
    }
    saveManager.save(this.save)
  }

  endDay() {
    const playedDay = this.save.day
    this.save.shopStats.totalCustomersServed += this.customersServed
    this.save.day += 1
    this.save.lastPlayed = Date.now()
    this.save.shopSession = null
    this.salesRushActive = false
    this.salesRushRemaining = 0
    this.luckyDayActive = false
    saveManager.save(this.save)
    this.scene.start('EndOfDayScene', {
      save: this.save,
      playedDay,
      customersServed: this.customersServed,
      sessionCoins: this.sessionCoins,
      ordersFulfilled: this.save.dailyOrdersFulfilled || 0,
    })
  }
}
