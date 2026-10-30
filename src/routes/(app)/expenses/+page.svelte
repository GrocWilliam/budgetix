<script lang="ts">
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';
	import FormModal from '$lib/FormModal.svelte';
	import { total } from '$lib/format';

	type Expense = PageData['expenses'][number];
	type Account = PageData['accounts'][number];

	let { data } = $props<{ data: PageData }>();

	let isShared = $state(false);
	let isProrata = $state(false);
	let adding = $state(false);
	let editing = $state<Expense | null>(null);
	let activeTab = $state<number | null>(null);

	const accountTabs = $derived(
		data.accounts.filter((acc: Account) =>
			data.expenses.some((e: Expense) => e.bankAccountId === acc.id)
		)
	);
	const currentTab = $derived(activeTab ?? accountTabs[0]?.id ?? null);
	const visible = $derived(
		currentTab === null
			? data.expenses
			: data.expenses.filter((e: Expense) => e.bankAccountId === currentTab)
	);
</script>

<!-- Champs communs au formulaire d'ajout (exp = null) et d'édition -->
{#snippet fields(exp: Expense | null)}
	<label>
		Libellé
		<input name="label" required placeholder="Loyer, Internet…" value={exp?.label ?? ''} />
	</label>
	<label>
		Compte
		<select name="bankAccountId" required>
			{#each data.accounts as acc (acc.id)}
				<option value={acc.id} selected={acc.id === exp?.bankAccountId}>{acc.name}</option>
			{/each}
		</select>
	</label>
	<label>
		Montant (€)
		<input name="amount" type="number" step="0.01" min="0" required value={exp?.amount ?? ''} />
	</label>
	<label>
		Catégorie
		<input name="category" placeholder="Logement, Transport…" value={exp?.category ?? ''} />
	</label>
	<label>
		Jour du mois
		<input name="dayOfMonth" type="number" min="1" max="31" required value={exp?.dayOfMonth ?? 1} />
	</label>
{/snippet}

<div class="page-header">
	<h1>Dépenses</h1>
	<button class="btn-add" onclick={() => (adding = true)}>+ Ajouter une dépense</button>
</div>

<section class="card">
	<h2>Mes dépenses</h2>
	{#if data.expenses.length === 0}
		<p class="empty">Aucune dépense définie.</p>
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
				<tr
					><th>Libellé</th><th>Catégorie</th><th>Montant</th><th>Jour</th><th>Commune</th><th
						>Réalisée</th
					><th></th></tr
				>
			</thead>
			<tbody>
				{#each visible as exp (exp.id)}
					<tr>
						<td>{exp.label}</td>

						<td>{exp.category ?? '—'}</td>
						<td class="amount" class:realized={exp.isRealized}
							>-{parseFloat(exp.amount).toFixed(2)} €</td
						>
						<td>Le {exp.dayOfMonth}</td>
						<td>
							{#if exp.isShared}
								<span class="badge">Partagée</span>
								{#if exp.isProrata}
									<span class="badge badge--prorata">Prorata</span>
								{/if}
								<div class="shares">
									{#each exp.computedShares as p (p.user.id)}
										<small>{p.user.name} : {parseFloat(p.sharePercentage).toFixed(1)}%</small>
									{/each}
								</div>
							{:else}
								—
							{/if}
						</td>
						<td>
							<form method="POST" action="?/toggleRealized" use:enhance>
								<input type="hidden" name="id" value={exp.id} />
								<input type="hidden" name="isRealized" value={String(!exp.isRealized)} />
								<button type="submit" class="btn-realized" class:is-realized={exp.isRealized}>
									{exp.isRealized ? '✓' : '○'}
								</button>
							</form>
						</td>
						<td class="actions-cell">
							<button class="btn-edit" onclick={() => (editing = exp)}>Éditer</button>
							<form method="POST" action="?/delete" use:enhance>
								<input type="hidden" name="id" value={exp.id} />
								<button type="submit" class="btn-danger">Supprimer</button>
							</form>
						</td>
					</tr>
				{/each}
			</tbody>
			<tfoot>
				<tr>
					<td>Total</td>
					<td></td>
					<td class="amount">-{total(visible.map((e: Expense) => e.amount)).toFixed(2)} €</td>
					<td colspan="4"></td>
				</tr>
			</tfoot>
		</table>
	{/if}
</section>

<FormModal
	open={adding}
	onclose={() => (adding = false)}
	title="Ajouter une dépense récurrente"
	action="?/create"
	submitLabel="Ajouter"
>
	{@render fields(null)}
	<label class="inline">
		<input type="checkbox" name="isShared" bind:checked={isShared} />
		Dépense commune
	</label>
	{#if isShared}
		<label class="inline">
			<input type="checkbox" name="isProrata" bind:checked={isProrata} />
			Prorata des revenus personnels
		</label>
	{/if}
	{#if isShared}
		{#if data.linkedUsers.length === 0}
			<p class="warn">
				Aucun utilisateur lié. <a href="/links">Envoyer une demande de liaison →</a>
			</p>
		{:else if isProrata}
			<div class="prorata-info">
				<span class="badge badge--prorata">Prorata</span>
				La répartition sera calculée automatiquement selon les revenus personnels de chaque participant.
				<div class="participants" style="margin-top:0.5rem">
					{#each data.linkedUsers as u (u.id)}
						<input type="hidden" name="participantId" value={u.id} />
					{/each}
				</div>
			</div>
		{:else}
			<div class="participants">
				<h3>Répartition</h3>
				{#each data.linkedUsers as u (u.id)}
					<div class="participant-row">
						<span>{u.name} ({u.email})</span>
						<input type="hidden" name="participantId" value={u.id} />
						<label class="share-label">
							Part (%)
							<input
								name="participantShare"
								type="number"
								step="0.01"
								min="0"
								max="100"
								value={Math.floor(100 / (data.linkedUsers.length + 1))}
							/>
						</label>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
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
		background: #f7768e;
	}
	td {
		vertical-align: top;
	}
	label.inline {
		flex-direction: row;
		align-items: center;
		gap: 0.5rem;
	}
	.amount {
		color: #f7768e;
		font-weight: 600;
	}
	.amount.realized {
		text-decoration: line-through;
		color: #6c7086;
	}
	.tab.active {
		color: #f7768e;
		border-bottom-color: #f7768e;
	}
	.badge {
		background: #bb9af7;
		color: #1a1b26;
		border-radius: 4px;
		padding: 0.1rem 0.4rem;
		font-size: 0.75rem;
	}
	.badge--prorata {
		background: #e0af68;
		color: #1a1b26;
	}
	.prorata-info {
		margin-top: 1rem;
		padding: 0.75rem 1rem;
		background: #1a1b26;
		border-radius: 8px;
		border: 1px solid #414868;
		color: #a9b1d6;
		font-size: 0.9rem;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
	}
	.shares {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		margin-top: 0.25rem;
	}
	.shares small {
		color: #6c7086;
		font-size: 0.75rem;
	}
	.participants {
		margin-top: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.participant-row {
		display: flex;
		align-items: center;
		gap: 1rem;
	}
	.share-label {
		flex-direction: row;
		align-items: center;
		gap: 0.5rem;
	}
	.warn {
		color: #e0af68;
		font-size: 0.9rem;
		margin-top: 0.75rem;
	}
	.warn a {
		color: #7aa2f7;
	}
	.btn-realized {
		background: none;
		border: 1px solid #414868;
		border-radius: 50%;
		width: 1.75rem;
		height: 1.75rem;
		cursor: pointer;
		color: #6c7086;
		font-size: 1rem;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s;
	}
	.btn-realized.is-realized {
		background: #9ece6a22;
		border-color: #9ece6a;
		color: #9ece6a;
	}
</style>
