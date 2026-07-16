ALTER TABLE "tts_audio" DROP CONSTRAINT "tts_audio_cache_key_unique";--> statement-breakpoint
ALTER TABLE "tts_audio" ADD COLUMN "model" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "tts_audio" ADD CONSTRAINT "tts_audio_cache_key_unique" UNIQUE("article_id","user_id","provider","voice","model","format","source","settings_version");