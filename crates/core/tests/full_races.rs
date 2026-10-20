use nova_core::*;

/// Deterministic driver uses only normal input, never teleports or modifies laps.
#[test]
fn a_driver_can_finish_every_track_and_mode_and_receive_one_reward() {
    let cat = Catalog::load();
    for track in &cat.tracks {
        let road = Road::new(track);
        for mode in &cat.modes {
            let mut save = Save::default();
            save.buy("starter_golf2", &cat).unwrap();
            let (stats, max) = save.stats(&cat);
            let mut race = Race::new(&road, &mode.id);
            for _ in 0..60000 {
                let idx = road.closest(race.pos).0;
                let target = road.samples[(idx + 5) % 420].point;
                let d = target.minus(race.pos);
                let desired = d.x.atan2(d.z);
                let error = (desired - race.yaw + std::f64::consts::PI)
                    .rem_euclid(std::f64::consts::TAU)
                    - std::f64::consts::PI;
                race.step(
                    1. / 60.,
                    Input {
                        gas: race.speed < 110.,
                        brake: race.speed > 125.,
                        left: error > 0.025,
                        right: error < -0.025,
                        ..Input::default()
                    },
                    stats,
                    max,
                    &road,
                    &mut save,
                );
                assert!(race.pos.x.is_finite() && race.pos.y.is_finite() && race.pos.z.is_finite());
                if race.finished {
                    break;
                }
            }
            assert!(
                race.finished,
                "{} / {} failed at sample {} lap {}",
                track.id, mode.id, race.sample, race.lap
            );
            assert!(race.elapsed > 20.);
            assert!(race.settle(&mut save, track));
            let cash = save.cash;
            assert!(!race.settle(&mut save, track));
            assert_eq!(save.cash, cash);
            assert_eq!(save.free_spins, 1);
            println!(
                "{} {} {:.1}s rank {}",
                track.id, mode.id, race.elapsed, race.rank
            );
        }
    }
}
