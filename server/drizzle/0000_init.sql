CREATE TABLE `character_languages` (
	`id` text PRIMARY KEY NOT NULL,
	`character_id` text NOT NULL,
	`code` text NOT NULL,
	`proficiency` text NOT NULL,
	`is_native` integer DEFAULT false NOT NULL,
	`notes` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `character_languages_character_idx` ON `character_languages` (`character_id`);--> statement-breakpoint
CREATE TABLE `character_traits` (
	`id` text PRIMARY KEY NOT NULL,
	`character_id` text NOT NULL,
	`category` text NOT NULL,
	`content` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `character_traits_character_idx` ON `character_traits` (`character_id`);--> statement-breakpoint
CREATE TABLE `characters` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`age` text,
	`origin` text,
	`cultural_background` text,
	`occupation` text,
	`education` text,
	`biography` text,
	`appearance` text,
	`portrait` text,
	`temperament` text,
	`interpersonal_style` text,
	`conflict_response` text,
	`stress_response` text,
	`big_five` text,
	`register` text,
	`vocabulary` text,
	`formality` text,
	`humor` text,
	`assertiveness` text,
	`argumentative_style` text,
	`conversational_depth` text,
	`cultural_linguistic_notes` text,
	`preferred_language` text,
	`author_notes` text,
	`status` text DEFAULT 'active' NOT NULL,
	`parent_id` text,
	`variant_note` text,
	`model_config_id` text,
	`identity_version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`model_config_id`) REFERENCES `model_configurations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `characters_status_idx` ON `characters` (`status`);--> statement-breakpoint
CREATE INDEX `characters_parent_idx` ON `characters` (`parent_id`);--> statement-breakpoint
CREATE TABLE `conversation_participants` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`character_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conversation_participants_unique` ON `conversation_participants` (`conversation_id`,`character_id`);--> statement-breakpoint
CREATE TABLE `conversation_summaries` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`from_seq` integer NOT NULL,
	`to_seq` integer NOT NULL,
	`content` text NOT NULL,
	`model` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `conversation_summaries_conversation_idx` ON `conversation_summaries` (`conversation_id`,`to_seq`);--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`character_id` text,
	`scenario_id` text,
	`title` text NOT NULL,
	`language` text DEFAULT 'auto' NOT NULL,
	`default_mode` text DEFAULT 'dialogue' NOT NULL,
	`turn_mode` text DEFAULT 'manual' NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`summarized_seq` integer DEFAULT 0 NOT NULL,
	`memory_processed_seq` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scenario_id`) REFERENCES `scenarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `conversations_character_idx` ON `conversations` (`character_id`);--> statement-breakpoint
CREATE INDEX `conversations_scenario_idx` ON `conversations` (`scenario_id`);--> statement-breakpoint
CREATE TABLE `expertise` (
	`id` text PRIMARY KEY NOT NULL,
	`character_id` text NOT NULL,
	`domain` text NOT NULL,
	`level` text NOT NULL,
	`description` text,
	`subtopics` text DEFAULT '[]' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `expertise_character_idx` ON `expertise` (`character_id`);--> statement-breakpoint
CREATE TABLE `identity_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`character_id` text NOT NULL,
	`version` integer NOT NULL,
	`snapshot` text NOT NULL,
	`reason` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `identity_revisions_character_idx` ON `identity_revisions` (`character_id`);--> statement-breakpoint
CREATE TABLE `knowledge_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`character_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`content` text NOT NULL,
	`embedding` text,
	FOREIGN KEY (`source_id`) REFERENCES `knowledge_sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `knowledge_chunks_source_idx` ON `knowledge_chunks` (`source_id`);--> statement-breakpoint
CREATE TABLE `knowledge_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`character_id` text NOT NULL,
	`title` text NOT NULL,
	`kind` text DEFAULT 'text' NOT NULL,
	`content` text NOT NULL,
	`source_ref` text,
	`epistemic_status` text DEFAULT 'fact' NOT NULL,
	`language` text,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `knowledge_sources_character_idx` ON `knowledge_sources` (`character_id`);--> statement-breakpoint
CREATE TABLE `memories` (
	`id` text PRIMARY KEY NOT NULL,
	`character_id` text NOT NULL,
	`category` text NOT NULL,
	`scenario_id` text,
	`content` text NOT NULL,
	`importance` integer DEFAULT 3 NOT NULL,
	`epistemic_status` text DEFAULT 'fact' NOT NULL,
	`language` text,
	`status` text DEFAULT 'active' NOT NULL,
	`origin` text DEFAULT 'author' NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`promoted_from_id` text,
	`retrieval_count` integer DEFAULT 0 NOT NULL,
	`last_retrieved_at` text,
	`embedding` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scenario_id`) REFERENCES `scenarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `memories_character_idx` ON `memories` (`character_id`,`category`,`status`);--> statement-breakpoint
CREATE INDEX `memories_scenario_idx` ON `memories` (`scenario_id`);--> statement-breakpoint
CREATE TABLE `memory_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`memory_id` text NOT NULL,
	`conversation_id` text,
	`message_id` text,
	`scenario_id` text,
	`from_seq` integer,
	`to_seq` integer,
	`note` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`memory_id`) REFERENCES `memories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `memory_sources_memory_idx` ON `memory_sources` (`memory_id`);--> statement-breakpoint
CREATE TABLE `message_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `message_revisions_message_idx` ON `message_revisions` (`message_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`seq` integer NOT NULL,
	`role` text NOT NULL,
	`character_id` text,
	`speaker_name` text,
	`content` text NOT NULL,
	`reasoning` text,
	`mode` text DEFAULT 'dialogue' NOT NULL,
	`language` text,
	`status` text DEFAULT 'complete' NOT NULL,
	`provider_type` text,
	`model` text,
	`context_meta` text,
	`regenerated_from_id` text,
	`edited_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `messages_conversation_idx` ON `messages` (`conversation_id`,`seq`);--> statement-breakpoint
CREATE TABLE `model_configurations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`provider_type` text NOT NULL,
	`base_url` text DEFAULT '' NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`temperature` real DEFAULT 0.8 NOT NULL,
	`top_p` real,
	`max_tokens` integer DEFAULT 1024 NOT NULL,
	`context_length` integer DEFAULT 8192 NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`api_key` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `scenario_events` (
	`id` text PRIMARY KEY NOT NULL,
	`scenario_id` text NOT NULL,
	`title` text,
	`content` text NOT NULL,
	`fictional_time` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`scenario_id`) REFERENCES `scenarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `scenario_events_scenario_idx` ON `scenario_events` (`scenario_id`);--> statement-breakpoint
CREATE TABLE `scenario_participants` (
	`id` text PRIMARY KEY NOT NULL,
	`scenario_id` text NOT NULL,
	`character_id` text NOT NULL,
	`role` text,
	`role_description` text,
	`knowledge` text,
	`objectives` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`scenario_id`) REFERENCES `scenarios`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scenario_participants_unique` ON `scenario_participants` (`scenario_id`,`character_id`);--> statement-breakpoint
CREATE TABLE `scenario_relationships` (
	`id` text PRIMARY KEY NOT NULL,
	`scenario_id` text NOT NULL,
	`from_character_id` text NOT NULL,
	`to_character_id` text NOT NULL,
	`description` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`scenario_id`) REFERENCES `scenarios`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `scenario_relationships_scenario_idx` ON `scenario_relationships` (`scenario_id`);--> statement-breakpoint
CREATE TABLE `scenarios` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`setting` text,
	`timeline` text,
	`environment` text,
	`initial_situation` text,
	`current_situation` text,
	`knowledge` text,
	`language` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_preferences` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
