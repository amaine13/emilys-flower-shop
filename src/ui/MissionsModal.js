import Phaser from 'phaser'
import { DAILY_GOALS_POOL, MILESTONES } from '../data/missions.js'
import * as saveManager from '../saveManager.js'
import { hasUnclaimedRewards } from '../missionManager.js'
import { GAME, PROGRESSION } from '../constants.js'
import { playSfx } from '../audioManager.js'
import { createRoundedFillCentered } from './roundedUi.js'
import { addPressEffect } from './buttonEffects.js'
import { Scrollbar } from './scrollbar.js'
import { COIN_EMOJI, COIN_TEXTURE, coinSizeForFont } from './coinLabel.js'

const PANEL_W = 350
const PANEL_H = 600
const LIST_TOP_OFFSET = 144
const LIST_BOTTOM_PAD = 20
const ROW_H_MIN = 76
const ROW_PAD_V = 14
const BAR_W = 160
const BAR_H = 8

const COLOR = {
  panel: 0xfef8f2,
  panelStroke: 0xe0c8b0,
  brown: '#5a3e2b',
  muted: '#8a7a6a',
  pink: 0xc96b9a,
  pinkHex: '#c96b9a',
  underline: 0xc96b9a,
  barBg: 0xe0d0c0,
  barFill: 0xc96b9a,
  divider: 0xe6dccc,
  badge: 0xff4444,
  success: '#4a8a4a',
}

// Full-screen modal that overlays whatever scene the player is in. Renders
// daily goals + milestones with progress bars and per-row Claim buttons.
export default class MissionsModal {
  constructor(scene, save, options = {}) {
    this.scene = scene
    this.save = save
    this.options = options
    this.objects = []
    this.activeTab = 'daily'
    this.listScrollY = 0
    this.listScrollMax = 0
    this.listNaturalH = 0
    this.listListTop = 0
    this.listContainer = null
    this.listMaskGfx = null
    this.missionsScrollbar = null
  }

