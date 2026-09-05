CREATE TABLE `acceptance_criteria` (
	`owner_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`item_id` text NOT NULL,
	`id` text NOT NULL,
	`text` text NOT NULL,
	CONSTRAINT `acceptance_criteria_pk` PRIMARY KEY(`owner_id`, `plan_id`, `item_id`, `id`),
	CONSTRAINT `fk_acceptance_criteria_owner_id_plan_id_item_id_work_items_owner_id_plan_id_id_fk` FOREIGN KEY (`owner_id`,`plan_id`,`item_id`) REFERENCES `work_items`(`owner_id`,`plan_id`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `assets` (
	`owner_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`id` text NOT NULL,
	`uri` text NOT NULL,
	`media_type` text NOT NULL,
	`digest` text NOT NULL,
	`caption` text NOT NULL,
	`role` text NOT NULL,
	`available` integer NOT NULL,
	CONSTRAINT `assets_pk` PRIMARY KEY(`owner_id`, `plan_id`, `id`),
	CONSTRAINT `fk_assets_owner_id_plan_id_plans_owner_id_id_fk` FOREIGN KEY (`owner_id`,`plan_id`) REFERENCES `plans`(`owner_id`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `decisions` (
	`owner_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`id` text NOT NULL,
	`title` text NOT NULL,
	`reason` text NOT NULL,
	`source` text,
	CONSTRAINT `decisions_pk` PRIMARY KEY(`owner_id`, `plan_id`, `id`),
	CONSTRAINT `fk_decisions_owner_id_plan_id_plans_owner_id_id_fk` FOREIGN KEY (`owner_id`,`plan_id`) REFERENCES `plans`(`owner_id`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `operations` (
	`owner_id` text NOT NULL,
	`id` text NOT NULL,
	`request_digest` text NOT NULL,
	`response_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT `operations_pk` PRIMARY KEY(`owner_id`, `id`),
	CONSTRAINT `fk_operations_owner_id_owners_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `owner_credentials` (
	`issuer` text NOT NULL,
	`claim` text NOT NULL,
	`value` text NOT NULL,
	`kind` text NOT NULL,
	`owner_id` text NOT NULL,
	CONSTRAINT `owner_credentials_pk` PRIMARY KEY(`issuer`, `claim`, `value`),
	CONSTRAINT `fk_owner_credentials_owner_id_owners_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `owners` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `plan_revisions` (
	`owner_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`version` integer NOT NULL,
	`operation_id` text NOT NULL,
	`plan_digest` text NOT NULL,
	`content_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT `plan_revisions_pk` PRIMARY KEY(`owner_id`, `plan_id`, `version`),
	CONSTRAINT `fk_plan_revisions_owner_id_plan_id_plans_owner_id_id_fk` FOREIGN KEY (`owner_id`,`plan_id`) REFERENCES `plans`(`owner_id`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `plans` (
	`owner_id` text NOT NULL,
	`id` text NOT NULL,
	`repository_provider` text NOT NULL,
	`repository_owner` text NOT NULL,
	`repository_name` text NOT NULL,
	`repository_verified` integer DEFAULT false NOT NULL,
	`contract_version` text DEFAULT 'v1' NOT NULL,
	`epic_goal` text NOT NULL,
	`current_version` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT `plans_pk` PRIMARY KEY(`owner_id`, `id`),
	CONSTRAINT `fk_plans_owner_id_owners_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `shared_contexts` (
	`owner_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`id` text NOT NULL,
	`title` text NOT NULL,
	`reason` text NOT NULL,
	`source` text,
	CONSTRAINT `shared_contexts_pk` PRIMARY KEY(`owner_id`, `plan_id`, `id`),
	CONSTRAINT `fk_shared_contexts_owner_id_plan_id_plans_owner_id_id_fk` FOREIGN KEY (`owner_id`,`plan_id`) REFERENCES `plans`(`owner_id`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `work_items` (
	`owner_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`id` text NOT NULL,
	`title` text NOT NULL,
	`short_goal` text NOT NULL,
	CONSTRAINT `work_items_pk` PRIMARY KEY(`owner_id`, `plan_id`, `id`),
	CONSTRAINT `fk_work_items_owner_id_plan_id_plans_owner_id_id_fk` FOREIGN KEY (`owner_id`,`plan_id`) REFERENCES `plans`(`owner_id`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `owner_credentials_owner_idx` ON `owner_credentials` (`owner_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `plan_revisions_operation_idx` ON `plan_revisions` (`owner_id`,`operation_id`);--> statement-breakpoint
CREATE INDEX `plans_owner_updated_idx` ON `plans` (`owner_id`,`updated_at`);