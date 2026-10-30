import { getDb } from './db';
import {
	bankAccount,
	bankAccountShare,
	income,
	expense,
	expenseParticipant,
	userLink,
	scheduledTransfer,
	user
} from './db/schema';
import { eq, and, or, inArray } from 'drizzle-orm';

/** Envoie une demande de liaison vers l'email donné (erreur si inexistant ou déjà lié) */
export async function sendLinkRequest(requesterId: string, receiverEmail: string) {
	const receiver = await getDb().query.user.findFirst({ where: eq(user.email, receiverEmail) });
	if (!receiver) throw new Error('Aucun utilisateur trouvé avec cet email.');
	if (receiver.id === requesterId) throw new Error('Vous ne pouvez pas vous lier à vous-même.');

	const existing = await getDb().query.userLink.findFirst({
		where: or(
			and(eq(userLink.requesterId, requesterId), eq(userLink.receiverId, receiver.id)),
			and(eq(userLink.requesterId, receiver.id), eq(userLink.receiverId, requesterId))
		)
	});
	if (existing) throw new Error('Une demande existe déjà avec cet utilisateur.');

	// Index unique (demandeur, destinataire) : un double clic ne crée pas deux liaisons
	return getDb()
		.insert(userLink)
		.values({ requesterId, receiverId: receiver.id })
		.onConflictDoNothing();
}

/** Demandes reçues en attente */
export function getPendingRequests(userId: string) {
	return getDb().query.userLink.findMany({
		where: and(eq(userLink.receiverId, userId), eq(userLink.status, 'pending')),
		with: { requester: true }
	});
}

/** Demandes envoyées */
export function getSentRequests(userId: string) {
	return getDb().query.userLink.findMany({
		where: eq(userLink.requesterId, userId),
		with: { receiver: true }
	});
}

/** Accepte une demande */
export function acceptLinkRequest(userId: string, linkId: number) {
	return getDb()
		.update(userLink)
		.set({ status: 'accepted' })
		.where(and(eq(userLink.id, linkId), eq(userLink.receiverId, userId)));
}

/**
 * Refuse ou supprime une demande / liaison. Sépare complètement les deux utilisateurs :
 * partages de comptes, revenus et virements créés par l'un sur les comptes de l'autre,
 * et participations aux dépenses des comptes de l'autre.
 */
export async function declineLinkRequest(userId: string, linkId: number) {
	const link = await getDb().query.userLink.findFirst({
		where: and(
			eq(userLink.id, linkId),
			or(eq(userLink.receiverId, userId), eq(userLink.requesterId, userId))
		)
	});
	if (!link) return;

	const { requesterId: a, receiverId: b } = link;
	const ownedBy = (id: string) =>
		getDb().select({ id: bankAccount.id }).from(bankAccount).where(eq(bankAccount.userId, id));
	const expensesOf = (id: string) =>
		getDb()
			.select({ id: expense.id })
			.from(expense)
			.where(inArray(expense.bankAccountId, ownedBy(id)));
	const transferTouches = (id: string) =>
		or(
			inArray(scheduledTransfer.fromAccountId, ownedBy(id)),
			inArray(scheduledTransfer.toAccountId, ownedBy(id))
		);

	await getDb().transaction(async (tx) => {
		await tx.delete(userLink).where(eq(userLink.id, link.id));
		for (const [me, other] of [
			[a, b],
			[b, a]
		]) {
			await tx
				.delete(bankAccountShare)
				.where(
					and(
						eq(bankAccountShare.sharedWithUserId, me),
						inArray(bankAccountShare.bankAccountId, ownedBy(other))
					)
				);
			await tx
				.delete(income)
				.where(and(eq(income.userId, me), inArray(income.bankAccountId, ownedBy(other))));
			await tx
				.delete(scheduledTransfer)
				.where(and(eq(scheduledTransfer.userId, me), transferTouches(other)));
			await tx
				.delete(expenseParticipant)
				.where(
					and(
						eq(expenseParticipant.userId, me),
						inArray(expenseParticipant.expenseId, expensesOf(other))
					)
				);
		}
	});
}

/** Retourne tous les utilisateurs liés (liaison acceptée) */
export async function getLinkedUsers(userId: string) {
	const links = await getDb().query.userLink.findMany({
		where: and(
			eq(userLink.status, 'accepted'),
			or(eq(userLink.requesterId, userId), eq(userLink.receiverId, userId))
		),
		with: { requester: true, receiver: true }
	});

	// Map par id : deux demandes croisées (A→B et B→A) ne donnent qu'un utilisateur
	const users = links.map((l) => (l.requesterId === userId ? l.receiver : l.requester));
	return [...new Map(users.map((u) => [u.id, u])).values()];
}
