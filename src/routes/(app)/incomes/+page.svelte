<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import { enhance } from '$app/forms';

	type Income = PageData['incomes'][number];
	type Account = PageData['accounts'][number];

	let { data, form } = $props<{ data: PageData; form: ActionData }>();

	let editingId = $state<number | null>(null);
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

<h1>Revenus</h1>

{#if form?.message}
	<p class="error">{form.message}</p>
{/if}

<section class="card">
	<h2>Ajouter un revenu récurrent</h2>
	<form method="POST" action="?/create" use:enhance>
		<div class="form-row">
			{@render fields(null)}
			<button type="submit">Ajouter</button>
		</div>
	</form>
</section>

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
							<button
								class="btn-edit"
								onclick={() => (editingId = editingId === inc.id ? null : inc.id)}>Éditer</button
							>
							<form method="POST" action="?/delete" use:enhance>
								<input type="hidden" name="id" value={inc.id} />
								<button type="submit" class="btn-danger">Supprimer</button>
							</form>
						</td>
					</tr>
					{#if editingId === inc.id}
						<tr class="edit-row">
							<td colspan="4">
								<form
									method="POST"
									action="?/update"
									use:enhance={() =>
										async ({ update }) => {
											await update();
											editingId = null;
										}}
								>
									<input type="hidden" name="id" value={inc.id} />
									<div class="edit-fields">
										{@render fields(inc)}
										<div class="edit-actions">
											<button type="submit">Enregistrer</button>
											<button type="button" class="btn-cancel" onclick={() => (editingId = null)}
												>Annuler</button
											>
										</div>
									</div>
								</form>
							</td>
						</tr>
					{/if}
				{/each}
			</tbody>
		</table>
	{/if}
</section>

<style>
	form[action='?/create'] button[type='submit'] {
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
