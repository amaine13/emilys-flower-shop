/** Consumables sold on the Upgrades screen (Emily's Tools). */
export const CONSUMABLES = [
  {
    id: 'instantBloom',
    icon: '⚡',
    name: 'Instant Bloom',
    description: 'One plot blooms instantly',
    packSize: 3,
    price: 500,
  },
  {
    id: 'harvestAll',
    icon: '🌿',
    name: 'Harvest All',
    description: 'Harvest all ready plots at once',
    packSize: 3,
    price: 250,
  },
  {
    id: 'plantAll',
    icon: '🌱',
    name: 'Plant All',
    description: 'Plant same seed on all empty plots',
    packSize: 3,
    price: 350,
  },
]

/** Walk-in shop only (not listed on Upgrades). */
export const SHOP_CONSUMABLES = [
  {
    id: 'salesRush',
    icon: '💰',
    name: 'Sales Rush',
    description: 'Next 5 customers pay double',
    packSize: 2,
    price: 400,
  },
  {
    id: 'luckyDay',
    icon: '✨',
    name: 'Lucky Day',
    description: 'Tips guaranteed for all customers',
    packSize: 2,
    price: 450,
  },
]

export const GARDEN_CONSUMABLES = CONSUMABLES

export function createDefaultConsumables() {
  const defs = [...CONSUMABLES, ...SHOP_CONSUMABLES]
  return defs.reduce((state, item) => {
    state[item.id] = 0
    return state
  }, {})
}
