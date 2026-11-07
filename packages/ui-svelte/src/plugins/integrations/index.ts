/**
 * Plugins for particular services and sites. None is registered by
 * default; a deployment registers the ones it serves, and with
 * registerService() the settings of services this package doesn't know.
 */
import { registerPlugin } from "../index";
import { covisPlugin } from "./covis";
import { gsheetsPlugin } from "./gsheets";
import { type OrcidOptions, orcidPlugin } from "./orcid";
import { triplePlugin } from "./triple";
import { viperPlugin } from "./viper";

export { covisPlugin, gsheetsPlugin, type OrcidOptions, orcidPlugin, triplePlugin, viperPlugin };

/** Registers every integration with its default settings. */
export function registerIntegrations(): void {
	for (const plugin of [viperPlugin, covisPlugin(), triplePlugin, gsheetsPlugin, orcidPlugin()]) registerPlugin(plugin);
}
