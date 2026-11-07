<!-- @component Info page of CoVis, the curated knowledge map of COVID-19 research. -->
<script lang="ts">
	let { site }: { site: string } = $props();
	const link = (path: string) => new URL(path, site).href;
</script>

<h3>Knowledge map of COVID-19 research curated by experts</h3>
<p>
	CoVis provides a curated knowledge map of seminal works on COVID-19 from eight critical areas of biomedical research.
	This collection is not meant to be exhaustive, but rather a single reference point for definitive research in key
	areas of coronavirus and COVID-19 research. CoVis makes it easier to get started on the topic - but also helps you to
	stay up-to-date. The knowledge map is constantly evolving thanks to the collective editing of subject-matter experts.
</p>
<p><a target="_blank" rel="noreferrer" href={link("faqs")}>Read our FAQs to find out more</a>.</p>
<h3>Data source curated by ReFigure</h3>
<p>
	The articles, datasets and ReFigures in CoVis are curated by an editorial team led by immunologists and ReFigure
	founders Dr. Girija Goyal and Dr. James Akin. Given the fast pace of research and the limited historical data on
	COVID-19, many findings are under debate and only understandable after reading several reports from different sources.
	Team <a target="_blank" rel="noreferrer" href="https://refigure.org/">ReFigure</a> creates visual, easy to understand,
	annotated, figure collections which provide analyses and consensus on key issues.
</p>
<p>
	Find out more about the curation process and the methodology for paper inclusion
	<a target="_blank" rel="noreferrer" href={link("faqs#methodology")}>in our FAQs</a>. We invite subject-matter experts
	to help us with our efforts. If you would like to contribute to CoVis, please
	<a target="_blank" rel="noreferrer" href={link("contact-us")}>get in touch</a>.
</p>
<h3>Software created by Open Knowledge Maps</h3>
<p>
	The resources selected for inclusion in CoVis are visualized in a knowledge map. Knowledge maps provide an instant
	overview of a topic by showing the main areas at a glance, and resources related to each area. This makes it possible
	to easily identify useful, pertinent information. The knowledge map is based on award-winning software
	<a target="_blank" rel="noreferrer" href="https://openknowledgemaps.org/">developed by Open Knowledge Maps</a>.
</p>
<p>
	In the knowledge map, research areas are displayed as bubbles. By clicking on one of the bubbles, you can inspect the
	resources assigned to it; open access papers can be directly viewed and downloaded within the interface. Find out more
	about knowledge maps and their properties
	<a target="_blank" rel="noreferrer" href={link("faqs#knowledge-map")}>in our FAQs</a>.
</p>
