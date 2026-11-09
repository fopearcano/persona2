CREATE TABLE `project_characters` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`character_id` text NOT NULL,
	`added_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_characters_unique` ON `project_characters` (`project_id`,`character_id`);--> statement-breakpoint
CREATE INDEX `project_characters_character_idx` ON `project_characters` (`character_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `scenarios` ADD `project_id` text REFERENCES projects(id) ON DELETE cascade;--> statement-breakpoint
CREATE INDEX `scenarios_project_idx` ON `scenarios` (`project_id`);