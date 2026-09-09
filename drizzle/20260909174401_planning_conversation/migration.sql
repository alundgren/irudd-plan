CREATE TABLE `planning_entries` (
	`owner_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`id` text NOT NULL,
	`revision` integer NOT NULL,
	`content_json` text NOT NULL,
	CONSTRAINT `planning_entries_pk` PRIMARY KEY(`owner_id`, `plan_id`, `id`),
	CONSTRAINT `fk_planning_entries_owner_id_plan_id_plans_owner_id_id_fk` FOREIGN KEY (`owner_id`,`plan_id`) REFERENCES `plans`(`owner_id`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX `planning_entries_revision_idx` ON `planning_entries` (`owner_id`,`plan_id`,`revision`);