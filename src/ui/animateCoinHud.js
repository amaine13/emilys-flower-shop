export function animateCoinHud(scene, fromValue, toValue) {
  if (scene._coinCountTween) {
    scene._coinCountTween.stop()
    scene._coinCountTween = null
  }

  const counter = { value: fromValue }
  scene._coinCountTween = scene.tweens.add({
    targets: counter,
    value: toValue,
    duration: 500,
    ease: 'Cubic.easeOut',
    onUpdate: () => scene.hudCoins.setText(`${Math.round(counter.value)}`),
    onComplete: () => {
      scene.hudCoins.setText(`${toValue}`)
      scene._coinCountTween = null
    },
  })

  if (toValue > fromValue && scene.hudCoinIcon) {
    scene.tweens.killTweensOf(scene.hudCoinIcon)
    const sx = scene.hudCoinIcon.scaleX
    const sy = scene.hudCoinIcon.scaleY
    scene.tweens.add({
      targets: scene.hudCoinIcon,
      scaleX: sx * 1.6,
      scaleY: sy * 1.6,
      duration: 130,
      yoyo: true,
      ease: 'Back.easeOut',
      onComplete: () => scene.hudCoinIcon.setDisplaySize(18, 18),
    })
  }
}
