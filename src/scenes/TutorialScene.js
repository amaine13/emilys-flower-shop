import Phaser from 'phaser'
import { addPressEffect } from '../ui/buttonEffects.js'
import * as saveManager from '../saveManager.js'
import { playBgMusic } from '../audioManager.js'
import { GAME } from '../constants.js'

// ✏️ EDIT DIALOGUE HERE — no code changes needed, just edit these strings
export const DIALOGUE = {
  welcome1: "Welcome to Emily's Flower Shop! 🌸",
  welcome2:
    'This little garden is all yours. Every flower you grow, every bouquet you make — it all starts right here.',
  welcome3: "Let's plant your very first flower, shall we?",
  plantPrompt: 'Tap an empty plot to plant your first seed! 🌱',
  plantedConfirm1: 'Perfect choice! 🌱 Your flower is now planted.',
  plantedConfirm2:
    "While we wait for it to grow, let's get the shop ready!",
  shopIntro:
    'Customers will be arriving soon. Tap the Shop tab to meet your first customer!',
  customerIntro:
    "Oh! A customer already! That's Marcus — he looks like he's in a bit of a rush...",
  customerIntro2:
    'Check what he needs and tap Fulfill if you have it in stock!',
  fulfilledCustomer:
    'Wonderful! 🌸 He left happy. A happy customer means coins for you!',
  harvestPrompt:
    'Your flower should be ready now! Head back to the garden and harvest it.',
  harvestedConfirm1: 'Beautiful! Look at that! 🌸 Your very first harvest.',
  harvestedConfirm2:
    'Harvested flowers go straight to your inventory — ready to sell!',
  endDay1: 'What a wonderful first day! ☀️',
  endDay2:
    'Tomorrow, more customers will arrive with special requests. Keep your garden growing and your shop stocked!',
  endDay3:
    "Your flower shop adventure starts now. I'm so proud of you! 🌸✿🌸",
  endDaySign: '— Emily',
}

const NAV_H = 70

const COLOR = {
  brown: '#5a3e2b',
  muted: '#8a7a6a',
  pink: '#c96b9a',
  pinkBg: 0xc96b9a,
  card: 0xfef8f2,
  cardStroke: 0xe0c8b0,
  arrow: '#c96b9a',
  navGreen: 0x8aaa64,
  inactiveTab: '#d4eebc',
}

// Bottom-nav layout mirrors the other scenes so the spotlight lines up perfectly.
const TABS = [
  { key: 'garden', emoji: '🌱', label: 'Garden' },
  { key: 'shop', emoji: '🏪', label: 'Shop' },
  { key: 'orders', emoji: '📋', label: 'Orders' },
  { key: 'upgrades', emoji: '⭐', label: 'Upgrades' },
]

export default class TutorialScene extends Phaser.Scene {
  constructor() {
    super('TutorialScene')
  }

  init(data) {
    this.save = data && data.save ? data.save : saveManager.init()
    if (data && typeof data.step === 'number') {
      this.step = data.step
    } else {
      this.step = this.save.tutorialStep || 0
    }
  }

  create() {
    this.scale.on('resize', () => {
      this.input.setDefaultCursor('default')
      if (!this._resizeScheduled) {
        this._resizeScheduled = true
        this.time.delayedCall(100, () => {
          this._resizeScheduled = false
          this.scene.restart({ save: this.save, step: this.step })
        })
      }
    })
    this.input.setTopOnly(true)
    playBgMusic(this, this.save)

    const { width, height } = this.scale
    const bg = this.add.image(width / 2, height / 2, 'bg-garden')
    bg.setDisplaySize(width, height)

    switch (this.step) {
      case 0:
        this.renderStep0()
        break
      case 2:
        this.renderStep2()
        break
      case 4:
        this.renderStep4()
        break
      case 5:
        this.renderStep5()
        break
      case 6:
        this.renderStep6()
        break
      default:
        // Defensive fallback; shouldn't happen because steps 1/3 live in other scenes.
        this.renderStep0()
        break
    }
  }

  // ---------- Reusable card + nav helpers ----------

