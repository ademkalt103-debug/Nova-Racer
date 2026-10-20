# NOVA RACER — Rust Edition

The racing simulation, catalog, progression, tuning purchases, challenge claims,
crate draws/settlement and multiplayer client run in **Rust compiled to WebAssembly**.
The HTTP/WebSocket relay is Rust too. The original Three.js r160 procedural
vehicles, workshop, road materials, lighting/shadows, DOM layout and WebAudio
presentation are preserved as a local browser adapter. DOM events dispatch
validated actions to Rust; the display receives frozen state snapshots.
No browser adapter may purchase an upgrade, grant a reward, write authoritative
game state or run racing physics. No CDN, PeerJS or Node server is used in play.

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
retains the shared circuit race logic. The original sample-wrap lap rule, AI ranking and finish-counting semantics are preserved.

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
sample-wrap parity, host authority, capacity and cleanup.

For live tests, start the server on port 3123 (or set `NOVA_URL`):

```sh
node tools/protocol-test.cjs
node tools/browser-test.cjs
```

Protocol tests need Node 22+. Browser tests additionally need Playwright and a
Chromium browser in your test environment. `PLAYWRIGHT_MODULE` can name an
existing installed module; `CHROME_PATH` can name an existing Chrome executable.
No npm installation or third-party script executes automatically. The browser
test uses isolated contexts and ordinary DOM clicks/keys, captures screenshots, and
rejects page errors or third-party network requests.

For a full browser sprint with accelerated animation time (no state/position
injection), generate the reference road and run the additional browser test.
It thins intermediate GPU draws to accelerate the test, then renders the finish UI:

```sh
cargo run --quiet -p nova-core --example roads > evidence/roads.json
node tools/browser-race-test.cjs
```

The preceding protocol test creates the `evidence` directory. Its contents are
local test artifacts and are not committed. Screenshots and a summary of the
verified results are in [docs/VALIDATION.md](docs/VALIDATION.md).

## Implementation and compatibility

- `crates/core`: deterministic rules, typed catalog/save, spline/road sampling.
- `crates/client`: Rust UI action/state controller, physics and multiplayer client.
- `crates/server`: bounded HTTP/WebSocket relay with static-file allowlisting.
- `web`: local original presentation, pinned Three.js/fonts/CSS and the WASM host.
- `third_party`: renderer/font/style provenance, hashes and license notices.
- `legacy`: original sources retained for reference and save migration.

This is a browser Rust/WASM rewrite, not a native desktop executable. The first
software-rendered preview has been replaced by the original visual/audio
presentation: wedge bodies, specialty vehicle meshes, tuning-dependent parts,
workshop geometry, glass/metal materials, shadows, banking, wheel steering/spin,
nitro flames, smoke/skids, speed lines, camera presets/shake, SVG HUD, starter
cards, dealership delta previews and crate reel. Rust owns the underlying rules.
See [docs/EQUIVALENCE.md](docs/EQUIVALENCE.md) for deterministic comparisons and
their limits. Audio requires a user gesture; physical touch devices are unverified.

Legacy `novaRacerV6NextLevelSave` is imported when no Rust save exists. New writes
use `novaRacerRustSaveV1`; the old key is preserved. Unknown cars/tracks/modes and
invalid saves are normalized; network messages never write arbitrary DOM HTML
or load remote executable code. The archived full application is not served by the new
server. Catalog extraction is a literal-only parser and does not evaluate the
upstream application's code.

The repository's Apache-2.0 `LICENSE` is retained. Original catalog names and
legacy source attribution remain in place. See [SECURITY-REVIEW.md](SECURITY-REVIEW.md)
for the security review and its limits.

Presentation regeneration is an optional development operation, not a game
build prerequisite. `tools/equivalence-assets.cjs` extracts only display methods
from the reviewed original, rejects remaining state-write handlers and copies
the pinned renderer from an explicitly supplied `NOVA_STYLE_DEPS` directory.
Static CSS/fonts are committed with licenses/provenance. Normal Cargo builds
never install npm packages or run the historical stylesheet compiler.
