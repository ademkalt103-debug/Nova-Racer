use axum::{
    extract::{
        ws::{Message, WebSocket},
        ConnectInfo, State, WebSocketUpgrade,
    },
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    net::SocketAddr,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tokio::sync::mpsc;

pub const MAX_PAYLOAD: usize = 32768;
const MAX_ROOMS: usize = 500;
const MAX_PLAYERS: usize = 8;
type Tx = mpsc::Sender<Value>;
#[derive(Clone)]
struct Player {
    profile: Value,
    state: Value,
    tx: Tx,
}
struct Room {
    host: String,
    players: BTreeMap<String, Player>,
    config: Value,
    started: bool,
}
#[derive(Default)]
struct World {
    rooms: BTreeMap<String, Room>,
    connections: BTreeMap<String, usize>,
    clients: usize,
    boards: Value,
}
#[derive(Clone)]
pub struct App {
    world: Arc<Mutex<World>>,
    next: Arc<AtomicU64>,
    web: Arc<std::path::PathBuf>,
}
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
fn clean(v: &Value, max: usize, fallback: &str) -> String {
    let text = v
        .as_str()
        .unwrap_or("")
        .chars()
        .filter(|c| !c.is_control() && !"<>\"'`\\".contains(*c))
        .collect::<String>();
    let s = text.trim().chars().take(max).collect::<String>();
    if s.is_empty() {
        fallback.into()
    } else {
        s
    }
}
fn num(v: &Value, min: f64, max: f64, fallback: f64) -> f64 {
    v.as_f64()
        .filter(|n| n.is_finite())
        .map(|n| n.clamp(min, max))
        .unwrap_or(fallback)
}
fn color(v: &Value, fallback: &str) -> String {
    let s = v.as_str().unwrap_or("");
    if s.len() == 7 && s.starts_with('#') && s[1..].bytes().all(|c| c.is_ascii_hexdigit()) {
        s.into()
    } else {
        fallback.into()
    }
}
fn profile(v: &Value, old: &Value) -> Value {
    let mut p = if old.is_object() {
        old.clone()
    } else {
        json!({})
    };
    for (k, n, f) in [
        ("name", 16, "PILOT"),
        ("carId", 28, "starter_golf2"),
        ("carName", 38, "Golf 2 GTI"),
        ("carClass", 6, "cult"),
        ("finish", 16, "metallic"),
        ("livery", 16, "none"),
    ] {
        if v.get(k).is_some() || p.get(k).is_none() {
            p[k] = json!(clean(&v[k], n, f));
        }
    }
    for (k, min, max, f) in [
        ("pi", 100., 999., 340.),
        ("hp", 100., 3500., 210.),
        ("rideHeightMm", -60., 20., -20.),
        ("camberDeg", -14., 0., -3.),
    ] {
        if v.get(k).is_some() || p.get(k).is_none() {
            p[k] = json!(num(&v[k], min, max, f));
        }
    }
    for (k, f) in [
        ("bodyColor", "#38bdf8"),
        ("rimColor", "#fbbf24"),
        ("caliperColor", "#ef4444"),
        ("neonColor", "#00f2fe"),
    ] {
        if v.get(k).is_some() || p.get(k).is_none() {
            p[k] = json!(color(&v[k], f));
        }
    }
    for (k, f) in [("carbonHood", false), ("underglow", true)] {
        if v.get(k).is_some() || p.get(k).is_none() {
            p[k] = json!(v[k].as_bool().unwrap_or(f));
        }
    }
    // Whitelist numeric tuning stages; arbitrary peer objects are never retained.
    if let Some(parts) = v["parts"].as_object() {
        let mut safe = json!({});
        for t in nova_core::Catalog::load().tuning {
            if parts.contains_key(&t.id) {
                safe[&t.id] = json!(num(&parts[&t.id], 0., 4., 0.).round());
            }
        }
        p["parts"] = safe;
    }
    p
}
fn config(v: &Value, old: &Value) -> Value {
    let c = nova_core::Catalog::load();
    let mode = v["gameMode"]
        .as_str()
        .or(old["gameMode"].as_str())
        .unwrap_or("circuit");
    let track = v["trackId"]
        .as_str()
        .or(old["trackId"].as_str())
        .unwrap_or("woerthersee");
    json!({"gameMode":if c.modes.iter().any(|m|m.id==mode){mode}else{"circuit"},"trackId":if c.tracks.iter().any(|t|t.id==track){track}else{"woerthersee"},"laps":num(v.get("laps").or(old.get("laps")).unwrap_or(&Value::Null),1.,10.,3.).round(),"items":v["items"].as_bool().or(old["items"].as_bool()).unwrap_or(true)})
}
fn players(r: &Room) -> Vec<Value> {
    r.players
        .iter()
        .map(|(id, p)| {
            let mut v = p.profile.clone();
            v["id"] = json!(id);
            v
        })
        .collect()
}
fn send(tx: &Tx, v: Value) {
    let _ = tx.try_send(v);
}
fn broadcast(r: &Room, v: Value, except: Option<&str>) {
    for (id, p) in &r.players {
        if except != Some(id.as_str()) {
            send(&p.tx, v.clone());
        }
    }
}
fn lobby(r: &Room, code: &str) {
    broadcast(
        r,
        json!({"type":"lobbyState","code":code,"hostId":r.host,"config":r.config,"started":r.started,"players":players(r)}),
        None,
    );
}
fn leave(w: &mut World, id: &str, code: &mut Option<String>) {
    if let Some(key) = code.take() {
        let mut empty = false;
        if let Some(r) = w.rooms.get_mut(&key) {
            r.players.remove(id);
            if r.players.is_empty() {
                empty = true;
            } else {
                if r.host == id {
                    r.host = r.players.keys().next().unwrap().clone();
                }
                broadcast(
                    r,
                    json!({"type":"playerLeft","playerId":id,"hostId":r.host}),
                    None,
                );
                lobby(r, &key);
            }
        }
        if empty {
            w.rooms.remove(&key);
        }
    }
}
fn error(tx: &Tx, message: &str) {
    send(tx, json!({"type":"error","message":message}));
}
fn handle(w: &mut World, id: &str, code: &mut Option<String>, tx: &Tx, msg: Value) {
    let kind = msg["type"].as_str().unwrap_or("");
    if kind == "pingClient" {
        send(
            tx,
            json!({"type":"pongClient","clientTs":msg["clientTs"],"serverTime":now(),"onlinePlayers":w.clients}),
        );
        return;
    }
    if ["createRoom", "joinRoom", "joinOrCreate"].contains(&kind) {
        let key = msg["code"]
            .as_str()
            .unwrap_or("")
            .chars()
            .filter(|c| c.is_ascii_alphanumeric())
            .take(10)
            .collect::<String>()
            .to_ascii_uppercase();
        let key = if key.len() < 2 {
            format!(
                "N{:09X}",
                (now()
                    ^ id.bytes()
                        .fold(0u64, |a, b| a.wrapping_mul(31).wrapping_add(b as u64)))
                    & 0xF_FFFF_FFFF
            )
        } else {
            key
        };
        if kind == "joinRoom" && !w.rooms.contains_key(&key) {
            error(tx, "Room not found");
            return;
        }
        if kind == "createRoom" && w.rooms.contains_key(&key) {
            error(tx, "Code already in use");
            return;
        }
        if w.rooms
            .get(&key)
            .is_some_and(|r| r.players.len() >= MAX_PLAYERS && !r.players.contains_key(id))
        {
            error(tx, "Room is full (8 players)");
            return;
        }
        if !w.rooms.contains_key(&key) && w.rooms.len() >= MAX_ROOMS {
            error(tx, "Maximum rooms reached");
            return;
        }
        leave(w, id, code);
        let r = w.rooms.entry(key.clone()).or_insert_with(|| Room {
            host: id.into(),
            players: BTreeMap::new(),
            config: config(&msg["config"], &Value::Null),
            started: false,
        });
        r.players.insert(
            id.into(),
            Player {
                profile: profile(&msg["player"], &Value::Null),
                state: Value::Null,
                tx: tx.clone(),
            },
        );
        *code = Some(key.clone());
        send(
            tx,
            json!({"type":if r.host==id{"roomCreated"}else{"joinedRoom"},"code":key,"playerId":id,"host":r.host==id,"hostId":r.host,"config":r.config,"started":r.started,"players":players(r)}),
        );
        lobby(r, &key);
        return;
    }
    if kind == "leaveRoom" {
        leave(w, id, code);
        return;
    }
    let Some(key) = code.as_ref() else { return };
    let Some(r) = w.rooms.get_mut(key) else {
        return;
    };
    if !r.players.contains_key(id) {
        return;
    }
    match kind {
        "updatePlayer" => {
            let p = r.players.get_mut(id).unwrap();
            p.profile = profile(&msg["player"], &p.profile);
            lobby(r, key);
        }
        "updateConfig" | "startRace" => {
            if r.host != id {
                error(tx, "Only the host may change or start the race");
                return;
            }
            r.config = config(&msg["config"], &r.config);
            if kind == "startRace" {
                r.started = true;
                broadcast(
                    r,
                    json!({"type":"raceStart","code":key,"hostId":id,"config":r.config,"players":players(r),"serverTime":now()}),
                    None,
                );
            } else {
                lobby(r, key);
            }
        }
        "chat" => {
            let text = clean(&msg["text"], 80, "");
            if !text.is_empty() {
                broadcast(
                    r,
                    json!({"type":"chat","playerId":id,"name":r.players[id].profile["name"],"text":text,"ts":now()}),
                    None,
                );
            }
        }
        "action" => {
            let kind = clean(&msg["kind"], 16, "oil");
            if !["oil", "banana", "horn"].contains(&kind.as_str()) {
                return;
            }
            broadcast(
                r,
                json!({"type":"playerAction","playerId":id,"kind":kind,"x":num(&msg["x"],-50000.,50000.,0.),"z":num(&msg["z"],-50000.,50000.,0.)}),
                Some(id),
            );
        }
        "state" => {
            let s = &msg["state"];
            let p = r.players.get_mut(id).unwrap();
            let mut safe = json!({"id":id,"name":p.profile["name"],"carId":p.profile["carId"]});
            for (k, min, max, f) in [
                ("x", -100000., 100000., 0.),
                ("y", -1000., 1000., 0.),
                ("z", -100000., 100000., 0.),
                ("heading", -1000., 1000., 0.),
                ("steerAngle", -1., 1., 0.),
                ("speed", -200., 650., 0.),
                ("lap", 1., 20., 1.),
                ("sampleIdx", 0., 419., 0.),
                ("driftCash", 0., 9999999., 0.),
                ("finishTime", 0., 3600., 0.),
            ] {
                safe[k] = json!(num(&s[k], min, max, f));
            }
            for k in ["isDrifting", "isBraking", "useNos", "finished"] {
                safe[k] = json!(s[k].as_bool().unwrap_or(false));
            }
            p.state = safe.clone();
            broadcast(r, json!({"type":"playerState","state":safe}), Some(id));
        }
        _ => {}
    }
}

impl App {
    pub fn new(web: std::path::PathBuf) -> Self {
        Self {
            world: Arc::new(Mutex::new(World {
                boards: json!({"drag":[],"circuit":[],"drift":[]}),
                ..World::default()
            })),
            next: Arc::new(AtomicU64::new(1)),
            web: Arc::new(web),
        }
    }
}
async fn secure_headers(req: axum::extract::Request, next: axum::middleware::Next) -> Response {
    let mut r = next.run(req).await;
    let h = r.headers_mut();
    for(k,v)in[("x-content-type-options","nosniff"),("x-frame-options","DENY"),("referrer-policy","no-referrer"),("cache-control","no-store"),("content-security-policy","default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'")]{h.insert(axum::http::HeaderName::from_static(k),axum::http::HeaderValue::from_static(v));}
    r
}
async fn status(State(a): State<App>) -> Json<Value> {
    let w = a.world.lock().unwrap();
    Json(
        json!({"ok":true,"version":"7.0.0-rust","activeRooms":w.rooms.len(),"onlinePlayers":w.clients,"leaderboards":w.boards}),
    )
}
async fn boards(State(a): State<App>) -> Json<Value> {
    Json(a.world.lock().unwrap().boards.clone())
}
async fn submit(State(a): State<App>, Json(v): Json<Value>) -> Json<Value> {
    let mode = if v["mode"] == "drag" {
        "drag"
    } else if v["mode"] == "drift" {
        "drift"
    } else {
        "circuit"
    };
    let mut row = json!({"name":clean(&v["name"],16,"PILOT"),"carName":clean(&v["carName"],38,"Custom Car"),"trackId":clean(&v["trackId"],32,"woerthersee")});
    if mode == "drift" {
        row["score"] = json!(num(&v["score"], 500., 999999., 0.).round());
    } else {
        row["time"] = json!(num(
            &v["time"],
            if mode == "drag" { 3.8 } else { 12. },
            if mode == "drag" { 60. } else { 600. },
            0.
        ));
    }
    if mode == "drag" {
        row["speed"] = json!(num(&v["speed"], 80., 560., 200.));
        row["whp"] = json!(num(&v["whp"], 100., 3500., 300.));
    }
    let mut w = a.world.lock().unwrap();
    let list = w.boards[mode].as_array_mut().unwrap();
    let field = if mode == "drift" { "score" } else { "time" };
    if row[field].as_f64().unwrap_or(0.) > 0. {
        list.push(row);
        list.sort_by(|a, b| {
            let order = a[field]
                .as_f64()
                .unwrap_or(0.)
                .total_cmp(&b[field].as_f64().unwrap_or(0.));
            if mode == "drift" {
                order.reverse()
            } else {
                order
            }
        });
        list.truncate(15);
    }
    Json(json!({"ok":true,"leaderboards":w.boards}))
}
async fn asset(a: &App, name: &str) -> Response {
    let file = match name {
        "index.html" | "gl.js" | "bridge.js" | "boot.js" | "style.css" | "nova-client.wasm" => name,
        _ => return StatusCode::NOT_FOUND.into_response(),
    };
    let mime = if file.ends_with(".wasm") {
        "application/wasm"
    } else if file.ends_with(".js") {
        "text/javascript; charset=utf-8"
    } else if file.ends_with(".css") {
        "text/css; charset=utf-8"
    } else {
        "text/html; charset=utf-8"
    };
    match tokio::fs::read(a.web.join(file)).await {
        Ok(bytes) => ([(header::CONTENT_TYPE, mime)], bytes).into_response(),
        Err(_) => (
            StatusCode::NOT_FOUND,
            "Asset missing; build the WASM client first",
        )
            .into_response(),
    }
}
async fn index(State(a): State<App>) -> Response {
    asset(&a, "index.html").await
}
async fn file(
    State(a): State<App>,
    axum::extract::Path(name): axum::extract::Path<String>,
) -> Response {
    asset(&a, &name).await
}
async fn upgrade(
    State(a): State<App>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Response {
    if let Some(origin) = headers.get(header::ORIGIN) {
        let host = headers
            .get(header::HOST)
            .and_then(|h| h.to_str().ok())
            .unwrap_or("");
        let origin = origin.to_str().unwrap_or("");
        if origin != format!("http://{host}") && origin != format!("https://{host}") {
            return StatusCode::FORBIDDEN.into_response();
        }
    }
    let ip = peer.ip().to_string();
    {
        let mut w = a.world.lock().unwrap();
        if w.clients >= 4000 || w.connections.get(&ip).copied().unwrap_or(0) >= 20 {
            return StatusCode::TOO_MANY_REQUESTS.into_response();
        }
        *w.connections.entry(ip.clone()).or_default() += 1;
        w.clients += 1;
    }
    // on_failed_upgrade releases a reserved connection slot too.
    let failed = a.clone();
    let failed_ip = ip.clone();
    ws.max_message_size(MAX_PAYLOAD)
        .max_frame_size(MAX_PAYLOAD)
        .on_failed_upgrade(move |_| disconnect(&failed, &failed_ip))
        .on_upgrade(move |socket| session(a, socket, ip))
        .into_response()
}
fn disconnect(a: &App, ip: &str) {
    let mut w = a.world.lock().unwrap();
    w.clients = w.clients.saturating_sub(1);
    if let Some(n) = w.connections.get_mut(ip) {
        *n = n.saturating_sub(1);
        if *n == 0 {
            w.connections.remove(ip);
        }
    }
}
async fn session(a: App, socket: WebSocket, ip: String) {
    let id = format!("p_{:x}_{:x}", now(), a.next.fetch_add(1, Ordering::Relaxed));
    let (tx, mut rx) = mpsc::channel(128);
    let (mut sink, mut stream) = socket.split();
    let mut code = None;
    send(
        &tx,
        json!({"type":"welcome","playerId":id,"serverTime":now(),"onlinePlayers":a.world.lock().unwrap().clients}),
    );
    let mut tick = tokio::time::interval(Duration::from_secs(20));
    tick.tick().await;
    let mut last = Instant::now();
    let mut window = Instant::now();
    let mut count = 0;
    loop {
        tokio::select! {
            value=rx.recv()=>{let Some(v)=value else{break};if sink.send(Message::Text(v.to_string().into())).await.is_err(){break;}},
            incoming=stream.next()=>{match incoming{Some(Ok(Message::Text(text)))=>{if window.elapsed()>=Duration::from_secs(1){window=Instant::now();count=0;}count+=1;if count>65{break;}last=Instant::now();if let Ok(msg)=serde_json::from_str::<Value>(&text){let mut w=a.world.lock().unwrap();handle(&mut w,&id,&mut code,&tx,msg);}},Some(Ok(Message::Pong(_)))=>last=Instant::now(),Some(Ok(Message::Ping(p)))=>{if sink.send(Message::Pong(p)).await.is_err(){break;}},Some(Ok(Message::Close(_)))|Some(Err(_))|None=>break,_=>{}}},
            _=tick.tick()=>{if last.elapsed()>Duration::from_secs(75){break;}
                if sink.send(Message::Ping(Vec::new().into())).await.is_err(){break;}}
        }
    }
    {
        leave(&mut a.world.lock().unwrap(), &id, &mut code);
    }
    disconnect(&a, &ip);
    let _ = sink.close().await;
}
pub fn router(app: App) -> Router {
    Router::new()
        .route("/", get(index))
        .route("/healthz", get(|| async { "OK" }))
        .route("/api/status", get(status))
        .route("/api/leaderboard", get(boards).post(submit))
        .route("/race", get(upgrade))
        .route("/ws", get(upgrade))
        .route("/{name}", get(file))
        .layer(axum::extract::DefaultBodyLimit::max(8192))
        .layer(axum::middleware::from_fn(secure_headers))
        .with_state(app)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn generated_code_can_be_joined_without_truncation() {
        let mut w = World::default();
        let (tx, _rx) = mpsc::channel(128);
        let mut host = None;
        handle(
            &mut w,
            "p_abc_1",
            &mut host,
            &tx,
            json!({"type":"createRoom"}),
        );
        let key = host.unwrap();
        assert_eq!(key.len(), 10);
        let mut guest = None;
        handle(
            &mut w,
            "p_abc_2",
            &mut guest,
            &tx,
            json!({"type":"joinRoom","code":key}),
        );
        assert_eq!(guest, Some(key.clone()));
        assert_eq!(w.rooms[&key].players.len(), 2);
    }
    #[test]
    fn host_authority_cleanup_and_input_limits() {
        let mut w = World::default();
        let (tx, _rx) = mpsc::channel(128);
        let mut host = None;
        let mut guest = None;
        handle(
            &mut w,
            "host",
            &mut host,
            &tx,
            json!({"type":"createRoom","code":"TEST","player":{"name":"<a>"}}),
        );
        handle(
            &mut w,
            "guest",
            &mut guest,
            &tx,
            json!({"type":"joinRoom","code":"TEST"}),
        );
        assert_eq!(w.rooms["TEST"].players.len(), 2);
        handle(
            &mut w,
            "guest",
            &mut guest,
            &tx,
            json!({"type":"startRace"}),
        );
        assert!(!w.rooms["TEST"].started);
        handle(&mut w, "host", &mut host, &tx, json!({"type":"startRace"}));
        assert!(w.rooms["TEST"].started);
        handle(
            &mut w,
            "guest",
            &mut guest,
            &tx,
            json!({"type":"state","state":{"x":999999999,"heading":"oops","name":"spoof"}}),
        );
        assert_eq!(w.rooms["TEST"].players["guest"].state["x"], 100000.);
        assert_eq!(w.rooms["TEST"].players["guest"].state["heading"], 0.);
        leave(&mut w, "host", &mut host);
        assert_eq!(w.rooms["TEST"].host, "guest");
        leave(&mut w, "guest", &mut guest);
        assert!(w.rooms.is_empty());
    }
    #[test]
    fn full_room_and_missing_join() {
        let mut w = World::default();
        let (tx, _rx) = mpsc::channel(128);
        let mut code = None;
        handle(
            &mut w,
            "missing",
            &mut code,
            &tx,
            json!({"type":"joinRoom","code":"NOPE"}),
        );
        assert!(w.rooms.is_empty());
        for i in 0..9 {
            handle(
                &mut w,
                &i.to_string(),
                &mut None,
                &tx,
                json!({"type":"joinOrCreate","code":"ROOM"}),
            );
        }
        assert_eq!(w.rooms["ROOM"].players.len(), 8);
    }
}
