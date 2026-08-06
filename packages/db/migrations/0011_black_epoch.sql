ALTER TYPE "public"."summary_provider" ADD VALUE 'openrouter';--> statement-breakpoint
ALTER TYPE "public"."tts_provider" ADD VALUE 'openrouter';--> statement-breakpoint
ALTER TYPE "public"."credential_provider" ADD VALUE 'openrouter';--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "summary_prefs" jsonb DEFAULT '{}'::jsonb NOT NULL;