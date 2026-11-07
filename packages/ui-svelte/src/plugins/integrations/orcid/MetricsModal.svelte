<!--
  @component
  The researcher's metrics: normalised h-index, academic age, citations,
  Altmetric totals and, where the map allows it, the h-index and teaching
  and mentorship counts (old OrcidResearcherMetricsInfo).
-->
<script lang="ts">
	import { contextParams } from "../../../header/context";
	import { t } from "../../../i18n/strings";
	import type { ModalProps } from "../../index";
	import { authorNumber } from "./researcher";

	let { state: map }: ModalProps = $props();

	const params = $derived(contextParams(map.map.context) ?? {});
	const na = $derived(t(map.strings, "notAvailable"));
	const value = (field: string, digits?: number) => {
		const n = authorNumber(map.author, field);
		return n === null ? na : digits === undefined ? String(n) : n.toFixed(digits);
	};
	const showHIndex = $derived(params.enable_h_index === "true" || params.enable_h_index === true);
	const teaching = $derived(params.enable_teaching_mentorship === "true" || params.enable_teaching_mentorship === true);
</script>

<h3>Traditional metrics</h3>
<p>Normalised h-index: {value("normalized_h_index", 1)}</p>
<p>Academic age: {value("academic_age")}</p>
{#if showHIndex}
	<p>h-index: {value("h_index")}</p>
{/if}
<p>Number of total citations: {value("total_citations")}</p>
<p class="note">
	<strong>Notes on metrics:</strong>
	The normalised h-index is calculated by dividing the h-index by academic age. Metrics are based on citation data
	provided by Crossref and information supplied by the researcher on their ORCID profile. Results may be impacted by
	accuracy and completeness of this data.
</p>

<h3>Altmetrics</h3>
<p>Number of total unique social media mentions: {value("total_unique_social_media_mentions")}</p>
<p>Number of total news, encyclopaedia, patent and policy references: {value("total_neppr")}</p>
<p class="note">
	<strong>Notes on metrics:</strong>
	Metrics are based on data provided by Altmetric and information supplied by the researcher on their ORCID profile.
	Results may be impacted by accuracy and completeness of this data. Social media mentions include the following:
	Facebook, blog posts, Google+, Reddit, X, Youtube, Q&A forums and Stack Exchange.
</p>

{#if teaching}
	<h3>Teaching &amp; mentorship</h3>
	<p>Number of total supervised PhD students: {value("total_supervised_phd_students")}</p>
	<p>Number of total supervised Master students: {value("total_supervised_master_students")}</p>
	<p>Number of total supervised Bachelor students: {value("total_supervised_bachelor_students")}</p>
	<p class="note">
		<strong>Notes on metrics:</strong>
		Metrics are based on information supplied by the researcher on their ORCID profile. Entries titled “Supervision” and
		“Co-supervision” are counted for each degree. Results may be impacted by accuracy and completeness of this data.
	</p>
{/if}

<style>
	h3 {
		margin: var(--space-4) 0 var(--space-1);
		font-size: var(--font-size-sm);
		letter-spacing: 0.04em;
		text-transform: uppercase;

		&:first-child {
			margin-top: 0;
		}
	}

	p {
		margin: 0 0 var(--space-1);
	}

	.note {
		margin-top: var(--space-2);
		color: var(--color-text-muted);
	}
</style>
