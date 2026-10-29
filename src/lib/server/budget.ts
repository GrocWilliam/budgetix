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
import { currentMonth, fixedShares, prorataShares, type AccountType } from './rules';

const sum = (rows: { amount: string }[]) => rows.reduce((s, r) => s + parseFloat(r.amount), 0);

// ─── Contrôle d'accès ─────────────────────────────────────────────────────────

/** Ids des comptes possédés + partagés avec cet utilisateur */
async function accessibleIds(userId: string) {
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
async function assertAccess(userId: string, ...accountIds: number[]) {
	const ids = await accessibleIds(userId);
	if (!accountIds.every((id) => ids.includes(id))) throw new Error('Compte inaccessible.');
	return ids;
}

// ─── Comptes ──────────────────────────────────────────────────────────────────

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

// ─── Revenus ─────────────────────────────────────────────────────────────────

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

// ─── Dépenses ────────────────────────────────────────────────────────────────

/** Somme des revenus des comptes personnels de chaque userId (base du prorata), en une requête */
async function incomeByUser(userIds: string[]) {
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

// ─── Virements planifiés ──────────────────────────────────────────────────────────

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

export async function createTransfer(userId: string, data: TransferData) {
	if (data.fromAccountId === data.toAccountId) {
		throw new Error('Les comptes source et destination doivent être différents.');
	}
	await assertAccess(userId, data.fromAccountId, data.toAccountId);

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
	await assertAccess(userId, data.fromAccountId, data.toAccountId);
	return getDb()
		.update(scheduledTransfer)
		.set(data)
		.where(and(eq(scheduledTransfer.id, id), eq(scheduledTransfer.userId, userId)));
}

// ─── Liaisons entre utilisateurs ─────────────────────────────────────────────

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

// ─── Équilibrage des comptes communs ─────────────────────────────────────────

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

// ─── Dashboard : solde restant par compte ─────────────────────────────────────

/** Retourne une liste plate de tous les comptes accessibles (possédés + partagés) */
export async function getAccessibleAccounts(userId: string) {
	const { owned, shared } = await getAccounts(userId);
	return [
		...owned.map((a) => ({ ...a, _sharedBy: null as (typeof shared)[0]['_sharedBy'] | null })),
		...shared
	];
}

export type AccessibleAccount = Awaited<ReturnType<typeof getAccessibleAccounts>>[number];

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
