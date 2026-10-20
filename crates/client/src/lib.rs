//! Rust/WebAssembly simulation, progression, UI actions and relay client.
//! Three.js/DOM/WebAudio are browser presentation APIs; no game authority lives there.
use nova_core::*;
use serde_json::{json, Value};
use std::{cell::RefCell, collections::BTreeMap};
mod faithful;
#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "env")]
extern "C" {
    fn nr_read(kind: u32, ptr: *mut u8, cap: usize) -> usize;
    fn nr_write(kind: u32, ptr: *const u8, len: usize);
}
// SAFETY: buffers are borrowed only for each synchronous browser host call.
fn read(kind: u32) -> String {
    #[cfg(target_arch = "wasm32")]
    {
        let mut buf = vec![0; if kind == 0 { 1_048_576 } else { 32_768 }];
        let n = unsafe { nr_read(kind, buf.as_mut_ptr(), buf.len()) }.min(buf.len());
        String::from_utf8_lossy(&buf[..n]).into_owned()
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        let _ = kind;
        String::new()
    }
}
fn write(kind: u32, s: &str) {
    #[cfg(target_arch = "wasm32")]
    unsafe {
        nr_write(kind, s.as_ptr(), s.len())
    }
    #[cfg(not(target_arch = "wasm32"))]
    let _ = (kind, s);
}

const CYAN: u32 = 0x20e3e8;
fn hex(s: &str, f: u32) -> u32 {
    u32::from_str_radix(s.trim_start_matches('#'), 16).unwrap_or(f)
}
const GAS: u32 = 1;
const BRAKE: u32 = 2;
const LEFT: u32 = 4;
const RIGHT: u32 = 8;
const DRIFT: u32 = 16;
const NITRO: u32 = 32;
const PAUSE: u32 = 64;
const RESET: u32 = 128;
const CAMERA: u32 = 256;
const EXIT: u32 = 512;
const MUTE: u32 = 1024;
#[derive(Clone)]
struct Remote {
    current: V3,
    target: V3,
    yaw: f64,
    target_yaw: f64,
    car: String,
    color: u32,
    lap: u32,
    sample: usize,
    finished: bool,
}

