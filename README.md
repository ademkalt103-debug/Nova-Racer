# NOVA RACER — Rust Edition

The racing simulation, catalog, progression, tuning, challenges, crate rewards,
menus, 3D projection and drawing commands run in **Rust compiled to WebAssembly**.
The HTTP/WebSocket relay is Rust too. Small local JavaScript files provide the
browser's Canvas, keyboard/pointer, localStorage, audio and WebSocket APIs.
There is no JavaScript game engine, CDN, PeerJS or Node server in the active game.

## Build and play

Install stable Rust and the linker required by your platform. From the repository root:

```sh
rustup target add wasm32-unknown-unknown
cargo build --locked --release -p nova-client --target wasm32-unknown-unknown
```

Copy `target/wasm32-unknown-unknown/release/nova_client.wasm` to
`web/nova-client.wasm`, then run:

```sh
cargo run --locked -p nova-server
```

Open **http://127.0.0.1:3000**. On Unix `sh tools/build.sh` builds both release
targets and copies the WASM file. With Node 22+, `npm run build` does the same
without installing any npm dependencies. `npm start` starts the Rust server.
Node is optional for normal play/builds.

On Windows GNU Rust, add the MinGW `bin` directory to `PATH` for `gcc` and
`dlltool`, or use a Rust MSVC toolchain with Visual Studio C++ Build Tools.

Configuration: `PORT` defaults to `3000`, `HOST` to `127.0.0.1`, and
`NOVA_WEB_DIR` to `web`. Set `HOST=0.0.0.0` deliberately for LAN/hosting access.
The Render blueprint uses the [Rust runtime](https://render.com/docs/blueprint-spec#runtime)
and the same build steps. Hosting deployment is not part of the local tests.

## Controls and progression

- W/Up: throttle; S/Down: service brake, then reverse.
- A/D or Left/Right: steer; Space: handbrake/drift; Shift: nitro.
- C: cycle three camera positions; R: reset to the nearest road sample.
- P: pause/resume; Escape: garage; M: mute. Touch driving buttons are provided.
- Pick one of three $18000 starters from $25000, leaving $7000 for upgrades.
- Earn track cash, stunt cash, reputation XP and one free crate spin per finish.
- Four original tracks, fourteen original vehicles, twelve tuning categories,
  four upgrade stages, body/rim/neon colors, and six daily/career challenges.
- Daily challenges reset on the browser's local date; career progress persists.
- Crates use the original 40/30/16/7/5/2 reward weights and duplicate compensation.

The four existing modes are preserved: Circuit, Drift Attack, Sprint and Street
Duel. As in the upstream V6 client, Sprint uses one lap and the other modes use
three. Drift points are tracked and submitted for Drift Attack; Street Duel
retains the shared circuit race logic. Checkpoints and win counting correct
upstream shortcuts.

## Friend races

Both players open the **same server URL**. Choose a starter, open ONLINE,
connect the relay and create/join a shared room code. The host chooses track/mode
and starts from ONLINE. Up to eight drivers share start/configuration, vehicle
profiles, positions and chat. Remote cars interpolate separately from track
geometry. Host disconnect transfers ownership; empty rooms are removed.

The relay uses same-origin `/race` or `/ws`. HTTPS hosting automatically uses WSS.
These are private friend races: position reports, local saves and leaderboard
scores are **client reported**, not tournament-grade authoritative results.
Rooms and leaderboards are in memory and reset on restart, matching the original
server's persistence boundary.

## Tests

```sh
cargo test --locked --workspace
cargo fmt --all -- --check
cargo clippy --locked --workspace --all-targets -- -D warnings
cargo audit
```

The core integration driver completes all 16 track/mode combinations through
normal throttle/brake/steering input and checks single settlement. It does not
teleport or change laps. Unit tests cover economy, saves, crates, drift/nitro,
checkpoint protection, host authority, capacity and cleanup.

For live tests, start the server on port 3123 (or set `NOVA_URL`):

```sh
node tools/protocol-test.cjs
node tools/browser-test.cjs
```

Protocol tests need Node 22+. Browser tests additionally need Playwright and a
Chromium browser in your test environment. `PLAYWRIGHT_MODULE` can name an
existing installed module; `CHROME_PATH` can name an existing Chrome executable.
No npm installation or third-party script executes automatically. The browser
test uses isolated contexts and ordinary clicks/keys, captures screenshots, and
rejects page errors or third-party network requests.

For a full browser sprint with accelerated animation time (no state/position
injection), generate the reference road and run the additional browser test:

```sh
cargo run --quiet -p nova-core --example roads > evidence/roads.json
node tools/browser-race-test.cjs
```

The preceding protocol test creates the `evidence` directory. Its contents are
local test artifacts and are not committed. Screenshots and a summary of the
verified results are in [docs/VALIDATION.md](docs/VALIDATION.md).

## Implementation and compatibility

- `crates/core`: deterministic rules, typed catalog/save, spline/road sampling.
- `crates/client`: Rust UI, software 3D renderer, physics and multiplayer client.
- `crates/server`: bounded HTTP/WebSocket relay with static-file allowlisting.
- `web`: local browser host/loader and compiled WASM (generated, not committed).
- `legacy`: original sources retained for reference and save migration.

This is a browser Rust/WASM rewrite, not a native desktop executable. Rendering
uses locally drawn flat-shaded geometry rather than Three.js materials/shadows;
the UI and procedural audio are reimplemented, not pixel/audio-identical. The
keyboard layout is designed for desktop and landscape play. Audio requires
a browser user gesture. Physical touch devices have not been certified.

Legacy `novaRacerV6NextLevelSave` is imported when no Rust save exists. New writes
use `novaRacerRustSaveV1`; the old key is preserved. Unknown cars/tracks/modes and
invalid saves are normalized; network messages never write arbitrary DOM HTML
or load remote executable code. The archived HTML is not served by the new
server. Catalog extraction is a literal-only parser and does not evaluate the
upstream application's code.

The repository's Apache-2.0 `LICENSE` is retained. Original catalog names and
legacy source attribution remain in place. See [SECURITY-REVIEW.md](SECURITY-REVIEW.md)
for the security review and its limits.
