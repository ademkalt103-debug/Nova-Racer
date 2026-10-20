# Security review of the Rust rewrite

## Scope and result

Reviewed the repository snapshot `42a8aa98e19903d745b760ddac1a2c2b96d1c179`,
the new Rust/browser code, package/build commands and the locked dependency
inventory. No malicious payload, credential harvesting, persistence installer,
shell downloader or hidden process launcher was identified in that review.
This is an evidence-bounded review, not a guarantee that any software is free
of vulnerabilities or supply-chain compromise.

The archived application loaded Tailwind, Three.js and PeerJS from CDNs and
used external PeerJS signaling. The active rewrite serves all executable assets
locally. Real Chromium tests observed only the local game server, including two
multiplayer clients. Archived executable sources are not served by the new
server. Catalog data was extracted with a literal parser, without `eval` or
executing the upstream HTML/JavaScript.

## Dependency checks

- `Cargo.lock` pins registry package versions and checksums. The final Cargo
  metadata inventory contains 85 packages including workspace/target-specific
  packages. There are no git dependency sources or npm runtime dependencies.
- `cargo audit` reported **zero vulnerabilities and no informational warnings**
  with advisory database commit
  `e6f94f3760d5e6c54c1b05f204002263bc025524`.
- An initially evaluated graphics library had RustSec soundness warnings. It
  and its graphics/font dependency tree were removed entirely from the final
  lockfile; the client uses its own Rust projection/raster drawing commands.
- Dependency custom build scripts were inventoried and hashed. Compiler-version
  and feature probes, generated files in Cargo output directories and expected
  target-specific linking were inspected. The inventory is not an exhaustive
  audit of every dependency's source or procedural macro expansion.
- The optional Node build helper uses fixed `rustup`/`cargo` argument arrays,
  `shell:false`, checks each exit status and copies only the built WASM asset.
  There are no preinstall/postinstall lifecycle hooks or downloaded scripts.

Microsoft Defender completed a custom scan of this checkout. Operational events
1000 and 1001 share scan ID `AA60C95B-090E-4516-BA7A-75E6F2324EEF`; the start
event names this checkout and the completion event records a 10-second scan.
No threat detection for this path was returned, and no detection event appeared
in the captured scan window. This records a scan result, not a malware-free
certification or a scan of every previously installed tool on the computer.

## Runtime boundaries tested

- Loopback bind by default; public/LAN binding requires `HOST` configuration.
- Explicit allowlist of browser assets; source, dotfiles and traversal attempts
  return 404. HTTP JSON bodies are limited to 8192 bytes; WebSocket frames and
  messages to 32768 bytes.
- Same-origin browser WebSocket checks; restrictive CSP, no-referrer, nosniff
  and frame denial headers. The client contains no dynamic evaluation or
  peer-provided HTML insertion.
- Eight players per room, 500 rooms, 20 connections per peer IP and a global
  connection limit. The peer IP comes from the actual socket, not an untrusted
  `X-Forwarded-For` header. Reverse proxies therefore need appropriate edge
  limits; several users behind one proxy can share this conservative limit.
- 65 messages/second per connection, bounded outbound queues and heartbeat
  cleanup. Numeric state is clamped, identity is socket-bound, strings/colors
  are sanitized and tuning parts are whitelisted.
- Only the room host may configure/start a race. Host departure transfers
  ownership and empty rooms are deleted.
- Ordered lap checkpoints prevent start-line oscillation rewards. Finish
  settlement is idempotent; progression cannot claim a challenge twice.

These protections are covered by unit/integration tests plus 14 live protocol
checks. Browser tests cover persistence, upgrades, keyboard driving/drift/nitro,
pause/reset, two-player start/state rendering and network-origin observations.
A separate browser test completes a full sprint using normal keyboard events
and accelerated animation time, verifies the finish UI/save and checks that
continued frames cannot award twice. The core driver completes all 16 track
and mode combinations. Automated play is not a human playtest.

## Remaining limits

Private rooms, scores and saves remain client reported. This rewrite does not
establish anti-cheat, authenticated accounts, persistent leaderboards, production
load capacity, internet hosting acceptance or physical-device input proof.
WASM FFI contains small documented `unsafe` blocks for synchronous borrowed
buffers; Rust's type system does not replace validation of the JS host boundary.
Audio/visual fidelity differs from Three.js as documented in the README.
