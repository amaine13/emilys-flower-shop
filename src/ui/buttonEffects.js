/**
 * Subtle press animation on interactive buttons.
 * @param {Phaser.Scene} scene
 * @param {Phaser.GameObjects.GameObject} interactive — object that receives pointer events
 * @param {Phaser.GameObjects.GameObject} [scaleTarget] — visual to scale (defaults to interactive)
 */
export function addPressEffect(scene, interactive, scaleTarget) {
  const targets = scaleTarget ?? interactive

  const release = () => {
    scene.tweens.add({
      targets,
      scaleX: 1,
      scaleY: 1,
      alpha: 1,
      duration: 100,
      ease: 'Power1',
    })
  }

  interactive.on('pointerdown', () => {
    scene.tweens.add({
      targets,
      scaleX: 0.95,
      scaleY: 0.95,
      alpha: 0.9,
      duration: 80,
      ease: 'Power1',
    })
  })

  interactive.on('pointerup', release)
  interactive.on('pointerout', release)
}
