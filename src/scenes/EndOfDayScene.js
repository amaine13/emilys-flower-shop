import Phaser from 'phaser'
import * as saveManager from '../saveManager.js'
import { GAME, PROGRESSION } from '../constants.js'
import { playSfx, playBgMusic } from '../audioManager.js'
import { createRoundedFillCentered } from '../ui/roundedUi.js'
import { addPressEffect } from '../ui/buttonEffects.js'
import { checkLevelMilestone, track, generateDailyGoals } from '../missionManager.js'
import { addCoinText, COIN_EMOJI } from '../ui/coinLabel.js'

const STROKE = 0xe0c8b0
const PINK = 0xc96b9a
const BAR_BG = 0xe0d0c0

function starsFromCustomersServed(n) {
  let s = 0
  if (n >= 1) s += 1
  if (n >= 2) s += 1
  if (n >= 3) s += 1
  if (n >= 4) s += 1
  if (n >= 5) s += 1
  return s
}

function starsFromOrdersFulfilled(n) {
  let s = 0
  if (n >= 1) s += 1
  if (n >= 2) s += 1
  return s
}

export default class EndOfDayScene extends Phaser.Scene {
  constructor() {
    super('EndOfDayScene')
  }

  create() {
    this.scale.on('resize', () => {
      this.input.setDefaultCursor('default')
    })
    const {
      save,
      playedDay,
      customersServed = 0,
      sessionCoins = 0,
      ordersFulfilled = 0,
    } = this.scene.settings.data

    this.save = save
    playBgMusic(this, this.save)
    this.playedDay = playedDay
    this.sessionCoins = sessionCoins
    this.customersServed = customersServed
    this.ordersFulfilled = ordersFulfilled
    this.cardElements = []

    this.buildBackground()

    const customerStars = starsFromCustomersServed(customersServed)
    const orderStars = starsFromOrdersFulfilled(ordersFulfilled)
    let starsEarned = 0
    starsEarned += customerStars
    starsEarned += orderStars

    const prevShopLevel = this.save.shopLevel
    this.save.totalStars += starsEarned
    this.save.dailyOrdersFulfilled = 0

    const newLevel = Math.min(
      Math.floor(this.save.totalStars / PROGRESSION.STARS_PER_LEVEL) + 1,
      PROGRESSION.MAX_LEVEL,
    )
    const leveledUp = newLevel > prevShopLevel
    if (leveledUp) {
      this.save.shopLevel = newLevel
    }
    checkLevelMilestone(this.save)
    track(this.save, 'earn_stars', starsEarned)
    generateDailyGoals(this.save)

    const rem = this.save.totalStars % PROGRESSION.STARS_PER_LEVEL
    const nextStars = rem === 0 ? PROGRESSION.STARS_PER_LEVEL : PROGRESSION.STARS_PER_LEVEL - rem
    const progressPct = rem / PROGRESSION.STARS_PER_LEVEL

    if (starsEarned > (this.save.shopStats?.highestStarsInADay ?? 0)) {
      if (!this.save.shopStats) this.save.shopStats = {}
      this.save.shopStats.highestStarsInADay = starsEarned
    }

    saveManager.save(this.save)

    this.buildCard({
      starsEarned,
      customerStars,
      orderStars,
      leveledUp,
      newLevel,
      nextStars,
      progressPct,
    })
    this.playEntranceAnimation()
  }

  buildBackground() {
    const bg = this.add.image(GAME.WIDTH / 2, GAME.HEIGHT / 2, 'bg-garden')
    bg.setDisplaySize(GAME.WIDTH, GAME.HEIGHT)
    this.add.rectangle(195, 422, 390, 844, 0x000000, 0.45)
  }

