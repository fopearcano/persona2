CREATE TABLE `sync_meta` (
	`id` integer PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`device_name` text,
	`bound_to` text,
	`applying` integer DEFAULT 0 NOT NULL,
	`folder` text,
	`enabled` integer DEFAULT false NOT NULL,
	`interval_minutes` integer DEFAULT 5 NOT NULL,
	`sync_set_id` text,
	`encryption_key` text,
	`last_seq` integer DEFAULT 0 NOT NULL,
	`last_sync_at` text,
	`last_error` text,
	`last_result` text,
	`last_import_at` text
);
--> statement-breakpoint
CREATE TABLE `sync_peers` (
	`device_id` text PRIMARY KEY NOT NULL,
	`name` text,
	`app_version` text,
	`applied_seq` integer DEFAULT 0 NOT NULL,
	`last_seq` integer DEFAULT 0 NOT NULL,
	`last_seen_at` text,
	`blocked` text
);
--> statement-breakpoint
CREATE TABLE `sync_pending` (
	`tbl` text NOT NULL,
	`row_id` text NOT NULL,
	`at` integer NOT NULL,
	`dev` text NOT NULL,
	`data` text NOT NULL,
	PRIMARY KEY(`tbl`, `row_id`)
);
--> statement-breakpoint
CREATE TABLE `sync_row_versions` (
	`tbl` text NOT NULL,
	`row_id` text NOT NULL,
	`at` integer NOT NULL,
	`dev` text NOT NULL,
	`dirty` integer DEFAULT 1 NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`tbl`, `row_id`)
);
--> statement-breakpoint
CREATE INDEX `sync_row_versions_dirty_idx` ON `sync_row_versions` (`dirty`);--> statement-breakpoint
DROP INDEX `coach_messages_thread_seq_idx`;--> statement-breakpoint
CREATE INDEX `coach_messages_thread_seq_idx` ON `coach_messages` (`thread_id`,`seq`);--> statement-breakpoint
-- Riga unica dello stato di sincronizzazione, con l'identità di questo dispositivo.
INSERT INTO `sync_meta` (`id`, `device_id`) VALUES (1, lower(hex(randomblob(16))));