const FADE_MS = 250

export function fadeToScene(scene, key, data) {
  if (scene._fadingOut) return
  scene._fadingOut = true
  scene.input.enabled = false
  scene.cameras.main.fadeOut(FADE_MS, 0, 0, 0)
  scene.cameras.main.once('camerafadeoutcomplete', () => {
    scene.scene.start(key, data)
  })
}

export function fadeInScene(scene) {
  scene._fadingOut = false
  scene.cameras.main.fadeIn(FADE_MS, 0, 0, 0)
}
