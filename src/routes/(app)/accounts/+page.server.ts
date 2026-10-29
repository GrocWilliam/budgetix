import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	getAccounts,
	createAccount,
	updateAccount,
	deleteAccount,
	shareAccount,
	unshareAccount,
	getLinkedUsers
} from '$lib/server/budget';
import { isAccountType, isAmount } from '$lib/server/rules';

export const load: PageServerLoad = async ({ locals }) => {
	const userId = locals.user!.id;
	const [{ owned, shared }, linkedUsers] = await Promise.all([
		getAccounts(userId),
		getLinkedUsers(userId)
	]);
	return { owned, shared, linkedUsers };
};

export const actions = {
	create: async ({ request, locals }) => {
		const fd = await request.formData();
		const name = (fd.get('name') as string)?.trim();
		const type = fd.get('type');
		const initialBalance = fd.get('initialBalance') as string;
		if (!name || !isAccountType(type) || !isAmount(initialBalance)) {
			return fail(400, { message: 'Données invalides.' });
		}
		await createAccount(locals.user!.id, {
			name,
			type,
			initialBalance,
			color: (fd.get('color') as string) || undefined
		});
		return { success: true };
	},

	delete: async ({ request, locals }) => {
		const fd = await request.formData();
		await deleteAccount(locals.user!.id, Number(fd.get('id')));
		return { success: true };
	},

	update: async ({ request, locals }) => {
		const fd = await request.formData();
		const name = (fd.get('name') as string)?.trim();
		const type = fd.get('type');
		const initialBalance = fd.get('initialBalance') as string;
		const rawCurrentBalance = fd.get('currentBalance') as string | null;
		const currentBalance =
			rawCurrentBalance !== '' && rawCurrentBalance !== null ? rawCurrentBalance : null;
		if (
			!name ||
			!isAccountType(type) ||
			!isAmount(initialBalance) ||
			(currentBalance !== null && !isAmount(currentBalance))
		) {
			return fail(400, { message: 'Données invalides.' });
		}
		await updateAccount(locals.user!.id, Number(fd.get('id')), {
			name,
			type,
			initialBalance,
			color: (fd.get('color') as string) || undefined,
			currentBalance
		});
		return { success: true };
	},

	share: async ({ request, locals }) => {
		const fd = await request.formData();
		try {
			await shareAccount(
				locals.user!.id,
				Number(fd.get('accountId')),
				fd.get('targetUserId') as string
			);
		} catch (e) {
			return fail(400, { message: (e as Error).message });
		}
		return { success: true };
	},

	unshare: async ({ request, locals }) => {
		const fd = await request.formData();
		try {
			await unshareAccount(
				locals.user!.id,
				Number(fd.get('accountId')),
				fd.get('targetUserId') as string
			);
		} catch (e) {
			return fail(400, { message: (e as Error).message });
		}
		return { success: true };
	}
} satisfies Actions;
