import { SAVE_KEY } from './constants.js'
import { createDefaultConsumables } from './data/consumables.js'

// Builds a fresh save object. Called whenever no save exists or reset() runs.
function createDefaultSave() {
  return {
    version: 1,
    coins: 150,
    shopLevel: 1,
    totalStars: 0,
    dailyOrdersFulfilled: 0,
    day: 1,
    unlockedFlowers: ['daisy', 'sunflower', 'tulip'],
    unlockedPlots: 4,
    garden: [],
    inventory: {},
    consumables: createDefaultConsumables(),
    orderBoard: [],
    orderBoardLastRefresh: Date.now(),
    orderBoardNeedsRefresh: false,
    shopStats: {
      totalCustomersServed: 0,
      totalOrdersFulfilled: 0,
      highestStarsInADay: 0,
    },
    seenCustomers: [],
    shopSession: null,
    tutorialComplete: false,
    tutorialStep: 0,
    ordersTooltipSeen: false,
    musicMuted: false,
    sfxMuted: false,
    missions: {
      daily: {
        lastReset: Date.now(),
        currentGoalIds: [],
        goals: [],
      },
      milestones: [
        { id: 'first_harvest', progress: 0, completed: false, rewardClaimed: false },
        { id: 'serve_10', progress: 0, completed: false, rewardClaimed: false },
        { id: 'unlock_seed', progress: 0, completed: false, rewardClaimed: false },
        { id: 'reach_level_3', progress: 0, completed: false, rewardClaimed: false },
        { id: 'fulfill_10_orders', progress: 0, completed: false, rewardClaimed: false },
        { id: 'expand_garden', progress: 0, completed: false, rewardClaimed: false },
      ],
    },
    lastPlayed: Date.now(),
  }
}

function getStorage() {
  if (typeof window === 'undefined' || !window.localStorage) return null
  return window.localStorage
}

// Loads an existing save or creates and persists a new one.
export function init() {
  const existing = load()
  if (existing) {
    ensureSaveShape(existing)
    save(existing)
    return existing
  }
  const fresh = createDefaultSave()
  save(fresh)
  return fresh
}

export function load() {
  const storage = getStorage()
  if (!storage) return null
  const raw = storage.getItem(SAVE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch (err) {
    console.warn('[saveManager] Failed to parse save, ignoring.', err)
    return null
  }
}

export function save(state) {
  const storage = getStorage()
  if (!storage) return
  state.lastPlayed = Date.now()
  storage.setItem(SAVE_KEY, JSON.stringify(state))
}

export function reset() {
  const storage = getStorage()
  if (storage) storage.removeItem(SAVE_KEY)
  const fresh = createDefaultSave()
  save(fresh)
  return fresh
}

function ensureSaveShape(state) {
  if (typeof state.dailyOrdersFulfilled !== 'number') {
    state.dailyOrdersFulfilled = 0
  }
  if (typeof state.orderBoardNeedsRefresh !== 'boolean') {
    state.orderBoardNeedsRefresh = false
  }
  if (!state.consumables) {
    state.consumables = createDefaultConsumables()
    return
  }

  const defaults = createDefaultConsumables()
  Object.keys(defaults).forEach((id) => {
    if (typeof state.consumables[id] !== 'number') {
      state.consumables[id] = defaults[id]
    }
  })
}

export default { init, load, save, reset }
