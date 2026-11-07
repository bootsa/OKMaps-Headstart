<!--
  @component
  Copies `text` to the clipboard; the label turns to "Copied" until the
  text changes.
-->
<script lang="ts">
	import Button from "./Button.svelte";

	interface Props {
		text: string;
		label?: string;
		copiedLabel?: string;
	}

	let { text, label = "Copy", copiedLabel = "Copied" }: Props = $props();

	let copiedText: string | null = $state(null);
	const copied = $derived(copiedText === text);

	async function copy() {
		try {
			await navigator.clipboard.writeText(text);
			copiedText = text;
		} catch {
			// No clipboard access (an insecure page or a refusal): the text stays selectable.
		}
	}
</script>

<Button variant="primary" size="sm" onclick={copy}>
	{copied ? copiedLabel : label}
</Button>
<span class="okmaps-visually-hidden" aria-live="polite">{copied ? copiedLabel : ""}</span>
