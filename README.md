# Budgetix

Budget mensuel : comptes, revenus, dépenses et virements récurrents, avec comptes partagés
entre utilisateurs liés et répartition des dépenses communes (parts fixes ou prorata des revenus).

SvelteKit + Better Auth + Drizzle (Postgres).

## Développement

```sh
cp .env.example .env   # DATABASE_URL, ORIGIN, BETTER_AUTH_SECRET
pnpm install
pnpm db:migrate
pnpm dev
```

- `pnpm test` : tests des règles de calcul. Les tests de contrôle d'accès (`budget.test.ts`)
  ne tournent que si `DATABASE_URL` pointe vers une base jetable migrée :
  ```sh
  docker run -d --rm -e POSTGRES_PASSWORD=test -p 55432:5432 postgres:17-alpine
  export DATABASE_URL=postgres://postgres:test@localhost:55432/postgres
  pnpm db:migrate && pnpm test
  ```
- `pnpm check` : vérification des types
- `pnpm db:generate` : nouvelle migration après modification de `src/lib/server/db/schema.ts`

## Production

`docker build -t budgetix .` puis lancer avec `DATABASE_URL`, `ORIGIN` et `BETTER_AUTH_SECRET`.
Les migrations sont appliquées au démarrage du conteneur.