  open() {
    this.objects = []
    const cx = GAME.WIDTH / 2
    const cy = GAME.HEIGHT / 2

    // Dim layer also blocks taps on the underlying scene.
    const dim = this.scene.add
      .rectangle(0, 0, GAME.WIDTH, GAME.HEIGHT, 0x000000, 0.6)
      .setOrigin(0, 0)
      .setDepth(1000)
    dim.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, GAME.WIDTH, GAME.HEIGHT),
      Phaser.Geom.Rectangle.Contains,
    )
    this.objects.push(dim)

    const panelLeft = cx - PANEL_W / 2
    const panelTop = cy - PANEL_H / 2

    const panel = this.scene.add.graphics().setDepth(1001)
    panel.fillStyle(COLOR.panel, 1)
    panel.lineStyle(2, COLOR.panelStroke, 1)
    panel.fillRoundedRect(panelLeft, panelTop, PANEL_W, PANEL_H, 20)
    panel.strokeRoundedRect(panelLeft, panelTop, PANEL_W, PANEL_H, 20)
    this.objects.push(panel)

    const title = this.scene.add
      .text(cx, panelTop + 28, "🎯 Emily's Goals", {
        fontFamily: 'Georgia',
        fontSize: '20px',
        color: COLOR.brown,
      })
      .setOrigin(0.5)
      .setDepth(1002)
    this.objects.push(title)

    this.buildStarsProgressBlock(cx, panelLeft, panelTop + 46)

    // Close button — plain rectangle + text, explicit hit area.
    const closeBg = this.scene.add
      .rectangle(panelLeft + PANEL_W - 22, panelTop + 22, 36, 36, 0x000000, 0)
      .setDepth(1002)
    closeBg.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, 36, 36),
      Phaser.Geom.Rectangle.Contains,
    )
    addPressEffect(this.scene, closeBg)
    closeBg.on('pointerdown', () => this.close())
    this.objects.push(closeBg)

    const closeLabel = this.scene.add
      .text(panelLeft + PANEL_W - 22, panelTop + 22, '✕', {
        fontFamily: 'Georgia',
        fontSize: '18px',
        color: COLOR.brown,
      })
      .setOrigin(0.5)
      .setDepth(1003)
    this.objects.push(closeLabel)

    this.buildTabs(panelLeft, panelTop + 92)
    this.buildList(panelLeft, panelTop + LIST_TOP_OFFSET)
  }

  buildStarsProgressBlock(cx, panelLeft, blockTop) {
    const total = this.save.totalStars ?? 0
    const lv = this.save.shopLevel ?? 1
    const sp = PROGRESSION.STARS_PER_LEVEL
    const maxLv = PROGRESSION.MAX_LEVEL

    let line
    let pct = 1
    if (lv >= maxLv) {
      line = `✿ ${total} stars · Level ${lv} · Max level`
    } else {
      const prevStars = (lv - 1) * sp
      const nextAt = lv * sp
      line = `✿ ${total} stars · Level ${lv} · Next level at ${nextAt} stars`
      const span = Math.max(1, nextAt - prevStars)
      pct = Math.max(0, Math.min(1, (total - prevStars) / span))
    }

    const summary = this.scene.add
      .text(cx, blockTop, line, {
        fontFamily: 'Georgia',
        fontSize: '12px',
        color: COLOR.brown,
        align: 'center',
        wordWrap: { width: PANEL_W - 28 },
      })
      .setOrigin(0.5, 0)
      .setDepth(1002)
    this.objects.push(summary)

    const barW = PANEL_W - 48
    const barX = panelLeft + 24
    const barY = blockTop + summary.height + 8

    const barBg = this.scene.add.graphics().setDepth(1002)
    barBg.fillStyle(COLOR.barBg, 1)
    barBg.fillRoundedRect(barX, barY, barW, BAR_H, BAR_H / 2)
    this.objects.push(barBg)

    if (pct > 0) {
      const fillW = Math.max(BAR_H, Math.round(barW * pct))
      const barFill = this.scene.add.graphics().setDepth(1003)
      barFill.fillStyle(COLOR.barFill, 1)
      barFill.fillRoundedRect(barX, barY, fillW, BAR_H, BAR_H / 2)
      this.objects.push(barFill)
    }
  }

  buildTabs(panelLeft, tabsTop) {
    const tabW = PANEL_W / 2
    const tabs = [
      { id: 'daily', label: 'Daily 🌸' },
      { id: 'milestones', label: 'Milestones ⭐' },
    ]
    tabs.forEach((tab, i) => {
      const tx = panelLeft + tabW * i + tabW / 2
      const ty = tabsTop + 16
      const active = this.activeTab === tab.id

      const label = this.scene.add
        .text(tx, ty, tab.label, {
          fontFamily: 'Georgia',
          fontSize: '15px',
          color: active ? COLOR.pinkHex : COLOR.muted,
          fontStyle: active ? 'bold' : 'normal',
        })
        .setOrigin(0.5)
        .setDepth(1002)
      this.objects.push(label)

      if (active) {
        const underline = this.scene.add
          .rectangle(tx, ty + 16, 90, 3, COLOR.underline)
          .setDepth(1002)
        this.objects.push(underline)
      }

      const hit = this.scene.add
        .rectangle(tx, ty, tabW, 40, 0x000000, 0)
        .setDepth(1003)
      hit.setInteractive(
        new Phaser.Geom.Rectangle(0, 0, tabW, 40),
        Phaser.Geom.Rectangle.Contains,
      )
      addPressEffect(this.scene, hit)
      hit.on('pointerdown', () => {
        if (this.activeTab === tab.id) return
        this.activeTab = tab.id
        this.refresh()
      })
      this.objects.push(hit)
    })
  }

  buildList(panelLeft, listTop) {
    this.removeListScrollInput()
    if (this.listContainer) {
      this.listContainer.destroy(true)
      this.listContainer = null
    }
    if (this.listMaskGfx) {
      this.listMaskGfx.destroy()
      this.listMaskGfx = null
    }
    if (this.missionsScrollbar) {
      this.missionsScrollbar.destroy()
      this.missionsScrollbar = null
    }

    const listViewportH = PANEL_H - LIST_TOP_OFFSET - LIST_BOTTOM_PAD
    this.listListTop = listTop
    const cx = GAME.WIDTH / 2

    const rows = []
    if (this.activeTab === 'milestones') {
      const state = this.save.missions.milestones
      MILESTONES.forEach((def) => {
        const rowState =
          state.find((s) => s.id === def.id) ||
          { progress: 0, completed: false, rewardClaimed: false }
        rows.push({ def, rowState })
      })
    } else {
      const state = this.save.missions.daily.goals
      const ids =
        this.save.missions.daily.currentGoalIds?.length > 0
          ? this.save.missions.daily.currentGoalIds
          : state.map((g) => g.id)
      ids.forEach((id) => {
        const def = DAILY_GOALS_POOL.find((g) => g.id === id)
        if (!def) return
        const rowState =
          state.find((s) => s.id === id) ||
          { progress: 0, completed: false, rewardClaimed: false }
        rows.push({ def, rowState })
      })
    }

    this.listScrollY = 0

    this.listContainer = this.scene.add
      .container(panelLeft, listTop)
      .setDepth(1002)

    this.listMaskGfx = this.scene.make.graphics({ x: 0, y: 0, add: false })
    this.listMaskGfx.fillStyle(0xffffff, 1)
    this.listMaskGfx.fillRect(panelLeft, listTop, PANEL_W, listViewportH)
    this.listContainer.setMask(
      new Phaser.Display.Masks.GeometryMask(this.scene, this.listMaskGfx),
    )
    this.objects.push(this.listMaskGfx)

    let curY = 0
    rows.forEach(({ def, rowState }, i) => {
      const rowH = this.buildRow(this.listContainer, curY, def, rowState)

      if (i < rows.length - 1) {
        const divider = this.scene.add
          .rectangle(16, curY + rowH - 1, PANEL_W - 32, 1, COLOR.divider)
          .setOrigin(0, 0)
        this.listContainer.add(divider)
      }

      curY += rowH
    })

    this.listNaturalH = curY
    this.listScrollMax = Math.max(0, this.listNaturalH - listViewportH)

    this.objects.push(this.listContainer)

    if (this.listScrollMax > 0) {
      this.bindListScroll(panelLeft, listTop, listViewportH)
    }

    this.missionsScrollbar = new Scrollbar(this.scene, {
      x: cx + PANEL_W / 2 - 8,
      y: listTop,
      height: listViewportH,
      orientation: 'vertical',
    })
    this.missionsScrollbar.bar.setDepth(1010)
    this.updateMissionsScrollbar()
  }

  bindListScroll(panelLeft, listTop, listViewportH) {
    const listScrollMin = -this.listScrollMax
    this._missionsListDown = (pointer) => {
      if (pointer.x < panelLeft || pointer.x > panelLeft + PANEL_W) return
      if (pointer.y < listTop || pointer.y > listTop + listViewportH) return
      this.listDragStartY = pointer.y
      this.listScrollYAtDragStart = this.listScrollY
      this.missionsListDragging = true
    }
    this._missionsListMove = (pointer) => {
      if (!this.missionsListDragging) return
      if (!pointer.isDown) return
      const dy = pointer.y - this.listDragStartY
      this.listScrollY = Phaser.Math.Clamp(
        this.listScrollYAtDragStart - dy,
        listScrollMin,
        0,
      )
      this.applyMissionsListScroll()
    }
    this._missionsListUp = () => {
      this.missionsListDragging = false
    }
    this._missionsListWheel = (_pointer, _go, _dx, dy) => {
      if (this.listScrollMax <= 0) return
      const next = Phaser.Math.Clamp(this.listScrollY - dy, listScrollMin, 0)
      if (next !== this.listScrollY) {
        this.listScrollY = next
        this.applyMissionsListScroll()
      }
    }
    this.scene.input.on('pointerdown', this._missionsListDown)
    this.scene.input.on('pointermove', this._missionsListMove)
    this.scene.input.on('pointerup', this._missionsListUp)
    this.scene.input.on('wheel', this._missionsListWheel)
  }

  applyMissionsListScroll() {
    if (this.listContainer) {
      this.listContainer.y = this.listListTop + this.listScrollY
    }
    this.updateMissionsScrollbar()
  }

  updateMissionsScrollbar() {
    if (!this.missionsScrollbar) return
    const listViewportH = PANEL_H - LIST_TOP_OFFSET - LIST_BOTTOM_PAD
    this.missionsScrollbar.update(
      this.listScrollY,
      this.listScrollMax,
      listViewportH,
      this.listNaturalH,
    )
  }

  removeListScrollInput() {
    if (this._missionsListDown) {
      this.scene.input.off('pointerdown', this._missionsListDown)
      this.scene.input.off('pointermove', this._missionsListMove)
      this.scene.input.off('pointerup', this._missionsListUp)
      this.scene.input.off('wheel', this._missionsListWheel)
      this._missionsListDown = null
      this._missionsListMove = null
      this._missionsListUp = null
      this._missionsListWheel = null
    }
    this.missionsListDragging = false
  }

  buildRow(container, localY, def, rowState) {
    const iconX = 22
    const textX = 50

    // Render description first so we can measure its height and size the row.
    const desc = this.scene.add
      .text(textX, localY + ROW_PAD_V, def.description, {
        fontFamily: 'Georgia',
        fontSize: '13px',
        color: COLOR.brown,
        wordWrap: { width: 190 },
      })
      .setOrigin(0, 0)
    container.add(desc)

    const barX = textX
    const barY = localY + ROW_PAD_V + desc.height + 8
    const rowH = Math.max(ROW_H_MIN, ROW_PAD_V + desc.height + 8 + BAR_H + ROW_PAD_V)
    const rowMidY = localY + rowH / 2

    if (def.icon === COIN_EMOJI) {
      const coinSize = coinSizeForFont(20)
      const icon = this.scene.add
        .image(iconX, rowMidY, COIN_TEXTURE)
        .setDisplaySize(coinSize, coinSize)
        .setOrigin(0.5)
      container.add(icon)
    } else {
      const icon = this.scene.add
        .text(iconX, rowMidY, def.icon, { fontSize: '20px' })
        .setOrigin(0.5)
      container.add(icon)
    }

    const barBg = this.scene.add.graphics()
    barBg.fillStyle(COLOR.barBg, 1)
    barBg.fillRoundedRect(barX, barY, BAR_W, BAR_H, BAR_H / 2)
    container.add(barBg)

    const pct = Math.max(0, Math.min(1, rowState.progress / def.target))
    if (pct > 0) {
      const fillW = Math.max(BAR_H, Math.round(BAR_W * pct))
      const barFill = this.scene.add.graphics()
      barFill.fillStyle(COLOR.barFill, 1)
      barFill.fillRoundedRect(barX, barY, fillW, BAR_H, BAR_H / 2)
      container.add(barFill)
    }

    const progressText = this.scene.add
      .text(
        barX + BAR_W + 8,
        barY + BAR_H / 2,
        `${Math.min(rowState.progress, def.target)}/${def.target}`,
        {
          fontFamily: 'Georgia',
          fontSize: '11px',
          color: COLOR.muted,
        },
      )
      .setOrigin(0, 0.5)
    container.add(progressText)

    if (rowState.completed && !rowState.rewardClaimed) {
      this.buildClaimButton(container, localY, rowH, def.id)
    } else if (rowState.rewardClaimed) {
      const claimed = this.scene.add
        .text(PANEL_W - 18, rowMidY, '✓ Claimed', {
          fontFamily: 'Georgia',
          fontSize: '13px',
          color: COLOR.success,
        })
        .setOrigin(1, 0.5)
      container.add(claimed)
    }

    return rowH
  }

  buildClaimButton(container, localY, rowH, id) {
    const btnW = 80
    const btnH = 30
    const btnCx = PANEL_W - 16 - btnW / 2
    const btnCy = localY + rowH / 2

    const btn = createRoundedFillCentered(this.scene, btnCx, btnCy, btnW, btnH, COLOR.pink)
    btn.setInteractive(
      new Phaser.Geom.Rectangle(-btnW / 2, -btnH / 2, btnW, btnH),
      Phaser.Geom.Rectangle.Contains,
    )
    addPressEffect(this.scene, btn)
    btn.on('pointerdown', () => this.claimReward(this.activeTab, id))
    container.add(btn)

    const label = this.scene.add
      .text(btnCx, btnCy, 'Claim 🎁', {
        fontFamily: 'Georgia',
        fontSize: '13px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
    container.add(label)
  }

  claimReward(type, id) {
    const list =
      type === 'daily'
        ? this.save.missions.daily.goals
        : this.save.missions.milestones
    const item = list.find((i) => i.id === id)
    if (!item || !item.completed || item.rewardClaimed) return

    item.rewardClaimed = true
    const def =
      type === 'daily'
        ? DAILY_GOALS_POOL.find((g) => g.id === id)
        : MILESTONES.find((m) => m.id === id)
    if (def && def.reward) {
      if (def.reward.coins) this.save.coins += def.reward.coins
      if (def.reward.stars) this.save.totalStars += def.reward.stars
    }
    saveManager.save(this.save)

    playSfx(this.scene, 'sfx-levelup', 0.5, this.save)

    // Let the underlying scene re-render its HUD so the new coins/stars show.
    if (this.scene && typeof this.scene.refreshHud === 'function') {
      this.scene.refreshHud()
    }

    this.refresh()
  }

  // Tear down + rebuild in place so progress bars and Claim states stay current.
  refresh() {
    this.destroyObjects()
    this.open()
  }

  close() {
    this.destroyObjects()
    if (typeof this.options.onClose === 'function') {
      this.options.onClose()
    }
  }

  destroyObjects() {
    this.removeListScrollInput()
    if (this.missionsScrollbar) {
      this.missionsScrollbar.destroy()
      this.missionsScrollbar = null
    }
    this.listContainer = null
    this.listMaskGfx = null
    this.objects.forEach((o) => o.destroy())
    this.objects = []
  }
}

// HUD pill that opens the modal. Returns a small handle so the caller can
// trigger a badge refresh after gameplay events (e.g. fulfilling an order).
// Row 1: right edge at GAME.WIDTH - 8, vertically centered at y = 22.
export function attachGoalsButton(scene, save) {
  const w = 90
  const h = 32
  const rightX = GAME.WIDTH - 8
  const cy = 22
  const cx = rightX - w / 2

  // Rounded pill = visual + hit (center-anchored graphics).
  const bg = createRoundedFillCentered(scene, cx, cy, w, h, COLOR.pink, 0.9).setDepth(20)
  bg.setInteractive(
    new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h),
    Phaser.Geom.Rectangle.Contains,
  )
  addPressEffect(scene, bg)

  const label = scene.add
    .text(cx, cy, '🎯 Goals', {
      fontFamily: 'Georgia',
      fontSize: '12px',
      color: '#ffffff',
    })
    .setOrigin(0.5, 0.5)
    .setDepth(21)

  const badgeCx = cx + w / 2 - 2
  const badgeCy = cy - h / 2 + 2
  const badgeBg = scene.add.circle(badgeCx, badgeCy, 8, COLOR.badge).setDepth(22)
  const badgeText = scene.add
    .text(badgeCx, badgeCy, '!', {
      fontFamily: 'Georgia',
      fontSize: '10px',
      color: '#ffffff',
      fontStyle: 'bold',
    })
    .setOrigin(0.5)
    .setDepth(23)

  function refreshBadge() {
    const show = hasUnclaimedRewards(save)
    badgeBg.setVisible(show)
    badgeText.setVisible(show)
  }
  refreshBadge()

  bg.on('pointerdown', () => {
    const modal = new MissionsModal(scene, save, { onClose: refreshBadge })
    modal.open()
  })

  return { refreshBadge, bg, label, badgeBg, badgeText }
}
