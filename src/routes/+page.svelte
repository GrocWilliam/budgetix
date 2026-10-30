<div class="page">
	<header class="hero">
		<h1>💰 Budgetix</h1>
		<p class="tagline">
			Sachez dès aujourd'hui combien il vous restera à la fin du mois, sur chacun de vos comptes.
		</p>
		<div class="cta">
			<a href="/login?mode=register" class="btn-primary">Commencer</a>
			<a href="/login" class="btn-secondary">Se connecter</a>
		</div>
	</header>

	<section>
		<h2>Comment ça marche</h2>
		<ol class="steps">
			<li>
				<span class="num">1</span>
				<strong>Déclarez vos comptes</strong>
				<p>Personnels, épargne ou communs, avec leur solde de début de mois.</p>
			</li>
			<li>
				<span class="num">2</span>
				<strong>Ajoutez ce qui revient chaque mois</strong>
				<p>Salaire, loyer, abonnements, virements vers l'épargne… et leur jour du mois.</p>
			</li>
			<li>
				<span class="num">3</span>
				<strong>Cochez au fil du mois</strong>
				<p>Marquez une dépense comme réalisée quand elle passe sur votre compte.</p>
			</li>
			<li>
				<span class="num">4</span>
				<strong>Lisez votre prévision</strong>
				<p>Budgetix calcule le reste en fin de mois et vous prévient avant un découvert.</p>
			</li>
		</ol>
	</section>

	<section>
		<h2>Pensé pour les couples et colocataires</h2>
		<ul class="features">
			<li>
				<strong>👥 Comptes communs</strong>
				<p>Liez-vous à un proche et partagez un compte pour suivre les mêmes chiffres.</p>
			</li>
			<li>
				<strong>⚖️ Répartition juste</strong>
				<p>Divisez chaque dépense commune en parts fixes ou au prorata des revenus de chacun.</p>
			</li>
			<li>
				<strong>💶 Qui vire combien</strong>
				<p>Le tableau de bord indique ce que chacun doit verser sur le compte commun ce mois-ci.</p>
			</li>
		</ul>
	</section>

	<footer class="cta">
		<a href="/login?mode=register" class="btn-primary">Créer mon compte</a>
	</footer>
</div>

<style>
	:global(body) {
		margin: 0;
		background: #1a1b26;
		color: #c0caf5;
		font-family: system-ui, sans-serif;
	}

	.page {
		max-width: 880px;
		margin: 0 auto;
		padding: 4rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 4rem;
	}

	.hero {
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.5rem;
	}

	h1 {
		font-size: 3rem;
		font-weight: 800;
		color: #cba6f7;
	}

	h2 {
		font-size: 1.5rem;
		font-weight: 700;
		color: #cba6f7;
		text-align: center;
		margin-bottom: 1.5rem;
	}

	.tagline {
		font-size: 1.15rem;
		color: #a9b1d6;
		line-height: 1.6;
		max-width: 520px;
	}

	.steps,
	.features {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
		gap: 1rem;
	}

	.steps li,
	.features li {
		background: #24283b;
		border-radius: 12px;
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.steps p,
	.features p {
		color: #a9b1d6;
		font-size: 0.95rem;
		line-height: 1.5;
	}

	.num {
		width: 2rem;
		height: 2rem;
		border-radius: 50%;
		background: #7aa2f7;
		color: #1a1b26;
		font-weight: 700;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.cta {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
		justify-content: center;
	}

	.btn-primary {
		padding: 0.75rem 2rem;
		background: #7aa2f7;
		color: #1a1b26;
		border-radius: 8px;
		text-decoration: none;
		font-weight: 700;
		font-size: 1rem;
		transition: background 0.15s;
	}
	.btn-primary:hover {
		background: #89b4fa;
	}

	.btn-secondary {
		padding: 0.75rem 2rem;
		background: transparent;
		color: #7aa2f7;
		border: 2px solid #7aa2f7;
		border-radius: 8px;
		text-decoration: none;
		font-weight: 600;
		font-size: 1rem;
		transition:
			background 0.15s,
			color 0.15s;
	}
	.btn-secondary:hover {
		background: #7aa2f7;
		color: #1a1b26;
	}
</style>
