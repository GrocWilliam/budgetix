import type { PageServerLoad } from './$types';
import { getDashboard, getCommonAccountSuggestions } from '$lib/server/dashboard';
import { getAccessibleAccounts } from '$lib/server/accounts';

export const load: PageServerLoad = async ({ locals }) => {
	const userId = locals.user!.id;
	const accessible = await getAccessibleAccounts(userId);
	const [{ accounts, totalBalance }, suggestions] = await Promise.all([
		getDashboard(userId, accessible),
		getCommonAccountSuggestions(userId, accessible)
	]);
	return { accounts, totalBalance, suggestions };
};
