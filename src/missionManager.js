import { DAILY_GOALS_POOL, MILESTONES } from './data/missions.js'
import * as saveManager from './saveManager.js'

// Single entry point for gameplay → mission state. Call from a scene whenever a
// tracked action happens and the manager will update daily goals + milestones in
// one shot, then persist.
export function track(save, action, value = 1) {
  ensureMissionsShape(save)

  const daily = save.missions.daily
  if (action === 'harvest') updateGoalsByAction(daily, 'harvest', value)
  if (action === 'serve_customer') updateGoalsByAction(daily, 'serve_customer', value)
  if (action === 'fulfill_order') updateGoalsByAction(daily, 'fulfill_order', value)
  if (action === 'earn_coins') updateGoalsByAction(daily, 'earn_coins', value)
  if (action === 'plant') updateGoalsByAction(daily, 'plant', value)
  if (action === 'get_tip') updateGoalsByAction(daily, 'get_tip', value)
  if (action === 'plant_tier2') updateGoal(daily, 'plant_tier2', value)
  if (action === 'plant_tier3') updateGoal(daily, 'grow_tier3', value)
  if (action === 'earn_stars') updateGoalSet(daily, 'earn_4stars', value)
  if (action === 'harvest_all_plots') updateGoal(daily, 'harvest_all_plots', value)
  if (action === 'inventory_count') updateGoalsByActionSet(daily, 'inventory_count', value)
  if (action === 'inventory_types') updateGoalsByActionSet(daily, 'inventory_types', value)
  if (action === 'serve_streak') updateGoalsByActionSet(daily, 'serve_streak', value)
  if (action === 'quick_fulfill') updateGoalsByAction(daily, 'quick_fulfill', value)
  if (action === 'big_order') updateGoalsByAction(daily, 'big_order', value)
  if (action === 'big_delivery') updateGoalsByAction(daily, 'big_delivery', value)
  if (action === 'tier3_order') updateGoalsByAction(daily, 'tier3_order', value)
  if (action === 'spend_coins') updateGoalsByAction(daily, 'spend_coins', value)
  if (action === 'buy_consumable') updateGoalsByAction(daily, 'buy_consumable', value)

  if (action === 'plant' || action === 'harvest' || action === 'serve_customer') {
    if (!daily.doneToday) daily.doneToday = {}
    const d = daily.doneToday
    if (action === 'plant') d.planted = true
    if (action === 'harvest') d.harvested = true
    if (action === 'serve_customer') d.served = true
    if (d.planted && d.harvested && d.served) {
      updateGoalSet(daily, 'plant_harvest_serve', 3)
    }
  }

  const milestones = save.missions.milestones
  if (action === 'harvest') updateMilestone(milestones, 'first_harvest', value)
  if (action === 'serve_customer') updateMilestone(milestones, 'serve_10', value)
  if (action === 'fulfill_order') updateMilestone(milestones, 'fulfill_10_orders', value)
  if (action === 'unlock_seed') updateMilestone(milestones, 'unlock_seed', value)
  if (action === 'expand_garden') updateMilestone(milestones, 'expand_garden', value)

  saveManager.save(save)
}

export function generateDailyGoals(save) {
  ensureMissionsShape(save)
  const pool = [...DAILY_GOALS_POOL]
  const selected = []
  while (selected.length < 4 && pool.length > 0) {
    const idx = Math.floor(Math.random() * pool.length)
    selected.push(pool.splice(idx, 1)[0])
  }
  save.missions.daily.goals = selected.map((g) => ({
    id: g.id,
    progress: 0,
    completed: false,
    rewardClaimed: false,
  }))
  save.missions.daily.lastReset = Date.now()
  save.missions.daily.currentGoalIds = selected.map((g) => g.id)
  save.missions.daily.doneToday = {}
}

function updateGoalsByAction(daily, action, value) {
  daily.goals.forEach((goal) => {
    if (goal.completed) return
    const def = DAILY_GOALS_POOL.find((g) => g.id === goal.id)
    if (!def || def.action !== action) return
    const target = def.target
    goal.progress = clampValue(goal.progress + value, 0, target)
    if (goal.progress >= target) goal.completed = true
  })
}

