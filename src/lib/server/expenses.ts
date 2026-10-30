import { getDb } from './db';
import { expense, expenseParticipant } from './db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { accessibleIds, assertAccess } from './access';
import { incomeByUser } from './incomes';
import { getLinkedUsers } from './links';
import { currentMonth, fixedShares, prorataShares } from './rules';

/**
 * Retourne les dépenses des comptes accessibles, enrichies :
 * - Pour les dépenses prorata, `computedShares` contient les parts dynamiques
 * - Pour les autres, `computedShares` reprend les parts stockées
 * - `isRealized` : prélevée ce mois-ci
 */
export async function getExpensesWithShares(userId: string) {
	const expenses = await getDb().query.expense.findMany({
		where: inArray(expense.bankAccountId, await accessibleIds(userId)),
		with: {
			bankAccount: true,
			participants: { with: { user: true } }
		},
		orderBy: expense.createdAt
	});
	const month = currentMonth();
	const incomes = await incomeByUser(
		expenses.filter((e) => e.isProrata).flatMap((e) => e.participants.map((p) => p.userId))
	);

	return expenses.map((exp) => {
		const prorataMap =
			exp.isProrata && exp.participants.length > 0
				? prorataShares(
						exp.participants.map((p) => p.userId),
						incomes
					)
				: null;

		return {
			...exp,
			isRealized: exp.realizedMonth === month,
			computedShares: exp.participants.map((p) => ({
				user: p.user,
				sharePercentage: prorataMap
					? (prorataMap.get(p.userId) ?? 0)
					: parseFloat(p.sharePercentage)
			}))
		};
	});
}

export async function createExpense(
	userId: string,
	data: {
		bankAccountId: number;
		label: string;
		amount: string;
		category?: string;
		dayOfMonth: number;
		isShared: boolean;
		isProrata: boolean;
		participants?: { userId: string; sharePercentage: string }[];
	}
) {
	await assertAccess(userId, data.bankAccountId);
	const { participants = [], ...expenseData } = data;

	let rows: { userId: string; sharePercentage: string }[] = [];
	if (data.isShared) {
		const linked = (await getLinkedUsers(userId)).map((u) => u.id);
		// Un participant en double serait compté deux fois dans la répartition
		const others = [...new Map(participants.map((p) => [p.userId, p])).values()].filter(
			(p) => p.userId !== userId
		);
		if (!others.every((p) => linked.includes(p.userId))) {
			throw new Error('Les participants doivent être des utilisateurs liés.');
		}
		rows = data.isProrata
			? [userId, ...others.map((p) => p.userId)].map((id) => ({ userId: id, sharePercentage: '0' })) // prorata = calculé dynamiquement
			: fixedShares(userId, others);
	}

	return getDb().transaction(async (tx) => {
		const [created] = await tx.insert(expense).values(expenseData).returning();
		if (rows.length > 0) {
			await tx
				.insert(expenseParticipant)
				.values(rows.map((p) => ({ expenseId: created.id, ...p })));
		}
		return created;
	});
}

export async function deleteExpense(userId: string, id: number) {
	const ids = await accessibleIds(userId);
	return getDb()
		.delete(expense)
		.where(and(eq(expense.id, id), inArray(expense.bankAccountId, ids)));
}

export async function updateExpense(
	userId: string,
	id: number,
	data: {
		bankAccountId: number;
		label: string;
		amount: string;
		category?: string | null;
		dayOfMonth: number;
	}
) {
	const ids = await assertAccess(userId, data.bankAccountId);
	return getDb()
		.update(expense)
		.set(data)
		.where(and(eq(expense.id, id), inArray(expense.bankAccountId, ids)));
}

export async function toggleExpenseRealized(userId: string, id: number, isRealized: boolean) {
	const ids = await accessibleIds(userId);
	return getDb()
		.update(expense)
		.set({ realizedMonth: isRealized ? currentMonth() : null })
		.where(and(eq(expense.id, id), inArray(expense.bankAccountId, ids)));
}
