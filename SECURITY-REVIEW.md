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
multiplayer clients. The archived full application is not served by the production
server. Catalog data was extracted with a literal parser, without `eval` or
executing the upstream HTML/JavaScript.

## Dependency checks

- `Cargo.lock` pins registry package versions and checksums. The final Cargo
  metadata inventory contains 85 packages including workspace/target-specific
  packages. There are no git dependency sources. No npm install runs during
  build/play; Three.js r160 is a pinned, vendored browser rendering dependency.
- `cargo audit` reported **zero vulnerabilities and no informational warnings**
  with advisory database commit
  `e6f94f3760d5e6c54c1b05f204002263bc025524`.
- An initially evaluated graphics library had RustSec soundness warnings. It
  and its graphics/font dependency tree were removed entirely from the final
  lockfile. The final client uses the original pinned browser rendering adapter
  and Rust gameplay rules, not that Rust graphics library.
- `third_party/provenance.json` records the Three.js 0.160.0 registry tarball SRI
  and SHA-256 of its local module. Font files have source/hash manifests and OFL
  notices. Three.js and the generated stylesheet retain MIT notices. The local
  npm advisory snapshot did not flag Three.js.
- The optional, isolated Tailwind 3.4.17 **development compiler** reported seven
  direct/transitive advisory entries for CSS-selector/glob parser denial of
  service. It was used only on bounded, reviewed local sources, with npm install
  scripts disabled. This historical compiler is not shipped as executable
  runtime code and does not run in the normal Cargo/game build. Only the static
  compiled CSS is committed. This build-tool exception is not represented as a
  clean audit of all software used during development.
- Dependency custom build scripts were inventoried and hashed. Compiler-version
  and feature probes, generated files in Cargo output directories and expected
  target-specific linking were inspected. The inventory is not an exhaustive
  audit of every dependency's source or procedural macro expansion.
- The optional Node build helper uses fixed `rustup`/`cargo` argument arrays,
  `shell:false`, checks each exit status and copies only the built WASM asset.
  There are no preinstall/postinstall lifecycle hooks or downloaded scripts.

Microsoft Defender completed an initial custom scan of this checkout. Operational events
1000 and 1001 share scan ID `AA60C95B-090E-4516-BA7A-75E6F2324EEF`; the start
event names this checkout and the completion event records a 10-second scan.
No threat detection for this path was returned, and no detection event appeared
in the captured scan window. This records a scan result, not a malware-free
certification or a scan of every previously installed tool on the computer.

After restoring the original presentation and vendoring the renderer/fonts,
a second checkout scan completed with ID `D3512213-482B-4675-8751-9C282883906A`.
Matching Defender 1000/1001 events identify this checkout and a 98-second scan;
no path-matching threat findings or detection events were returned in that window.

## Runtime boundaries tested

After the f64 gameplay/parity changes, a final custom scan completed with matching
1000/1001 events for scan ID `1CA90D54-EA7F-40F3-842E-23424C50A69D` (15 seconds).
The start event names this checkout; no matching threat findings or 1116/1117
detection events were returned for that scan window.

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
- The V6 sample-wrap lap rule is retained, including its edge behavior. Finish
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
Original presentation fixtures and measured gameplay parity are documented in docs/EQUIVALENCE.md.
