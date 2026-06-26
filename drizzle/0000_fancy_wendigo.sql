CREATE TABLE `generation_presets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`provider_profile_id` text NOT NULL,
	`prompt_template_id` text NOT NULL,
	`temperature` real,
	`max_tokens` integer,
	`locale` text NOT NULL,
	`output_format` text NOT NULL,
	`enabled_pipeline_steps` text NOT NULL,
	`is_default` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `generations` (
	`id` text PRIMARY KEY NOT NULL,
	`idempotency_key` text,
	`title` text NOT NULL,
	`event_summary` text NOT NULL,
	`provider_profile_snapshot` text NOT NULL,
	`prompt_template_snapshot` text NOT NULL,
	`generation_preset_snapshot` text NOT NULL,
	`rendered_system_prompt` text NOT NULL,
	`rendered_user_prompt` text NOT NULL,
	`output_content` text,
	`status` text NOT NULL,
	`error_message` text,
	`model` text,
	`provider_kind` text,
	`input_tokens` integer,
	`output_tokens` integer,
	`total_tokens` integer,
	`started_at` text,
	`completed_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `generations_idempotency_key_unique` ON `generations` (`idempotency_key`);--> statement-breakpoint
CREATE TABLE `prompt_template_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`version` integer NOT NULL,
	`snapshot` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `prompt_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`system_prompt` text NOT NULL,
	`user_prompt_template` text NOT NULL,
	`supported_variables` text NOT NULL,
	`custom_variable_defaults` text DEFAULT '{}' NOT NULL,
	`output_format` text NOT NULL,
	`version` integer NOT NULL,
	`is_default` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `provider_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`provider_kind` text NOT NULL,
	`base_url` text,
	`model` text NOT NULL,
	`api_key_ref` text,
	`key_masked` text,
	`default_temperature` real NOT NULL,
	`default_max_tokens` integer NOT NULL,
	`enabled` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
