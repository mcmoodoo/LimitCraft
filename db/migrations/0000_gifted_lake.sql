DROP TYPE IF EXISTS "public"."order_status" CASCADE;--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'filled', 'cancelled', 'expired');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_hash" varchar(66) NOT NULL,
	"maker_asset" varchar(42) NOT NULL,
	"taker_asset" varchar(42) NOT NULL,
	"making_amount" numeric NOT NULL,
	"taking_amount" numeric NOT NULL,
	"maker_address" varchar(42) NOT NULL,
	"expires_in" timestamp NOT NULL,
	"signature" text NOT NULL,
	"maker_traits" text NOT NULL,
	"extension" text NOT NULL,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_hash_unique" UNIQUE("order_hash")
);
