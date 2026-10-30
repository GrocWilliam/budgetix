import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import {
	getTransfers,
	createTransfer,
	updateTransfer,
	deleteTransfer
} from '$lib/server/transfers';
import { getAccessibleAccounts } from '$lib/server/accounts';
import { isPositiveAmount, isDay } from '$lib/server/rules';

export const load: PageServerLoad = async ({ locals }) => {
	const userId = locals.user!.id;
	const [transfers, accounts] = await Promise.all([
		getTransfers(userId),
		getAccessibleAccounts(userId)
	]);

	return { transfers, accounts, currentUserId: userId };
};

function parseTransfer(fd: FormData) {
	const data = {
		fromAccountId: Number(fd.get('fromAccountId')),
		toAccountId: Number(fd.get('toAccountId')),
		label: (fd.get('label') as string)?.trim(),
		amount: fd.get('amount') as string,
		dayOfMonth: Number(fd.get('dayOfMonth'))
	};
	return data.label && isPositiveAmount(data.amount) && isDay(data.dayOfMonth) ? data : null;
}

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const data = parseTransfer(await request.formData());
		if (!data) return fail(400, { message: 'Données invalides.' });
		try {
			await createTransfer(locals.user!.id, data);
		} catch (e) {
			return fail(400, { message: (e as Error).message });
		}
		return { success: true };
	},

	delete: async ({ request, locals }) => {
		const fd = await request.formData();
		await deleteTransfer(locals.user!.id, Number(fd.get('id')));
		return { success: true };
	},

	update: async ({ request, locals }) => {
		const fd = await request.formData();
		const data = parseTransfer(fd);
		if (!data) return fail(400, { message: 'Données invalides.' });
		try {
			await updateTransfer(locals.user!.id, Number(fd.get('id')), data);
		} catch (e) {
			return fail(400, { message: (e as Error).message });
		}
		return { success: true };
	}
};
