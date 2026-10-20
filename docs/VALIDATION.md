# Local validation

Tested on Windows x64 with Rust 1.97.0, a GNU linker, and Chromium through
Playwright. Both release targets build: `nova-server` and the `wasm32-unknown-unknown`
client. The generated WASM is approximately 540 KB and is built from source;
no opaque game executable is supplied in the PR.

| Check | Result |
|---|---|
| `cargo test --locked --workspace` | 11 tests passed |
| Core automated driver | All 16 track/mode combinations completed |
| `cargo fmt --all -- --check` | Passed |
| `cargo clippy --locked --workspace --all-targets -- -D warnings` | Passed |
| Release Rust server and WASM build | Passed |
| `cargo audit` | 0 vulnerabilities, no informational warnings |
| Live HTTP/WebSocket protocol | 14 checks passed |
| Ordinary browser UI/input/multiplayer | 10 checks passed |
| Full browser sprint | Finished in 60.27 seconds of simulated time |
| Finish settlement | $14250 including stunts; 593 XP; 1 free spin; no duplicate award |
| Original visual equivalence | Twelve pixel-identical deterministic comparisons; see EQUIVALENCE.md |
| Original gameplay differential | 92 scenarios / 194368 native frames; 72 scenarios / 191484 WASM frames passed |
| Browser network observations | Local game server only; no external executable assets |
| Browser exceptions | None in the tested scenarios |

The full browser sprint accelerates the animation clock while dispatching normal
keyboard events. It does not inject a finish flag, modify positions or change
the save. It thins intermediate GPU draws (one in 30) to accelerate simulation,
then renders the original finish UI and checks localStorage. The separate
ordinary-input test renders every frame and exercises visible driving effects.
The separate core driver also uses only normal throttle/brake/steering input.
The two-player check uses independent browser contexts, room creation/join,
host start and visible remote state in each client. Eight-player capacity is
verified at the protocol layer; eight simultaneous human players were not tested.

## Screenshots

Garage and the original track catalog:

![Rust garage](screenshots/garage.png)

Rust-driven race with the original 3D presentation and normal keyboard driving:

![Rust race](screenshots/race.png)

Finish screen after the browser driver completes a sprint:

![Finished sprint](screenshots/race-finish.png)

These are automated local tests. Maintainer acceptance, production hosting,
physical devices, a human playtest and bounty payment are not implied by them.
The original visual/audio presentation is retained through a local browser
adapter while game-state transitions remain in Rust. Documented intentional
differences are the local relay lobby, host authority, input/save bounds and optional pause/reset controls.
