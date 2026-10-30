<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';
	import { fmt, typeLabels } from '$lib/format';

	type Transfer = PageData['transfers'][number];

	let { data, form } = $props<{ data: PageData; form: ActionData }>();

	let editingId = $state<number | null>(null);

	function accountLabel(acc: { name: string; type: string }) {
		return `${acc.name} (${typeLabels[acc.type] ?? acc.type})`;
	}
</script>

<!-- Champs communs au formulaire d'ajout (t = null) et d'édition -->
{#snippet fields(t: Transfer | null)}
	<label>
		Libellé
		<input
			name="label"
			required
			placeholder="Épargne mensuelle, Participation loyer…"
			value={t?.label ?? ''}
		/>
	</label>
	<label>
		Compte source
		<select name="fromAccountId" required>
			{#each data.accounts as acc (acc.id)}
				<option value={acc.id} selected={acc.id === t?.fromAccountId}>{accountLabel(acc)}</option>
			{/each}
		</select>
	</label>
	<label>
		Compte destination
		<select name="toAccountId" required>
			{#each data.accounts as acc (acc.id)}
				<option value={acc.id} selected={acc.id === t?.toAccountId}>{accountLabel(acc)}</option>
			{/each}
		</select>
	</label>
	<label>
		Montant (€)
		<input name="amount" type="number" step="0.01" min="0.01" required value={t?.amount ?? ''} />
	</label>
	<label>
		Jour du mois
		<input name="dayOfMonth" type="number" min="1" max="31" required value={t?.dayOfMonth ?? 1} />
	</label>
{/snippet}

<h1>Virements planifiés</h1>

<section class="card">
	<h2>Nouveau virement récurrent</h2>
	{#if form?.message}
		<p class="error">{form.message}</p>
	{/if}
	<form method="POST" action="?/create" use:enhance>
		<div class="form-row">
			{@render fields(null)}
		</div>
		<button type="submit" style="margin-top:1rem">Planifier le virement</button>
	</form>
</section>

<section class="card">
	<h2>Virements programmés</h2>
	{#if data.transfers.length === 0}
		<p class="empty">Aucun virement planifié.</p>
	{:else}
		<table>
			<thead>
				<tr>
					<th>Libellé</th>
					<th>De</th>
					<th>Vers</th>
					<th>Montant</th>
					<th>Jour</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each data.transfers as t (t.id)}
					<tr>
						<td>{t.label}</td>
						<td>
							<span class="account-chip chip--from">{t.fromAccount.name}</span>
						</td>
						<td>
							<span class="account-chip chip--to">{t.toAccount.name}</span>
						</td>
						<td class="amount">{fmt(parseFloat(t.amount))} €</td>
						<td>Le {t.dayOfMonth}</td>
						<td class="actions-cell">
							{#if t.userId === data.currentUserId}
								<button
									class="btn-edit"
									onclick={() => (editingId = editingId === t.id ? null : t.id)}>Éditer</button
								>
								<form method="POST" action="?/delete" use:enhance>
									<input type="hidden" name="id" value={t.id} />
									<button type="submit" class="btn-danger">Supprimer</button>
								</form>
							{/if}
						</td>
					</tr>
					{#if editingId === t.id && t.userId === data.currentUserId}
						<tr class="edit-row">
							<td colspan="6">
								<form
									method="POST"
									action="?/update"
									use:enhance={() =>
										async ({ update }) => {
											await update();
											editingId = null;
										}}
								>
									<input type="hidden" name="id" value={t.id} />
									<div class="edit-fields">
										{@render fields(t)}
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
	.amount {
		color: #e0af68;
		font-weight: 600;
	}
	.account-chip {
		display: inline-block;
		padding: 0.15rem 0.5rem;
		border-radius: 4px;
		font-size: 0.8rem;
		font-weight: 500;
	}
	.chip--from {
		background: #2e3255;
		color: #f7768e;
	}
	.chip--to {
		background: #2e3255;
		color: #9ece6a;
	}
</style>
