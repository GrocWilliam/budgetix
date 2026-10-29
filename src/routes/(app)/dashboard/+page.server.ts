import type { PageServerLoad } from './$types';
import {
	getDashboard,
	getCommonAccountSuggestions,
	getAccessibleAccounts
} from '$lib/server/budget';

export const load: PageServerLoad = async ({ locals }) => {
	const userId = locals.user!.id;
	const accessible = await getAccessibleAccounts(userId);
	const [accounts, suggestions] = await Promise.all([
		getDashboard(accessible),
		getCommonAccountSuggestions(userId, accessible)
	]);
	const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);
	return { accounts, totalBalance, suggestions };
};
