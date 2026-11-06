<!--
  @component
  A small label next to a paper: open access, document type, a metric.
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    tone?: "neutral" | "accent" | "low" | "high";
    title?: string;
    children: Snippet;
  }

  let { tone = "neutral", title, children }: Props = $props();
</script>

<span class="okm-tag {tone}" {title}>{@render children()}</span>

<style>
  .okm-tag {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: 0 var(--space-2);
    border: 1px solid currentColor;
    border-radius: var(--radius-sm);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    line-height: 1.6;
    white-space: nowrap;
  }

  .neutral {
    color: var(--color-text);
  }

  .accent {
    color: var(--color-open-access);
  }

  .low {
    color: var(--color-tag-low);
  }

  .high {
    color: var(--color-tag-high);
  }
</style>
