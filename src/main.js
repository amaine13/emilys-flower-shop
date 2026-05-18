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

const config = {
  type: Phaser.AUTO,
  width: GAME.WIDTH,
  height: GAME.HEIGHT,
  backgroundColor: GAME.BG_COLOR,
  parent: 'game-container',
  scale: {
    mode: Phaser.Scale.WIDTH_CONTROLS_HEIGHT,
    autoCenter: Phaser.Scale.NO_CENTER,
    width: GAME.WIDTH,
    height: GAME.HEIGHT,
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

new Phaser.Game(config)
