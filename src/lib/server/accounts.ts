import { getDb } from './db';
import { bankAccount, bankAccountShare, userLink } from './db/schema';
import { eq, and, or } from 'drizzle-orm';
import type { AccountType } from './rules';

/** Comptes possédés + comptes partagés avec cet utilisateur */
export async function getAccounts(userId: string) {
	const [owned, sharedRows] = await Promise.all([
		getDb().query.bankAccount.findMany({
			where: eq(bankAccount.userId, userId),
			with: { shares: { with: { sharedWithUser: true } } },
			orderBy: bankAccount.createdAt
		}),
		getDb().query.bankAccountShare.findMany({
			where: eq(bankAccountShare.sharedWithUserId, userId),
			with: { bankAccount: { with: { user: true } } }
		})
	]);

	const shared = sharedRows.map((s) => ({
		...s.bankAccount,
		shares: [] as (typeof owned)[0]['shares'],
		_sharedBy: s.bankAccount.user
	}));

	return { owned, shared };
}

export async function createAccount(
	userId: string,
	data: { name: string; type: AccountType; initialBalance: string; color?: string }
) {
	return getDb()
		.insert(bankAccount)
		.values({ userId, ...data })
		.returning();
}

export function updateAccount(
	userId: string,
	id: number,
	data: {
		name: string;
		type: AccountType;
		initialBalance: string;
		color?: string;
		currentBalance?: string | null;
	}
) {
	return getDb()
		.update(bankAccount)
		.set(data)
		.where(and(eq(bankAccount.id, id), eq(bankAccount.userId, userId)));
}

export function deleteAccount(userId: string, id: number) {
	return getDb()
		.delete(bankAccount)
		.where(and(eq(bankAccount.id, id), eq(bankAccount.userId, userId)));
}

/** Partage un compte avec un utilisateur lié (validation du lien côté service) */
export async function shareAccount(ownerId: string, accountId: number, targetUserId: string) {
	// Vérifier que les deux sont bien liés
	const link = await getDb().query.userLink.findFirst({
		where: and(
			eq(userLink.status, 'accepted'),
			or(
				and(eq(userLink.requesterId, ownerId), eq(userLink.receiverId, targetUserId)),
				and(eq(userLink.requesterId, targetUserId), eq(userLink.receiverId, ownerId))
			)
		)
	});
	if (!link) throw new Error('Vous devez être lié à cet utilisateur pour partager un compte.');

	// Vérifier que le compte appartient bien à l'émetteur
	const acc = await getDb().query.bankAccount.findFirst({
		where: and(eq(bankAccount.id, accountId), eq(bankAccount.userId, ownerId))
	});
	if (!acc) throw new Error('Compte introuvable.');

	// Index unique (compte, utilisateur) : un double clic ne crée pas de doublon
	await getDb()
		.insert(bankAccountShare)
		.values({ bankAccountId: accountId, sharedWithUserId: targetUserId })
		.onConflictDoNothing();
}

/** Supprime un partage (seul le propriétaire peut le faire) */
export async function unshareAccount(ownerId: string, accountId: number, targetUserId: string) {
	const acc = await getDb().query.bankAccount.findFirst({
		where: and(eq(bankAccount.id, accountId), eq(bankAccount.userId, ownerId))
	});
	if (!acc) throw new Error('Compte introuvable ou non autorisé.');

	return getDb()
		.delete(bankAccountShare)
		.where(
			and(
				eq(bankAccountShare.bankAccountId, accountId),
				eq(bankAccountShare.sharedWithUserId, targetUserId)
			)
		);
}

/** Retourne une liste plate de tous les comptes accessibles (possédés + partagés) */
export async function getAccessibleAccounts(userId: string) {
	const { owned, shared } = await getAccounts(userId);
	return [
		...owned.map((a) => ({ ...a, _sharedBy: null as (typeof shared)[0]['_sharedBy'] | null })),
		...shared
	];
}

export type AccessibleAccount = Awaited<ReturnType<typeof getAccessibleAccounts>>[number];
