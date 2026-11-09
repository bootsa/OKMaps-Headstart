import type { SourceModule } from "./settings/registry";
import type { SaveTarget } from "./settings/settings";

/** What the search form hands over when someone makes a map. */
export interface SearchSubmit {
	source: SourceModule;
	/** The request the source made from the form. */
	request: unknown;
	view: string;
	title: string;
	/** Where to keep the map. */
	saveTo: SaveTarget;
	/** Shows progress under the button. */
	progress: (text: string) => void;
}
