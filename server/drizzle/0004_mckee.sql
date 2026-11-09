CREATE TABLE `coach_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`seq` integer NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`reasoning` text,
	`section` text,
	`proposals` text,
	`meta` text,
	`status` text DEFAULT 'complete' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `coach_threads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `coach_messages_thread_seq_idx` ON `coach_messages` (`thread_id`,`seq`);--> statement-breakpoint
CREATE TABLE `coach_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`character_id` text NOT NULL,
	`project_id` text,
	`title` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `coach_threads_character_idx` ON `coach_threads` (`character_id`);--> statement-breakpoint
ALTER TABLE `characters` ADD `build` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `story` text;