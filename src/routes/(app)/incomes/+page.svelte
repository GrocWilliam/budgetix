<script lang="ts">
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';
	import FormModal from '$lib/FormModal.svelte';
	import { total } from '$lib/format';

	type Income = PageData['incomes'][number];
	type Account = PageData['accounts'][number];

	let { data } = $props<{ data: PageData }>();

	let adding = $state(false);
	let editing = $state<Income | null>(null);
	let activeTab = $state<number | null>(null);

	const accountTabs = $derived(
		data.accounts.filter((acc: Account) =>
			data.incomes.some((i: Income) => i.bankAccountId === acc.id)
		)
	);
	const currentTab = $derived(activeTab ?? accountTabs[0]?.id ?? null);
	const visible = $derived(
		currentTab === null
			? data.incomes
			: data.incomes.filter((i: Income) => i.bankAccountId === currentTab)
	);
</script>

<!-- Champs communs au formulaire d'ajout (inc = null) et d'édition -->
{#snippet fields(inc: Income | null)}
	<label>
		Libellé
		<input name="label" required placeholder="Salaire" value={inc?.label ?? ''} />
	</label>
	<label>
		Compte
		<select name="bankAccountId" required>
			{#each data.accounts as acc (acc.id)}
				<option value={acc.id} selected={acc.id === inc?.bankAccountId}>{acc.name}</option>
			{/each}
		</select>
	</label>
	<label>
		Montant (€)
		<input name="amount" type="number" step="0.01" min="0" required value={inc?.amount ?? ''} />
	</label>
	<label>
		Jour du mois
		<input name="dayOfMonth" type="number" min="1" max="31" required value={inc?.dayOfMonth ?? 1} />
	</label>
{/snippet}

<div class="page-header">
	<h1>Revenus</h1>
	<button class="btn-add" onclick={() => (adding = true)}>+ Ajouter un revenu</button>
</div>

<section class="card">
	<h2>Mes revenus</h2>
	{#if data.incomes.length === 0}
		<p class="empty">Aucun revenu défini.</p>
	{:else}
		<div class="tabs">
			{#each accountTabs as tab (tab.id)}
				<button
					class="tab"
					class:active={currentTab === tab.id}
					onclick={() => (activeTab = tab.id)}>{tab.name}</button
				>
			{/each}
		</div>
		<table>
			<thead>
				<tr><th>Libellé</th><th>Montant</th><th>Jour</th><th></th></tr>
			</thead>
			<tbody>
				{#each visible as inc (inc.id)}
					<tr>
						<td>{inc.label}</td>
						<td class="amount">+{parseFloat(inc.amount).toFixed(2)} €</td>
						<td>Le {inc.dayOfMonth}</td>
						<td class="actions-cell">
							<button class="btn-edit" onclick={() => (editing = inc)}>Éditer</button>
							<form method="POST" action="?/delete" use:enhance>
								<input type="hidden" name="id" value={inc.id} />
								<button type="submit" class="btn-danger">Supprimer</button>
							</form>
						</td>
					</tr>
				{/each}
			</tbody>
			<tfoot>
				<tr>
					<td>Total</td>
					<td class="amount">+{total(visible.map((i: Income) => i.amount)).toFixed(2)} €</td>
					<td colspan="2"></td>
				</tr>
			</tfoot>
		</table>
	{/if}
</section>

<FormModal
	open={adding}
	onclose={() => (adding = false)}
	title="Ajouter un revenu récurrent"
	action="?/create"
	submitLabel="Ajouter"
>
	{@render fields(null)}
</FormModal>

<FormModal
	open={editing !== null}
	onclose={() => (editing = null)}
	title="Modifier"
	action="?/update"
>
	{#if editing}
		<input type="hidden" name="id" value={editing.id} />
		{@render fields(editing)}
	{/if}
</FormModal>

<style>
	.btn-add {
		background: #9ece6a;
	}
	.amount {
		color: #9ece6a;
		font-weight: 600;
	}
	.tab.active {
		color: #9ece6a;
		border-bottom-color: #9ece6a;
	}
</style>
