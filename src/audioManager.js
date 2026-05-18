import Phaser from 'phaser'

// Tiny module-level audio helper. Background music is a single keyed sound on
// the scene Sound Manager (Phaser keeps it across scene.start when the key
// stays registered). Use sound.get('music-bg') before add() so it never duplicates.
//
// Music and SFX are controlled independently:
//   save.musicMuted -> gates playBgMusic + pause/resume of the track
//   save.sfxMuted   -> gates every playSfx() call site

export function playBgMusic(scene, save) {
  if (save && save.musicMuted) return
  if (!scene || !scene.sound) return
  if (!scene.cache.audio.exists('music-bg')) return
  try {
    let music = scene.sound.get('music-bg')
    if (!music) {
      music = scene.sound.add('music-bg', { loop: true, volume: 0.35 })
      music.play()
      return
    }
    if (music.isPaused) {
      music.resume()
      return
    }
    if (!music.isPlaying) {
      music.play()
    }
  } catch (e) {
    // Audio context might be locked until first user gesture; ignored silently.
  }
}

// Toggle wrapper used by the music HUD button. Handles all three cases:
// mute → pause; unmute with existing track → resume; unmute with no track yet
// (e.g. game booted muted) → create + play.
export function setMusicMuted(muted, scene, save) {
  const music = scene?.sound?.get?.('music-bg')
  if (muted) {
    if (music && music.isPlaying) music.pause()
    return
  }
  if (music && music.isPaused) {
    try {
      music.resume()
    } catch (e) {
      // ignored
    }
    return
  }
  if (!music) playBgMusic(scene, save)
}

export function playSfx(scene, key, volume = 0.6, save) {
  if (!scene || !scene.sound) return
  if (save && save.sfxMuted) return
  if (!scene.cache.audio.exists(key)) return
  try {
    scene.sound.play(key, { volume })
  } catch (e) {
    // Silently fail if the audio isn't loaded yet or the context is locked.
  }
}

// Single HUD mute toggle at the top-left: 🔊 when audio is on, 🔇 when muted.
// One tap flips both save.musicMuted and save.sfxMuted together so the player
// has a single conceptual on/off switch. Plain Text + invisible 32×32 hit rect
// (no pill, no background). `hudCy` must match the coin row (same y as 🪙 text).
// Returns { label } for teardown lists.
export function attachMuteButton(scene, save, saveManager, hudCy) {
  const HIT_W = 32
  const HIT_H = 32
  const isMuted = () => !!save.musicMuted

  const label = scene.add
    .text(12, hudCy, isMuted() ? '🔇' : '🔊', {
      fontFamily: 'Georgia',
      fontSize: '16px',
      color: '#ffffff',
    })
    .setOrigin(0, 0.5)
    .setDepth(20)
  label.setInteractive(
    new Phaser.Geom.Rectangle(0, -HIT_H / 2, HIT_W, HIT_H),
    Phaser.Geom.Rectangle.Contains,
  )
  label.on('pointerdown', () => {
    const next = !isMuted()
    save.musicMuted = next
    save.sfxMuted = next
    saveManager.save(save)
    label.setText(next ? '🔇' : '🔊')
    setMusicMuted(next, scene, save)
  })

  return { label }
}
