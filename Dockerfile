FROM node:22-alpine

# Version de pnpm lue depuis "packageManager" dans package.json
RUN corepack enable

WORKDIR /app

# Installer les dépendances
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# Copier les sources et builder l'application
# (getDb() est paresseux : pas besoin de DATABASE_URL au build)
COPY . .
RUN pnpm build

# Variables d'environnement requises
# DATABASE_URL=postgres://user:password@host:5432/dbname
# BETTER_AUTH_SECRET=<secret>
# ORIGIN=https://budget.example.com   (URL publique : CSRF + Better Auth)
# Les migrations drizzle sont appliquées au démarrage (entrypoint.sh)

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

EXPOSE 3000

RUN chmod +x entrypoint.sh
ENTRYPOINT ["./entrypoint.sh"]
