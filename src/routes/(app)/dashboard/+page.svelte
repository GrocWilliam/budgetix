<script lang="ts">
	import type { PageData } from './$types';
	import { fmt, typeLabels } from '$lib/format';

	let { data } = $props<{ data: PageData }>();

	const typeColors: Record<string, string> = {
		personal: '#7aa2f7',
		savings: '#9ece6a',
		common: '#bb9af7'
	};
</script>

<h1>Tableau de bord</h1>

{#if data.suggestions.length > 0}
	<section class="equilibrage">
		<h2>Équilibrage ce mois-ci</h2>
		<p class="equilibrage-desc">
			Montants à virer sur chaque compte commun pour couvrir votre part des dépenses : selon la
			répartition de chaque dépense commune, sinon au prorata des revenus personnels.
		</p>
		<div class="suggestions-grid">
			{#each data.suggestions as s (s.account.id)}
				<div class="suggestion-card" style="border-left: 4px solid {s.account.color ?? '#bb9af7'}">
					<div class="suggestion-header">
						<span class="suggestion-account">{s.account.name}</span>
						<div class="suggestion-totals">
							<span class="suggestion-total">Dépenses : {fmt(s.totalExpenses)} €</span>
							{#if s.totalTransfersOut > 0}
								<span class="suggestion-total"
									>Virements sortants : {fmt(s.totalTransfersOut)} €</span
								>
							{/if}
							{#if s.totalIncomes > 0}
								<span class="suggestion-total suggestion-total--income"
									>Revenus : -{fmt(s.totalIncomes)} €</span
								>
							{/if}
							<span class="suggestion-total suggestion-total--main"
								>Total à couvrir : {fmt(s.totalToCover)} €</span
							>
						</div>
					</div>
					<div class="suggestion-amount">
						<span class="amount-label">Votre contribution</span>
						<span class="amount-value">{fmt(s.myAmount)} €</span>
						<span class="amount-pct">({s.myShare.toFixed(1)} % du total)</span>
					</div>
					{#if s.breakdown.length > 1}
						<div class="breakdown">
							{#each s.breakdown as b (b.userId)}
								<div class="breakdown-row">
									<span>{b.userName}</span>
									<span>{fmt(b.amount)} € ({b.sharePercent.toFixed(1)} %)</span>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</section>
{/if}

<div class="total-card">
	<div>
		<span class="label">Reste prévu en fin de mois (mes comptes)</span>
		{#if data.atRisk > 0}
			<div class="risk">
				⚠ {data.atRisk} compte{data.atRisk > 1 ? 's' : ''} à découvert prévu ce mois-ci
			</div>
		{/if}
	</div>
	<span class="total" class:negative={data.totalProjected < 0}>
		{fmt(data.totalProjected)} €
	</span>
</div>

<div class="accounts-grid">
	{#each data.accounts as acc (acc.id)}
		<div
			class="account-card"
			class:at-risk={acc.overdraftDay !== null}
			style="border-top: 4px solid {acc.color ?? typeColors[acc.type]}"
		>
			<div class="account-header">
				<span class="account-name">{acc.name}</span>
				<span class="type-badge" style="color:{typeColors[acc.type]}">{typeLabels[acc.type]}</span>
			</div>
			{#if acc._sharedBy}
				<div class="shared-by">Partagé par {acc._sharedBy.name}</div>
			{/if}

			{#if acc.overdraftDay !== null}
				<div class="alert">
					⚠ Découvert {acc.overdraftDay === data.today
						? "dès aujourd'hui"
						: `prévu le ${acc.overdraftDay}`}
				</div>
			{/if}

			<div class="balance-label">Reste prévu en fin de mois</div>
			<div class="balance" class:negative={acc.projectedEnd < 0}>{fmt(acc.projectedEnd)} €</div>
			<div class="margin-row" class:pos={acc.monthlyMargin >= 0} class:neg={acc.monthlyMargin < 0}>
				<span>Marge mensuelle</span>
				<span>{acc.monthlyMargin >= 0 ? '+' : ''}{fmt(acc.monthlyMargin)} € / mois</span>
			</div>

			<div class="details">
				{#if acc.currentBalance != null && acc.delta != null}
					<div class="detail-row">
						<span>Solde actuel</span>
						<span>{fmt(parseFloat(acc.currentBalance))} €</span>
					</div>
					<div class="detail-row">
						<span>Prévu aujourd'hui</span>
						<span>{fmt(acc.expectedToday)} €</span>
					</div>
					<div class="detail-row" class:delta-neg={acc.delta < 0}>
						<span>Écart vs prévu</span>
						<span>{acc.delta >= 0 ? '+' : ''}{fmt(acc.delta)} €</span>
					</div>
				{:else}
					<div class="detail-row">
						<span>Solde initial</span>
						<span>{fmt(parseFloat(acc.initialBalance))} €</span>
					</div>
				{/if}
				<div class="detail-row income">
					<span>Revenus / mois</span>
					<span>+{fmt(acc.totalIncomes)} €</span>
				</div>
				<div class="detail-row expense">
					<span>Dépenses prévues</span>
					<span>{acc.totalExpenses > 0 ? '-' : ''}{fmt(acc.totalExpenses)} €</span>
				</div>
				{#if acc.totalRealizedExpenses > 0}
					<div class="detail-row realized">
						<span>… dont réalisées</span>
						<span>-{fmt(acc.totalRealizedExpenses)} €</span>
					</div>
				{/if}
				{#if acc.totalTransfersOut > 0}
					<div class="detail-row transfer-out">
						<span>Virements sortants</span>
						<span>-{fmt(acc.totalTransfersOut)} €</span>
					</div>
				{/if}
				{#if acc.totalTransfersIn > 0}
					<div class="detail-row transfer-in">
						<span>Virements entrants</span>
						<span>+{fmt(acc.totalTransfersIn)} €</span>
					</div>
				{/if}
			</div>
		</div>
	{/each}

	{#if data.accounts.length === 0}
		<p class="empty">
			Aucun compte défini. <a href="/accounts">Créer un compte →</a>
		</p>
	{/if}
</div>

<style>
	.total-card {
		background: #24283b;
		border-radius: 10px;
		padding: 1.5rem 2rem;
		margin-bottom: 2rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.label {
		color: #a9b1d6;
		font-size: 1rem;
	}
	.total {
		font-size: 2rem;
		font-weight: 700;
		color: #9ece6a;
	}
	.total.negative {
		color: #f7768e;
	}

	.accounts-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 1.25rem;
	}

	.account-card {
		background: #24283b;
		border-radius: 10px;
		padding: 1.25rem;
	}
	.account-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.75rem;
	}
	.account-name {
		font-weight: 600;
		font-size: 1.05rem;
	}
	.type-badge {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
	}
	.shared-by {
		font-size: 0.75rem;
		color: #bb9af7;
		margin-bottom: 0.5rem;
	}

	.balance {
		font-size: 1.75rem;
		font-weight: 700;
		color: #9ece6a;
		margin-bottom: 1rem;
	}
	.balance.negative {
		color: #f7768e;
	}

	.details {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		border-top: 1px solid #2e3255;
		padding-top: 0.75rem;
	}
	.detail-row {
		display: flex;
		justify-content: space-between;
		font-size: 0.875rem;
		color: #a9b1d6;
	}
	.detail-row.income span:last-child {
		color: #9ece6a;
	}
	.detail-row.expense span:last-child {
		color: #f7768e;
	}
	.detail-row.transfer-out span:last-child {
		color: #e0af68;
	}
	.detail-row.transfer-in span:last-child {
		color: #73daca;
	}
	.detail-row.realized span:last-child {
		color: #9ece6a;
	}
	.detail-row.realized span:first-child {
		padding-left: 0.75rem;
		color: #6c7086;
		font-style: italic;
	}
	.balance-label {
		font-size: 0.75rem;
		color: #6c7086;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.margin-row {
		display: flex;
		justify-content: space-between;
		font-size: 0.85rem;
		font-weight: 600;
		margin: -0.5rem 0 0.75rem;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
	}
	.margin-row.pos {
		color: #9ece6a;
		background: #9ece6a11;
	}
	.margin-row.neg {
		color: #f7768e;
		background: #f7768e11;
	}
	.detail-row.delta-neg span:last-child {
		color: #f7768e;
	}
	/* Compte qui passe à découvert ce mois-ci */
	.account-card.at-risk {
		box-shadow: inset 0 0 0 1px #f7768e;
	}
	.alert {
		color: #f7768e;
		background: #f7768e1a;
		border-radius: 4px;
		padding: 0.3rem 0.5rem;
		font-size: 0.85rem;
		font-weight: 600;
		margin-bottom: 0.6rem;
	}
	.risk {
		color: #f7768e;
		font-size: 0.85rem;
		font-weight: 600;
		margin-top: 0.25rem;
	}

	.empty a {
		color: #7aa2f7;
	}

	/* ── Équilibrage ── */
	.equilibrage {
		background: #24283b;
		border-radius: 10px;
		padding: 1.5rem;
		margin-bottom: 2rem;
	}
	.equilibrage h2 {
		margin: 0 0 0.4rem;
		color: #cba6f7;
	}
	.equilibrage-desc {
		color: #6c7086;
		font-size: 0.85rem;
		margin: 0 0 1.25rem;
	}
	.suggestions-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 1rem;
	}
	.suggestion-card {
		background: #1a1b26;
		border-radius: 8px;
		padding: 1rem 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.suggestion-header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.suggestion-account {
		font-weight: 600;
		font-size: 1rem;
	}
	.suggestion-totals {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.1rem;
	}
	.suggestion-total {
		font-size: 0.8rem;
		color: #6c7086;
	}
	.suggestion-total--main {
		color: #a9b1d6;
		font-weight: 600;
	}
	.suggestion-total--income {
		color: #9ece6a;
	}
	.suggestion-amount {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.amount-label {
		font-size: 0.85rem;
		color: #a9b1d6;
	}
	.amount-value {
		font-size: 1.5rem;
		font-weight: 700;
		color: #e0af68;
	}
	.amount-pct {
		font-size: 0.8rem;
		color: #6c7086;
	}
	.breakdown {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		border-top: 1px solid #2e3255;
		padding-top: 0.6rem;
	}
	.breakdown-row {
		display: flex;
		justify-content: space-between;
		font-size: 0.8rem;
		color: #6c7086;
	}
</style>
