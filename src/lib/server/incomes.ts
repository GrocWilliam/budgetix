import { getDb } from './db';
import { bankAccount, income } from './db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { assertAccess } from './access';
import { sum } from './rules';

export function getIncomes(userId: string) {
	return getDb().query.income.findMany({
		where: eq(income.userId, userId),
		with: { bankAccount: true },
		orderBy: income.createdAt
	});
}

export async function createIncome(
	userId: string,
	data: { bankAccountId: number; label: string; amount: string; dayOfMonth: number }
) {
	await assertAccess(userId, data.bankAccountId);
	return getDb()
		.insert(income)
		.values({ userId, ...data })
		.returning();
}

export async function updateIncome(
	userId: string,
	id: number,
	data: { bankAccountId: number; label: string; amount: string; dayOfMonth: number }
) {
	await assertAccess(userId, data.bankAccountId);
	return getDb()
		.update(income)
		.set(data)
		.where(and(eq(income.id, id), eq(income.userId, userId)));
}

export function deleteIncome(userId: string, id: number) {
	return getDb()
		.delete(income)
		.where(and(eq(income.id, id), eq(income.userId, userId)));
}

/** Somme des revenus des comptes personnels de chaque userId (base du prorata), en une requête */
export async function incomeByUser(userIds: string[]) {
	const personalAccounts = await getDb().query.bankAccount.findMany({
		where: and(eq(bankAccount.type, 'personal'), inArray(bankAccount.userId, userIds)),
		with: { incomes: true }
	});

	const byUser = new Map<string, number>();
	for (const acc of personalAccounts) {
		byUser.set(acc.userId, (byUser.get(acc.userId) ?? 0) + sum(acc.incomes));
	}
	return byUser;
}
