import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const providerProfiles = sqliteTable("provider_profiles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  providerKind: text("provider_kind").notNull(),
  baseUrl: text("base_url"),
  model: text("model").notNull(),
  apiKeyRef: text("api_key_ref"),
  keyMasked: text("key_masked"),
  defaultTemperature: real("default_temperature").notNull(),
  defaultMaxTokens: integer("default_max_tokens").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const promptTemplates = sqliteTable("prompt_templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  systemPrompt: text("system_prompt").notNull(),
  userPromptTemplate: text("user_prompt_template").notNull(),
  supportedVariables: text("supported_variables").notNull(),
  outputFormat: text("output_format").notNull(),
  version: integer("version").notNull(),
  isDefault: integer("is_default", { mode: "boolean" }).notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const promptTemplateVersions = sqliteTable("prompt_template_versions", {
  id: text("id").primaryKey(),
  templateId: text("template_id").notNull(),
  version: integer("version").notNull(),
  snapshot: text("snapshot").notNull(),
  createdAt: text("created_at").notNull(),
});

export const generationPresets = sqliteTable("generation_presets", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  providerProfileId: text("provider_profile_id").notNull(),
  promptTemplateId: text("prompt_template_id").notNull(),
  temperature: real("temperature"),
  maxTokens: integer("max_tokens"),
  locale: text("locale").notNull(),
  outputFormat: text("output_format").notNull(),
  enabledPipelineSteps: text("enabled_pipeline_steps").notNull(),
  isDefault: integer("is_default", { mode: "boolean" }).notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const generations = sqliteTable("generations", {
  id: text("id").primaryKey(),
  idempotencyKey: text("idempotency_key").unique(),
  title: text("title").notNull(),
  eventSummary: text("event_summary").notNull(),
  providerProfileSnapshot: text("provider_profile_snapshot").notNull(),
  promptTemplateSnapshot: text("prompt_template_snapshot").notNull(),
  generationPresetSnapshot: text("generation_preset_snapshot").notNull(),
  renderedSystemPrompt: text("rendered_system_prompt").notNull(),
  renderedUserPrompt: text("rendered_user_prompt").notNull(),
  outputContent: text("output_content"),
  status: text("status").notNull(),
  errorMessage: text("error_message"),
  model: text("model"),
  providerKind: text("provider_kind"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  totalTokens: integer("total_tokens"),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull(),
});

