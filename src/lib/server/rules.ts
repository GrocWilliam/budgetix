// Règles pures (sans DB), testées dans rules.test.ts

/**
 * Montant numeric(12,2) (string Postgres) en centimes entiers. Les calculs d'argent se font
 * en centimes : en euros flottants, 100.30 - 50.10 - 50.20 donne -0.0000000000000142.
 */
export const cents = (amount: string) => Math.round(parseFloat(amount) * 100);

/** Somme des montants, en centimes */
export const sum = (rows: { amount: string }[]) => rows.reduce((s, r) => s + cents(r.amount), 0);

export const euros = (c: number) => c / 100;

export const ACCOUNT_TYPES = ['personal', 'savings', 'common'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const isAccountType = (t: unknown): t is AccountType =>
	ACCOUNT_TYPES.includes(t as AccountType);

/** Montant valide pour numeric(12,2) ; peut être négatif (solde initial à découvert) */
export const isAmount = (s: unknown) =>
	typeof s === 'string' && s.trim() !== '' && Math.abs(Number(s)) < 1e10;

/** Montant de revenu, dépense ou virement */
export const isPositiveAmount = (s: unknown) => isAmount(s) && Number(s) >= 0;

export const isDay = (n: number) => Number.isInteger(n) && n >= 1 && n <= 31;

/** Mois courant 'YYYY-MM' */
// shortcut: fuseau Europe/Paris codé en dur, à rendre configurable si des utilisateurs hors France arrivent
export const currentMonth = (now = new Date()) =>
	now.toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }).slice(0, 7);

/**
 * Le jour `dayOfMonth` est-il passé (ou est-ce aujourd'hui) ce mois-ci ?
 * Un jour au-delà de la fin du mois (31 en février) tombe le dernier jour.
 */
export function isDue(dayOfMonth: number, now = new Date()) {
	const { day, daysInMonth } = parisToday(now);
	return Math.min(dayOfMonth, daysInMonth) <= day;
}

/** Jour du mois et nombre de jours du mois, à Paris */
export function parisToday(now = new Date()) {
	const [y, m, day] = now
		.toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' })
		.split('-')
		.map(Number);
	return { day, daysInMonth: new Date(Date.UTC(y, m, 0)).getUTCDate() };
}

/**
 * Déroule les mouvements à venir du mois (centimes signés, par jour) à partir du solde `start`.
 * `end` : solde en fin de mois ; `overdraftDay` : premier jour sous zéro (null si jamais).
 * Le même jour, les débits passent avant les crédits : on prévient au plus tôt.
 */
export function projectMonth(
	start: number,
	movements: { day: number; amount: number }[],
	today: number
) {
	let balance = start;
	let overdraftDay = start < 0 ? today : null;
	for (const m of [...movements].sort((x, y) => x.day - y.day || x.amount - y.amount)) {
		balance += m.amount;
		if (balance < 0 && overdraftDay === null) overdraftDay = m.day;
	}
	return { end: balance, overdraftDay };
}

/**
 * Parts fixes : chaque participant garde la part saisie, l'auteur prend le reste.
 * Lève une erreur si les parts saisies dépassent 100 %.
 */
export function fixedShares(
	authorId: string,
	others: { userId: string; sharePercentage: string }[]
) {
	const othersTotal = others.reduce((s, p) => s + Number(p.sharePercentage), 0);
	const author = 100 - othersTotal;
	if (author < 0 || others.some((p) => !(Number(p.sharePercentage) >= 0))) {
		throw new Error('Les parts doivent être positives et ne pas dépasser 100 %.');
	}
	return [{ userId: authorId, sharePercentage: author.toFixed(2) }, ...others];
}

/**
 * Parts au prorata des revenus. `incomeByUser` = somme des revenus personnels par userId.
 * Répartition égale si personne n'a de revenu.
 */
export function prorataShares(userIds: string[], incomeByUser: Map<string, number>) {
	const grand = userIds.reduce((s, id) => s + (incomeByUser.get(id) ?? 0), 0);
	return new Map(
		userIds.map((id) => [
			id,
			grand === 0 ? 100 / userIds.length : ((incomeByUser.get(id) ?? 0) / grand) * 100
		])
	);
}
