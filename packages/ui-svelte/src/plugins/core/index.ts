/**
 * The plugins this package ships. registerCorePlugins() registers the ones
 * that work anywhere; pick the rest: registerPlugin(sharePlugin({ link })).
 * Share, embed, FAQs and reload depend on the deployment (where maps live,
 * its FAQ page, how it knows about updates), so they are not core.
 */
import { type OkmPlugin, registerPlugin } from "../index";
import { citeMapPlugin } from "./cite-map";
import { citePaperPlugin } from "./cite-paper";
import { type CreditOptions, creditPlugin } from "./credit";
import { exportPaperPlugin } from "./export-paper";
import { infoPlugin } from "./info";
import { type PdfOptions, pdfPlugin } from "./pdf";
import { type ReloadOptions, reloadPlugin } from "./reload";
import { type EmbedOptions, embedPlugin, faqsPlugin, type ShareOptions, sharePlugin } from "./share";

export {
	type CreditOptions,
	citeMapPlugin,
	citePaperPlugin,
	creditPlugin,
	type EmbedOptions,
	embedPlugin,
	exportPaperPlugin,
	faqsPlugin,
	infoPlugin,
	type PdfOptions,
	pdfPlugin,
	type ReloadOptions,
	reloadPlugin,
	type ShareOptions,
	sharePlugin,
};

export const corePlugins: OkmPlugin[] = [infoPlugin, citeMapPlugin, pdfPlugin(), citePaperPlugin, exportPaperPlugin];

export function registerCorePlugins(): void {
	for (const plugin of corePlugins) registerPlugin(plugin);
}
