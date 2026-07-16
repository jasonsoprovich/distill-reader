CREATE TYPE "public"."tts_source" AS ENUM('full', 'summary');--> statement-breakpoint
ALTER TABLE "tts_audio" DROP CONSTRAINT "tts_audio_cache_key_unique";--> statement-breakpoint
ALTER TABLE "tts_audio" ADD COLUMN "source" "tts_source" DEFAULT 'full' NOT NULL;--> statement-breakpoint
ALTER TABLE "tts_audio" ADD CONSTRAINT "tts_audio_cache_key_unique" UNIQUE("article_id","user_id","provider","voice","format","source","settings_version");