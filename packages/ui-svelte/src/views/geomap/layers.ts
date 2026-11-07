/** Tile layers of the geo map (old Geomap/Layer/config.ts); the first is shown at the start. */
export interface TileLayerSpec {
	name: string;
	url: string;
	/** HTML from this file only, never from map data. */
	attribution: string;
}

const OSM =
	'<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>';
const TERMS =
	'<a href="https://www.openstreetmap.org/terms" target="_blank" rel="noopener noreferrer">Website and API terms</a>';

export const tileLayers: TileLayerSpec[] = [
	{
		name: "Standard",
		url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
		attribution: `&copy; ${OSM} ♥ <a href="https://wiki.osmfoundation.org/wiki/Terms_of_Use" target="_blank" rel="noopener noreferrer">Make a Donation</a>. ${TERMS}`,
	},
	{
		name: "Humanitarian",
		url: "https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
		attribution: `&copy; ${OSM}. Tiles style by <a href="https://www.hotosm.org/" target="_blank" rel="noopener noreferrer">Humanitarian OpenStreetMap Team</a> hosted by <a href="https://openstreetmap.fr/" target="_blank" rel="noopener noreferrer">OpenStreetMap France</a>. ${TERMS}`,
	},
	{
		name: "Topographical (OpenTopoMap)",
		url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
		attribution:
			'map data: © <a href="https://openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org/" target="_blank" rel="noopener noreferrer">SRTM</a> | map style: © <a href="https://opentopomap.org/" target="_blank" rel="noopener noreferrer">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener noreferrer">CC-BY-SA</a>)',
	},
];

/** "Title; Country, Continent", what a pin is called (old createPinIcon getAriaLabel). */
export function pinLabel(title: string, place: { country: string | null; continent: string | null } | null): string {
	if (!place) return title;
	return `${title}; ${[place.country, place.continent].filter(Boolean).join(", ")}`;
}
