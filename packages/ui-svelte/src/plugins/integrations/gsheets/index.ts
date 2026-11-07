import type { OkmPlugin } from "../../index";
import GsheetsInfo from "./GsheetsInfo.svelte";

/**
 * Maps curated in a Google Sheet (service "gsheets"): their info page.
 * Pair with reloadPlugin to offer a reload when the sheet changes.
 */
export const gsheetsPlugin: OkmPlugin = {
	id: "gsheets",
	infoPages: [{ matches: (m) => m.config.service === "gsheets", component: GsheetsInfo }],
};
