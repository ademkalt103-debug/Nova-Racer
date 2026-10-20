//! Deterministic game rules shared by the browser renderer and relay.
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Debug, Deserialize)]
pub struct Catalog {
    pub cars: Vec<Car>,
    pub tuning: Vec<Tuning>,
    pub tracks: Vec<Track>,
    pub modes: Vec<Mode>,
    pub challenges: Vec<Challenge>,
}
impl Catalog {
    pub fn load() -> Self {
        serde_json::from_str(include_str!("../data/catalog.json")).expect("embedded catalog")
    }
    pub fn car(&self, id: &str) -> &Car {
        self.cars
            .iter()
            .find(|c| c.id == id)
            .unwrap_or(&self.cars[0])
    }
    pub fn track(&self, id: &str) -> &Track {
        self.tracks
            .iter()
            .find(|c| c.id == id)
            .unwrap_or(&self.tracks[0])
    }
}
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Car {
    pub id: String,
    pub name: String,
    pub brand: String,
    pub car_class: String,
    pub mesh_type: String,
    pub rarity: String,
    pub level_req: u32,
    pub price: u64,
    pub default_color: String,
    pub sound_profile: String,
    pub stats: Stats,
    pub base_kmh: f32,
}
#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    pub top_speed: f32,
    pub accel: f32,
    pub handling: f32,
    pub drift: f32,
    pub brakes: f32,
}
#[derive(Clone, Debug, Deserialize)]
pub struct Tuning {
    pub id: String,
    pub name: String,
    pub cam: String,
    pub cost: u64,
    pub bonus: Stats,
}
#[derive(Clone, Debug, Deserialize)]
pub struct Track {
    pub id: String,
    pub name: String,
    pub region: String,
    pub sky: u32,
    pub ground: u32,
    pub road: u32,
    pub reward: u64,
    pub points: Vec<[f32; 3]>,
}
#[derive(Clone, Debug, Deserialize)]
pub struct Mode {
    pub id: String,
    pub name: String,
}
#[derive(Clone, Debug, Deserialize)]
pub struct Challenge {
    pub id: String,
    pub title: String,
    pub desc: String,
    pub target: u64,
    pub cash: u64,
    pub xp: u64,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct Paint {
    pub body: String,
    pub rims: String,
    pub neon: String,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Save {
    pub version: u32,
    pub cash: u64,
    pub xp: u64,
    pub level: u32,
    pub starter_chosen: bool,
    pub owned_cars: Vec<String>,
    pub selected_car_id: String,
    pub selected_track_id: String,
    pub selected_mode: String,
    pub free_spins: u32,
    pub tuning: BTreeMap<String, BTreeMap<String, u8>>,
    pub colors: BTreeMap<String, Paint>,
    pub daily_date: String,
    pub challenge_progress: BTreeMap<String, u64>,
    pub challenge_claimed: BTreeMap<String, bool>,
}
impl Default for Save {
    fn default() -> Self {
        Self {
            version: 7,
            cash: 25000,
            xp: 0,
            level: 1,
            starter_chosen: false,
            owned_cars: vec![],
            selected_car_id: "starter_golf2".into(),
            selected_track_id: "woerthersee".into(),
            selected_mode: "circuit".into(),
            free_spins: 0,
            tuning: BTreeMap::new(),
            colors: BTreeMap::new(),
            daily_date: String::new(),
            challenge_progress: BTreeMap::new(),
            challenge_claimed: BTreeMap::new(),
        }
    }
}
pub fn xp_to_next(level: u32) -> u64 {
    (1000.0 * (level.max(1) as f64).powf(1.35)).floor() as u64
}
impl Save {
    pub fn load(json: &str, cat: &Catalog, day: &str) -> Self {
        let mut save: Self = serde_json::from_str(json).unwrap_or_default();
        save.level = save.level.clamp(1, 1000);
        save.cash = save.cash.min(1_000_000_000);
        save.xp = save.xp.min(1_000_000_000);
        save.free_spins = save.free_spins.min(10000);
        let mut seen = BTreeSet::new();
        save.owned_cars
            .retain(|id| cat.cars.iter().any(|c| c.id == *id) && seen.insert(id.clone()));
        save.starter_chosen = !save.owned_cars.is_empty();
        if !save.owned_cars.contains(&save.selected_car_id) {
            save.selected_car_id = save
                .owned_cars
                .first()
                .cloned()
                .unwrap_or_else(|| cat.cars[0].id.clone());
        }
        if !cat.tracks.iter().any(|t| t.id == save.selected_track_id) {
            save.selected_track_id = cat.tracks[0].id.clone();
        }
        if !cat.modes.iter().any(|t| t.id == save.selected_mode) {
            save.selected_mode = cat.modes[0].id.clone();
        }
        for parts in save.tuning.values_mut() {
            for stage in parts.values_mut() {
                *stage = (*stage).min(4);
            }
        }
        save.reset_day(day);
        save
    }
    pub fn reset_day(&mut self, day: &str) {
        if self.daily_date != day {
            for id in ["d_drift", "d_nearmiss", "d_airtime"] {
                self.challenge_progress.remove(id);
                self.challenge_claimed.remove(id);
            }
            self.daily_date = day.into();
        }
    }
    pub fn add_xp(&mut self, xp: u64) {
        self.xp = self.xp.saturating_add(xp);
        while self.level < 1000 && self.xp >= xp_to_next(self.level) {
            self.xp -= xp_to_next(self.level);
            self.level += 1;
        }
    }
    pub fn progress(&self, id: &str) -> u64 {
        *self.challenge_progress.get(id).unwrap_or(&0)
    }
    pub fn add_progress(&mut self, id: &str, n: u64) {
        let p = self.challenge_progress.entry(id.into()).or_default();
        *p = p.saturating_add(n);
    }
    pub fn buy(&mut self, id: &str, cat: &Catalog) -> Result<(), &'static str> {
        let car = cat.cars.iter().find(|c| c.id == id).ok_or("Unknown car")?;
        if self.owned_cars.contains(&car.id) {
            self.selected_car_id = car.id.clone();
            return Ok(());
        }
        if !self.starter_chosen && !car.id.starts_with("starter_") {
            return Err("Choose a starter first");
        }
        if self.level < car.level_req {
            return Err("Reputation level too low");
        }
        if self.cash < car.price {
            return Err("Not enough cash");
        }
        self.cash -= car.price;
        self.owned_cars.push(car.id.clone());
        self.selected_car_id = car.id.clone();
        self.starter_chosen = true;
        self.challenge_progress
            .insert("p_cars".into(), self.owned_cars.len() as u64);
        Ok(())
    }
    pub fn stage(&self, cat: &str) -> u8 {
        self.tuning
            .get(&self.selected_car_id)
            .and_then(|p| p.get(cat))
            .copied()
            .unwrap_or(0)
    }
    pub fn upgrade(&mut self, id: &str, cat: &Catalog) -> Result<(), &'static str> {
        if !self.starter_chosen {
            return Err("Choose a starter first");
        }
        let part = cat
            .tuning
            .iter()
            .find(|t| t.id == id)
            .ok_or("Unknown part")?;
        let stage = self.stage(id);
        if stage >= 4 {
            return Err("Maximum stage installed");
        }
        let cost = (part.cost as f64 * f64::from(stage + 1) * 1.3).round() as u64;
        if self.cash < cost {
            return Err("Not enough cash");
        }
        self.cash -= cost;
        self.tuning
            .entry(self.selected_car_id.clone())
            .or_default()
            .insert(id.into(), stage + 1);
        Ok(())
    }
    pub fn stats(&self, cat: &Catalog) -> (Stats, f32) {
        let car = cat.car(&self.selected_car_id);
        let mut s = car.stats;
        let mut sum = 0;
        for p in &cat.tuning {
            let n = f32::from(self.stage(&p.id));
            sum += self.stage(&p.id) as u32;
            s.top_speed = (s.top_speed + p.bonus.top_speed * n).min(10.);
            s.accel = (s.accel + p.bonus.accel * n).min(10.);
            s.handling = (s.handling + p.bonus.handling * n).min(10.);
            s.drift = (s.drift + p.bonus.drift * n).min(10.);
            s.brakes = (s.brakes + p.bonus.brakes * n).min(10.);
        }
        (s, (car.base_kmh + sum as f32 * 3.2).round())
    }
    pub fn claim(&mut self, id: &str, cat: &Catalog) -> Result<(), &'static str> {
        let c = cat
            .challenges
            .iter()
            .find(|c| c.id == id)
            .ok_or("Unknown challenge")?;
        if self.progress(id) < c.target {
            return Err("Challenge incomplete");
        }
        if self.challenge_claimed.get(id) == Some(&true) {
            return Err("Already claimed");
        }
        self.cash += c.cash;
        self.add_xp(c.xp);
        self.challenge_claimed.insert(id.into(), true);
        Ok(())
    }
    pub fn spin(&mut self, roll: u8) -> Result<&'static str, &'static str> {
        if !self.starter_chosen {
            return Err("Choose a starter first");
        }
        if self.free_spins > 0 {
            self.free_spins -= 1;
        } else if self.cash >= 7500 {
            self.cash -= 7500;
        } else {
            return Err("Need $7500 or a free spin");
        }
        let car = match roll % 100 {
            0..=39 => {
                self.cash += 5000;
                return Ok("+$5000 Cash");
            }
            40..=69 => {
                self.add_xp(450);
                return Ok("+450 XP");
            }
            70..=85 => {
                self.cash += 14000;
                return Ok("+$14000 Jackpot");
            }
            86..=92 => "cult_moped",
            93..=97 => "cult_tuktuk",
            _ => "cult_starkvarg",
        };
        if self.owned_cars.iter().any(|id| id == car) {
            self.cash += 12000;
            return Ok("Duplicate car: +$12000");
        }
        self.owned_cars.push(car.into());
        self.challenge_progress
            .insert("p_cars".into(), self.owned_cars.len() as u64);
        Ok(car)
    }
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize)]
pub struct V3 {
    pub x: f32,
    pub y: f32,
    pub z: f32,
}
impl V3 {
    pub fn new(x: f32, y: f32, z: f32) -> Self {
        Self { x, y, z }
    }
    pub fn plus(self, b: Self) -> Self {
        Self::new(self.x + b.x, self.y + b.y, self.z + b.z)
    }
    pub fn minus(self, b: Self) -> Self {
        Self::new(self.x - b.x, self.y - b.y, self.z - b.z)
    }
    pub fn scale(self, n: f32) -> Self {
        Self::new(self.x * n, self.y * n, self.z * n)
    }
    pub fn length(self) -> f32 {
        (self.x * self.x + self.y * self.y + self.z * self.z).sqrt()
    }
    pub fn unit(self) -> Self {
        self.scale(1. / self.length().max(0.0001))
    }
    pub fn dot(self, b: Self) -> f32 {
        self.x * b.x + self.y * b.y + self.z * b.z
    }
    pub fn cross(self, b: Self) -> Self {
        Self::new(
            self.y * b.z - self.z * b.y,
            self.z * b.x - self.x * b.z,
            self.x * b.y - self.y * b.x,
        )
    }
}
#[derive(Clone, Debug)]
pub struct Sample {
    pub point: V3,
    pub tangent: V3,
    pub right: V3,
    pub up: V3,
}
#[derive(Clone, Debug)]
pub struct Road {
    pub samples: Vec<Sample>,
    pub length: f32,
}
impl Road {
    pub fn new(track: &Track) -> Self {
        let p: Vec<_> = track
            .points
            .iter()
            .map(|p| V3::new(p[0] * 1.45, p[1] * 1.35, p[2] * 1.45))
            .collect();
        let mut dense = Vec::new();
        let n = p.len();
        for i in 0..n {
            for k in 0..100 {
                let t = k as f32 / 100.;
                let a = p[(i + n - 1) % n];
                let b = p[i];
                let c = p[(i + 1) % n];
                let d = p[(i + 2) % n];
                dense.push(
                    b.scale(2.)
                        .plus(c.minus(a).scale(t))
                        .plus(
                            a.scale(2.)
                                .minus(b.scale(5.))
                                .plus(c.scale(4.))
                                .minus(d)
                                .scale(t * t),
                        )
                        .plus(
                            a.scale(-1.)
                                .plus(b.scale(3.))
                                .minus(c.scale(3.))
                                .plus(d)
                                .scale(t * t * t),
                        )
                        .scale(0.5),
                );
            }
        }
        dense.push(dense[0]);
        let mut lengths = vec![0.];
        for i in 1..dense.len() {
            lengths.push(lengths[i - 1] + dense[i].minus(dense[i - 1]).length());
        }
        let length = *lengths.last().unwrap();
        let mut points = Vec::new();
        let mut j = 1;
        for i in 0..420 {
            let dist = length * i as f32 / 420.;
            while j < lengths.len() - 1 && lengths[j] < dist {
                j += 1;
            }
            let a = (dist - lengths[j - 1]) / (lengths[j] - lengths[j - 1]).max(0.0001);
            points.push(dense[j - 1].scale(1. - a).plus(dense[j].scale(a)));
        }
        let samples = (0..420)
            .map(|i| {
                let a = points[(i + 419) % 420];
                let b = points[i];
                let c = points[(i + 1) % 420];
                let tangent = c.minus(a).unit();
                let u = b.minus(a).unit();
                let v = c.minus(b).unit();
                let bank = ((u.z * v.x - u.x * v.z) * 2.8).clamp(-0.26, 0.26);
                let up = V3::new(0., 1., 0.)
                    .scale(bank.cos())
                    .plus(tangent.cross(V3::new(0., 1., 0.)).scale(bank.sin()))
                    .plus(tangent.scale(tangent.y * (1. - bank.cos())))
                    .unit();
                Sample {
                    point: b,
                    tangent,
                    right: tangent.cross(up).unit(),
                    up,
                }
            })
            .collect();
        Self { samples, length }
    }
    pub fn closest(&self, p: V3) -> (usize, f32) {
        self.samples
            .iter()
            .enumerate()
            .map(|(i, s)| {
                let d = (p.x - s.point.x).powi(2) + (p.z - s.point.z).powi(2);
                (i, d)
            })
            .min_by(|a, b| a.1.total_cmp(&b.1))
            .map(|(i, d)| (i, d.sqrt()))
            .unwrap()
    }
}
#[derive(Clone, Copy, Default)]
pub struct Input {
    pub gas: bool,
    pub brake: bool,
    pub left: bool,
    pub right: bool,
    pub drift: bool,
    pub nos: bool,
}
#[derive(Clone, Debug)]
pub struct Bot {
    pub progress: f32,
    pub speed: f32,
    pub lane: f32,
    pub cooldown: f32,
}
#[derive(Clone, Debug)]
pub struct Race {
    pub pos: V3,
    pub yaw: f32,
    pub speed: f32,
    pub nos: f32,
    pub lap: u32,
    pub max_laps: u32,
    pub sample: usize,
    pub countdown: f32,
    pub elapsed: f32,
    pub finished: bool,
    pub paid: bool,
    pub paused: bool,
    pub drift_angle: f32,
    pub drift_points: u64,
    pub total_drift: u64,
    pub combo: u32,
    pub drift_time: f32,
    pub stunt_cash: u64,
    pub toast: String,
    pub toast_time: f32,
    pub bots: Vec<Bot>,
    pub rank: u32,
    pub vel_y: f32,
    pub airtime: f32,
    pub slip_time: f32,
    pub checkpoints: u8,
    pub nitro_active: bool,
}
impl Race {
    pub fn new(road: &Road, mode: &str) -> Self {
        let s = &road.samples[0];
        Self {
            pos: s.point,
            yaw: s.tangent.x.atan2(s.tangent.z),
            speed: 0.,
            nos: 100.,
            lap: 1,
            max_laps: if mode == "timeattack" { 1 } else { 3 },
            sample: 0,
            countdown: 2.55,
            elapsed: 0.,
            finished: false,
            paid: false,
            paused: false,
            drift_angle: 0.,
            drift_points: 0,
            total_drift: 0,
            combo: 1,
            drift_time: 0.,
            stunt_cash: 0,
            toast: String::new(),
            toast_time: 0.,
            bots: (0..3)
                .map(|i| Bot {
                    progress: 0.025 * (i + 1) as f32,
                    speed: 165. + i as f32 * 22.,
                    lane: (i as f32 - 1.) * 3.1,
                    cooldown: 0.,
                })
                .collect(),
            rank: 1,
            vel_y: 0.,
            airtime: 0.,
            slip_time: 0.,
            checkpoints: 0,
            nitro_active: false,
        }
    }
    pub fn reset(&mut self, road: &Road) {
        let s = &road.samples[self.sample];
        self.pos = s.point;
        self.yaw = s.tangent.x.atan2(s.tangent.z);
        self.speed = 0.;
        self.vel_y = 0.;
        self.airtime = 0.;
        self.drift_points = 0;
    }
    fn stunt(&mut self, text: &str, cash: u64, nos: f32) {
        self.stunt_cash += cash;
        self.nos = (self.nos + nos).min(100.);
        self.toast = format!("{text} +${cash}");
        self.toast_time = 2.3;
    }
    pub fn step(
        &mut self,
        dt: f32,
        input: Input,
        stats: Stats,
        max_speed: f32,
        road: &Road,
        save: &mut Save,
    ) {
        if self.finished || self.paused || !dt.is_finite() {
            return;
        }
        let dt = dt.clamp(0., 0.05);
        self.toast_time = (self.toast_time - dt).max(0.);
        if self.countdown > 0. {
            self.countdown = (self.countdown - dt).max(0.);
            return;
        }
        self.elapsed += dt;
        self.nitro_active = input.nos && self.nos > 0. && self.speed > 40.;
        self.nos = (self.nos + dt * if self.nitro_active { -26. } else { 3.5 }).clamp(0., 100.);
        if input.gas {
            self.speed +=
                (32. + stats.accel * 6.8) * dt * if self.nitro_active { 1.42 } else { 1. };
        } else if input.brake {
            self.speed = if self.speed > 2. {
                (self.speed - (65. + stats.brakes * 9.5) * dt).max(0.)
            } else {
                (self.speed - 28. * dt).max(-35.)
            };
        } else {
            self.speed *= 1. - dt * 0.35;
        }
        self.speed = self
            .speed
            .clamp(-35., max_speed * if self.nitro_active { 1.12 } else { 1. });
        let top = save
            .progress("p_topspeed")
            .max(self.speed.max(0.).round() as u64);
        save.challenge_progress.insert("p_topspeed".into(), top);
        let steer = i32::from(input.left) - i32::from(input.right);
        if input.drift {
            self.speed *= 1. - dt * 0.45;
        }
        let drifting = input.drift && steer != 0 && self.speed > 55.;
        if self.speed.abs() > 2. {
            self.yaw += steer as f32
                * (1.15 + stats.handling * 0.12)
                * (self.speed.abs() / 110.).min(1.)
                * if drifting { 1.32 } else { 1. }
                * dt
                * self.speed.signum();
        }
        if drifting {
            self.drift_angle +=
                (steer as f32 * (0.42 + stats.drift * 0.025) - self.drift_angle) * dt * 6.5;
            self.drift_time += dt;
            let pts = (self.speed * dt * 2.4 * self.combo as f32).round() as u64;
            self.drift_points += pts;
            self.total_drift += pts;
            save.add_progress("d_drift", pts);
            self.combo = if self.drift_time > 3.5 {
                5
            } else if self.drift_time > 2. {
                3
            } else if self.drift_time > 0.9 {
                2
            } else {
                1
            };
        } else {
            if self.drift_points >= 350 {
                self.stunt(
                    "DRIFT COMBO",
                    (self.drift_points as f32 * 0.35).round() as u64,
                    self.combo as f32 * 4.,
                );
            }
            self.drift_points = 0;
            self.combo = 1;
            self.drift_time = 0.;
            self.drift_angle *= 1. - dt * 8.;
        }
        let meters = self.speed / 3.6 * dt;
        self.pos.x += self.yaw.sin() * meters;
        self.pos.z += self.yaw.cos() * meters;
        let (idx, dist) = road.closest(self.pos);
        let sample = &road.samples[idx];
        let road_y = sample.point.y;
        let slope = road.samples[(idx + 1) % 420].point.y - road_y;
        if self.pos.y <= road_y + 0.05 {
            if self.airtime > 0.4 {
                save.add_progress("d_airtime", 1);
                self.stunt("AIRTIME LANDING", 400, 15.);
            }
            self.airtime = 0.;
            self.pos.y = road_y;
            if slope < -0.18 && self.speed > 145. {
                self.vel_y = self.speed / 220. * 5.2;
                self.pos.y += 0.12;
            } else {
                self.vel_y = 0.;
            }
        } else {
            self.vel_y -= 19.6 * dt;
            self.pos.y = (self.pos.y + self.vel_y * dt).max(road_y);
            self.airtime += dt;
        }
        if dist > 9. {
            self.speed *= 1. - dt * 1.1;
            self.drift_points = 0;
            self.combo = 1;
            if dist > 13.3 {
                self.pos.x += (sample.point.x - self.pos.x) * dt * 4.;
                self.pos.z += (sample.point.z - self.pos.z) * dt * 4.;
            }
        }
        // Ordered checkpoints prevent start-line oscillation from awarding laps.
        if dist < 10. {
            match self.checkpoints {
                0 if (100..140).contains(&idx) => self.checkpoints = 1,
                1 if (205..245).contains(&idx) => self.checkpoints = 2,
                2 if (310..350).contains(&idx) => self.checkpoints = 3,
                _ => {}
            }
            if self.checkpoints == 3 && self.sample > 344 && idx < 75 && self.speed > 0. {
                self.lap += 1;
                self.checkpoints = 0;
                if self.lap > self.max_laps {
                    self.finished = true;
                }
            }
        }
        self.sample = idx;
        let mut near = 0;
        let mut slip = false;
        let player_progress = (self.lap - 1) as f32 + idx as f32 / 420.;
        self.rank = 1;
        for bot in &mut self.bots {
            bot.progress += bot.speed / 3.6 * dt / road.length;
            let b = &road.samples[(bot.progress.fract() * 420.) as usize % 420];
            let p = b.point.plus(b.right.scale(bot.lane));
            let delta = p.minus(self.pos);
            let d = delta.length();
            bot.cooldown = (bot.cooldown - dt).max(0.);
            if bot.progress > player_progress {
                self.rank += 1;
            }
            if d > 2.2 && d < 4.2 && self.speed > 105. && bot.cooldown <= 0. {
                bot.cooldown = 3.;
                near += 1;
            }
            if d < 2.2 {
                self.speed *= 1. - dt * 2.;
            }
            if d > 4.5
                && d < 19.
                && self.speed > 95.
                && delta
                    .unit()
                    .dot(V3::new(self.yaw.sin(), 0., self.yaw.cos()))
                    > 0.92
            {
                slip = true;
            }
        }
        if near > 0 {
            save.add_progress("d_nearmiss", near);
            self.stunt("NEAR MISS", 250 * near, 10.);
        }
        if slip {
            self.slip_time += dt;
            self.speed += 12. * dt;
            if self.slip_time > 1.2 {
                self.slip_time = 0.;
                self.stunt("SLIPSTREAM", 200, 12.);
            }
        } else {
            self.slip_time = (self.slip_time - dt).max(0.);
        }
    }
    pub fn settle(&mut self, save: &mut Save, track: &Track) -> bool {
        if !self.finished || self.paid {
            return false;
        }
        self.paid = true;
        save.cash += track.reward + self.stunt_cash;
        save.free_spins += 1;
        save.add_xp(480 + (self.stunt_cash as f32 * 0.15).round() as u64);
        if self.rank == 1 {
            save.add_progress("p_wins", 1);
        }
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn legacy_save_migration_preserves_owned_car_paint_and_tuning() {
        let cat = Catalog::load();
        let json = r##"{"version":6,"cash":12345,"xp":200,"level":3,"starterChosen":true,"ownedCars":["starter_e36"],"selectedCarId":"starter_e36","selectedTrackId":"shuto_c1","selectedMode":"drift","tuning":{"starter_e36":{"engine":2}},"colors":{"starter_e36":{"body":"#abcdef","rims":"#112233","neon":"#123456"}},"dailyDate":"2026-10-21","challengeProgress":{"d_drift":1200,"p_wins":2}}"##;
        let save = Save::load(json, &cat, "2026-10-21");
        assert_eq!(save.cash, 12345);
        assert_eq!(save.level, 3);
        assert_eq!(save.xp, 200);
        assert_eq!(save.selected_car_id, "starter_e36");
        assert_eq!(save.stage("engine"), 2);
        assert_eq!(save.colors["starter_e36"].body, "#abcdef");
        assert_eq!(save.progress("d_drift"), 1200);
        let normalized = Save::load(
            r#"{"ownedCars":["fake","starter_e36","starter_e36"],"selectedTrackId":"invalid","selectedMode":"invalid","tuning":{"starter_e36":{"engine":255}}}"#,
            &cat,
            "2026-10-21",
        );
        assert_eq!(normalized.owned_cars, vec!["starter_e36"]);
        assert_eq!(normalized.stage("engine"), 4);
        assert_eq!(normalized.selected_track_id, "woerthersee");
        assert_eq!(normalized.selected_mode, "circuit");
    }
    #[test]
    fn catalog_and_tracks_preserved() {
        let c = Catalog::load();
        assert_eq!(
            (
                c.cars.len(),
                c.tracks.len(),
                c.tuning.len(),
                c.modes.len(),
                c.challenges.len()
            ),
            (14, 4, 12, 4, 6)
        );
        for t in &c.tracks {
            let r = Road::new(t);
            assert_eq!(r.samples.len(), 420);
            assert!(r.length > 1000.);
            assert!(r
                .samples
                .iter()
                .all(|s| s.point.y.is_finite() && s.tangent.length() > 0.99));
        }
    }
    #[test]
    fn economy_cannot_buy_locked_cars_or_double_claim() {
        let c = Catalog::load();
        let mut s = Save::default();
        assert!(s.buy("hyper_jesko", &c).is_err());
        s.buy("starter_golf2", &c).unwrap();
        assert_eq!(s.cash, 7000);
        s.upgrade("engine", &c).unwrap();
        assert_eq!(s.cash, 3880);
        assert!(s.upgrade("turbo", &c).is_err());
        s.challenge_progress.insert("p_wins".into(), 3);
        s.claim("p_wins", &c).unwrap();
        assert!(s.claim("p_wins", &c).is_err());
    }
    #[test]
    fn invalid_save_and_daily_reset() {
        let c = Catalog::load();
        let s = Save::load("bad", &c, "2026-10-20");
        assert_eq!(s.cash, 25000);
        let mut s = Save::default();
        s.add_progress("d_drift", 2500);
        s.add_progress("p_wins", 2);
        s.reset_day("2026-10-21");
        assert_eq!(s.progress("d_drift"), 0);
        assert_eq!(s.progress("p_wins"), 2);
    }
    #[test]
    fn countdown_brakes_drift_nitro_and_settlement() {
        let c = Catalog::load();
        let road = Road::new(&c.tracks[0]);
        let mut s = Save::default();
        let (stats, max) = s.stats(&c);
        let mut r = Race::new(&road, "timeattack");
        r.step(
            0.05,
            Input {
                gas: true,
                ..Input::default()
            },
            stats,
            max,
            &road,
            &mut s,
        );
        assert_eq!(r.speed, 0.);
        r.countdown = 0.;
        for _ in 0..30 {
            r.step(
                0.05,
                Input {
                    gas: true,
                    ..Input::default()
                },
                stats,
                max,
                &road,
                &mut s,
            );
        }
        assert!(r.speed > 40.);
        let n = r.nos;
        r.step(
            0.05,
            Input {
                gas: true,
                nos: true,
                ..Input::default()
            },
            stats,
            max,
            &road,
            &mut s,
        );
        assert!(r.nos < n);
        r.speed = 100.;
        r.step(
            0.05,
            Input {
                left: true,
                drift: true,
                ..Input::default()
            },
            stats,
            max,
            &road,
            &mut s,
        );
        assert!(r.total_drift > 0);
        assert!(!r.settle(&mut s, &c.tracks[0]));
        r.finished = true;
        assert!(r.settle(&mut s, &c.tracks[0]));
        let cash = s.cash;
        assert!(!r.settle(&mut s, &c.tracks[0]));
        assert_eq!(cash, s.cash);
    }
    #[test]
    fn start_line_oscillation_cannot_finish() {
        let c = Catalog::load();
        let road = Road::new(&c.tracks[0]);
        let mut s = Save::default();
        let mut r = Race::new(&road, "timeattack");
        r.countdown = 0.;
        r.sample = 419;
        r.pos = road.samples[0].point;
        r.speed = 5.;
        let (stats, max) = s.stats(&c);
        r.step(0.01, Input::default(), stats, max, &road, &mut s);
        assert_eq!(r.lap, 1);
        assert!(!r.finished);
    }
    #[test]
    fn every_crate_bucket_and_duplicate_is_accounted() {
        let c = Catalog::load();
        for roll in [0, 40, 70, 86, 93, 99] {
            let mut s = Save::default();
            s.buy("starter_golf2", &c).unwrap();
            s.free_spins = 1;
            let before = s.cash;
            s.spin(roll).unwrap();
            assert_eq!(s.free_spins, 0);
            if roll >= 86 {
                assert_eq!(s.owned_cars.len(), 2);
                s.free_spins = 1;
                s.spin(roll).unwrap();
                assert_eq!(s.cash, before + 12000);
            }
        }
    }
}
