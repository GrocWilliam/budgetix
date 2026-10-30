import { getDb } from './db';
import { bankAccountShare, income, expense, scheduledTransfer, user } from './db/schema';
import { or, inArray } from 'drizzle-orm';
import type { AccessibleAccount } from './accounts';
import { incomeByUser } from './incomes';
import {
	cents,
	currentMonth,
	euros,
	isDue,
	parisToday,
	projectMonth,
	prorataShares,
	sum
} from './rules';

/**
 * Pour chaque compte commun accessible à l'utilisateur, calcule ce que chacun doit y virer
 * pour couvrir le mois :
 * - chaque dépense commune selon sa propre répartition (parts fixes ou prorata de ses participants)
 * - les dépenses non partagées, virements sortants et revenus du compte au prorata des revenus
 *   personnels des membres du compte
 *
 * Membres d'un compte commun = son propriétaire + les utilisateurs avec qui il est partagé.
 */
export async function getCommonAccountSuggestions(userId: string, accessible: AccessibleAccount[]) {
	const commonAccounts = accessible.filter((a) => a.type === 'common');
	const ids = commonAccounts.map((a) => a.id);

	// Toutes les dépenses, virements sortants et revenus des comptes (pas filtrés par utilisateur)
	const [expenses, transfersOut, incomes, shares, owners] = await Promise.all([
		getDb().query.expense.findMany({
			where: inArray(expense.bankAccountId, ids),
			with: { participants: { with: { user: true } } }
		}),
		getDb().query.scheduledTransfer.findMany({
			where: inArray(scheduledTransfer.fromAccountId, ids)
		}),
		getDb().query.income.findMany({ where: inArray(income.bankAccountId, ids) }),
		getDb().query.bankAccountShare.findMany({
			where: inArray(bankAccountShare.bankAccountId, ids),
			with: { sharedWithUser: true }
		}),
		getDb().query.user.findMany({
			where: inArray(
				user.id,
				commonAccounts.map((a) => a.userId)
			)
		})
	]);

	const membersOf = (acc: AccessibleAccount) => {
		const owner = owners.find((u) => u.id === acc.userId);
		return [
			...(owner ? [owner] : []),
			...shares.filter((s) => s.bankAccountId === acc.id).map((s) => s.sharedWithUser)
		];
	};
	const personalIncomes = await incomeByUser([
		...commonAccounts.flatMap((acc) => membersOf(acc).map((p) => p.id)),
		...expenses.flatMap((e) => e.participants.map((p) => p.userId))
	]);

	const suggestions = commonAccounts.map((acc) => {
		const accExpenses = expenses.filter((e) => e.bankAccountId === acc.id);
		const totalExpenses = sum(accExpenses);
		const totalTransfersOut = sum(transfersOut.filter((t) => t.fromAccountId === acc.id));
		const totalIncomes = sum(incomes.filter((i) => i.bankAccountId === acc.id));

		const members = membersOf(acc);
		const accountSplit = prorataShares(
			members.map((m) => m.id),
			personalIncomes
		);

		// Centimes dus par utilisateur ; `split` = pourcentage par userId
		const due = new Map<string, number>();
		const add = (split: Map<string, number>, amount: number) => {
			for (const [id, pct] of split) due.set(id, (due.get(id) ?? 0) + (amount * pct) / 100);
		};
		for (const e of accExpenses) {
			const ps = e.isShared ? e.participants : [];
			const split =
				ps.length === 0
					? accountSplit
					: e.isProrata
						? prorataShares(
								ps.map((p) => p.userId),
								personalIncomes
							)
						: new Map(ps.map((p) => [p.userId, parseFloat(p.sharePercentage)]));
			add(split, cents(e.amount));
		}
		add(accountSplit, totalTransfersOut - totalIncomes);

		// Membres du compte + participants d'une dépense qui n'en sont pas membres
		const people = [...members, ...accExpenses.flatMap((e) => e.participants.map((p) => p.user))];
		const unique = [...new Map(people.map((p) => [p.id, p])).values()];
		const amounts = unique.map((p) => ({
			p,
			// Les revenus du compte peuvent dépasser la part de quelqu'un : rien à virer, pas un crédit
			amount: Math.max(0, Math.round(due.get(p.id) ?? 0))
		}));
		// Total = somme des parts arrondies : la répartition affichée tombe juste au centime
		const totalToCover = amounts.reduce((s, a) => s + a.amount, 0);

		const breakdown = amounts.map(({ p, amount }) => ({
			userId: p.id,
			userName: p.name,
			sharePercent: totalToCover === 0 ? 0 : (amount / totalToCover) * 100,
			amount: euros(amount)
		}));
		const mine = breakdown.find((b) => b.userId === userId);

		return {
			account: { id: acc.id, name: acc.name, color: acc.color },
			totalExpenses: euros(totalExpenses),
			totalTransfersOut: euros(totalTransfersOut),
			totalIncomes: euros(totalIncomes),
			totalToCover: euros(totalToCover),
			myShare: mine?.sharePercent ?? 0,
			myAmount: mine?.amount ?? 0,
			breakdown
		};
	});

	// Ne retourner que les comptes communs ayant quelque chose à couvrir
	return suggestions.filter((s) => s.totalToCover > 0);
}

