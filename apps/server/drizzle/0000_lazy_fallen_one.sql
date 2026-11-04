CREATE TABLE "alarms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"floor_id" uuid,
	"device_id" text NOT NULL,
	"integration_key_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"object_id" text,
	"object_type" text,
	"severity" text NOT NULL,
	"count" integer NOT NULL,
	"first_occurred_at" timestamp with time zone NOT NULL,
	"last_occurred_at" timestamp with time zone NOT NULL,
	"last_received_at" timestamp with time zone NOT NULL,
	"x" double precision,
	"y" double precision,
	"acknowledged_at" timestamp with time zone,
	"ack_note" text
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" uuid NOT NULL,
	"floor_id" uuid NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"pos_x" double precision NOT NULL,
	"pos_y" double precision NOT NULL,
	"pos_z" double precision NOT NULL,
	"yaw_deg" double precision DEFAULT 0 NOT NULL,
	"pitch_deg" double precision DEFAULT 0 NOT NULL,
	"hfov_deg" double precision,
	"range_m" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alarm_id" uuid NOT NULL,
	"integration_key_id" uuid NOT NULL,
	"external_event_id" text,
	"device_id" text NOT NULL,
	"event_type" text NOT NULL,
	"severity" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"x" double precision,
	"y" double precision,
	"object_id" text,
	"object_type" text,
	CONSTRAINT "events_key_external_uq" UNIQUE("integration_key_id","external_event_id")
);
--> statement-breakpoint
CREATE TABLE "floors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"name" text NOT NULL,
	"elevation_min" double precision NOT NULL,
	"elevation_max" double precision NOT NULL,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"default_severity" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "integration_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"model_version" integer,
	"model_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alarms" ADD CONSTRAINT "alarms_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alarms" ADD CONSTRAINT "alarms_integration_key_id_integration_keys_id_fk" FOREIGN KEY ("integration_key_id") REFERENCES "public"."integration_keys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_floor_id_floors_id_fk" FOREIGN KEY ("floor_id") REFERENCES "public"."floors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_alarm_id_alarms_id_fk" FOREIGN KEY ("alarm_id") REFERENCES "public"."alarms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floors" ADD CONSTRAINT "floors_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alarms_continuation_idx" ON "alarms" USING btree ("integration_key_id","device_id","event_type","object_id","last_received_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "alarms_site_ack_idx" ON "alarms" USING btree ("site_id","acknowledged_at");--> statement-breakpoint
CREATE INDEX "alarms_site_first_idx" ON "alarms" USING btree ("site_id","first_occurred_at");