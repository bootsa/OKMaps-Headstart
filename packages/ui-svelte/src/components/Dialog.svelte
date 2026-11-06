<!--
  @component
  A modal dialog on the native <dialog> element: focus trap, Escape and the
  backdrop come from the browser, so there is no Bootstrap or jQuery behind it.
  Bind `open` to show and hide it.
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    open?: boolean;
    title: string;
    /** Width of the dialog. */
    size?: "sm" | "md" | "lg";
    onclose?: () => void;
    children: Snippet;
    footer?: Snippet;
  }

  let {
    open = $bindable(false),
    title,
    size = "md",
    onclose,
    children,
    footer,
  }: Props = $props();

  let dialog: HTMLDialogElement;
  const titleId = `okm-dialog-${Math.random().toString(36).slice(2)}`;

  $effect(() => {
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  });

  function handleClose() {
    open = false;
    onclose?.();
  }

  function handleBackdrop(event: MouseEvent) {
    if (event.target === dialog) dialog.close();
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions (Escape is native) -->
<dialog
  bind:this={dialog}
  class="okm-dialog {size}"
  aria-labelledby={titleId}
  onclose={handleClose}
  onclick={handleBackdrop}
>
  <header>
    <h2 id={titleId}>{title}</h2>
    <button
      class="close"
      type="button"
      aria-label="Close"
      onclick={() => dialog.close()}>×</button
    >
  </header>
  <div class="body">{@render children()}</div>
  {#if footer}
    <footer>{@render footer()}</footer>
  {/if}
</dialog>

<style>
  .okm-dialog {
    width: min(100% - 2 * var(--space-4), var(--dialog-width));
    max-height: min(100% - 2 * var(--space-8), 48rem);
    padding: 0;
    border: 0;
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-overlay);
    font-family: var(--font-sans);
    color: var(--color-text);
    background: var(--color-surface);

    &::backdrop {
      background: rgb(0 0 0 / 0.4);
    }

    &[open] {
      display: flex;
      flex-direction: column;
    }
  }

  .sm {
    --dialog-width: 24rem;
  }

  .md {
    --dialog-width: 36rem;
  }

  .lg {
    --dialog-width: 56rem;
  }

  header {
    display: flex;
    align-items: start;
    gap: var(--space-4);
    padding: var(--space-4) var(--space-6);
    border-bottom: 1px solid var(--color-border);
  }

  h2 {
    flex: 1;
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    color: var(--color-heading);
  }

  .close {
    border: 0;
    background: none;
    font-size: var(--font-size-xl);
    line-height: 1;
    color: var(--color-text-muted);
    cursor: pointer;

    &:hover {
      color: var(--color-text);
    }
  }

  .body {
    padding: var(--space-4) var(--space-6);
    overflow: auto;
  }

  footer {
    display: flex;
    justify-content: end;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-6);
    border-top: 1px solid var(--color-border);
  }
</style>
