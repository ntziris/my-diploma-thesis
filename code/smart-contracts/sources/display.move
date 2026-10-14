module art_tokenization::display;

use std::string::String;
use sui::display_registry::{Self, DisplayRegistry, DisplayCap};
use sui::package::Publisher;
use art_tokenization::artwork::Artwork;
use art_tokenization::fraction::Fraction;

public fun register(
    registry: &mut DisplayRegistry,
    publisher: &mut Publisher,
    aggregator: String,
    site: String,
    ctx: &mut TxContext,
): (DisplayCap<Artwork>, DisplayCap<Fraction>) {
    let image = concat(aggregator, b"/v1/blobs/{image_blob_id}");

    // Artwork Display v2
    let (mut artwork_display, artwork_cap) =
        display_registry::new_with_publisher<Artwork>(registry, publisher, ctx);

    display_registry::set(&mut artwork_display, &artwork_cap, b"name".to_string(), b"{title}".to_string());
    display_registry::set(&mut artwork_display, &artwork_cap, b"description".to_string(), b"{artist_name}, {year}. {medium}, {dimensions}.".to_string());
    display_registry::set(&mut artwork_display, &artwork_cap, b"image_url".to_string(), image);
    display_registry::set(&mut artwork_display, &artwork_cap, b"creator".to_string(), b"{artist_name}".to_string());
    display_registry::set(&mut artwork_display, &artwork_cap, b"link".to_string(), concat(site, b"/artwork/{id}"));
    display_registry::set(&mut artwork_display, &artwork_cap, b"project_url".to_string(), site);
    display_registry::share(artwork_display);

    // Fraction Display v2
    let (mut fraction_display, fraction_cap) =
        display_registry::new_with_publisher<Fraction>(registry, publisher, ctx);

    display_registry::set(&mut fraction_display, &fraction_cap, b"name".to_string(), b"{title}: {amount} fractions".to_string());
    display_registry::set(&mut fraction_display, &fraction_cap, b"description".to_string(), b"Fractional ownership of the artwork {artwork_id}".to_string());
    display_registry::set(&mut fraction_display, &fraction_cap, b"image_url".to_string(), image);
    display_registry::set(&mut fraction_display, &fraction_cap, b"link".to_string(), concat(site, b"/artwork/{artwork_id}"));
    display_registry::set(&mut fraction_display, &fraction_cap, b"project_url".to_string(), site);
    display_registry::share(fraction_display);

    (artwork_cap, fraction_cap)
}

fun concat(mut base: String, suffix: vector<u8>): String {
    base.append(suffix.to_string());
    base
}
