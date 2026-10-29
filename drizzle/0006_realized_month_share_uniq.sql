ALTER TABLE "expense" ADD COLUMN "realized_month" text;--> statement-breakpoint
UPDATE "expense" SET "realized_month" = to_char(now() AT TIME ZONE 'Europe/Paris', 'YYYY-MM') WHERE "is_realized";--> statement-breakpoint
DELETE FROM "bank_account_share" a USING "bank_account_share" b WHERE a."id" > b."id" AND a."bank_account_id" = b."bank_account_id" AND a."shared_with_user_id" = b."shared_with_user_id";--> statement-breakpoint
CREATE UNIQUE INDEX "bank_account_share_account_user_uniq" ON "bank_account_share" USING btree ("bank_account_id","shared_with_user_id");
