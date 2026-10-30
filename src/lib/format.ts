// Affichage partagé entre les pages (côté client : ne peut pas vivre dans $lib/server)

export const typeLabels: Record<string, string> = {
	personal: 'Personnel',
	savings: 'Épargne',
	common: 'Commun'
};

export const fmt = (n: number) =>
	n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Somme de montants numeric (string, null ignoré), additionnés en centimes pour éviter la dérive des flottants */
export const total = (amounts: (string | null)[]) =>
	amounts.reduce((s, a) => s + (a == null ? 0 : Math.round(parseFloat(a) * 100)), 0) / 100;
