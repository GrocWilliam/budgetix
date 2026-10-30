import { getDb } from './db';
import { scheduledTransfer } from './db/schema';
import { and, eq, or, inArray } from 'drizzle-orm';
import { accessibleIds, assertAccess } from './access';

/**
 * Retourne tous les virements planifiés accessibles par l'utilisateur
 * (depuis ou vers un compte qu'il possède ou partagé avec lui).
 */
export async function getTransfers(userId: string) {
	const ids = await accessibleIds(userId);
	return getDb().query.scheduledTransfer.findMany({
		where: or(
			inArray(scheduledTransfer.fromAccountId, ids),
			inArray(scheduledTransfer.toAccountId, ids)
		),
		with: { fromAccount: true, toAccount: true, user: true },
		orderBy: scheduledTransfer.dayOfMonth
	});
}

type TransferData = {
	fromAccountId: number;
	toAccountId: number;
	label: string;
	amount: string;
	dayOfMonth: number;
};

/** Comptes distincts et accessibles, pour la création comme pour la modification */
async function assertTransferAccounts(userId: string, data: TransferData) {
	if (data.fromAccountId === data.toAccountId) {
		throw new Error('Les comptes source et destination doivent être différents.');
	}
	await assertAccess(userId, data.fromAccountId, data.toAccountId);
}

export async function createTransfer(userId: string, data: TransferData) {
	await assertTransferAccounts(userId, data);
	const [created] = await getDb()
		.insert(scheduledTransfer)
		.values({ userId, ...data })
		.returning();
	return created;
}

export function deleteTransfer(userId: string, id: number) {
	return getDb()
		.delete(scheduledTransfer)
		.where(and(eq(scheduledTransfer.id, id), eq(scheduledTransfer.userId, userId)));
}

export async function updateTransfer(userId: string, id: number, data: TransferData) {
	await assertTransferAccounts(userId, data);
	return getDb()
		.update(scheduledTransfer)
		.set(data)
		.where(and(eq(scheduledTransfer.id, id), eq(scheduledTransfer.userId, userId)));
}
