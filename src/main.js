import Phaser from 'phaser'
import { GAME } from './constants.js'
import PreloadScene from './scenes/PreloadScene.js'
import TitleScene from './scenes/TitleScene.js'
import GardenScene from './scenes/GardenScene.js'
import ShopScene from './scenes/ShopScene.js'
import EndOfDayScene from './scenes/EndOfDayScene.js'
import UpgradeScene from './scenes/UpgradeScene.js'
import OrderScene from './scenes/OrderScene.js'
import TutorialScene from './scenes/TutorialScene.js'

const MAX_WIDTH = 480

const config = {
  type: Phaser.AUTO,
  backgroundColor: GAME.BG_COLOR,
  resolution: window.devicePixelRatio || 2,
  parent: 'game-container',
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: Math.min(window.innerWidth, MAX_WIDTH),
    height: window.innerHeight,
  },
  input: {
    activePointers: 3,
  },
  scene: [
    PreloadScene,
    TitleScene,
    TutorialScene,
    GardenScene,
    ShopScene,
    EndOfDayScene,
    UpgradeScene,
    OrderScene,
  ],
}

const game = new Phaser.Game(config)

// On mobile, window.innerWidth/Height are not reliable the instant a resize
// or orientationchange fires — the browser needs time to settle. We debounce
// both events and give orientationchange a longer delay so iOS/Android have
// finished updating their layout before we commit the new canvas size.
let _resizeTimer = null

function applyResize() {
  game.scale.resize(Math.min(window.innerWidth, MAX_WIDTH), window.innerHeight)
}

function scheduleResize(delayMs) {
  clearTimeout(_resizeTimer)
  _resizeTimer = setTimeout(applyResize, delayMs)
}

// Regular resize (browser chrome show/hide, keyboard, etc.) — short debounce.
window.addEventListener('resize', () => scheduleResize(200))

// orientationchange fires before resize on mobile; claim the slot with a
// longer delay so the subsequent resize event doesn't shorten it.
window.addEventListener('orientationchange', () => scheduleResize(400))
