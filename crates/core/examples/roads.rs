fn main() {
    let cat = nova_core::Catalog::load();
    let roads: std::collections::BTreeMap<_, _> = cat
        .tracks
        .iter()
        .map(|t| {
            let road = nova_core::Road::new(t);
            (
                t.id.clone(),
                road.samples.iter().map(|s| s.point).collect::<Vec<_>>(),
            )
        })
        .collect();
    println!("{}", serde_json::to_string(&roads).unwrap());
}
