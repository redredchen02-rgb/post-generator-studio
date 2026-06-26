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
  customVariableDefaults: text("custom_variable_defaults").notNull().default("{}"),
  outputFormat: text("output_format").notNull(),
  version: integer("version").notNull(),
  isDefault: integer("is_default", { mode: "boolean" }).notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const promptTemplateVersions = sqliteTable("prompt_template_versions", {
  id: text("id").primaryKey(),
  templateId: text("template_id")
    .notNull()
    .references(() => promptTemplates.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  snapshot: text("snapshot").notNull(),
  createdAt: text("created_at").notNull(),
});

export const generationPresets = sqliteTable("generation_presets", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  providerProfileId: text("provider_profile_id")
    .notNull()
    .references(() => providerProfiles.id, { onDelete: "restrict" }),
  promptTemplateId: text("prompt_template_id")
    .notNull()
    .references(() => promptTemplates.id, { onDelete: "restrict" }),
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
  // FK to generation_drafts(id) ON DELETE SET NULL is enforced at the SQL level
  // (INITIAL_SQL + migration). The drizzle .references() is intentionally omitted
  // here: generation_drafts already references generations, and adding the reverse
  // reference creates a circular type drizzle cannot infer.
  activeDraftId: text("active_draft_id"),
  qualityScore: text("quality_score"),
});

export const generationDrafts = sqliteTable("generation_drafts", {
  id: text("id").primaryKey(),
  generationId: text("generation_id")
    .notNull()
    .references(() => generations.id, { onDelete: "cascade" }),
  label: text("label"),
  content: text("content").notNull(),
  // 'working' = live autosave buffer (single, updated in place); 'snapshot' = saved version.
  kind: text("kind").notNull().default("snapshot"),
  // 'generated' = raw model output; 'edited' = user edit; 'rewrite' = AI rewrite.
  source: text("source").notNull().default("edited"),
  createdAt: text("created_at").notNull(),
});

