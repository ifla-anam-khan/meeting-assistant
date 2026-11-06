CREATE TABLE "feed_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"category" text NOT NULL,
	"type" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 2 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feed_items" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"summary" text,
	"category" text NOT NULL,
	"tags" text,
	"importance" real DEFAULT 0.5 NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"embedding" text,
	"processed" boolean DEFAULT false NOT NULL,
	"author" text,
	"extra" jsonb,
	CONSTRAINT "feed_items_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE INDEX "feed_items_published_idx" ON "feed_items" ("published_at" DESC);
--> statement-breakpoint
CREATE INDEX "feed_items_category_idx" ON "feed_items" ("category");
--> statement-breakpoint
CREATE INDEX "feed_items_importance_idx" ON "feed_items" ("importance" DESC, "published_at" DESC);
--> statement-breakpoint
CREATE INDEX "feed_items_processed_idx" ON "feed_items" ("processed") WHERE processed = false;
--> statement-breakpoint
ALTER TABLE "feed_items" ADD CONSTRAINT "feed_items_source_id_feed_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."feed_sources"("id") ON DELETE cascade ON UPDATE no action;
