import { describe, test, beforeEach } from 'vitest';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { getDb } from './db';
import {
	user,
	bankAccount,
	expense,
	expenseParticipant,
	income,
	scheduledTransfer,
	bankAccountShare,
	userLink
} from './db/schema';
import { getAccessibleAccounts, shareAccount } from './accounts';
import { getCommonAccountSuggestions, getDashboard } from './dashboard';
import {
	createExpense,
	deleteExpense,
	getExpensesWithShares,
	toggleExpenseRealized,
	updateExpense
} from './expenses';
import { createIncome } from './incomes';
import { declineLinkRequest } from './links';
import { createTransfer } from './transfers';

// Nécessite une base Postgres jetable et migrée :
//   DATABASE_URL=postgres://… pnpm db:migrate && DATABASE_URL=postgres://… pnpm test
describe.skipIf(!process.env.DATABASE_URL)('contrôle d’accès entre utilisateurs', () => {
	let a: string, b: string, accA: number, commonA: number, accB: number, expA: number;

	async function newUser() {
		const id = crypto.randomUUID();
		await getDb()
			.insert(user)
			.values({ id, name: id, email: `${id}@test.local` });
		return id;
	}
	const newAccount = async (userId: string, type: 'personal' | 'common') =>
		(await getDb().insert(bankAccount).values({ userId, name: type, type }).returning())[0].id;

	beforeEach(async () => {
		[a, b] = [await newUser(), await newUser()];
		[accA, commonA, accB] = [
			await newAccount(a, 'personal'),
			await newAccount(a, 'common'),
			await newAccount(b, 'personal')
		];
		expA = (
			await createExpense(a, {
				bankAccountId: accA,
				label: 'Loyer',
				amount: '800',
				dayOfMonth: 5,
				isShared: false,
				isProrata: false
			})
		).id;
	});

	const expenseExists = async (id: number) =>
		!!(await getDb().query.expense.findFirst({ where: eq(expense.id, id) }));

	test('B ne voit, ne modifie ni ne supprime les dépenses de A', async () => {
		assert.ok(!(await getExpensesWithShares(b)).some((e) => e.id === expA));
		await deleteExpense(b, expA);
		await toggleExpenseRealized(b, expA, true);
		assert.ok(await expenseExists(expA));
		assert.equal(
			(await getDb().query.expense.findFirst({ where: eq(expense.id, expA) }))!.realizedMonth,
			null
		);
		await assert.rejects(
			updateExpense(b, expA, { bankAccountId: accA, label: 'x', amount: '1', dayOfMonth: 1 })
		);
	});

	test('B n’écrit pas sur les comptes de A', async () => {
		const data = { bankAccountId: accA, label: 'x', amount: '1', dayOfMonth: 1 };
		await assert.rejects(createIncome(b, data));
		await assert.rejects(createExpense(b, { ...data, isShared: false, isProrata: false }));
		await assert.rejects(
			createTransfer(b, {
				fromAccountId: accB,
				toAccountId: accA,
				label: 'x',
				amount: '1',
				dayOfMonth: 1
			})
		);
	});

	test('délier sépare tout : partages, revenus, virements, participations', async () => {
		const [link] = await getDb()
			.insert(userLink)
			.values({ requesterId: a, receiverId: b, status: 'accepted' })
			.returning();
		await shareAccount(a, commonA, b);
		await createIncome(b, {
			bankAccountId: commonA,
			label: 'Apport',
			amount: '100',
			dayOfMonth: 1
		});
		await createTransfer(b, {
			fromAccountId: accB,
			toAccountId: commonA,
			label: 'Loyer',
			amount: '400',
			dayOfMonth: 1
		});
		// B en double : ne doit être compté qu'une fois
		const shared = await createExpense(a, {
			bankAccountId: commonA,
			label: 'Courses',
			amount: '300',
			dayOfMonth: 1,
			isShared: true,
			isProrata: false,
			participants: [
				{ userId: b, sharePercentage: '30' },
				{ userId: b, sharePercentage: '30' }
			]
		});
		const parts = await getDb().query.expenseParticipant.findMany({
			where: eq(expenseParticipant.expenseId, shared.id)
		});
		assert.deepEqual(
			parts.map((p) => [p.userId, p.sharePercentage]).sort(),
			[
				[a, '70.00'],
				[b, '30.00']
			].sort()
		);

		await declineLinkRequest(a, link.id);

		assert.equal(
			(
				await getDb().query.bankAccountShare.findMany({
					where: eq(bankAccountShare.sharedWithUserId, b)
				})
			).length,
			0
		);
		assert.equal((await getDb().query.income.findMany({ where: eq(income.userId, b) })).length, 0);
		assert.equal(
			(await getDb().query.scheduledTransfer.findMany({ where: eq(scheduledTransfer.userId, b) }))
				.length,
			0
		);
		const left = await getDb().query.expenseParticipant.findMany({
			where: eq(expenseParticipant.expenseId, shared.id)
		});
		assert.deepEqual(
			left.map((p) => p.userId),
			[a]
		);
		assert.ok(
			await getDb().query.bankAccount.findFirst({ where: eq(bankAccount.id, accB) }),
			'les comptes de B restent'
		);
	});

	test('tableau de bord : solde nul exact, sans « -0,00 »', async () => {
		const acc = (
			await getDb()
				.insert(bankAccount)
				.values({ userId: a, name: 'Zéro', initialBalance: '100.30' })
				.returning()
		)[0].id;
		for (const amount of ['50.10', '50.20']) {
			await createExpense(a, {
				bankAccountId: acc,
				label: 'x',
				amount,
				dayOfMonth: 1,
				isShared: false,
				isProrata: false
			});
		}
		const { accounts } = await getDashboard(a, await getAccessibleAccounts(a));
		const zero = accounts.find((x) => x.id === acc)!;
		assert.equal(zero.balance, 0);
		assert.ok(!(zero.balance < 0));
	});

	test('équilibrage : parts fixes de la dépense, prorata pour le reste ; total sans les comptes partagés', async () => {
		await getDb().insert(userLink).values({ requesterId: a, receiverId: b, status: 'accepted' });
		await shareAccount(a, commonA, b);
		// Revenus personnels égaux : prorata 50/50
		for (const [u, acc] of [
			[a, accA],
			[b, accB]
		] as const) {
			await createIncome(u, {
				bankAccountId: acc,
				label: 'Salaire',
				amount: '2000',
				dayOfMonth: 1
			});
		}
		// 1000 € à 70 (A, l'auteur) / 30 (B) + 200 € non partagés (50/50)
		await createExpense(a, {
			bankAccountId: commonA,
			label: 'Loyer',
			amount: '1000',
			dayOfMonth: 1,
			isShared: true,
			isProrata: false,
			participants: [{ userId: b, sharePercentage: '30' }]
		});
		await createExpense(a, {
			bankAccountId: commonA,
			label: 'Internet',
			amount: '200',
			dayOfMonth: 1,
			isShared: false,
			isProrata: false
		});

		const [s] = await getCommonAccountSuggestions(b, await getAccessibleAccounts(b));
		assert.equal(s.totalToCover, 1200);
		assert.deepEqual(Object.fromEntries(s.breakdown.map((x) => [x.userId, x.amount])), {
			[a]: 800,
			[b]: 400
		});
		assert.equal(s.myAmount, 400);

		// B voit le compte commun de A, mais son total ne compte que ses comptes : 0 + 2000
		const dash = await getDashboard(b, await getAccessibleAccounts(b));
		assert.ok(dash.accounts.some((x) => x.id === commonA));
		assert.equal(dash.totalBalance, 2000);
	});
});
