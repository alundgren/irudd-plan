CREATE TABLE `deleted_plans` (
	`owner_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`deleted_at` text NOT NULL,
	CONSTRAINT `deleted_plans_pk` PRIMARY KEY(`owner_id`, `plan_id`),
	CONSTRAINT `fk_deleted_plans_owner_id_owners_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
ALTER TABLE `github_work_links` ADD `closed_at` text;--> statement-breakpoint
ALTER TABLE `plans` ADD `retention_generation` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `plans` ADD `retention_status` text DEFAULT 'scheduled' NOT NULL;--> statement-breakpoint
ALTER TABLE `plans` ADD `retention_reason` text;--> statement-breakpoint
ALTER TABLE `plans` ADD `retention_checked_at` text;--> statement-breakpoint
ALTER TABLE `plans` ADD `retention_next_check_at` text DEFAULT '1970-01-01T00:00:00.000Z' NOT NULL;--> statement-breakpoint
ALTER TABLE `plans` ADD `inactive_since` text;--> statement-breakpoint
ALTER TABLE `plans` ADD `expires_at` text;--> statement-breakpoint
ALTER TABLE `plans` ADD `ever_attached` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `plans_retention_due_idx` ON `plans` (`retention_next_check_at`);
--> statement-breakpoint
UPDATE plans SET ever_attached = 1, retention_status = 'unknown', retention_reason = 'Linked work needs a complete GitHub status check.' WHERE EXISTS (SELECT 1 FROM github_work_links WHERE github_work_links.owner_id = plans.owner_id AND github_work_links.plan_id = plans.id);