function updateGoalsByActionSet(daily, action, value) {
  daily.goals.forEach((goal) => {
    if (goal.completed) return
    const def = DAILY_GOALS_POOL.find((g) => g.id === goal.id)
    if (!def || def.action !== action) return
    const target = def.target
    goal.progress = clampValue(Math.max(goal.progress, value), 0, target)
    if (goal.progress >= target) goal.completed = true
  })
}

function updateGoal(daily, id, value) {
  const goal = daily.goals.find((g) => g.id === id)
  if (!goal || goal.completed) return
  const target = getTarget(id)
  goal.progress = clampValue(goal.progress + value, 0, target)
  if (goal.progress >= target) goal.completed = true
}

function updateGoalSet(daily, id, value) {
  const goal = daily.goals.find((g) => g.id === id)
  if (!goal || goal.completed) return
  const target = getTarget(id)
  goal.progress = clampValue(Math.max(goal.progress, value), 0, target)
  if (goal.progress >= target) goal.completed = true
}

function clampValue(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function updateMilestone(milestones, id, value) {
  const m = milestones.find((mi) => mi.id === id)
  if (!m || m.completed) return
  const target = getTarget(id, true)
  // expand_garden tracks the player's absolute plot count, not a delta.
  if (id === 'expand_garden') {
    m.progress = Math.min(Math.max(m.progress, value), target)
  } else {
    m.progress = Math.min(m.progress + value, target)
  }
  if (m.progress >= target) m.completed = true
}

function getTarget(id, isMilestone = false) {
  const list = isMilestone ? MILESTONES : DAILY_GOALS_POOL
  const def = list.find((g) => g.id === id)
  return (def && def.target) || 1
}

// Ensures new saves / first visit have daily goals; resets happen in EndOfDayScene.
export function resetDailyGoals(save) {
  ensureMissionsShape(save)
  if (save.missions.daily.goals.length === 0) {
    generateDailyGoals(save)
    saveManager.save(save)
  }
}

// Convenience milestone: reach_level_3 isn't a "delta" action so we check the
// current shopLevel value whenever it might have changed.
export function checkLevelMilestone(save) {
  ensureMissionsShape(save)
  const m = save.missions.milestones.find((mi) => mi.id === 'reach_level_3')
  if (!m || m.completed) return
  if (save.shopLevel >= 3) {
    m.progress = save.shopLevel
    m.completed = true
    saveManager.save(save)
  }
}

// True if any daily goal or milestone is completed but its reward is unclaimed.
// Used by the HUD goals button to show its red "!" badge.
export function hasUnclaimedRewards(save) {
  ensureMissionsShape(save)
  const daily = save.missions.daily.goals.some(
    (g) => g.completed && !g.rewardClaimed,
  )
  const milestone = save.missions.milestones.some(
    (m) => m.completed && !m.rewardClaimed,
  )
  return daily || milestone
}

function ensureMissionsShape(save) {
  if (!save.missions) {
    save.missions = {
      daily: {
        lastReset: Date.now(),
        currentGoalIds: [],
        goals: [],
        doneToday: {},
      },
      milestones: MILESTONES.map((m) => ({
        id: m.id,
        progress: 0,
        completed: false,
        rewardClaimed: false,
      })),
    }
    return
  }

  if (!save.missions.daily) {
    save.missions.daily = {
      lastReset: Date.now(),
      currentGoalIds: [],
      goals: [],
      doneToday: {},
    }
  }
  if (!Array.isArray(save.missions.daily.goals)) {
    save.missions.daily.goals = []
  }
  if (!Array.isArray(save.missions.daily.currentGoalIds)) {
    save.missions.daily.currentGoalIds = save.missions.daily.goals.map((g) => g.id)
  }
  if (!save.missions.daily.doneToday) {
    save.missions.daily.doneToday = {}
  }
  if (!save.missions.milestones) {
    save.missions.milestones = MILESTONES.map((m) => ({
      id: m.id,
      progress: 0,
      completed: false,
      rewardClaimed: false,
    }))
  }
}
