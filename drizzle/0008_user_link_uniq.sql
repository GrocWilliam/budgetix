DELETE FROM "user_link" a USING "user_link" b WHERE a."requester_id" = b."requester_id" AND a."receiver_id" = b."receiver_id" AND ((a."status" = b."status" AND a."id" > b."id") OR (a."status" = 'pending' AND b."status" = 'accepted'));--> statement-breakpoint
CREATE UNIQUE INDEX "user_link_requester_receiver_uniq" ON "user_link" USING btree ("requester_id","receiver_id");
