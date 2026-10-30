<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';
	import FormModal from '$lib/FormModal.svelte';
	import { typeLabels } from '$lib/format';

	type Account = PageData['owned'][number];

	let { data, form } = $props<{ data: PageData; form: ActionData }>();

	// Suivi du compte dont le panneau de partage est ouvert
	let sharingAccountId = $state<number | null>(null);
	let adding = $state(false);
	let editing = $state<Account | null>(null);
</script>

<!-- Champs communs au formulaire d'ajout (acc = null) et d'édition -->
{#snippet fields(acc: Account | null)}
	<label>
		Nom
		<input name="name" required value={acc?.name ?? ''} />
	</label>
	<label>
		Type
		<select name="type">
			{#each Object.entries(typeLabels) as [value, label] (value)}
				<option {value} selected={acc?.type === value}>{label}</option>
			{/each}
		</select>
	</label>
	<label>
		Solde initial (€)
		<input
			name="initialBalance"
			type="number"
			step="0.01"
			required
			value={acc?.initialBalance ?? 0}
		/>
	</label>
	{#if acc}
		<label>
			Solde actuel (€) <span class="field-hint">optionnel</span>
			<input
				name="currentBalance"
				type="number"
				step="0.01"
				placeholder="Valeur réelle du compte"
				value={acc.currentBalance ?? ''}
			/>
		</label>
	{/if}
	<label>
		Couleur
		<input name="color" type="color" value={acc?.color ?? '#cba6f7'} />
	</label>
{/snippet}

<div class="page-header">
	<h1>Comptes bancaires</h1>
	<button class="btn-add" onclick={() => (adding = true)}>+ Ajouter un compte</button>
</div>

<!-- Mes comptes (propriétaire) -->
<section class="card">
	<h2>Mes comptes</h2>
	{#if data.owned.length === 0}
		<p class="empty">Aucun compte défini pour l'instant.</p>
	{:else}
		<table>
			<thead>
				<tr>
					<th>Nom</th>
					<th>Type</th>
					<th>Solde initial</th>
					<th>Solde actuel</th>
					<th>Partagé avec</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each data.owned as acc (acc.id)}
					<tr>
						<td>
							<span class="dot" style="background:{acc.color ?? '#888'}"></span>
							{acc.name}
						</td>
						<td>{typeLabels[acc.type]}</td>
						<td>{parseFloat(acc.initialBalance).toFixed(2)} €</td>
						<td>
							{#if acc.currentBalance !== null && acc.currentBalance !== undefined}
								<span class="current-balance">{parseFloat(acc.currentBalance).toFixed(2)} €</span>
							{:else}
								<span class="muted">—</span>
							{/if}
						</td>
						<td>
							{#if acc.shares.length === 0}
								<span class="muted">—</span>
							{:else}
								<div class="share-pills">
									{#each acc.shares as s (s.id)}
										<span class="pill">
											{s.sharedWithUser.name}
											<form method="POST" action="?/unshare" use:enhance style="display:inline">
												<input type="hidden" name="accountId" value={acc.id} />
												<input type="hidden" name="targetUserId" value={s.sharedWithUser.id} />
												<button type="submit" class="pill-remove" title="Retirer le partage"
													>×</button
												>
											</form>
										</span>
									{/each}
								</div>
							{/if}
						</td>
						<td class="actions-cell">
							<button class="btn-edit" onclick={() => (editing = acc)}>Éditer</button>
							{#if data.linkedUsers.length > 0}
								<button
									class="btn-share"
									onclick={() => (sharingAccountId = sharingAccountId === acc.id ? null : acc.id)}
								>
									{sharingAccountId === acc.id ? 'Fermer' : 'Partager'}
								</button>
							{/if}
							<form method="POST" action="?/delete" use:enhance>
								<input type="hidden" name="id" value={acc.id} />
								<button type="submit" class="btn-danger">Supprimer</button>
							</form>
						</td>
					</tr>
					{#if sharingAccountId === acc.id}
						<tr class="share-row">
							<td colspan="6">
								<div class="share-panel">
									<strong>Partager avec :</strong>
									{#each data.linkedUsers as u (u.id)}
										{@const alreadyShared = acc.shares.some(
											(s: { sharedWithUser: { id: string } }) => s.sharedWithUser.id === u.id
										)}
										<div class="share-user">
											<span>{u.name} <span class="muted">({u.email})</span></span>
											{#if alreadyShared}
												<form method="POST" action="?/unshare" use:enhance>
													<input type="hidden" name="accountId" value={acc.id} />
													<input type="hidden" name="targetUserId" value={u.id} />
													<button type="submit" class="btn-danger-sm">Retirer</button>
												</form>
											{:else}
												<form method="POST" action="?/share" use:enhance>
													<input type="hidden" name="accountId" value={acc.id} />
													<input type="hidden" name="targetUserId" value={u.id} />
													<button type="submit" class="btn-ok">Partager</button>
												</form>
											{/if}
										</div>
									{/each}
									{#if form?.message}
										<p class="error">{form.message}</p>
									{/if}
								</div>
							</td>
						</tr>
					{/if}
				{/each}
			</tbody>
		</table>
	{/if}
</section>

<!-- Comptes partagés avec moi -->
{#if data.shared.length > 0}
	<section class="card">
		<h2>Comptes partagés avec moi</h2>
		<table>
			<thead>
				<tr>
					<th>Nom</th>
					<th>Type</th>
					<th>Solde initial</th>
					<th>Propriétaire</th>
				</tr>
			</thead>
			<tbody>
				{#each data.shared as acc (acc.id)}
					<tr>
						<td>
							<span class="dot" style="background:{acc.color ?? '#888'}"></span>
							{acc.name}
						</td>
						<td>{typeLabels[acc.type]}</td>
						<td>{parseFloat(acc.initialBalance).toFixed(2)} €</td>
						<td class="muted">{acc._sharedBy?.name} ({acc._sharedBy?.email})</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</section>
{/if}

{#if data.linkedUsers.length === 0 && data.owned.length > 0}
	<p class="hint">
		💡 Aucun utilisateur lié. <a href="/links">Créer une liaison →</a> pour partager vos comptes.
	</p>
{/if}

<FormModal
	open={adding}
	onclose={() => (adding = false)}
	title="Ajouter un compte"
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
	.dot {
		display: inline-block;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		margin-right: 6px;
		vertical-align: middle;
	}
	.muted {
		color: #6c7086;
		font-size: 0.85rem;
	}
	.hint {
		color: #a9b1d6;
		font-size: 0.875rem;
	}
	.hint a {
		color: #7aa2f7;
	}
	.btn-danger-sm {
		padding: 0.2rem 0.6rem;
		background: #f7768e;
		color: #1a1b26;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.8rem;
	}
	.btn-ok {
		padding: 0.2rem 0.6rem;
		background: #9ece6a;
		color: #1a1b26;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.8rem;
	}
	.btn-share {
		padding: 0.3rem 0.7rem;
		background: #bb9af7;
		color: #1a1b26;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.8rem;
		font-weight: 600;
	}
	.share-pills {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}
	.pill {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		background: #414868;
		border-radius: 20px;
		padding: 0.15rem 0.5rem;
		font-size: 0.8rem;
		color: #c0caf5;
	}
	.pill-remove {
		background: none;
		border: none;
		color: #f7768e;
		cursor: pointer;
		font-size: 0.9rem;
		padding: 0;
		line-height: 1;
	}
	.share-row td {
		background: #1e2030;
		padding: 0;
		border-bottom: 2px solid #7aa2f7;
	}
	.share-panel {
		padding: 1rem 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.share-panel strong {
		color: #cba6f7;
		font-size: 0.9rem;
	}
	.share-user {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.4rem 0.5rem;
		background: #24283b;
		border-radius: 6px;
		gap: 1rem;
		font-size: 0.875rem;
	}
	.error {
		color: #f7768e;
		font-size: 0.85rem;
		margin: 0;
	}
	.current-balance {
		color: #9ece6a;
		font-weight: 600;
	}
	.field-hint {
		font-size: 0.75rem;
		color: #6c7086;
		font-weight: 400;
	}
</style>
