CREATE TABLE `github_work_links` (
	`owner_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`item_id` text,
	`repository_id` text NOT NULL,
	`work_node_id` text NOT NULL,
	`work_database_id` text NOT NULL,
	`type` text NOT NULL,
	`number` integer NOT NULL,
	`url` text NOT NULL,
	`state` text NOT NULL,
	`last_observed_at` text NOT NULL,
	CONSTRAINT `github_work_links_pk` PRIMARY KEY(`owner_id`, `plan_id`, `type`, `work_node_id`),
	CONSTRAINT `fk_github_work_links_owner_id_plan_id_plans_owner_id_id_fk` FOREIGN KEY (`owner_id`,`plan_id`) REFERENCES `plans`(`owner_id`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
ALTER TABLE `plans` ADD `repository_id` text;--> statement-breakpoint
ALTER TABLE `plans` ADD `repository_visibility` text;--> statement-breakpoint
ALTER TABLE `plans` ADD `repository_verified_at` text;--> statement-breakpoint
ALTER TABLE `plans` ADD `published_at` text;--> statement-breakpoint
CREATE INDEX `github_work_links_plan_idx` ON `github_work_links` (`owner_id`,`plan_id`);