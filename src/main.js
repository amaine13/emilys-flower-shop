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

window.addEventListener('resize', () => {
  game.scale.resize(Math.min(window.innerWidth, MAX_WIDTH), window.innerHeight)
})
