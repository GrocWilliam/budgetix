import { getDb } from './db';
import { bankAccountShare, income, expense, scheduledTransfer, user } from './db/schema';
import { or, inArray } from 'drizzle-orm';
import type { AccessibleAccount } from './accounts';
import { incomeByUser } from './incomes';
import { currentMonth, prorataShares, sum } from './rules';

/**
 * Pour chaque compte commun accessible à l'utilisateur, calcule :
 * - le total mensuel des dépenses portées par ce compte
 * - la part (prorata des revenus personnels) que chaque participant doit virer
 * - en particulier la part de l'utilisateur courant
 *
 * Un "participant" d'un compte commun = son propriétaire + tous les utilisateurs
 * avec qui il est partagé via bank_account_share.
 */
export async function getCommonAccountSuggestions(userId: string, accessible: AccessibleAccount[]) {
	// Tous les comptes communs accessibles (possédés ou partagés)
	const commonAccounts = accessible.filter((a) => a.type === 'common');
	const ids = commonAccounts.map((a) => a.id);

	// Toutes les dépenses, virements sortants et revenus des comptes (pas filtrés par utilisateur)
	const [expenses, transfersOut, incomes, shares, owners] = await Promise.all([
		getDb().query.expense.findMany({ where: inArray(expense.bankAccountId, ids) }),
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

	const participantsOf = (acc: AccessibleAccount) => {
		const owner = owners.find((u) => u.id === acc.userId);
		return [
			...(owner ? [owner] : []),
			...shares.filter((s) => s.bankAccountId === acc.id).map((s) => s.sharedWithUser)
		];
	};
	const personalIncomes = await incomeByUser(
		commonAccounts.flatMap((acc) => participantsOf(acc).map((p) => p.id))
	);

	const suggestions = commonAccounts.map((acc) => {
		const totalExpenses = sum(expenses.filter((e) => e.bankAccountId === acc.id));
		const totalTransfersOut = sum(transfersOut.filter((t) => t.fromAccountId === acc.id));
		const totalIncomes = sum(incomes.filter((i) => i.bankAccountId === acc.id));
		const totalToCover = Math.max(0, totalExpenses + totalTransfersOut - totalIncomes);

		// Participants = propriétaire + utilisateurs avec accès partagé
		const participants = participantsOf(acc);

		// Calcul prorata selon les revenus personnels des participants
		const prorataMap = prorataShares(
			participants.map((p) => p.id),
			personalIncomes
		);

		const breakdown = participants.map((p) => ({
			userId: p.id,
			userName: p.name,
			sharePercent: prorataMap.get(p.id) ?? 0,
			amount: totalToCover * ((prorataMap.get(p.id) ?? 0) / 100)
		}));

		const mine = breakdown.find((b) => b.userId === userId);

		return {
			account: { id: acc.id, name: acc.name, color: acc.color },
			totalExpenses,
			totalTransfersOut,
			totalIncomes,
			totalToCover,
			myShare: mine?.sharePercent ?? 0,
			myAmount: mine?.amount ?? 0,
			breakdown
		};
	});

	// Ne retourner que les comptes communs ayant des dépenses ou virements sortants
	return suggestions.filter((s) => s.totalToCover > 0);
}

export async function getDashboard(accounts: AccessibleAccount[]) {
	const ids = accounts.map((a) => a.id);
	const month = currentMonth();

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

	return accounts.map((acc) => {
		const accExpenses = expenses.filter((e) => e.bankAccountId === acc.id);
		const totalIncomes = sum(incomes.filter((i) => i.bankAccountId === acc.id));

		// Le montant intégral de chaque dépense est débité du compte,
		// quelle que soit la répartition entre participants.
		const totalExpenses = sum(accExpenses);
		const totalRealizedExpenses = sum(accExpenses.filter((e) => e.realizedMonth === month));

		const totalTransfersOut = sum(transfers.filter((t) => t.fromAccountId === acc.id));
		const totalTransfersIn = sum(transfers.filter((t) => t.toAccountId === acc.id));

		const balance =
			parseFloat(acc.initialBalance) +
			totalIncomes -
			totalExpenses -
			totalTransfersOut +
			totalTransfersIn;

		return {
			...acc,
			totalIncomes,
			totalExpenses,
			totalRealizedExpenses,
			totalTransfersOut,
			totalTransfersIn,
			balance
		};
	});
}
