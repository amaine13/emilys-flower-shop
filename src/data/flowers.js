export const FLOWERS = [
  // Tier 1 — unlocked from Day 1
  { id: 'daisy', name: 'Daisy', tier: 1, growTimeMs: 10000, seedCost: 5, sellPrice: 15, unlockLevel: 1, sprite: 'flower-daisy', potSprite: 'flower-pot-red' },
  { id: 'sunflower', name: 'Sunflower', tier: 1, growTimeMs: 10000, seedCost: 8, sellPrice: 22, unlockLevel: 1, sprite: 'flower-sunflower', potSprite: 'flower-pot-red' },
  { id: 'tulip', name: 'Tulip', tier: 1, growTimeMs: 10000, seedCost: 10, sellPrice: 28, unlockLevel: 1, sprite: 'flower-tulip', potSprite: 'flower-pot-red' },
  // Tier 2 — unlock at Shop Level 2
  { id: 'rose', name: 'Rose', tier: 2, growTimeMs: 12000, seedCost: 20, sellPrice: 55, unlockLevel: 2, sprite: 'flower-rose', potSprite: 'flower-pot-red' },
  { id: 'lavender', name: 'Lavender', tier: 2, growTimeMs: 12000, seedCost: 18, sellPrice: 50, unlockLevel: 2, sprite: 'flower-lavender', potSprite: 'flower-pot-red' },
  { id: 'carnation', name: 'Carnation', tier: 2, growTimeMs: 12000, seedCost: 22, sellPrice: 60, unlockLevel: 2, sprite: 'flower-carnation', potSprite: 'flower-pot-red' },
  // Tier 3 — unlock via special orders
  { id: 'peony', name: 'Peony', tier: 3, growTimeMs: 14000, seedCost: 50, sellPrice: 130, unlockLevel: 4, sprite: 'flower-peony', potSprite: 'flower-pot-red' },
  { id: 'ranunculus', name: 'Ranunculus', tier: 3, growTimeMs: 14000, seedCost: 55, sellPrice: 140, unlockLevel: 4, sprite: 'flower-ranunculus', potSprite: 'flower-pot-red' },
  { id: 'anemone', name: 'Anemone', tier: 3, growTimeMs: 14000, seedCost: 45, sellPrice: 120, unlockLevel: 4, sprite: 'flower-anemone', potSprite: 'flower-pot-red' },
  // Tier 4 — exotic/seasonal
  { id: 'protea', name: 'Protea', tier: 4, growTimeMs: 16000, seedCost: 100, sellPrice: 250, unlockLevel: 7, sprite: 'flower-protea', potSprite: 'flower-pot-red' },
  { id: 'dahlia', name: 'Black Dahlia', tier: 4, growTimeMs: 16000, seedCost: 120, sellPrice: 280, unlockLevel: 7, sprite: 'flower-dahlia', potSprite: 'flower-pot-red' },
  { id: 'sweetheart', name: 'Sweetheart Rose', tier: 4, growTimeMs: 16000, seedCost: 60, sellPrice: 180, unlockLevel: 9, sprite: 'flower-sweetheart', potSprite: 'flower-pot-red' },
  { id: 'holly', name: 'Holly Sprig', tier: 4, growTimeMs: 16000, seedCost: 40, sellPrice: 100, unlockLevel: 9, sprite: 'flower-holly', potSprite: 'flower-pot-red' },
]

export function getFlowerById(id) {
  return FLOWERS.find((f) => f.id === id) || null
}

export function getUnlockedFlowers(unlockedIds) {
  return FLOWERS.filter((f) => unlockedIds.includes(f.id))
}