#[derive(PartialEq, Clone, Copy)]
enum Tab {
    Drive,
    Tuning,
    Dealer,
    Network,
}
struct Game {
    challenge_open: bool,
    crate_open: bool,
    pending_spin: Option<(f64, u8)>,
    crate_seq: u32,
    crate_items: Vec<u8>,
    crate_result: String,
    cat: Catalog,
    save: Save,
    road: Road,
    race: Option<Race>,
    tab: Tab,
    camera: u8,
    notice: String,
    notice_time: f64,
    muted: bool,
    rng: u32,
    room: String,
    host: String,
    id: String,
    connected: bool,
    players: Vec<Value>,
    remotes: BTreeMap<String, Remote>,
    chats: Vec<String>,
    send_timer: f64,
    save_timer: f64,
    frame: u64,
}
impl Game {
    fn new() -> Self {
        let cat = Catalog::load();
        let save = Save::load(&read(0), &cat, &read(1));
        let road = Road::new(cat.track(&save.selected_track_id));
        let g = Self {
            challenge_open: false,
            crate_open: false,
            pending_spin: None,
            crate_seq: 0,
            crate_items: vec![],
            crate_result: String::new(),
            cat,
            save,
            road,
            race: None,
            tab: Tab::Drive,
            camera: 0,
            notice: String::new(),
            notice_time: 0.,
            muted: false,
            rng: 0x91abc325,
            room: String::new(),
            host: String::new(),
            id: String::new(),
            connected: false,
            players: vec![],
            remotes: BTreeMap::new(),
            chats: vec![],
            send_timer: 0.,
            save_timer: 0.,
            frame: 0,
        };
        g.persist();
        g
    }
    fn persist(&self) {
        if let Ok(s) = serde_json::to_string(&self.save) {
            write(0, &s);
        }
    }
    fn notify(&mut self, s: impl Into<String>) {
        self.notice = s.into();
        self.notice_time = 4.;
    }
    fn send(&self, v: Value) {
        write(1, &v.to_string());
    }
    fn profile(&self) -> Value {
        let c = self.cat.car(&self.save.selected_car_id);
        let (s, max) = self.save.stats(&self.cat);
        let body = self
            .save
            .colors
            .get(&c.id)
            .map(|p| p.body.as_str())
            .unwrap_or(&c.default_color);
        json!({"name":"PILOT","carId":c.id,"carName":c.name,"carClass":c.car_class,"pi":((s.top_speed+s.accel+s.handling+s.drift+s.brakes)*18.5).min(999.),"hp":max*2.,"bodyColor":body,"parts":self.save.tuning.get(&c.id)})
    }
    fn cfg(&self) -> Value {
        json!({"gameMode":self.save.selected_mode,"trackId":self.save.selected_track_id,"laps":if self.save.selected_mode=="timeattack"{1}else{3},"items":true})
    }
    fn start(&mut self) {
        if !self.save.starter_chosen {
            self.notify("Choose your first car before racing");
            return;
        }
        self.road = Road::new(self.cat.track(&self.save.selected_track_id));
        self.race = Some(Race::new(&self.road, &self.save.selected_mode));
        if !self.room.is_empty() {
            self.race.as_mut().unwrap().bots.clear();
        }
        self.persist();
    }
    fn network(&mut self) {
        for _ in 0..128 {
            let raw = read(2);
            if raw.is_empty() {
                break;
            }
            let Ok(v) = serde_json::from_str::<Value>(&raw) else {
                continue;
            };
            match v["type"].as_str().unwrap_or("") {
                "transportOpen" => {
                    self.connected = true;
                    self.notify("Relay connected");
                }
                "transportClosed" => {
                    self.connected = false;
                    self.room.clear();
                    self.players.clear();
                    self.remotes.clear();
                    self.notify("Relay disconnected");
                }
                "welcome" => {
                    self.id = v["playerId"].as_str().unwrap_or("").into();
                }
                "roomCreated" | "joinedRoom" | "lobbyState" => {
                    self.room = v["code"].as_str().unwrap_or("").into();
                    self.host = v["hostId"].as_str().unwrap_or("").into();
                    self.players = v["players"].as_array().cloned().unwrap_or_default();
                    let ids: Vec<_> = self
                        .players
                        .iter()
                        .filter_map(|p| p["id"].as_str())
                        .collect();
                    self.remotes.retain(|id, _| ids.contains(&id.as_str()));
                    if let Some(track) = v["config"]["trackId"].as_str() {
                        self.save.selected_track_id = self.cat.track(track).id.clone();
                    }
                    if let Some(mode) = v["config"]["gameMode"].as_str() {
                        if self.cat.modes.iter().any(|m| m.id == mode) {
                            self.save.selected_mode = mode.into();
                        }
                    }
                    if v["type"] == "joinedRoom" && v["started"] == true {
                        self.start();
                    }
                }
                "raceStart" => {
                    if let Some(track) = v["config"]["trackId"].as_str() {
                        self.save.selected_track_id = self.cat.track(track).id.clone();
                    }
                    if let Some(mode) = v["config"]["gameMode"].as_str() {
                        if self.cat.modes.iter().any(|m| m.id == mode) {
                            self.save.selected_mode = mode.into();
                        }
                    }
                    self.start();
                }
                "playerState" => {
                    let s = &v["state"];
                    let id = s["id"].as_str().unwrap_or("");
                    if id.is_empty() || id == self.id {
                        continue;
                    }
                    let p = V3::new(
                        s["x"].as_f64().unwrap_or(0.),
                        s["y"].as_f64().unwrap_or(0.),
                        s["z"].as_f64().unwrap_or(0.),
                    );
                    if !p.x.is_finite() || !p.y.is_finite() || !p.z.is_finite() {
                        continue;
                    }
                    let yaw = s["heading"].as_f64().unwrap_or(0.);
                    let car = s["carId"].as_str().unwrap_or("starter_golf2").to_string();
                    let color = self
                        .players
                        .iter()
                        .find(|p| p["id"] == id)
                        .and_then(|p| p["bodyColor"].as_str())
                        .map(|s| hex(s, CYAN))
                        .unwrap_or(CYAN);
                    let r = self.remotes.entry(id.into()).or_insert(Remote {
                        current: p,
                        target: p,
                        yaw,
                        target_yaw: yaw,
                        car: car.clone(),
                        color,
                        lap: 1,
                        sample: 0,
                        finished: false,
                    });
                    r.target = p;
                    r.target_yaw = yaw;
                    r.car = car;
                    r.color = color;
                    r.lap = s["lap"].as_u64().unwrap_or(1) as u32;
                    r.sample = s["sampleIdx"].as_f64().unwrap_or(0.) as usize;
                    r.finished = s["finished"].as_bool().unwrap_or(false);
                }
                "playerLeft" => {
                    if let Some(id) = v["playerId"].as_str() {
                        self.remotes.remove(id);
                    }
                }
                "chat" => {
                    let name = v["name"].as_str().unwrap_or("PILOT");
                    let s = v["text"].as_str().unwrap_or("");
                    self.chats.push(format!("{name}: {s}"));
                    if self.chats.len() > 7 {
                        self.chats.remove(0);
                    }
                }
                "error" => self.notify(v["message"].as_str().unwrap_or("Relay error")),
                _ => {}
            }
        }
    }
    fn tick(&mut self, dt: f64, keys: u32, pressed: u32) {
        self.frame += 1;
        self.network();
        self.faithful_events(dt);
        self.notice_time = (self.notice_time - dt).max(0.);
        self.save_timer += dt;
        if self.save_timer > 3. {
            self.save.reset_day(&read(1));
            self.persist();
            self.save_timer = 0.;
        }
        if pressed & MUTE != 0 {
            self.muted = !self.muted;
        }
        if pressed & CAMERA != 0 {
            self.camera = (self.camera + 1) % 3;
        }
        if pressed & EXIT != 0 {
            if self.race.is_some() {
                self.race = None;
                self.persist();
            } else {
                self.tab = Tab::Drive;
            }
        }
        if let Some(r) = &mut self.race {
            if pressed & PAUSE != 0 {
                r.paused = !r.paused;
            }
            if pressed & RESET != 0 {
                r.reset(&self.road);
            }
            let (stats, max) = self.save.stats(&self.cat);
            r.step(
                dt,
                Input {
                    gas: keys & GAS != 0,
                    brake: keys & BRAKE != 0,
                    left: keys & LEFT != 0,
                    right: keys & RIGHT != 0,
                    drift: keys & DRIFT != 0,
                    nos: keys & NITRO != 0,
                },
                stats,
                max,
                &self.road,
                &mut self.save,
            );
            let track_id = self.save.selected_track_id.clone();
            let settled = r.settle(&mut self.save, self.cat.track(&track_id));
            if settled {
                let car = self.cat.car(&self.save.selected_car_id);
                write(4,&json!({"mode":if self.save.selected_mode=="drift"{"drift"}else{"circuit"},"name":"PILOT","carName":car.name,"trackId":self.save.selected_track_id,"time":r.elapsed,"score":r.total_drift}).to_string());
                self.persist();
            }
            self.send_timer += dt;
            if self.send_timer > 0.05 && !self.room.is_empty() {
                self.send_timer = 0.;
                if let Some(r) = &self.race {
                    self.send(json!({"type":"state","state":{"x":r.pos.x,"y":r.pos.y,"z":r.pos.z,"heading":r.yaw,"speed":r.speed,"lap":r.lap,"sampleIdx":r.sample,"isDrifting":keys&DRIFT!=0,"useNos":r.nitro_active,"finished":r.finished,"finishTime":r.elapsed}}));
                }
            }
        }
        for r in self.remotes.values_mut() {
            r.current = r
                .current
                .plus(r.target.minus(r.current).scale((dt * 12.).min(1.)));
            let d = (r.target_yaw - r.yaw + std::f64::consts::PI).rem_euclid(std::f64::consts::TAU)
                - std::f64::consts::PI;
            r.yaw += d * (dt * 12.).min(1.);
        }
        if self.frame.is_multiple_of(6) {
            let r = self.race.as_ref();
            write(9,&json!({"rust":true,"car":self.save.selected_car_id,"cash":self.save.cash,"level":self.save.level,"starterChosen":self.save.starter_chosen,"owned":self.save.owned_cars,"track":self.save.selected_track_id,"mode":self.save.selected_mode,"room":self.room,"host":self.host==self.id,"players":self.players.len(),"remotes":self.remotes.len(),"racing":r.is_some(),"speed":r.map(|r|r.speed),"lap":r.map(|r|r.lap),"finished":r.map(|r|r.finished),"paused":r.map(|r|r.paused),"countdown":r.map(|r|r.countdown),"sample":r.map(|r|r.sample),"position":r.map(|r|r.pos),"yaw":r.map(|r|r.yaw),"nos":r.map(|r|r.nos),"drift":r.map(|r|r.total_drift),"elapsed":r.map(|r|r.elapsed)}).to_string());
        }
    }
    fn cycle(&mut self, delta: i32) {
        let i = self
            .save
            .owned_cars
            .iter()
            .position(|id| id == &self.save.selected_car_id)
            .unwrap_or(0) as i32;
        self.save.selected_car_id = self.save.owned_cars
            [(i + delta).rem_euclid(self.save.owned_cars.len() as i32) as usize]
            .clone();
        self.persist();
        if !self.room.is_empty() {
            self.send(json!({"type":"updatePlayer","player":self.profile()}));
        }
    }
}
thread_local! {static GAME:RefCell<Option<Game>>=const{RefCell::new(None)};}
#[no_mangle]
pub extern "C" fn nova_init() {
    GAME.with(|g| *g.borrow_mut() = Some(Game::new()));
}
#[no_mangle]
pub extern "C" fn nova_frame(
    _w: f64,
    _h: f64,
    dt: f64,
    keys: u32,
    pressed: u32,
    _mx: f64,
    _my: f64,
    _click: u32,
) {
    GAME.with(|cell| {
        if let Some(g) = cell.borrow_mut().as_mut() {
            let dt = if dt.is_finite() {
                dt.clamp(0., 0.05)
            } else {
                0.
            };
            g.tick(dt, keys, pressed);
            g.faithful_present(dt, keys);
        }
    });
}
