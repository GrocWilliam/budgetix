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
import * as budget from './budget';

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
			await budget.createExpense(a, {
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
		assert.ok(!(await budget.getExpensesWithShares(b)).some((e) => e.id === expA));
		await budget.deleteExpense(b, expA);
		await budget.toggleExpenseRealized(b, expA, true);
		assert.ok(await expenseExists(expA));
		assert.equal(
			(await getDb().query.expense.findFirst({ where: eq(expense.id, expA) }))!.realizedMonth,
			null
		);
		await assert.rejects(
			budget.updateExpense(b, expA, { bankAccountId: accA, label: 'x', amount: '1', dayOfMonth: 1 })
		);
	});

	test('B n’écrit pas sur les comptes de A', async () => {
		const data = { bankAccountId: accA, label: 'x', amount: '1', dayOfMonth: 1 };
		await assert.rejects(budget.createIncome(b, data));
		await assert.rejects(budget.createExpense(b, { ...data, isShared: false, isProrata: false }));
		await assert.rejects(
			budget.createTransfer(b, {
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
		await budget.shareAccount(a, commonA, b);
		await budget.createIncome(b, {
			bankAccountId: commonA,
			label: 'Apport',
			amount: '100',
			dayOfMonth: 1
		});
		await budget.createTransfer(b, {
			fromAccountId: accB,
			toAccountId: commonA,
			label: 'Loyer',
			amount: '400',
			dayOfMonth: 1
		});
		// B en double : ne doit être compté qu'une fois
		const shared = await budget.createExpense(a, {
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

		await budget.declineLinkRequest(a, link.id);

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
});