  buildCard({
    starsEarned,
    customerStars,
    orderStars,
    leveledUp,
    newLevel,
    nextStars,
    progressPct,
  }) {
    const cx = GAME.WIDTH / 2
    const cardW = 340
    const padX = 24
    const innerLeft = cx - cardW / 2 + padX
    const innerRight = cx + cardW / 2 - padX

    let blockH = 420
    if (leveledUp) blockH += 48
    const cardH = blockH
    const cardX = cx - cardW / 2
    const cardY = (GAME.HEIGHT - cardH) / 2

    const panel = this.add.graphics()
    panel.fillStyle(0xfef8f2, 1)
    panel.lineStyle(2, STROKE, 1)
    panel.fillRoundedRect(cardX, cardY, cardW, cardH, 20)
    panel.strokeRoundedRect(cardX, cardY, cardW, cardH, 20)
    this.addCardElement(panel)

    let y = cardY + 36
    const title = this.add
      .text(cx, y, `End of Day ${this.playedDay}`, {
        fontFamily: 'Georgia',
        fontSize: '26px',
        color: '#5a3e2b',
      })
      .setOrigin(0.5)
    this.addCardElement(title)
    y += 38

    const earnedLine = this.add
      .text(cx, y, `✿ You earned ${starsEarned} stars today!`, {
        fontFamily: 'Georgia',
        fontSize: '18px',
        color: '#c96b9a',
      })
      .setOrigin(0.5)
    this.addCardElement(earnedLine)
    y += 36

    this.addDivider(innerLeft, innerRight, y)
    y += 14

    this.addBreakdownRow(
      innerLeft,
      innerRight,
      y,
      `Customers served: ${this.customersServed} / 5`,
      `+${customerStars} stars`,
    )
    y += 28

    this.addBreakdownRow(
      innerLeft,
      innerRight,
      y,
      `Orders fulfilled: ${this.ordersFulfilled}`,
      `+${orderStars} stars`,
    )
    y += 28

    const coinsRowLayout = addCoinText(this, {
      x: innerLeft,
      y,
      text: `Coins earned today: ${COIN_EMOJI} ${this.sessionCoins}`,
      style: { fontFamily: 'Georgia', fontSize: '15px', color: '#5a3e2b' },
      originX: 0,
      originY: 0.5,
    })
    coinsRowLayout.objects.forEach((o) => this.addCardElement(o))
    y += 32

    this.addDivider(innerLeft, innerRight, y)
    y += 18

    const totalLine = this.add
      .text(cx, y, `Total stars: ${this.save.totalStars} → Level ${this.save.shopLevel}`, {
        fontFamily: 'Georgia',
        fontSize: '15px',
        color: '#5a3e2b',
      })
      .setOrigin(0.5)
    this.addCardElement(totalLine)
    y += 26

    let nextLineText = `Next level in ${nextStars} stars`
    if (this.save.shopLevel >= PROGRESSION.MAX_LEVEL) {
      nextLineText = "You've reached the top level! ✿"
    }
    const nextLine = this.add
      .text(cx, y, nextLineText, {
        fontFamily: 'Georgia',
        fontSize: '13px',
        color: '#8a7a6a',
      })
      .setOrigin(0.5)
    this.addCardElement(nextLine)
    y += 28

    const barW = 280
    const barH = 10
    const barLeft = cx - barW / 2
    const barY = y
    const barBg = this.add.graphics()
    barBg.fillStyle(BAR_BG, 1)
    barBg.fillRoundedRect(barLeft, barY - barH / 2, barW, barH, barH / 2)
    this.addCardElement(barBg)

    const fillW = Math.max(0, Math.min(barW, barW * progressPct))
    const barFill = this.add.graphics()
    barFill.fillStyle(PINK, 1)
    barFill.fillRoundedRect(barLeft, barY - barH / 2, fillW, barH, barH / 2)
    this.addCardElement(barFill)

    y += 28

    if (leveledUp) {
      const banner = this.add
        .text(cx, y, `✿ Level Up! Now Level ${newLevel} ✿`, {
          fontFamily: 'Georgia',
          fontSize: '20px',
          color: '#c96b9a',
        })
        .setOrigin(0.5)
      banner.setScale(0)
      this.addCardElement(banner, { isLevelBanner: true })
      y += 44
    }

    const message = this.add
      .text(cx, y, this.getEmilyMessage(starsEarned), {
        fontFamily: 'Georgia',
        fontStyle: 'italic',
        fontSize: '14px',
        color: '#8a7a6a',
        align: 'center',
        wordWrap: { width: 300 },
      })
      .setOrigin(0.5)
    this.addCardElement(message)
    y += Math.max(48, message.height + 16)

    this.buildButton(cx, cardY + cardH - 52)
  }

  addDivider(left, right, y) {
    const g = this.add.graphics()
    g.lineStyle(1, STROKE, 1)
    g.lineBetween(left, y, right, y)
    this.addCardElement(g)
  }

  addBreakdownRow(left, right, y, leftStr, rightStr) {
    const a = this.add
      .text(left, y, leftStr, {
        fontFamily: 'Georgia',
        fontSize: '15px',
        color: '#5a3e2b',
      })
      .setOrigin(0, 0.5)
    const b = this.add
      .text(right, y, rightStr, {
        fontFamily: 'Georgia',
        fontSize: '15px',
        color: '#5a3e2b',
      })
      .setOrigin(1, 0.5)
    this.addCardElement(a)
    this.addCardElement(b)
  }

  buildButton(x, y) {
    const w = 300
    const h = 80
    const visualH = 60
    const button = createRoundedFillCentered(this, x, y, w, visualH, PINK)
    const hit = this.add.rectangle(x, y, w, h, 0x000000, 0.001)
    hit.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, w, h),
      Phaser.Geom.Rectangle.Contains,
    )
    addPressEffect(this, hit, button)
    hit.on('pointerdown', () => {
      saveManager.save(this.save)
      this.scene.start('GardenScene', { save: this.save })
    })

    const label = this.add
      .text(x, y, '🌱 Plant for tomorrow', {
        fontFamily: 'Georgia',
        fontSize: '18px',
        color: '#ffffff',
      })
      .setOrigin(0.5)

    this.addCardElement(button)
    this.addCardElement(hit)
    this.addCardElement(label)
  }

  addCardElement(obj, meta = {}) {
    obj.setAlpha(0)
    this.cardElements.push({ obj, meta })
  }

  playEntranceAnimation() {
    this.cardElements.forEach(({ obj, meta }, index) => {
      this.tweens.add({
        targets: obj,
        alpha: 1,
        duration: 300,
        delay: index * 80,
      })

      if (meta.isLevelBanner) {
        this.tweens.add({
          targets: obj,
          scale: 1.0,
          duration: 400,
          delay: index * 80,
          ease: 'Back.Out',
          onStart: () => playSfx(this, 'sfx-levelup', 0.6, this.save),
        })
      }
    })
  }

  getEmilyMessage(starsEarned) {
    const messages = {
      0: 'Slow day... but every flower counts. 🌱',
      1: 'A quiet start. Tomorrow will be better! 🌸',
      2: 'Nice work! Keep it up! ✿',
      3: 'Great day Emily! The shop is doing well! 🌸',
      4: 'Wonderful! The customers loved it! ✿',
      5: 'What a day! You served everyone! 🌸✿',
      6: 'Amazing! Full house AND orders done! ✿🌸✿',
      7: 'PERFECT DAY! Emily is glowing! 🌸✿🌸✿',
    }
    return messages[Math.min(7, Math.max(0, starsEarned))] ?? messages[0]
  }
}