  // Builds a centered dialogue card sized to its content. Caller can pass an onTap
  // handler to make the whole card a tap target (used for "Tap to continue").
  createDialogueCard({
    emoji,
    title,
    body,
    bodyItalic,
    hint,
    yCenter,
    depth = 10,
    onTap = null,
  }) {
    const cardW = 320
    const padding = 22
    const cx = this.scale.width / 2
    const resolvedYCenter = yCenter !== undefined ? yCenter : this.scale.height / 2
    const wrap = cardW - padding * 2

    const lines = []
    if (emoji) {
      lines.push(
        this.add
          .text(0, 0, emoji, { fontSize: '34px', align: 'center' })
          .setOrigin(0.5, 0),
      )
    }
    if (title) {
      lines.push(
        this.add
          .text(0, 0, title, {
            fontFamily: 'Georgia',
            fontSize: '24px',
            color: COLOR.brown,
            align: 'center',
            wordWrap: { width: wrap },
          })
          .setOrigin(0.5, 0),
      )
    }
    if (body) {
      lines.push(
        this.add
          .text(0, 0, body, {
            fontFamily: 'Georgia',
            fontSize: '17px',
            color: COLOR.brown,
            align: 'center',
            wordWrap: { width: wrap },
          })
          .setOrigin(0.5, 0),
      )
    }
    if (bodyItalic) {
      lines.push(
        this.add
          .text(0, 0, bodyItalic, {
            fontFamily: 'Georgia',
            fontStyle: 'italic',
            fontSize: '16px',
            color: COLOR.muted,
            align: 'center',
            wordWrap: { width: wrap },
          })
          .setOrigin(0.5, 0),
      )
    }
    if (hint) {
      lines.push(
        this.add
          .text(0, 0, hint, {
            fontFamily: 'Georgia',
            fontStyle: 'italic',
            fontSize: '14px',
            color: COLOR.muted,
            align: 'center',
          })
          .setOrigin(0.5, 0),
      )
    }

    const gap = 12
    let contentH = 0
    lines.forEach((line, i) => {
      contentH += line.height
      if (i < lines.length - 1) contentH += gap
    })

    const cardH = contentH + padding * 2
    const cardTop = resolvedYCenter - cardH / 2

    // Background goes in first so text lays on top.
    const cardBg = this.add.graphics().setDepth(depth)
    cardBg.fillStyle(COLOR.card, 1)
    cardBg.lineStyle(2, COLOR.cardStroke, 1)
    cardBg.fillRoundedRect(cx - cardW / 2, cardTop, cardW, cardH, 20)
    cardBg.strokeRoundedRect(cx - cardW / 2, cardTop, cardW, cardH, 20)

    let y = cardTop + padding
    lines.forEach((line, i) => {
      line.setPosition(cx, y).setDepth(depth + 1)
      y += line.height
      if (i < lines.length - 1) y += gap
    })

    if (onTap) {
      const hit = this.add
        .rectangle(cx, cardTop + cardH / 2, cardW, cardH, 0x000000, 0)
        .setDepth(depth + 2)
      hit.setInteractive(
        new Phaser.Geom.Rectangle(0, 0, cardW, cardH),
        Phaser.Geom.Rectangle.Contains,
      )
      addPressEffect(this, hit, cardBg)
      hit.on('pointerdown', onTap)
    }
  }

