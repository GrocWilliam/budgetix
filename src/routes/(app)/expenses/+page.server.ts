import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	getExpensesWithShares,
	createExpense,
	updateExpense,
	deleteExpense,
	toggleExpenseRealized
} from '$lib/server/expenses';
import { getAccessibleAccounts } from '$lib/server/accounts';
import { getLinkedUsers } from '$lib/server/links';
import { isPositiveAmount, isDay } from '$lib/server/rules';

export const load: PageServerLoad = async ({ locals }) => {
	const userId = locals.user!.id;
	const [expenses, accounts, linkedUsers] = await Promise.all([
		getExpensesWithShares(userId),
		getAccessibleAccounts(userId),
		getLinkedUsers(userId)
	]);
	return { expenses, accounts, linkedUsers };
};

function parseExpense(fd: FormData) {
	const data = {
		bankAccountId: Number(fd.get('bankAccountId')),
		label: (fd.get('label') as string)?.trim(),
		amount: fd.get('amount') as string,
		dayOfMonth: Number(fd.get('dayOfMonth'))
	};
	return data.label && isPositiveAmount(data.amount) && isDay(data.dayOfMonth) ? data : null;
}

export const actions = {
	create: async ({ request, locals }) => {
		const fd = await request.formData();
		const data = parseExpense(fd);
		if (!data) return fail(400, { message: 'Données invalides.' });
		const isShared = fd.get('isShared') === 'on';
		const isProrata = fd.get('isProrata') === 'on';

		// Pas de filtre sur les parts : elles restent alignées avec les ids (vide = 0 %)
		const participantShares = fd.getAll('participantShare') as string[];
		const participants = (fd.getAll('participantId') as string[]).map((userId, i) => ({
			userId,
			sharePercentage: participantShares[i] || '0'
		}));

		try {
			await createExpense(locals.user!.id, {
				...data,
				category: (fd.get('category') as string) || undefined,
				isShared,
				isProrata,
				participants: isShared ? participants : undefined
			});
		} catch (e) {
			return fail(400, { message: (e as Error).message });
		}
		return { success: true };
	},

	delete: async ({ request, locals }) => {
		const fd = await request.formData();
		await deleteExpense(locals.user!.id, Number(fd.get('id')));
		return { success: true };
	},

	update: async ({ request, locals }) => {
		const fd = await request.formData();
		const data = parseExpense(fd);
		if (!data) return fail(400, { message: 'Données invalides.' });
		try {
			await updateExpense(locals.user!.id, Number(fd.get('id')), {
				...data,
				category: (fd.get('category') as string) || null
			});
		} catch (e) {
			return fail(400, { message: (e as Error).message });
		}
		return { success: true };
	},

	toggleRealized: async ({ request, locals }) => {
		const fd = await request.formData();
		const id = Number(fd.get('id'));
		const isRealized = fd.get('isRealized') === 'true';
		await toggleExpenseRealized(locals.user!.id, id, isRealized);
		return { success: true };
	}
} satisfies Actions;
