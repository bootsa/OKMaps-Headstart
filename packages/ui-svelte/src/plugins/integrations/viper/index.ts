import { t } from "../../../i18n/strings";
import type { OkmPlugin } from "../../index";
import ViperEditModal from "./ViperEditModal.svelte";
import ViperInfo from "./ViperInfo.svelte";

const isViper = (service: string, infoType: string | null) => service === "openaire" && infoType === "viper";

/**
 * VIPER, the Visual Project Explorer (OpenAIRE project maps with
 * infoType "viper"): its info page and "Add project resources", which
 * explains how to link more resources to the project on OpenAIRE.
 */
export const viperPlugin: OkmPlugin = {
	id: "viper",
	infoPages: [{ priority: 1, matches: (m) => isViper(m.config.service, m.config.infoType), component: ViperInfo }],
	actions: [
		{
			id: "viper-edit",
			label: "Add resources",
			title: "Add project resources",
			show: (m) => m.config.service === "openaire",
			run: (m) => m.openModal("viper-edit"),
		},
	],
	modals: { "viper-edit": { title: (m) => t(m.strings, "viper_edit_title"), component: ViperEditModal } },
};
