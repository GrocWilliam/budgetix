import { getDb } from './db';
import { bankAccount, bankAccountShare } from './db/schema';
import { eq } from 'drizzle-orm';

/** Ids des comptes possédés + partagés avec cet utilisateur */
export async function accessibleIds(userId: string) {
	const [owned, shared] = await Promise.all([
		getDb().select({ id: bankAccount.id }).from(bankAccount).where(eq(bankAccount.userId, userId)),
		getDb()
			.select({ id: bankAccountShare.bankAccountId })
			.from(bankAccountShare)
			.where(eq(bankAccountShare.sharedWithUserId, userId))
	]);
	return [...owned, ...shared].map((r) => r.id);
}

/** Lève une erreur si l'un des comptes n'est pas accessible ; retourne les ids accessibles */
export async function assertAccess(userId: string, ...accountIds: number[]) {
	const ids = await accessibleIds(userId);
	if (!accountIds.every((id) => ids.includes(id))) throw new Error('Compte inaccessible.');
	return ids;
}
