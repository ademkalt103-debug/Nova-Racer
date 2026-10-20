//! Rust/WASM game. JavaScript implements browser I/O only, not game rules.
use nova_core::*;
use serde_json::{json, Value};
use std::{cell::RefCell, collections::BTreeMap};

#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "env")]
extern "C" {
    fn nr_clear(color: u32);
    fn nr_rect(x: f32, y: f32, w: f32, h: f32, color: u32);
    fn nr_text(ptr: *const u8, len: usize, x: f32, y: f32, size: f32, color: u32);
    fn nr_poly(ptr: *const f32, len: usize, color: u32);
    fn nr_line(x: f32, y: f32, x2: f32, y2: f32, width: f32, color: u32);
    fn nr_read(kind: u32, ptr: *mut u8, cap: usize) -> usize;
    fn nr_write(kind: u32, ptr: *const u8, len: usize);
    fn nr_audio(freq: f32, gain: f32, slip: f32);
}
// Safe wrappers: borrowed slices remain alive for each synchronous host call.
fn clear(c: u32) {
    #[cfg(target_arch = "wasm32")]
    unsafe {
        nr_clear(c)
    }
    #[cfg(not(target_arch = "wasm32"))]
    let _ = c;
}
fn rect(x: f32, y: f32, w: f32, h: f32, c: u32) {
    #[cfg(target_arch = "wasm32")]
    unsafe {
        nr_rect(x, y, w, h, c)
    }
    #[cfg(not(target_arch = "wasm32"))]
    let _ = (x, y, w, h, c);
}
fn text(s: &str, x: f32, y: f32, size: f32, c: u32) {
    #[cfg(target_arch = "wasm32")]
    unsafe {
        nr_text(s.as_ptr(), s.len(), x, y, size, c)
    }
    #[cfg(not(target_arch = "wasm32"))]
    let _ = (s, x, y, size, c);
}
fn poly(p: &[f32], c: u32) {
    #[cfg(target_arch = "wasm32")]
    unsafe {
        nr_poly(p.as_ptr(), p.len(), c)
    }
    #[cfg(not(target_arch = "wasm32"))]
    let _ = (p, c);
}
fn line(x: f32, y: f32, a: f32, b: f32, w: f32, c: u32) {
    #[cfg(target_arch = "wasm32")]
    unsafe {
        nr_line(x, y, a, b, w, c)
    }
    #[cfg(not(target_arch = "wasm32"))]
    let _ = (x, y, a, b, w, c);
}
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
fn audio(f: f32, g: f32, s: f32) {
    #[cfg(target_arch = "wasm32")]
    unsafe {
        nr_audio(f, g, s)
    }
    #[cfg(not(target_arch = "wasm32"))]
    let _ = (f, g, s);
}
const BG: u32 = 0x080d18;
const PANEL: u32 = 0x111d31;
const EDGE: u32 = 0x22334a;
const WHITE: u32 = 0xeaf2ff;
const MUTED: u32 = 0x91a6c1;
const CYAN: u32 = 0x20e3e8;
const GOLD: u32 = 0xffcc55;
const PINK: u32 = 0xff4488;
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
    yaw: f32,
    target_yaw: f32,
    car: String,
    color: u32,
    lap: u32,
    sample: usize,
    finished: bool,
}
struct Face {
    points: Vec<V3>,
    color: u32,
    depth: f32,
}
struct View {
    pos: V3,
    forward: V3,
    right: V3,
    up: V3,
    w: f32,
    h: f32,
    focal: f32,
}
impl View {
    fn new(pos: V3, target: V3, w: f32, h: f32, fov: f32) -> Self {
        let forward = target.minus(pos).unit();
        let right = forward.cross(V3::new(0., 1., 0.)).unit();
        let up = right.cross(forward).unit();
        Self {
            pos,
            forward,
            right,
            up,
            w,
            h,
            focal: h / (2. * (fov.to_radians() / 2.).tan()),
        }
    }
    fn project(&self, p: V3) -> (f32, f32, f32) {
        let d = p.minus(self.pos);
        let z = d.dot(self.forward);
        (
            self.w * 0.5 + d.dot(self.right) * self.focal / z,
            self.h * 0.5 - d.dot(self.up) * self.focal / z,
            z,
        )
    }
    fn draw(&self, faces: &mut [Face]) {
        for f in faces.iter_mut() {
            f.depth = f
                .points
                .iter()
                .map(|p| p.minus(self.pos).dot(self.forward))
                .sum::<f32>()
                / f.points.len() as f32;
        }
        faces.sort_by(|a, b| b.depth.total_cmp(&a.depth));
        for f in faces {
            if f.depth < 0.2 || f.depth > 950. {
                continue;
            }
            let mut clipped = Vec::new();
            for i in 0..f.points.len() {
                let a = f.points[i];
                let b = f.points[(i + 1) % f.points.len()];
                let za = a.minus(self.pos).dot(self.forward);
                let zb = b.minus(self.pos).dot(self.forward);
                if za >= 0.3 {
                    clipped.push(a);
                }
                if (za >= 0.3) != (zb >= 0.3) {
                    clipped.push(a.plus(b.minus(a).scale((0.3 - za) / (zb - za))));
                }
            }
            if clipped.len() < 3 {
                continue;
            }
            let coords: Vec<_> = clipped
                .iter()
                .flat_map(|p| {
                    let (x, y, _) = self.project(*p);
                    [x, y]
                })
                .collect();
            if coords.chunks(2).all(|p| p[0] < 0.)
                || coords.chunks(2).all(|p| p[0] > self.w)
                || coords.chunks(2).all(|p| p[1] < 0.)
                || coords.chunks(2).all(|p| p[1] > self.h)
            {
                continue;
            }
            poly(&coords, f.color);
        }
    }
}
fn face(f: &mut Vec<Face>, p: Vec<V3>, c: u32) {
    f.push(Face {
        points: p,
        color: c,
        depth: 0.,
    });
}
fn shade(c: u32, k: f32) -> u32 {
    let r = ((c >> 16) as f32 * k).min(255.) as u32;
    let g = (((c >> 8) & 255) as f32 * k).min(255.) as u32;
    let b = ((c & 255) as f32 * k).min(255.) as u32;
    (r << 16) | (g << 8) | b
}
fn hex(s: &str, f: u32) -> u32 {
    u32::from_str_radix(s.trim_start_matches('#'), 16).unwrap_or(f)
}
fn block(f: &mut Vec<Face>, pos: V3, size: V3, yaw: f32, c: u32) {
    let corners: Vec<_> = [
        (-1., -1., -1.),
        (1., -1., -1.),
        (1., -1., 1.),
        (-1., -1., 1.),
        (-1., 1., -1.),
        (1., 1., -1.),
        (1., 1., 1.),
        (-1., 1., 1.),
    ]
    .into_iter()
    .map(|(x, y, z)| {
        let x = x * size.x * 0.5;
        let z = z * size.z * 0.5;
        V3::new(
            pos.x + x * yaw.cos() + z * yaw.sin(),
            pos.y + y * size.y * 0.5,
            pos.z - x * yaw.sin() + z * yaw.cos(),
        )
    })
    .collect();
    for (ids, k) in [
        ([4, 5, 6, 7], 1.15),
        ([0, 1, 5, 4], 0.65),
        ([1, 2, 6, 5], 0.85),
        ([2, 3, 7, 6], 0.75),
        ([3, 0, 4, 7], 0.95),
    ] {
        face(f, ids.iter().map(|i| corners[*i]).collect(), shade(c, k));
    }
}
// Rendering ABI keeps a position, shape and three independent paint channels.
#[allow(clippy::too_many_arguments)]
fn vehicle(
    f: &mut Vec<Face>,
    p: V3,
    yaw: f32,
    car: &Car,
    body: u32,
    rims: u32,
    neon: u32,
    nos: bool,
) {
    let motorcycle = car.mesh_type.contains("moped") || car.mesh_type.contains("supermoto");
    let tuk = car.mesh_type.contains("tuktuk");
    let mower = car.mesh_type.contains("mower");
    let w = if motorcycle {
        0.6
    } else if tuk {
        1.4
    } else {
        1.85
    };
    let len = if motorcycle || mower { 2.2 } else { 4.2 };
    let h = if car.mesh_type == "suv" { 1.0 } else { 0.65 };
    block(
        f,
        p.plus(V3::new(0., h * 0.5 + 0.25, 0.)),
        V3::new(w, h, len),
        yaw,
        body,
    );
    if motorcycle {
        block(
            f,
            p.plus(V3::new(0., 1.4, 0.)),
            V3::new(0.5, 1.1, 0.7),
            yaw,
            0x232c47,
        );
    } else if !mower {
        block(
            f,
            p.plus(V3::new(0., h + 0.65, -0.25)),
            V3::new(w * 0.83, if tuk { 1.2 } else { 0.7 }, len * 0.48),
            yaw,
            0x41647a,
        );
        block(
            f,
            p.plus(V3::new(0., h + 1.02, -0.25)),
            V3::new(w * 0.85, 0.08, len * 0.47),
            yaw,
            body,
        );
    }
    for x in if motorcycle {
        vec![0.]
    } else {
        vec![-w * 0.55, w * 0.55]
    } {
        for z in [-len * 0.31, len * 0.31] {
            let wheel = V3::new(
                p.x + x * yaw.cos() + z * yaw.sin(),
                p.y + 0.32,
                p.z - x * yaw.sin() + z * yaw.cos(),
            );
            block(f, wheel, V3::new(0.28, 0.65, 0.65), yaw, 0x080b12);
            block(f, wheel, V3::new(0.31, 0.34, 0.34), yaw, rims);
        }
    }
    let rear = p.plus(V3::new(
        -yaw.sin() * len * 0.51,
        0.35,
        -yaw.cos() * len * 0.51,
    ));
    block(f, rear, V3::new(w * 0.8, 0.1, 0.1), yaw, 0xff294b);
    block(
        f,
        p.plus(V3::new(0., 0.09, 0.)),
        V3::new(w * 1.1, 0.05, len * 0.8),
        yaw,
        neon,
    );
    if nos {
        block(
            f,
            rear.plus(V3::new(-yaw.sin() * 0.7, 0., -yaw.cos() * 0.7)),
            V3::new(0.6, 0.3, 1.3),
            yaw,
            0xffaa22,
        );
    }
    if car.mesh_type == "gt3" || car.mesh_type == "hyper" {
        block(
            f,
            p.plus(V3::new(-yaw.sin() * 1.5, 1.2, -yaw.cos() * 1.5)),
            V3::new(w * 1.2, 0.12, 0.45),
            yaw,
            body,
        );
    }
}
#[derive(PartialEq, Clone, Copy)]
enum Tab {
    Drive,
    Tuning,
    Dealer,
    Network,
    Challenges,
    Crate,
}
struct Game {
    cat: Catalog,
    save: Save,
    road: Road,
    race: Option<Race>,
    tab: Tab,
    selected: usize,
    part: usize,
    camera: u8,
    width: f32,
    height: f32,
    mx: f32,
    my: f32,
    click: bool,
    notice: String,
    notice_time: f32,
    muted: bool,
    rng: u32,
    room_input: String,
    chat_input: String,
    chat_focus: bool,
    room: String,
    host: String,
    id: String,
    connected: bool,
    players: Vec<Value>,
    remotes: BTreeMap<String, Remote>,
    chats: Vec<String>,
    send_timer: f32,
    save_timer: f32,
    preview: usize,
    filter: usize,
    paint_channel: usize,
    garage_cam: f32,
    garage_goal: f32,
    frame: u64,
}
impl Game {
    fn new() -> Self {
        let cat = Catalog::load();
        let save = Save::load(&read(0), &cat, &read(1));
        let road = Road::new(cat.track(&save.selected_track_id));
        let g = Self {
            cat,
            save,
            road,
            race: None,
            tab: Tab::Drive,
            selected: 0,
            part: 0,
            camera: 0,
            width: 1280.,
            height: 800.,
            mx: 0.,
            my: 0.,
            click: false,
            notice: String::new(),
            notice_time: 0.,
            muted: false,
            rng: 0x91abc325,
            room_input: String::new(),
            chat_input: String::new(),
            chat_focus: false,
            room: String::new(),
            host: String::new(),
            id: String::new(),
            connected: false,
            players: vec![],
            remotes: BTreeMap::new(),
            chats: vec![],
            send_timer: 0.,
            save_timer: 0.,
            preview: 0,
            filter: 0,
            paint_channel: 0,
            garage_cam: 0.6,
            garage_goal: 0.6,
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
    fn button(&mut self, label: &str, x: f32, y: f32, w: f32, h: f32, active: bool) -> bool {
        let hover = self.mx >= x && self.mx <= x + w && self.my >= y && self.my <= y + h;
        rect(
            x,
            y,
            w,
            h,
            if active {
                0x146a79
            } else if hover {
                0x29415c
            } else {
                PANEL
            },
        );
        rect(x, y, w, 2., if active { CYAN } else { EDGE });
        text(
            label,
            x + 12.,
            y + h * 0.63,
            14.,
            if active { WHITE } else { MUTED },
        );
        hover && self.click
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
                        s["x"].as_f64().unwrap_or(0.) as f32,
                        s["y"].as_f64().unwrap_or(0.) as f32,
                        s["z"].as_f64().unwrap_or(0.) as f32,
                    );
                    if !p.x.is_finite() || !p.y.is_finite() || !p.z.is_finite() {
                        continue;
                    }
                    let yaw = s["heading"].as_f64().unwrap_or(0.) as f32;
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
    fn tick(&mut self, dt: f32, keys: u32, pressed: u32) {
        self.frame += 1;
        self.network();
        if self.tab != Tab::Network || self.race.is_some() {
            let _ = read(3);
        }
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
            if !self.room.is_empty() {
                r.rank = 1;
                let progress = (r.lap - 1) as f32 + r.sample as f32 / 420.;
                for remote in self.remotes.values() {
                    if remote.finished
                        || ((remote.lap - 1) as f32 + remote.sample as f32 / 420.) > progress
                    {
                        r.rank += 1;
                    }
                }
            }
            let track_id = self.save.selected_track_id.clone();
            let settled = r.settle(&mut self.save, self.cat.track(&track_id));
            let gain = if self.muted || r.finished || r.paused || r.countdown > 0. {
                0.
            } else {
                0.035
            };
            let gear = ((r.speed.abs() / 52.).floor() + 1.).min(6.);
            let rpm = ((r.speed.abs() % (52.)) / 52.).max(0.12);
            audio(
                45. + rpm * 125. + gear * 9.,
                gain,
                if keys & DRIFT != 0 { 0.015 } else { 0. },
            );
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
        } else {
            audio(0., 0., 0.);
            self.garage_cam += (self.garage_goal - self.garage_cam) * dt * 5.;
        }
        for r in self.remotes.values_mut() {
            r.current = r
                .current
                .plus(r.target.minus(r.current).scale((dt * 12.).min(1.)));
            let d = (r.target_yaw - r.yaw + std::f32::consts::PI).rem_euclid(std::f32::consts::TAU)
                - std::f32::consts::PI;
            r.yaw += d * (dt * 12.).min(1.);
        }
        if self.frame.is_multiple_of(6) {
            let r = self.race.as_ref();
            write(9,&json!({"rust":true,"car":self.save.selected_car_id,"cash":self.save.cash,"level":self.save.level,"starterChosen":self.save.starter_chosen,"owned":self.save.owned_cars,"track":self.save.selected_track_id,"mode":self.save.selected_mode,"room":self.room,"host":self.host==self.id,"players":self.players.len(),"remotes":self.remotes.len(),"racing":r.is_some(),"speed":r.map(|r|r.speed),"lap":r.map(|r|r.lap),"finished":r.map(|r|r.finished),"paused":r.map(|r|r.paused),"countdown":r.map(|r|r.countdown),"sample":r.map(|r|r.sample),"position":r.map(|r|r.pos),"yaw":r.map(|r|r.yaw),"nos":r.map(|r|r.nos),"drift":r.map(|r|r.total_drift),"elapsed":r.map(|r|r.elapsed)}).to_string());
        }
    }
    fn scene(&mut self) {
        let mut faces = Vec::new();
        let view;
        if let Some(r) = &self.race {
            let track = self.cat.track(&self.save.selected_track_id);
            clear(track.sky);
            let s = &self.road.samples[r.sample];
            let ratio = (r.speed.abs() / self.save.stats(&self.cat).1).min(1.);
            let (dist, h) = match self.camera {
                1 => (10., 4.),
                2 => (-0.4, 1.2),
                _ => (7.2, 2.8),
            };
            view = View::new(
                r.pos
                    .plus(V3::new(-r.yaw.sin() * dist, h, -r.yaw.cos() * dist)),
                r.pos
                    .plus(V3::new(r.yaw.sin() * 12., 1., r.yaw.cos() * 12.)),
                self.width,
                self.height,
                60. + ratio * 15. + if r.nitro_active { 7. } else { 0. },
            );
            face(
                &mut faces,
                vec![
                    V3::new(-1500., -1.5, -1500.),
                    V3::new(1500., -1.5, -1500.),
                    V3::new(1500., -1.5, 1500.),
                    V3::new(-1500., -1.5, 1500.),
                ],
                track.ground,
            );
            for i in 0..420 {
                let a = &self.road.samples[i];
                let b = &self.road.samples[(i + 1) % 420];
                let la = a.point.minus(a.right.scale(7.8));
                let ra = a.point.plus(a.right.scale(7.8));
                let lb = b.point.minus(b.right.scale(7.8));
                let rb = b.point.plus(b.right.scale(7.8));
                face(&mut faces, vec![la, ra, rb, lb], track.road);
                for side in [-1., 1.] {
                    face(
                        &mut faces,
                        vec![
                            a.point
                                .plus(a.right.scale(side * 7.8))
                                .plus(V3::new(0., 0.03, 0.)),
                            a.point
                                .plus(a.right.scale(side * 8.55))
                                .plus(V3::new(0., 0.03, 0.)),
                            b.point
                                .plus(b.right.scale(side * 8.55))
                                .plus(V3::new(0., 0.03, 0.)),
                            b.point
                                .plus(b.right.scale(side * 7.8))
                                .plus(V3::new(0., 0.03, 0.)),
                        ],
                        if i % 2 == 0 { 0xef3e51 } else { 0xe9edf4 },
                    );
                }
                if i % 10 == 0 {
                    block(
                        &mut faces,
                        ra.plus(a.right.scale(1.5)).plus(V3::new(0., 2.1, 0.)),
                        V3::new(0.3, 4.5, 0.3),
                        0.,
                        if i % 20 == 0 { CYAN } else { PINK },
                    );
                }
                if i % 5 < 2 {
                    face(
                        &mut faces,
                        vec![
                            a.point
                                .minus(a.right.scale(0.12))
                                .plus(V3::new(0., 0.05, 0.)),
                            a.point
                                .plus(a.right.scale(0.12))
                                .plus(V3::new(0., 0.05, 0.)),
                            b.point
                                .plus(b.right.scale(0.12))
                                .plus(V3::new(0., 0.05, 0.)),
                            b.point
                                .minus(b.right.scale(0.12))
                                .plus(V3::new(0., 0.05, 0.)),
                        ],
                        0xb5b9c2,
                    );
                }
            }
            // Start gantry and checkered stripe.
            let start = &self.road.samples[0];
            for i in 0..12 {
                let x = -7.8 + (i as f32 + 0.5) * 1.3;
                block(
                    &mut faces,
                    start
                        .point
                        .plus(start.right.scale(x))
                        .plus(V3::new(0., 0.07, 0.)),
                    V3::new(1.3, 0.08, 1.),
                    start.tangent.x.atan2(start.tangent.z),
                    if i % 2 == 0 { WHITE } else { 0x080808 },
                );
            }
            if self.room.is_empty() {
                for (i, b) in r.bots.iter().enumerate() {
                    let a = &self.road.samples[(b.progress.fract() * 420.) as usize % 420];
                    let car = &self.cat.cars[(i * 3 + 2) % self.cat.cars.len()];
                    vehicle(
                        &mut faces,
                        a.point.plus(a.right.scale(b.lane)),
                        a.tangent.x.atan2(a.tangent.z),
                        car,
                        hex(&car.default_color, PINK),
                        GOLD,
                        CYAN,
                        false,
                    );
                }
            }
            let car = self.cat.car(&self.save.selected_car_id);
            let paint = self.save.colors.get(&car.id);
            let body = paint
                .map(|p| hex(&p.body, hex(&car.default_color, CYAN)))
                .unwrap_or_else(|| hex(&car.default_color, CYAN));
            let rims = paint.map(|p| hex(&p.rims, GOLD)).unwrap_or(GOLD);
            let neon = paint.map(|p| hex(&p.neon, CYAN)).unwrap_or(CYAN);
            if self.camera != 2 {
                vehicle(
                    &mut faces,
                    r.pos,
                    r.yaw + r.drift_angle,
                    car,
                    body,
                    rims,
                    neon,
                    r.nitro_active,
                );
            }
            for remote in self.remotes.values() {
                vehicle(
                    &mut faces,
                    remote.current,
                    remote.yaw,
                    self.cat.car(&remote.car),
                    remote.color,
                    GOLD,
                    CYAN,
                    false,
                );
            }
            let _ = s;
        } else {
            clear(BG);
            view = View::new(
                V3::new(self.garage_cam.sin() * 7., 3.5, self.garage_cam.cos() * 7.),
                V3::new(0., 0.7, 0.),
                self.width * 0.57,
                self.height,
                55.,
            );
            face(
                &mut faces,
                vec![
                    V3::new(-50., -0.04, -50.),
                    V3::new(50., -0.04, -50.),
                    V3::new(50., -0.04, 50.),
                    V3::new(-50., -0.04, 50.),
                ],
                0x152338,
            );
            for i in -6..=6 {
                block(
                    &mut faces,
                    V3::new(i as f32 * 2., 0., 0.),
                    V3::new(0.015, 0.01, 24.),
                    0.,
                    0x29425c,
                );
                block(
                    &mut faces,
                    V3::new(0., 0., i as f32 * 2.),
                    V3::new(24., 0.01, 0.015),
                    0.,
                    0x29425c,
                );
            }
            let car = if self.tab == Tab::Dealer {
                &self.cat.cars[self.preview]
            } else {
                self.cat.car(&self.save.selected_car_id)
            };
            let paint = self.save.colors.get(&car.id);
            vehicle(
                &mut faces,
                V3::default(),
                0.,
                car,
                paint
                    .map(|p| hex(&p.body, hex(&car.default_color, CYAN)))
                    .unwrap_or_else(|| hex(&car.default_color, CYAN)),
                paint.map(|p| hex(&p.rims, GOLD)).unwrap_or(GOLD),
                paint.map(|p| hex(&p.neon, CYAN)).unwrap_or(CYAN),
                false,
            );
        }
        view.draw(&mut faces);
    }
    fn draw(&mut self) {
        self.scene();
        if self.race.is_some() {
            self.race_ui();
        } else {
            self.garage_ui();
        }
        if self.notice_time > 0. {
            rect(20., self.height - 72., self.width - 40., 38., 0x253e54);
            text(&self.notice, 34., self.height - 47., 16., WHITE);
        }
        self.click = false;
    }
    fn garage_ui(&mut self) {
        text("NOVA RACER", 28., 46., 30., WHITE);
        text("STREET LEGENDS  /  RUST EDITION", 30., 69., 12., CYAN);
        text(
            &format!(
                "${}    LVL {}    XP {}/{}",
                self.save.cash,
                self.save.level,
                self.save.xp,
                xp_to_next(self.save.level)
            ),
            30.,
            105.,
            15.,
            GOLD,
        );
        let x = self.width * 0.56;
        let w = self.width - x - 24.;
        rect(x - 12., 20., w + 24., self.height - 48., BG);
        if !self.save.starter_chosen {
            text("ZERO TO HERO", x, 60., 26., CYAN);
            text(
                "Choose your starter. $25000 starting cash.",
                x,
                90.,
                14.,
                MUTED,
            );
            for i in 0..3 {
                let car = self.cat.cars[i].clone();
                let y = 125. + i as f32 * 120.;
                text(&car.name, x, y, 16., WHITE);
                text(
                    &format!("{} km/h   ${}   {}", car.base_kmh, car.price, car.car_class),
                    x,
                    y + 25.,
                    14.,
                    MUTED,
                );
                if self.button(
                    &format!("BUY {}", car.id.trim_start_matches("starter_")),
                    x,
                    y + 40.,
                    w,
                    40.,
                    false,
                ) {
                    match self.save.buy(&car.id, &self.cat) {
                        Ok(()) => {
                            self.persist();
                            self.notify("Starter purchased. $7000 left for upgrades.");
                        }
                        Err(e) => self.notify(e),
                    }
                }
            }
            return;
        }
        let car = self.cat.car(&self.save.selected_car_id);
        text(&car.name, 28., self.height - 172., 18., WHITE);
        let (s, max) = self.save.stats(&self.cat);
        text(
            &format!(
                "{} km/h  ACC {:.1}  GRIP {:.1}  DRIFT {:.1}",
                max, s.accel, s.handling, s.drift
            ),
            28.,
            self.height - 145.,
            13.,
            MUTED,
        );
        if self.button("< CAR", 28., self.height - 126., 100., 36., false) {
            self.cycle(-1);
        }
        if self.button("CAR >", 138., self.height - 126., 100., 36., false) {
            self.cycle(1);
        }
        for (i, (label, tab)) in [
            ("DRIVE", Tab::Drive),
            ("TUNING", Tab::Tuning),
            ("CARS", Tab::Dealer),
            ("ONLINE", Tab::Network),
            ("TASKS", Tab::Challenges),
            ("CRATE", Tab::Crate),
        ]
        .into_iter()
        .enumerate()
        {
            if self.button(
                label,
                x + (i % 3) as f32 * (w / 3.),
                32. + (i / 3) as f32 * 42.,
                w / 3. - 5.,
                36.,
                self.tab == tab,
            ) {
                self.tab = tab;
                self.selected = 0;
            }
        }
        match self.tab {
            Tab::Drive => self.drive_ui(x, w),
            Tab::Tuning => self.tuning_ui(x, w),
            Tab::Dealer => self.dealer_ui(x, w),
            Tab::Network => self.online_ui(x, w),
            Tab::Challenges => self.challenges_ui(x, w),
            Tab::Crate => self.crate_ui(x, w),
        }
        if self.button(
            if self.muted { "SOUND OFF" } else { "SOUND ON" },
            28.,
            self.height - 82.,
            100.,
            32.,
            !self.muted,
        ) {
            self.muted = !self.muted;
        }
        if self.button("ROTATE VIEW", 138., self.height - 82., 135., 32., false) {
            self.garage_goal += 0.9;
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
    fn drive_ui(&mut self, x: f32, w: f32) {
        text("CHOOSE A TRACK", x, 145., 18., WHITE);
        for i in 0..self.cat.tracks.len() {
            let t = self.cat.tracks[i].clone();
            let y = 163. + i as f32 * 56.;
            if self.button(&t.name, x, y, w, 48., self.save.selected_track_id == t.id) {
                self.save.selected_track_id = t.id;
                self.persist();
            }
            text(&format!("${}", t.reward), x + w - 70., y + 42., 11., GOLD);
        }
        text("GAME MODE", x, 416., 18., WHITE);
        for i in 0..self.cat.modes.len() {
            let m = self.cat.modes[i].clone();
            let name = match m.id.as_str() {
                "circuit" => "Circuit / 3 laps",
                "drift" => "Drift Attack",
                "timeattack" => "Sprint / 1 lap",
                _ => "Street Duel",
            };
            if self.button(
                name,
                x + (i % 2) as f32 * w / 2.,
                435. + (i / 2) as f32 * 46.,
                w / 2. - 6.,
                40.,
                self.save.selected_mode == m.id,
            ) {
                self.save.selected_mode = m.id;
                self.persist();
            }
        }
        if self.button("START SOLO RACE", x, 550., w, 52., true) {
            if !self.room.is_empty() {
                self.send(json!({"type":"leaveRoom"}));
                self.room.clear();
                self.players.clear();
                self.remotes.clear();
            }
            self.start();
        }
        text(
            "WASD / arrows: drive   SPACE: drift   SHIFT: nitro",
            x,
            630.,
            12.,
            MUTED,
        );
        text(
            "C: camera   R: reset   P: pause   ESC: garage",
            x,
            651.,
            12.,
            MUTED,
        );
    }
    fn tuning_ui(&mut self, x: f32, w: f32) {
        text("PERFORMANCE WORKSHOP", x, 144., 18., WHITE);
        for i in 0..self.cat.tuning.len() {
            let p = self.cat.tuning[i].clone();
            if self.button(
                &format!("{}  [{}]", p.name, self.save.stage(&p.id)),
                x + (i % 3) as f32 * w / 3.,
                162. + (i / 3) as f32 * 41.,
                w / 3. - 5.,
                35.,
                i == self.part,
            ) {
                self.part = i;
                self.garage_goal = match p.cam.as_str() {
                    "front" => 0.1,
                    "rear" | "exhaust" => 3.1,
                    "rims" => 1.6,
                    _ => 2.5,
                };
            }
        }
        let p = self.cat.tuning[self.part].clone();
        let stage = self.save.stage(&p.id);
        text(
            &format!("{} / STAGE {} OF 4", p.name, stage),
            x,
            365.,
            18.,
            GOLD,
        );
        let cost = (p.cost as f64 * f64::from(stage + 1) * 1.3).round() as u64;
        if self.button(
            &if stage == 4 {
                "MAXIMUM STAGE".into()
            } else {
                format!("INSTALL NEXT STAGE / ${cost}")
            },
            x,
            388.,
            w,
            45.,
            stage < 4,
        ) {
            match self.save.upgrade(&p.id, &self.cat) {
                Ok(()) => {
                    self.persist();
                    self.notify("Upgrade installed");
                }
                Err(e) => self.notify(e),
            }
        }
        for (i, label) in ["BODY", "RIMS", "NEON"].iter().enumerate() {
            if self.button(
                label,
                x + i as f32 * w / 3.,
                462.,
                w / 3. - 5.,
                32.,
                self.paint_channel == i,
            ) {
                self.paint_channel = i;
            }
        }
        for (i, c) in [
            CYAN, PINK, GOLD, 0xef4444, 0x10b981, 0xeaf2ff, 0x3b82f6, 0x111111,
        ]
        .iter()
        .enumerate()
        {
            let bx = x + i as f32 * w / 8.;
            if self.button("", bx, 510., w / 8. - 5., 38., false) {
                let car = self.cat.car(&self.save.selected_car_id);
                let paint = self.save.colors.entry(car.id.clone()).or_insert(Paint {
                    body: car.default_color.clone(),
                    rims: "#ffcc55".into(),
                    neon: "#20e3e8".into(),
                });
                let color = format!("#{c:06x}");
                match self.paint_channel {
                    0 => paint.body = color,
                    1 => paint.rims = color,
                    _ => paint.neon = color,
                };
                self.persist();
            }
            rect(bx + 5., 515., w / 8. - 15., 28., *c);
        }
        let (s, max) = self.save.stats(&self.cat);
        text(
            &format!(
                "{} km/h   Power {:.1}   Brakes {:.1}",
                max, s.accel, s.brakes
            ),
            x,
            590.,
            14.,
            MUTED,
        );
    }
    fn dealer_ui(&mut self, x: f32, w: f32) {
        let filters = ["all", "cult", "wagon", "suv", "gt3", "hyper"];
        for (i, label) in filters.iter().enumerate() {
            if self.button(
                label,
                x + i as f32 * w / 6.,
                128.,
                w / 6. - 4.,
                30.,
                self.filter == i,
            ) {
                self.filter = i;
                self.selected = 0;
            }
        }
        let ids: Vec<_> = self
            .cat
            .cars
            .iter()
            .enumerate()
            .filter(|(_, c)| self.filter == 0 || c.car_class == filters[self.filter])
            .map(|(i, _)| i)
            .collect();
        let page = self.selected.min(ids.len().saturating_sub(1));
        for (row, i) in ids.iter().skip(page).take(5).enumerate() {
            let c = self.cat.cars[*i].clone();
            let y = 181. + row as f32 * 85.;
            let owned = self.save.owned_cars.contains(&c.id);
            if self.button(&c.name, x, y, w, 36., self.preview == *i) {
                self.preview = *i;
            }
            text(
                &format!(
                    "{} km/h | {} | LVL {} | ${}",
                    c.base_kmh, c.rarity, c.level_req, c.price
                ),
                x + 6.,
                y + 52.,
                12.,
                MUTED,
            );
            if self.button(
                if owned { "SELECT" } else { "BUY" },
                x + w - 100.,
                y + 41.,
                100.,
                30.,
                owned,
            ) {
                match self.save.buy(&c.id, &self.cat) {
                    Ok(()) => {
                        self.persist();
                        self.notify("Car selected");
                    }
                    Err(e) => self.notify(e),
                }
            }
        }
        if self.button("PREV", x, 635., w / 2. - 5., 34., false) {
            self.selected = self.selected.saturating_sub(5);
        }
        if self.button("NEXT", x + w / 2., 635., w / 2. - 5., 34., false) {
            self.selected = (page + 5).min(ids.len().saturating_sub(1));
        }
    }
    fn online_ui(&mut self, x: f32, w: f32) {
        text("PRIVATE FRIEND RACES", x, 147., 18., WHITE);
        text(
            "Same-origin Rust WebSocket relay. No PeerJS service.",
            x,
            175.,
            12.,
            MUTED,
        );
        if self.button(
            if self.connected {
                "RECONNECT RELAY"
            } else {
                "CONNECT RELAY"
            },
            x,
            195.,
            w,
            38.,
            self.connected,
        ) {
            write(2, "");
        }
        let typed = read(3);
        for c in typed.chars() {
            if c == '\u{8}' {
                if self.chat_focus {
                    self.chat_input.pop();
                } else {
                    self.room_input.pop();
                }
            } else if self.chat_focus {
                if !c.is_control() && self.chat_input.chars().count() < 80 {
                    self.chat_input.push(c);
                }
            } else if c.is_ascii_alphanumeric() && self.room_input.len() < 10 {
                self.room_input.push(c.to_ascii_uppercase());
            }
        }
        if self.button(
            &format!("ROOM CODE: {}_", self.room_input),
            x,
            246.,
            w,
            38.,
            !self.chat_focus,
        ) {
            self.chat_focus = false;
        }
        for (i, label) in ["CREATE ROOM", "JOIN ROOM"].iter().enumerate() {
            if self.button(label, x + i as f32 * w / 2., 296., w / 2. - 5., 38., false) {
                if !self.connected {
                    self.notify("Connect the relay first");
                } else {
                    self.send(json!({"type":if i==0{"createRoom"}else{"joinRoom"},"code":self.room_input,"player":self.profile(),"config":self.cfg()}));
                }
            }
        }
        text(
            &format!(
                "ROOM: {}    {}/8 PLAYERS",
                if self.room.is_empty() {
                    "-"
                } else {
                    &self.room
                },
                self.players.len()
            ),
            x,
            365.,
            15.,
            CYAN,
        );
        text(&format!("HOST: {}", self.host), x, 389., 11., MUTED);
        if !self.room.is_empty() {
            if self.button(
                "HOST: START RACE",
                x,
                407.,
                w - 100.,
                40.,
                self.host == self.id,
            ) {
                self.send(json!({"type":"startRace","config":self.cfg()}));
            }
            if self.button("LEAVE", x + w - 94., 407., 94., 40., false) {
                self.send(json!({"type":"leaveRoom"}));
                self.room.clear();
                self.players.clear();
                self.remotes.clear();
            }
            if self.button(
                &format!("CHAT: {}_", self.chat_input),
                x,
                461.,
                w - 70.,
                34.,
                self.chat_focus,
            ) {
                self.chat_focus = true;
            }
            if self.button("SEND", x + w - 66., 461., 66., 34., false) {
                self.send(json!({"type":"chat","text":self.chat_input}));
                self.chat_input.clear();
            }
            for (i, s) in self.chats.iter().rev().take(6).enumerate() {
                text(s, x, 521. + i as f32 * 20., 12., MUTED);
            }
        }
        text(
            "Client-reported positions and scores; private play only.",
            x,
            671.,
            12.,
            MUTED,
        );
    }
    fn challenges_ui(&mut self, x: f32, w: f32) {
        text("DAILY + CAREER CHALLENGES", x, 145., 18., WHITE);
        for i in 0..self.cat.challenges.len() {
            let c = self.cat.challenges[i].clone();
            let y = 180. + i as f32 * 80.;
            text(&c.title, x, y, 16., WHITE);
            text(
                &format!(
                    "{} / {}   +${}   +{} XP",
                    self.save.progress(&c.id),
                    c.target,
                    c.cash,
                    c.xp
                ),
                x,
                y + 22.,
                12.,
                MUTED,
            );
            rect(x, y + 31., w - 106., 4., EDGE);
            rect(
                x,
                y + 31.,
                (w - 106.) * (self.save.progress(&c.id) as f32 / c.target as f32).min(1.),
                4.,
                CYAN,
            );
            if self.button(
                if self.save.challenge_claimed.get(&c.id) == Some(&true) {
                    "CLAIMED"
                } else {
                    "CLAIM"
                },
                x + w - 100.,
                y - 10.,
                100.,
                38.,
                self.save.progress(&c.id) >= c.target,
            ) {
                match self.save.claim(&c.id, &self.cat) {
                    Ok(()) => {
                        self.persist();
                        self.notify("Reward claimed");
                    }
                    Err(e) => self.notify(e),
                }
            }
        }
    }
    fn crate_ui(&mut self, x: f32, w: f32) {
        text("MYSTERY CRATE", x, 153., 24., GOLD);
        text(
            &format!("{} FREE SPINS", self.save.free_spins),
            x,
            201.,
            18.,
            CYAN,
        );
        text("A finished race earns one free spin.", x, 235., 14., MUTED);
        text(
            "Otherwise costs $7500 of in-game cash.",
            x,
            258.,
            14.,
            MUTED,
        );
        for (i, s) in [
            "40%  $5000 cash",
            "30%  450 reputation XP",
            "16%  $14000 jackpot",
            "7%   Beta RR 50 Moped",
            "5%   Bangkok TukTuk",
            "2%   Stark Varg Supermoto",
        ]
        .iter()
        .enumerate()
        {
            text(s, x, 310. + i as f32 * 32., 16., WHITE);
        }
        if self.button("OPEN CRATE", x, 553., w, 50., true) {
            self.rng ^= self.rng << 13;
            self.rng ^= self.rng >> 17;
            self.rng ^= self.rng << 5;
            let roll = (self.rng % 100) as u8;
            match self.save.spin(roll) {
                Ok(s) => {
                    self.notify(s);
                    self.persist();
                }
                Err(e) => self.notify(e),
            }
        }
    }
    fn race_ui(&mut self) {
        let r = self.race.as_ref().unwrap();
        let lap = r.lap.min(r.max_laps);
        rect(20., 20., 350., 88., BG);
        text(
            &format!("LAP {lap}/{}   POS {}", r.max_laps, r.rank),
            36.,
            51.,
            21.,
            WHITE,
        );
        text(
            &format!(
                "TIME {:02}:{:05.2}   {:?}",
                (r.elapsed / 60.) as u32,
                r.elapsed % 60.,
                self.save.selected_mode
            ),
            36.,
            80.,
            16.,
            CYAN,
        );
        rect(self.width - 260., 20., 240., 90., BG);
        text(
            &format!("{:.0} KM/H", r.speed.abs()),
            self.width - 244.,
            60.,
            30.,
            WHITE,
        );
        text(
            &format!(
                "GEAR {}   NOS {:.0}%",
                if r.speed < -1. {
                    "R".into()
                } else {
                    format!("{}", ((r.speed.abs() / 52.).floor() as u32 + 1).min(6))
                },
                r.nos
            ),
            self.width - 244.,
            88.,
            15.,
            GOLD,
        );
        rect(self.width - 244., 98., 200. * r.nos / 100., 4., CYAN);
        if r.countdown > 0. {
            text(
                &format!("{}", (r.countdown / 0.85).ceil() as u32),
                self.width * 0.5 - 22.,
                self.height * 0.42,
                80.,
                GOLD,
            );
        }
        if r.paused {
            text(
                "PAUSED / P TO RESUME",
                self.width * 0.5 - 190.,
                self.height * 0.4,
                30.,
                WHITE,
            );
        }
        if r.toast_time > 0. {
            text(&r.toast, self.width * 0.5 - 150., 140., 24., GOLD);
        }
        if r.drift_points > 0 {
            text(
                &format!("DRIFT x{}  {} PTS", r.combo, r.drift_points),
                self.width * 0.5 - 150.,
                180.,
                24.,
                CYAN,
            );
        }
        // Track overview, including remote drivers.
        let mapx = 24.;
        let mapy = self.height - 260.;
        rect(mapx - 4., mapy - 4., 220., 170., BG);
        let points = &self.road.samples;
        let minx = points
            .iter()
            .map(|s| s.point.x)
            .fold(f32::INFINITY, f32::min);
        let maxx = points
            .iter()
            .map(|s| s.point.x)
            .fold(f32::NEG_INFINITY, f32::max);
        let minz = points
            .iter()
            .map(|s| s.point.z)
            .fold(f32::INFINITY, f32::min);
        let maxz = points
            .iter()
            .map(|s| s.point.z)
            .fold(f32::NEG_INFINITY, f32::max);
        let scale = (190. / (maxx - minx)).min(140. / (maxz - minz));
        let mp = |p: V3| {
            (
                mapx + 10. + (p.x - minx) * scale,
                mapy + 10. + (p.z - minz) * scale,
            )
        };
        for i in (0..420).step_by(3) {
            let (a, b) = mp(points[i].point);
            let (c, d) = mp(points[(i + 3) % 420].point);
            line(a, b, c, d, 3., MUTED);
        }
        let (a, b) = mp(r.pos);
        rect(a - 3., b - 3., 7., 7., CYAN);
        for remote in self.remotes.values() {
            let (a, b) = mp(remote.current);
            rect(a - 3., b - 3., 6., 6., PINK);
        }
        text("WASD: DRIVE | SPACE: DRIFT | SHIFT: NOS | C: CAMERA | R: RESET | P: PAUSE | ESC: GARAGE",24.,self.height-24.,12.,WHITE);
        let finished = r.finished;
        let time = r.elapsed;
        let stunt = r.stunt_cash;
        let drift = r.total_drift;
        if finished {
            let x = self.width * 0.5 - 240.;
            let y = self.height * 0.5 - 160.;
            rect(x, y, 480., 300., BG);
            text("RACE COMPLETE", x + 40., y + 55., 30., CYAN);
            text(
                &format!("TIME {:.2}s   DRIFT {}", time, drift),
                x + 40.,
                y + 98.,
                19.,
                WHITE,
            );
            text(
                &format!(
                    "+${} RACE   +${} STUNTS",
                    self.cat.track(&self.save.selected_track_id).reward,
                    stunt
                ),
                x + 40.,
                y + 137.,
                18.,
                GOLD,
            );
            text(
                "+1 FREE SPIN / REPUTATION XP SAVED",
                x + 40.,
                y + 174.,
                15.,
                MUTED,
            );
            if self.button("RETURN TO GARAGE", x + 40., y + 212., 400., 48., true) {
                self.race = None;
                self.persist();
            }
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
    w: f32,
    h: f32,
    dt: f32,
    keys: u32,
    pressed: u32,
    mx: f32,
    my: f32,
    click: u32,
) {
    GAME.with(|cell| {
        if let Some(g) = cell.borrow_mut().as_mut() {
            g.width = w.max(960.);
            g.height = h.max(740.);
            g.mx = mx;
            g.my = my;
            g.click = click != 0;
            g.tick(
                if dt.is_finite() {
                    dt.clamp(0., 0.05)
                } else {
                    0.
                },
                keys,
                pressed,
            );
            g.draw();
        }
    });
}
