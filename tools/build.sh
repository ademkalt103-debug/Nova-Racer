#!/bin/sh
set -eu
rustup target add wasm32-unknown-unknown
cargo build --locked --release -p nova-client --target wasm32-unknown-unknown
cp target/wasm32-unknown-unknown/release/nova_client.wasm web/nova-client.wasm
cargo build --locked --release -p nova-server