  // Renders a visual-only 4-tab bottom nav, then darkens everything except the
  // active tab's cell. Returns the spotlit tab's center for arrow placement.
  renderNavWithSpotlight(activeTabKey, onActiveTap) {
    const NAV_TOP = this.scale.height - NAV_H
    const W = this.scale.width
    this.add
      .rectangle(0, NAV_TOP, W, NAV_H, COLOR.navGreen)
      .setOrigin(0, 0)
      .setDepth(1)

    const tabW = W / TABS.length
    TABS.forEach((tab, i) => {
      const cx = i * tabW + tabW / 2
      const cy = NAV_TOP + NAV_H / 2
      this.add
        .text(cx, cy - 12, tab.emoji, { fontSize: '24px' })
        .setOrigin(0.5)
        .setDepth(1)
      this.add
        .text(cx, cy + 14, tab.label, {
          fontFamily: 'Georgia',
          fontSize: '14px',
          color: COLOR.inactiveTab,
        })
        .setOrigin(0.5)
        .setDepth(1)
    })

    const activeIdx = TABS.findIndex((t) => t.key === activeTabKey)
    const cellLeft = activeIdx * tabW
    const cellRight = cellLeft + tabW
    const dim = 0.6

    // Dim every area outside the active cell with four framing rects.
    this.add
      .rectangle(0, 0, W, NAV_TOP, 0x000000, dim)
      .setOrigin(0, 0)
      .setDepth(2)
    if (cellLeft > 0) {
      this.add
        .rectangle(0, NAV_TOP, cellLeft, NAV_H, 0x000000, dim)
        .setOrigin(0, 0)
        .setDepth(2)
    }
    if (cellRight < W) {
      this.add
        .rectangle(cellRight, NAV_TOP, W - cellRight, NAV_H, 0x000000, dim)
        .setOrigin(0, 0)
        .setDepth(2)
    }

    // Re-render the spotlit tab above the dim so it pops bright.
    const activeCx = activeIdx * tabW + tabW / 2
    const activeCy = NAV_TOP + NAV_H / 2
    this.add
      .text(activeCx, activeCy - 12, TABS[activeIdx].emoji, { fontSize: '24px' })
      .setOrigin(0.5)
      .setDepth(3)
    this.add
      .text(activeCx, activeCy + 14, TABS[activeIdx].label, {
        fontFamily: 'Georgia',
        fontSize: '14px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setDepth(3)
    this.add.rectangle(activeCx, activeCy + 28, 30, 2, 0xffffff).setDepth(3)

    // Only the spotlit tab is interactive — every other input is blocked.
    const hit = this.add
      .rectangle(activeCx, activeCy, tabW, NAV_H, 0x000000, 0)
      .setDepth(4)
    hit.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, tabW, NAV_H),
      Phaser.Geom.Rectangle.Contains,
    )
    addPressEffect(this, hit)
    hit.on('pointerdown', onActiveTap)

    return { cx: activeCx, cy: activeCy }
  }

  // Bouncing ↓ arrow around a base y position (range ±10px, ~500ms half-cycle).
  bouncingArrow(x, baseY) {
    const startY = baseY - 10
    const arrow = this.add
      .text(x, startY, '↓', {
        fontFamily: 'Georgia',
        fontSize: '30px',
        color: COLOR.arrow,
      })
      .setOrigin(0.5)
      .setDepth(5)
      .setShadow(0, 0, '#ffffff', 4)
    this.tweens.add({
      targets: arrow,
      y: baseY + 10,
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
    return arrow
  }

  // ---------- Step renders ----------

  // Step 0 — Welcome.
  renderStep0() {
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.5)
      .setOrigin(0, 0)
      .setDepth(1)
    this.createDialogueCard({
      emoji: '🌸',
      title: DIALOGUE.welcome1,
      body: DIALOGUE.welcome2,
      bodyItalic: DIALOGUE.welcome3,
      hint: 'Tap to continue',
      depth: 10,
      onTap: () => {
        this.save.tutorialStep = 1
        saveManager.save(this.save)
        this.scene.start('GardenScene', {
          save: this.save,
          tutorialMode: true,
          tutorialStep: 1,
        })
      },
    })
  }

  // Step 2 — Confirm planting + point at Shop tab.
  renderStep2() {
    const NAV_TOP = this.scale.height - NAV_H
    const { cx } = this.renderNavWithSpotlight('shop', () => {
      this.save.tutorialStep = 3
      saveManager.save(this.save)
      this.scene.start('ShopScene', {
        save: this.save,
        tutorialMode: true,
        tutorialStep: 3,
      })
    })
    this.bouncingArrow(cx, NAV_TOP - 30)
    this.createDialogueCard({
      emoji: '🌱',
      title: DIALOGUE.plantedConfirm1,
      body: DIALOGUE.plantedConfirm2,
      bodyItalic: DIALOGUE.shopIntro,
      yCenter: 300,
      depth: 10,
    })
  }

  // Step 4 (front) — Tell player to go back to Garden to harvest.
  renderStep4() {
    const NAV_TOP = this.scale.height - NAV_H
    const { cx } = this.renderNavWithSpotlight('garden', () => {
      // Garden tutorial back-half: harvest the planted plot.
      saveManager.save(this.save)
      this.scene.start('GardenScene', {
        save: this.save,
        tutorialMode: true,
        tutorialStep: 4,
      })
    })
    this.bouncingArrow(cx, NAV_TOP - 30)
    this.createDialogueCard({
      emoji: '🌸',
      title: DIALOGUE.fulfilledCustomer,
      body: DIALOGUE.harvestPrompt,
      yCenter: 300,
      depth: 10,
    })
  }

  // Step 5 — Harvest confirmation.
  renderStep5() {
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.5)
      .setOrigin(0, 0)
      .setDepth(1)
    this.createDialogueCard({
      emoji: '🌸',
      title: DIALOGUE.harvestedConfirm1,
      body: DIALOGUE.harvestedConfirm2,
      hint: 'Tap to continue',
      depth: 10,
      onTap: () => {
        this.save.tutorialStep = 6
        saveManager.save(this.save)
        this.scene.start('TutorialScene', { save: this.save, step: 6 })
      },
    })
  }

