<!--
  @component
  How to add resources to a VIPER map: link them on the project's OpenAIRE
  page, which the map is made from.
-->
<script lang="ts">
	import { contextParams, t } from "@okmaps/core";
	import screenshot from "../../../assets/viper-project-screenshot.png";
	import Button from "../../../components/Button.svelte";
	import type { ModalProps } from "../../index";
	import { projectPage } from "./project";

	let { state: map }: ModalProps = $props();

	const p = $derived(contextParams(map.map.context) ?? {});
	const text = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v) : "");
	const name = $derived((text(p.acronym) ? `${text(p.acronym)} - ` : "") + text(p.title));
	const href = $derived(projectPage(p.obj_id));
</script>

<p>Are you missing relevant publications and datasets related to this project?</p>
<p>
	No problem: simply link further resources on the OpenAIRE website. The resources will then be automatically added to
	the map.
</p>
<p>Use the button indicated in the exemplary screenshot to do so:</p>
<a {href} target="_blank" rel="noreferrer" class="shot">
	<img src={screenshot} alt="The OpenAIRE project page, with the button for linking resources">
</a>
<p>By clicking on the button below, you are redirected to the OpenAIRE page for <strong>{name}</strong>.</p>
<Button {href} newTab>{t(map.strings, "viper_edit_button_text")}</Button>

<style>
	.shot img {
		display: block;
		max-width: 100%;
		margin: var(--space-2) 0 var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
	}
</style>
