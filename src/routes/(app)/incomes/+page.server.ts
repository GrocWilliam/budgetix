import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getIncomes, createIncome, updateIncome, deleteIncome } from '$lib/server/incomes';
import { getAccessibleAccounts } from '$lib/server/accounts';
import { isPositiveAmount, isDay } from '$lib/server/rules';

function parseIncome(fd: FormData) {
	const data = {
		bankAccountId: Number(fd.get('bankAccountId')),
		label: (fd.get('label') as string)?.trim(),
		amount: fd.get('amount') as string,
		dayOfMonth: Number(fd.get('dayOfMonth'))
	};
	return data.label && isPositiveAmount(data.amount) && isDay(data.dayOfMonth) ? data : null;
}

export const load: PageServerLoad = async ({ locals }) => {
	const [incomes, accounts] = await Promise.all([
		getIncomes(locals.user!.id),
		getAccessibleAccounts(locals.user!.id)
	]);
	return { incomes, accounts };
};

export const actions = {
	create: async ({ request, locals }) => {
		const data = parseIncome(await request.formData());
		if (!data) return fail(400, { message: 'Données invalides.' });
		try {
			await createIncome(locals.user!.id, data);
		} catch (e) {
			return fail(400, { message: (e as Error).message });
		}
		return { success: true };
	},

	delete: async ({ request, locals }) => {
		const fd = await request.formData();
		await deleteIncome(locals.user!.id, Number(fd.get('id')));
		return { success: true };
	},

	update: async ({ request, locals }) => {
		const fd = await request.formData();
		const data = parseIncome(fd);
		if (!data) return fail(400, { message: 'Données invalides.' });
		try {
			await updateIncome(locals.user!.id, Number(fd.get('id')), data);
		} catch (e) {
			return fail(400, { message: (e as Error).message });
		}
		return { success: true };
	}
} satisfies Actions;