  // Step 6 — Special "End of Day 0" closing screen.
  renderStep6() {
    const W = this.scale.width
    const H = this.scale.height
    this.add
      .rectangle(0, 0, W, H, 0x000000, 0.55)
      .setOrigin(0, 0)
      .setDepth(1)

    const cx = W / 2
    const cardW = 340
    const cardH = 500
    const cardTop = (H - cardH) / 2

    const cardBg = this.add.graphics().setDepth(2)
    cardBg.fillStyle(COLOR.card, 1)
    cardBg.lineStyle(2, COLOR.cardStroke, 1)
    cardBg.fillRoundedRect(cx - cardW / 2, cardTop, cardW, cardH, 20)
    cardBg.strokeRoundedRect(cx - cardW / 2, cardTop, cardW, cardH, 20)

    // Decorative side flowers — just outside the card edge but on-screen.
    const daisy = this.add
      .image(20, cardTop + 70, 'flower-daisy')
      .setDepth(3)
    daisy.setScale(0.8)
    const tulip = this.add
      .image(W - 20, cardTop + 70, 'flower-tulip')
      .setDepth(3)
    tulip.setScale(0.8)

    this.add
      .text(cx, cardTop + 50, '☀️', { fontSize: '50px' })
      .setOrigin(0.5)
      .setDepth(3)

    this.add
      .text(cx, cardTop + 120, DIALOGUE.endDay1, {
        fontFamily: 'Georgia',
        fontSize: '26px',
        color: COLOR.brown,
        align: 'center',
        wordWrap: { width: cardW - 50 },
      })
      .setOrigin(0.5, 0)
      .setDepth(3)

    this.add
      .text(cx, cardTop + 180, DIALOGUE.endDay2, {
        fontFamily: 'Georgia',
        fontSize: '17px',
        color: COLOR.brown,
        align: 'center',
        wordWrap: { width: cardW - 50 },
      })
      .setOrigin(0.5, 0)
      .setDepth(3)

    this.add
      .text(cx, cardTop + 300, DIALOGUE.endDay3, {
        fontFamily: 'Georgia',
        fontStyle: 'italic',
        fontSize: '16px',
        color: COLOR.muted,
        align: 'center',
        wordWrap: { width: cardW - 50 },
      })
      .setOrigin(0.5, 0)
      .setDepth(3)

    this.add
      .text(cx, cardTop + 370, DIALOGUE.endDaySign, {
        fontFamily: 'Georgia',
        fontStyle: 'italic',
        fontSize: '18px',
        color: COLOR.pink,
      })
      .setOrigin(0.5, 0)
      .setDepth(3)

    const btnW = 280
    const btnH = 56
    const btnCy = cardTop + cardH - 50
    const btn = this.add.graphics().setDepth(3)
    btn.fillStyle(COLOR.pinkBg, 1)
    btn.fillRoundedRect(cx - btnW / 2, btnCy - btnH / 2, btnW, btnH, Math.min(24, btnW / 2, btnH / 2))
    this.add
      .text(cx, btnCy, 'Begin your adventure! 🌸', {
        fontFamily: 'Georgia',
        fontSize: '20px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setDepth(4)

    const hit = this.add
      .rectangle(cx, btnCy, btnW, btnH, 0x000000, 0)
      .setDepth(5)
    hit.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, btnW, btnH),
      Phaser.Geom.Rectangle.Contains,
    )
    addPressEffect(this, hit, btn)
    hit.on('pointerdown', () => {
      this.save.tutorialComplete = true
      this.save.tutorialStep = 6
      this.save.day = 1
      saveManager.save(this.save)
      this.scene.start('GardenScene', { save: this.save })
    })
  }
}
