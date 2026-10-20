//! Replays test fixtures captured from the archived V6 controller.
use nova_core::*;
use serde_json::{json, Value};
use std::io::{self, Read};

fn snapshot(r: &Race, s: &Save) -> Vec<f64> {
    let mut a = vec![
        r.speed,
        r.nos,
        r.yaw,
        r.pos.x,
        r.pos.y,
        r.pos.z,
        r.drift_angle,
        r.drift_time,
        r.drift_points as f64,
        r.combo as f64,
        r.airtime,
        r.vel_y,
        r.slip_time,
        r.stunt_cash as f64,
        r.lap as f64,
        r.sample as f64,
        r.rank as f64,
        u8::from(r.finished) as f64,
        s.progress("d_drift") as f64,
        s.progress("d_nearmiss") as f64,
        s.progress("d_airtime") as f64,
        s.progress("p_topspeed") as f64,
        s.progress("p_wins") as f64,
        s.cash as f64,
        s.xp as f64,
        s.level as f64,
        s.free_spins as f64,
    ];
    for b in &r.bots {
        a.extend([b.progress, b.cooldown]);
    }
    a
}
fn main() {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input).unwrap();
    let cases: Value = serde_json::from_str(&input).unwrap();
    let cat = Catalog::load();
    let mut frames = 0;
    let mut worst = 0f64;
    let mut worst_at = String::new();
    let mut failures = Vec::new();
    for c in cases.as_array().unwrap() {
        let mut save = Save::load(&c["save"].to_string(), &cat, "2026-10-21");
        let track = cat.track(c["track"].as_str().unwrap());
        let road = Road::new(track);
        let mut r = Race::new(&road, c["mode"].as_str().unwrap());
        r.countdown = 0.;
        let init = &c["initial"];
        if let Some(i) = init["idx"].as_u64() {
            r.pos = road.samples[i as usize].point;
            r.sample = i as usize;
            r.last_sample = i as usize;
            r.yaw = road.samples[i as usize]
                .tangent
                .x
                .atan2(road.samples[i as usize].tangent.z);
        }
        if let Some(i) = init["lastSample"].as_u64() {
            r.last_sample = i as usize;
        }
        if let Some(i) = init["speed"].as_f64() {
            r.speed = i;
        }
        if let Some(i) = init["nos"].as_f64() {
            r.nos = i;
        }
        if let Some(i) = init["height"].as_f64() {
            r.pos.y += i;
        }
        if let Some(i) = init["airtime"].as_f64() {
            r.airtime = i;
        }
        if let Some(i) = init["offroad"].as_f64() {
            r.pos = r.pos.plus(road.samples[r.sample].right.scale(i));
        }
        if let Some(bots) = init["bots"].as_array() {
            for (b, v) in r.bots.iter_mut().zip(bots) {
                b.progress = v[0].as_f64().unwrap();
                b.speed = v[1].as_f64().unwrap();
                b.lane = v[2].as_f64().unwrap();
            }
        }
        let (stats, max) = save.stats(&cat);
        for (i, f) in c["frames"].as_array().unwrap().iter().enumerate() {
            let k = f[0].as_u64().unwrap();
            r.step(
                1. / 60.,
                Input {
                    gas: k & 1 != 0,
                    brake: k & 2 != 0,
                    left: k & 4 != 0,
                    right: k & 8 != 0,
                    drift: k & 16 != 0,
                    nos: k & 32 != 0,
                },
                stats,
                max,
                &road,
                &mut save,
            );
            r.settle(&mut save, track);
            let actual = snapshot(&r, &save);
            for (j, (a, b)) in actual.iter().zip(f[1].as_array().unwrap()).enumerate() {
                let b = b.as_f64().unwrap();
                let error = (a - b).abs();
                if error > worst {
                    worst = error;
                    worst_at = format!("{} frame {i} field {j}: {a} vs {b}", c["name"]);
                }
                let tolerance =
                    if [0, 1, 2, 3, 4, 5, 6, 7, 10, 11, 12, 27, 28, 29, 30, 31, 32].contains(&j) {
                        1e-7
                    } else {
                        0.
                    };
                if error > tolerance && failures.len() < 10 {
                    failures.push(format!(
                        "{} frame {i} field {j}: {a} vs {b} (error {error})",
                        c["name"]
                    ));
                }
            }
            frames += 1;
        }
    }
    println!(
        "{}",
        json!({"cases":cases.as_array().unwrap().len(),"frames":frames,"maxAbsoluteError":worst,"worstAt":worst_at,"failures":failures})
    );
    if !failures.is_empty() {
        std::process::exit(1);
    }
}
