import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  data: text("data", { mode: "json" }).notNull(),
  createdAt: text("created_at").notNull(),
});
export const events = sqliteTable("events", {
  seq: integer("seq").primaryKey({ autoIncrement: true }),
  runId: text("run_id"),
  type: text("type").notNull(),
  message: text("message").notNull(),
  createdAt: text("created_at").notNull(),
});
export const commands = sqliteTable("commands", {
  id: text("id").primaryKey(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  type: text("type").notNull(),
  runId: text("run_id"),
  data: text("data").notNull(),
  state: text("state").notNull(),
  createdAt: text("created_at").notNull(),
});
