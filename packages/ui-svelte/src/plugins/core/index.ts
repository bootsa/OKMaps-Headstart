/**
 * The plugins this package ships. Register all of them with
 * registerCorePlugins(), or pick: registerPlugin(infoPlugin).
 */
import { type OkmPlugin, registerPlugin } from "../index";
import { citeMapPlugin } from "./cite-map";
import { citePaperPlugin } from "./cite-paper";
import { exportPaperPlugin } from "./export-paper";
import { infoPlugin } from "./info";
import { type PdfOptions, pdfPlugin } from "./pdf";

export { citeMapPlugin, citePaperPlugin, exportPaperPlugin, infoPlugin, type PdfOptions, pdfPlugin };

export const corePlugins: OkmPlugin[] = [infoPlugin, citeMapPlugin, pdfPlugin(), citePaperPlugin, exportPaperPlugin];

export function registerCorePlugins(): void {
	for (const plugin of corePlugins) registerPlugin(plugin);
}
