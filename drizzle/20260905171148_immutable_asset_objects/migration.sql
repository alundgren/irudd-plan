CREATE TABLE `asset_objects` (
	`owner_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`id` text NOT NULL,
	`digest` text NOT NULL,
	`media_type` text NOT NULL,
	`caption` text NOT NULL,
	`role` text NOT NULL,
	`content` blob NOT NULL,
	`byte_length` integer NOT NULL,
	`source_media_type` text,
	`source_digest` text,
	`source_content` blob,
	`source_byte_length` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT `asset_objects_pk` PRIMARY KEY(`owner_id`, `plan_id`, `id`, `digest`),
	CONSTRAINT `fk_asset_objects_owner_id_owners_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `asset_objects_owner_storage_idx` ON `asset_objects` (`owner_id`);