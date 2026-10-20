//! Browser presentation protocol. State transitions and rewards remain in Rust.
use super::*;
const REWARDS: [&str; 6] = [
    "+$5.000 Cash",
    "+450 Ruf-XP",
    "+$14.000 Jackpot",
    "Beta RR 50 Moped",
    "Bangkok TukTuk",
    "Stark Varg Supermoto",
];
fn bucket(roll: u8) -> usize {
    match roll {
        0..=39 => 0,
        40..=69 => 1,
        70..=85 => 2,
        86..=92 => 3,
        93..=97 => 4,
        _ => 5,
    }
}
impl Game {
    fn random_roll(&mut self) -> u8 {
        self.rng ^= self.rng << 13;
        self.rng ^= self.rng >> 17;
        self.rng ^= self.rng << 5;
        (self.rng % 100) as u8
    }
    pub(super) fn faithful_events(&mut self, dt: f64) {
        if let Some((time, roll)) = self.pending_spin {
            if time <= dt {
                self.pending_spin = None;
                self.save.free_spins += 1;
                match self.save.spin(roll) {
                    Ok(_) => {
                        let rarity = [
                            "Common",
                            "Common",
                            "Rare",
                            "Kult-Meme",
                            "Kult-Meme",
                            "Legendary",
                        ][bucket(roll)];
                        self.crate_result = format!("{} ({rarity})!", REWARDS[bucket(roll)]);
                    }
                    Err(e) => self.notify(e),
                }
                self.persist();
            } else {
                self.pending_spin = Some((time - dt, roll));
            }
        }
        for _ in 0..32 {
            let raw = read(7);
            if raw.is_empty() {
                break;
            }
            let Ok(v) = serde_json::from_str::<Value>(&raw) else {
                continue;
            };
            let id = v["id"].as_str().unwrap_or("");
            let result = match v["type"].as_str().unwrap_or("") {
                "buy" => {
                    let r = self.save.buy(id, &self.cat);
                    if r.is_ok() && !self.room.is_empty() {
                        self.send(json!({"type":"updatePlayer","player":self.profile()}));
                    }
                    r
                }
                "stage" => {
                    let stage = v["stage"].as_u64().unwrap_or(255);
                    if stage > 4 {
                        Err("Invalid stage")
                    } else {
                        self.save.install_stage(id, stage as u8, &self.cat)
                    }
                }
                "color" => {
                    let value = v["value"].as_str().unwrap_or("");
                    if value.len() != 7
                        || !value.starts_with('#')
                        || !value[1..].bytes().all(|c| c.is_ascii_hexdigit())
                    {
                        Err("Invalid color")
                    } else {
                        let car = self.cat.car(&self.save.selected_car_id);
                        let p = self.save.colors.entry(car.id.clone()).or_insert(Paint {
                            body: car.default_color.clone(),
                            rims: "#fbbf24".into(),
                            neon: "#00f3ff".into(),
                        });
                        match id {
                            "body" => p.body = value.into(),
                            "rims" => p.rims = value.into(),
                            "neon" => p.neon = value.into(),
                            _ => {}
                        }
                        Ok(())
                    }
                }
                "cycle" => {
                    if !self.save.owned_cars.is_empty() {
                        self.cycle(if v["dir"].as_i64().unwrap_or(1) < 0 {
                            -1
                        } else {
                            1
                        });
                    }
                    Ok(())
                }
                "track" => {
                    if self.cat.tracks.iter().any(|t| t.id == id) {
                        self.save.selected_track_id = id.into();
                        Ok(())
                    } else {
                        Err("Unknown track")
                    }
                }
                "mode" => {
                    if self.cat.modes.iter().any(|t| t.id == id) {
                        self.save.selected_mode = id.into();
                        Ok(())
                    } else {
                        Err("Unknown mode")
                    }
                }
                "claim" => self.save.claim(id, &self.cat),
                "tab" => {
                    self.tab = match id {
                        "tuning" => Tab::Tuning,
                        "dealership" => Tab::Dealer,
                        "multiplayer" => Tab::Network,
                        _ => Tab::Drive,
                    };
                    Ok(())
                }
                "challenges" => {
                    self.challenge_open = v["open"].as_bool().unwrap_or(false);
                    Ok(())
                }
                "crate" => {
                    self.crate_open = v["open"].as_bool().unwrap_or(false);
                    Ok(())
                }
                "spin" => {
                    if self.pending_spin.is_some() {
                        continue;
                    }
                    if !self.save.starter_chosen {
                        Err("Choose a starter first")
                    } else if self.save.free_spins == 0 && self.save.cash < 7500 {
                        Err("Nicht genug Cash ($7.500 benötigt)!")
                    } else {
                        if self.save.free_spins > 0 {
                            self.save.free_spins -= 1;
                        } else {
                            self.save.cash -= 7500;
                        }
                        self.crate_seq += 1;
                        self.crate_result.clear();
                        self.crate_items.clear();
                        let mut winner = 0;
                        for i in 0..30 {
                            let roll = self.random_roll();
                            self.crate_items.push(bucket(roll) as u8);
                            if i == 24 {
                                winner = roll;
                            }
                        }
                        self.pending_spin = Some((3.3, winner));
                        Ok(())
                    }
                }
                "launch" => {
                    if !self.room.is_empty() {
                        self.send(json!({"type":"startRace","config":self.cfg()}));
                    } else {
                        self.start();
                    }
                    Ok(())
                }
                "garage" => {
                    self.race = None;
                    Ok(())
                }
                "camera" => {
                    self.camera = (self.camera + 1) % 3;
                    Ok(())
                }
                "pause" => {
                    if let Some(r) = &mut self.race {
                        r.paused = !r.paused;
                    }
                    Ok(())
                }
                "mute" => {
                    self.muted = !self.muted;
                    Ok(())
                }
                "connect" => {
                    write(2, "");
                    Ok(())
                }
                "room" => {
                    if !self.connected {
                        Err("Connect the relay first")
                    } else {
                        let mode = v["mode"].as_str().unwrap_or("join");
                        self.send(json!({"type":if mode=="create"{"createRoom"}else{"joinRoom"},"code":v["code"],"config":self.cfg(),"player":self.profile()}));
                        Ok(())
                    }
                }
                "leave" => {
                    self.send(json!({"type":"leaveRoom"}));
                    self.room.clear();
                    self.players.clear();
                    self.remotes.clear();
                    Ok(())
                }
                "sync" => {
                    self.send(json!({"type":"startRace","config":self.cfg()}));
                    Ok(())
                }
                "chat" => {
                    self.send(json!({"type":"chat","text":v["text"]}));
                    Ok(())
                }
                _ => Err("Unknown UI action"),
            };
            if let Err(e) = result {
                self.notify(e);
            }
            if matches!(v["type"].as_str(), Some("track" | "mode"))
                && !self.room.is_empty()
                && self.host == self.id
            {
                self.send(json!({"type":"updateConfig","config":self.cfg()}));
            }
            self.persist();
        }
    }
    pub(super) fn faithful_present(&self, dt: f64, keys: u32) {
        let mut stats = json!({});
        for car in &self.cat.cars {
            let mut save = self.save.clone();
            save.selected_car_id = car.id.clone();
            let (s, max) = save.stats(&self.cat);
            // Match V6's two-decimal stat bars without exposing f64 display noise.
            let round = |v: f64| (v * 100.).round() / 100.;
            let mut value = json!({"topSpeed":round(s.top_speed),"accel":round(s.accel),"handling":round(s.handling),"drift":round(s.drift),"brakes":round(s.brakes)});
            value["maxKmh"] = json!(max);
            value["pi"] = json!(((round(s.top_speed)
                + round(s.accel)
                + round(s.handling)
                + round(s.drift)
                + round(s.brakes))
                * 18.5)
                .round()
                .min(999.));
            stats[&car.id] = value;
        }
        let race=self.race.as_ref().map(|r|json!({"pos":r.pos,"yaw":r.yaw,"speedKmh":r.speed,"nos":r.nos,"lap":r.lap,"maxLaps":r.max_laps,"sampleIdx":r.sample,"countdown":r.countdown,"elapsed":r.elapsed,"finished":r.finished,"paused":r.paused,"driftAngle":r.drift_angle,"driftPointsCurrent":r.drift_points,"driftCombo":r.combo,"stuntCashEarned":r.stunt_cash,"toast":r.toast,"toastTime":r.toast_time,"rank":r.rank,"isNos":r.nitro_active,"moveMeters":r.move_meters,"isDrifting":r.drifting,"smokePos":r.smoke_pos,"stunts":r.stunts,"bots":r.bots.iter().map(|b|json!({"sNorm":b.progress.fract(),"laneOffset":b.lane})).collect::<Vec<_>>()}));
        let remotes:Vec<_>=self.remotes.iter().map(|(id,r)|json!({"id":id,"pos":r.current,"yaw":r.yaw,"carId":r.car,"color":format!("#{:06x}",r.color)})).collect();
        write(6,&json!({"dt":dt.clamp(0.,0.05),"keys":keys,"save":self.save,"needXp":xp_to_next(self.save.level),"stats":stats,"race":race,"camera":self.camera,"muted":self.muted,"tab":match self.tab{Tab::Tuning=>"tuning",Tab::Dealer=>"dealership",Tab::Network=>"multiplayer",_=>"drive"},"challengesOpen":self.challenge_open,"crateOpen":self.crate_open,"crate":{"seq":self.crate_seq,"items":self.crate_items,"busy":self.pending_spin.is_some(),"result":self.crate_result},"notice":if self.notice_time>0.{&self.notice}else{""},"room":self.room,"hostId":self.host,"playerId":self.id,"connected":self.connected,"players":self.players,"remotes":remotes,"chats":self.chats}).to_string());
    }
}
