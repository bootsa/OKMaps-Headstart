/**
 * The plugins this package ships. Register all of them with
 * registerCorePlugins(), or pick: registerPlugin(infoPlugin).
 */
import { type OkmPlugin, registerPlugin } from "../index";
import { citeMapPlugin } from "./cite-map";
import { infoPlugin } from "./info";

export { citeMapPlugin, infoPlugin };

export const corePlugins: OkmPlugin[] = [infoPlugin, citeMapPlugin];

export function registerCorePlugins(): void {
	for (const plugin of corePlugins) registerPlugin(plugin);
}
