<!-- Formulaire dans une fenêtre modale (<dialog> natif : focus, Échap et fond gérés par le navigateur) -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { enhance } from '$app/forms';

	let {
		open,
		onclose,
		title,
		action,
		submitLabel = 'Enregistrer',
		children
	}: {
		open: boolean;
		onclose: () => void;
		title: string;
		action: string;
		submitLabel?: string;
		children: Snippet;
	} = $props();

	let dialog: HTMLDialogElement;
	let error = $state<string | null>(null);

	$effect(() => {
		if (open) {
			error = null;
			dialog.showModal();
		} else {
			dialog.close();
		}
	});
</script>

<dialog bind:this={dialog} {onclose} onclick={(e) => e.target === dialog && dialog.close()}>
	{#if open}
		<!-- Formulaire recréé à chaque ouverture : pas de saisie restante d'une ouverture précédente -->
		<form
			method="POST"
			{action}
			use:enhance={() =>
				async ({ result, update }) => {
					await update();
					if (result.type === 'failure') {
						error = (result.data?.message as string | undefined) ?? 'Erreur.';
					} else {
						dialog.close();
					}
				}}
		>
			<h2>{title}</h2>
			{@render children()}
			{#if error}
				<p class="error">{error}</p>
			{/if}
			<div class="actions">
				<button type="submit">{submitLabel}</button>
				<button type="button" class="btn-cancel" onclick={() => dialog.close()}>Annuler</button>
			</div>
		</form>
	{/if}
</dialog>

<style>
	dialog {
		margin: auto;
		padding: 0;
		width: min(28rem, calc(100vw - 2rem));
		background: #24283b;
		color: #c0caf5;
		border-radius: 10px;
		box-shadow: 0 10px 40px #0008;
	}
	dialog::backdrop {
		background: #0009;
	}
	/* Padding sur le formulaire et non le dialog : un clic sur le dialog lui-même = clic sur le fond */
	form {
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}
	form :global(input:not([type='checkbox'], [type='color'], [type='hidden'])),
	form :global(select) {
		width: 100%;
	}
	h2 {
		font-weight: 600;
		font-size: 1.1rem;
	}
	.actions {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
		margin-top: 0.5rem;
	}
	.error {
		margin: 0;
	}
</style>
