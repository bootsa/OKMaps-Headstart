<!--
  @component
  The one button. `variant` picks the look; `href` turns it into a link that
  looks the same. An icon-only button needs `label` for screen readers.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLButtonAttributes } from "svelte/elements";

  interface Props extends Omit<HTMLButtonAttributes, "children"> {
    variant?: "primary" | "secondary" | "ghost";
    size?: "sm" | "md";
    /** Accessible name, required when the button shows only an icon. */
    label?: string;
    /** Render as a link instead of a button. */
    href?: string;
    children?: Snippet;
  }

  let {
    variant = "primary",
    size = "md",
    label,
    href,
    children,
    type = "button",
    ...rest
  }: Props = $props();
</script>

{#if href}
  <a class="okm-button {variant} {size}" {href} aria-label={label}
    >{@render children?.()}</a
  >
{:else}
  <button
    class="okm-button {variant} {size}"
    {type}
    aria-label={label}
    {...rest}>{@render children?.()}</button
  >
{/if}

<style>
  .okm-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    min-height: 2.25rem;
    padding: var(--space-2) var(--space-4);
    border: 1px solid transparent;
    border-radius: var(--radius-pill);
    font: inherit;
    font-weight: var(--font-weight-semibold);
    line-height: var(--line-height-tight);
    text-decoration: none;
    cursor: pointer;
    transition:
      background-color var(--duration-fast) var(--ease-standard),
      color var(--duration-fast) var(--ease-standard);

    &:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }
  }

  .sm {
    min-height: 1.75rem;
    padding: var(--space-1) var(--space-3);
    font-size: var(--font-size-sm);
  }

  .primary {
    background: var(--color-action);
    color: var(--color-action-text);

    &:hover:not(:disabled) {
      background: var(--color-accent-strong);
      color: var(--color-action-text);
    }
  }

  .secondary {
    background: var(--color-surface);
    border-color: var(--color-action);
    color: var(--color-action);

    &:hover:not(:disabled) {
      background: var(--color-surface-muted);
      color: var(--color-accent-strong);
    }
  }

  .ghost {
    background: transparent;
    color: var(--color-text);

    &:hover:not(:disabled) {
      background: var(--color-surface-muted);
    }
  }
</style>
