// Affichage partagé entre les pages (côté client : ne peut pas vivre dans $lib/server)

export const typeLabels: Record<string, string> = {
	personal: 'Personnel',
	savings: 'Épargne',
	common: 'Commun'
};

export const fmt = (n: number) =>
	n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
