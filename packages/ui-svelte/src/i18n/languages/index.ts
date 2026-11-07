/**
 * Interface languages beyond English (eng, eng_pubmed and eng_openaire are
 * built in). Register the ones a deployment needs:
 *
 *   registerLanguage("ger", ger);   // or registerLanguages() for all
 */
import { registerLanguage } from "../strings";
import { engOrcid } from "./eng_orcid";
import { engPlos } from "./eng_plos";
import { ger } from "./ger";
import { gerLinkedcat } from "./ger_linkedcat";

export { engOrcid, engPlos, ger, gerLinkedcat };

export const extraLanguages = { ger, ger_linkedcat: gerLinkedcat, eng_plos: engPlos, eng_orcid: engOrcid };

export function registerLanguages(): void {
	for (const [id, s] of Object.entries(extraLanguages)) registerLanguage(id, s);
}
