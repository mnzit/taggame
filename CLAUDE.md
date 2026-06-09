# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A serverless, multiplayer browser game of tag. One device is the **host** (renders the game on a big screen / laptop) and phones act as **wireless gamepads**. There is no backend, build step, or package manager — it's plain HTML + vanilla JS loading libraries from CDNs.

## Running / developing

- Open `index.html` over HTTP (not `file://`, since camera/getUserMedia and WebRTC require a secure context). Any static server works, e.g. `python3 -m http.server 8000` then visit `http://localhost:8000`.
- For phone-as-controller testing across devices, host and phones must reach each other — the WebRTC connection uses only Google STUN servers (no TURN), so it generally requires being on the **same WiFi/LAN** (see `RTC_CONFIG` in `js/net.js`). Cross-network NAT traversal will often fail.
- Desktop-only testing: use the "ADD LOCAL" button in the lobby to add keyboard players (P1 = WASD + Space/Shift-sneak, P2 = Arrows + ArrowUp). No phone needed.
- Script tags in `index.html` are cache-busted with `?v=N` query strings — bump the version when changing JS if a browser caches aggressively.

## Connection model (the non-obvious part)

There is **no signaling server**. WebRTC offer/answer SDP is exchanged entirely through **QR codes scanned by device cameras**, implemented in `js/net.js`:

1. SDP is JSON → `pako.deflate` (gzip) → custom **Base45** encoding (`b45encode`/`b45decode`, alphanumeric so it packs densely into QR) → rendered as an alphanumeric QR (`packSDP`/`unpackSDP`).
2. Host generates an **offer** QR; phone scans it, produces an **answer** QR; host scans that back. `waitIce` blocks on ICE gathering (with a 3.5s timeout) so the SDP is fully-formed before encoding — this is "non-trickle" ICE.
3. Once the `RTCDataChannel` ('ctrl') opens, the phone sends `{a:'name'|'move'|'jump'}` messages and the host sends `{a:'welcome'|'start'}`. All gameplay state lives on the host; phones are dumb input devices.

`peers` maps a slot number → `{pc, dc, connected, name}`. `markSlotConnected` is the bridge that tells `window.gameEngine` to add/remove a player when a data channel opens/closes.

## Architecture

Three scripts, loaded in this order (order matters — globals are referenced across files):

- **`js/net.js`** — WebRTC, QR signaling, Base45/SDP codec, host lobby DOM (`updateHostLobby`), and the global `peers`/`maxPlayers`. Owns both host-side pairing and phone-side joining. `broadcastToControllers` / `cvSend` are the two send paths.
- **`js/controller.js`** — Phone-only UI: virtual joystick (nipplejs), jump button, fullscreen + landscape lock. Translates touch/keyboard into `cvSend({a:'move'|'jump'})`. Also has keyboard fallbacks so a controller can be driven from a desktop browser for testing.
- **`js/game.js`** — Everything host-side: the `GameEngine` (single `requestAnimationFrame` loop, fixed-timestep-ish physics, AABB platform collision, tag logic, day/night cycle, weather, power-ups, fog/darkness vision overlays), a `drawCharacter` procedural sprite renderer, the `SoundEngine` (all SFX synthesized live via Web Audio oscillators — no audio files), and the local-player / keyboard handling. Exposes `window.gameEngine` and `window.soundEngine`.

Communication is one-directional for gameplay: **phone input → host `GameEngine.handlePlayerMove/handlePlayerJump`**. The host never sends positions back; nothing is rendered on the phone.

### GameEngine notes

- Player IDs are either a numeric **slot** (remote phone) or the strings `'local1'`/`'local2'` (keyboard/touch host players). Code distinguishes them with `id.toString().startsWith('local')` and `typeof id === 'number'`.
- The map is **regenerated on every resize** (`resize` → `loadMap`) because platform layout is procedural and screen-relative. `GAME_MAPS` is a registry keyed by id; add a map by adding an object with a `build(w,h)` returning `{platforms, decorations}` (or a bare platforms array). Platforms may be flagged `isCollapsible` and cycle through `normal → flashing → crumbled → normal`.
- `this.scale` (≈0.8 touch / 1.2 desktop) multiplies sprite size, vision radii, particle velocities, and many distances — keep new gameplay distances scaled by it for consistency across devices.
- Tag rules: first player to join is `itPlayerId`; on a collision the IT player tags the other, who is stunned 1.5s, a 2s `tagCooldown` blocks re-tagging, and the 30s `roundTimer` resets. If the timer hits 0, whoever is IT loses.
- Rendering layers in `draw()` are order-dependent (sky/celestial → mountains → footprints → decorations → platforms → players → power-ups → particles → weather → fog → darkness/lantern). Screen shake wraps the world layers in a `save/restore` translate.

## graphify

This project has a graphify knowledge graph at `graphify-out/`. Per the user's global instructions: before answering architecture questions, prefer reading `graphify-out/GRAPH_REPORT.md` / `graphify-out/wiki/index.md` if present, and run `graphify update .` after modifying code files to keep the graph current.