/**
 * Pour chaque compte accessible :
 * - `monthlyMargin` : ce qui reste chaque mois après les mouvements habituels
 *   (revenus + virements entrants - dépenses - virements sortants), indépendant du solde
 * - `projectedEnd` : solde prévu en fin de mois = solde de départ + mouvements encore à venir
 *   (dépenses non cochées « réalisée », revenus et virements dont le jour n'est pas passé).
 *   Départ = solde actuel saisi, sinon le solde prévu aujourd'hui.
 * - `overdraftDay` : jour où le compte passe sous zéro ce mois-ci (null si jamais)
 * - `expectedToday` / `delta` : prévu aujourd'hui et écart avec le solde actuel saisi
 * `totalProjected` ne compte que les comptes de l'utilisateur, pas ceux partagés avec lui.
 */
export async function getDashboard(userId: string, accounts: AccessibleAccount[]) {
	const ids = accounts.map((a) => a.id);
	const now = new Date();
	const month = currentMonth(now);
	const { day: today, daysInMonth } = parisToday(now);
	const dayOf = (d: number) => Math.min(d, daysInMonth);

	const [incomes, expenses, transfers] = await Promise.all([
		getDb().query.income.findMany({ where: inArray(income.bankAccountId, ids) }),
		getDb().query.expense.findMany({ where: inArray(expense.bankAccountId, ids) }),
		getDb().query.scheduledTransfer.findMany({
			where: or(
				inArray(scheduledTransfer.fromAccountId, ids),
				inArray(scheduledTransfer.toAccountId, ids)
			)
		})
	]);

	type Row = { amount: string; dayOfMonth: number };
	const dueSum = (rows: Row[]) => sum(rows.filter((r) => isDue(r.dayOfMonth, now)));
	// Mouvements dont le jour n'est pas encore passé, signés : +1 crédit, -1 débit
	const upcoming = (rows: Row[], sign: 1 | -1) =>
		rows
			.filter((r) => dayOf(r.dayOfMonth) > today)
			.map((r) => ({ day: dayOf(r.dayOfMonth), amount: sign * cents(r.amount) }));

	const computed = accounts.map((acc) => {
		const accIncomes = incomes.filter((i) => i.bankAccountId === acc.id);
		// Le montant intégral de chaque dépense est débité du compte,
		// quelle que soit la répartition entre participants.
		const accExpenses = expenses.filter((e) => e.bankAccountId === acc.id);
		const accOut = transfers.filter((t) => t.fromAccountId === acc.id);
		const accIn = transfers.filter((t) => t.toAccountId === acc.id);

		const initial = cents(acc.initialBalance);
		const monthlyMargin = sum(accIncomes) + sum(accIn) - sum(accExpenses) - sum(accOut);
		// Dépenses : seules celles cochées « réalisée » ce mois-ci, la coche est l'info de l'utilisateur ;
		// revenus et virements n'ont pas de coche : leur jour du mois fait foi
		const realized = sum(accExpenses.filter((e) => e.realizedMonth === month));
		const expectedToday = initial + dueSum(accIncomes) - realized - dueSum(accOut) + dueSum(accIn);
		const current = acc.currentBalance == null ? null : cents(acc.currentBalance);

		const { end, overdraftDay } = projectMonth(
			current ?? expectedToday,
			[
				...upcoming(accIncomes, 1),
				...upcoming(accIn, 1),
				...upcoming(accOut, -1),
				// Dépense non cochée dont le jour est passé : en retard, elle peut tomber dès aujourd'hui
				...accExpenses
					.filter((e) => e.realizedMonth !== month)
					.map((e) => ({ day: Math.max(dayOf(e.dayOfMonth), today), amount: -cents(e.amount) }))
			],
			today
		);

		return {
			...acc,
			totalIncomes: euros(sum(accIncomes)),
			totalExpenses: euros(sum(accExpenses)),
			totalRealizedExpenses: euros(realized),
			totalTransfersOut: euros(sum(accOut)),
			totalTransfersIn: euros(sum(accIn)),
			monthlyMargin: euros(monthlyMargin),
			projectedEnd: euros(end),
			overdraftDay,
			expectedToday: euros(expectedToday),
			delta: current === null ? null : euros(current - expectedToday)
		};
	});

	const mine = computed.filter((a) => a.userId === userId);
	// projectedEnd * 100 redonne exactement les centimes (projectedEnd = centimes / 100)
	const totalProjected = euros(mine.reduce((s, a) => s + Math.round(a.projectedEnd * 100), 0));
	const atRisk = mine.filter((a) => a.overdraftDay !== null).length;
	return { accounts: computed, totalProjected, atRisk, today };
}
