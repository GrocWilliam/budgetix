#!/bin/sh
set -e

pnpm db:migrate
exec pnpm start
