import { createHash, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { resolve, relative, isAbsolute, join } from "node:path";
import {
  mkdirSync,
  realpathSync,
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
export const id = () => randomUUID();
export const now = () => new Date().toISOString();
export const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
export function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export const digest = (value: unknown) => hash(stable(value));
export function dataRoot() {
  const root = resolve(
    process.env.HUB_DATA_DIR || join(homedir(), ".ai-delivery-hub"),
  );
  mkdirSync(root, { recursive: true, mode: 0o700 });
  if (lstatSync(root).isSymbolicLink())
    throw new Error("Data root must not be a symlink");
  return realpathSync(root);
}
export function inside(root: string, path: string) {
  const rel = relative(resolve(root), resolve(path));
  return (
    rel === "" ||
    (!rel.startsWith(".." + "/") && rel !== ".." && !isAbsolute(rel))
  );
}
export function safePath(root: string, path: string, mustExist = true) {
  if (
    isAbsolute(path) ||
    path.includes("\0") ||
    path.includes("\\") ||
    path.split("/").includes("..")
  )
    throw new Error("Unsafe path");
  const full = resolve(root, path);
  if (!inside(root, full)) throw new Error("Path escape");
  let current = resolve(root);
  if (existsSync(current) && lstatSync(current).isSymbolicLink())
    throw new Error("Symlink root");
  for (const part of relative(root, full).split("/").filter(Boolean)) {
    current = join(current, part);
    if (existsSync(current) && lstatSync(current).isSymbolicLink())
      throw new Error("Symlink escape");
  }
  if (
    mustExist &&
    (!existsSync(full) || !inside(realpathSync(root), realpathSync(full)))
  )
    throw new Error("Missing or escaping path");
  return full;
}
export const forbidden = (path: string) =>
  path
    .split("/")
    .some((part) =>
      /^(?:\.env(?:\..*)?|\.git|\.codex|\.claude|\.agents|node_modules|\.next|dist|build|coverage|artifacts|storage-state.*|auth\.json|.*\.(?:pem|key|p12))$/i.test(
        part,
      ),
    );
export function fileMap(root: string): Record<string, string> {
  const result: Record<string, string> = {};
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name),
        rel = relative(root, full);
      if (forbidden(rel)) continue;
      if (entry.isSymbolicLink())
        throw new Error(`Symlink is not supported: ${rel}`);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        if (statSync(full).size > 10 * 1024 * 1024)
          throw new Error(`Source file too large: ${rel}`);
        result[rel] = hash(readFileSync(full));
      }
    }
  }
  walk(root);
  return result;
}
export function redact(text: string) {
  for (const [key, value] of Object.entries(process.env))
    if (
      /TOKEN|SECRET|PASSWORD|API_KEY|^HUB_QA_/.test(key) &&
      value &&
      value.length > 7
    )
      text = text.split(value).join("[REDACTED]");
  return text
    .replace(/(?:Bearer\s+)[\w.-]+/gi, "Bearer [REDACTED]")
    .replace(/(?:sk-|lin_api_|gh[pousr]_)[A-Za-z0-9_-]{8,}/g, "[REDACTED]")
    .replace(
      /((?:password|secret|token|api[_-]?key)\s*[=:]\s*["']?)[^\s,"'}]+/gi,
      "$1[REDACTED]",
    )
    .slice(0, 32000);
}
export function sensitiveContent(buffer: Buffer | string) {
  const value = buffer.toString();
  if (
    /(?:sk-|lin_api_|gh[pousr]_)[A-Za-z0-9_-]{8,}|Bearer\s+[\w.-]{8,}|(?:password|secret|api[_-]?key)\s*[=:]\s*["']?[^\s,"'}]{5,}/i.test(
      value,
    )
  )
    return true;
  return Object.entries(process.env).some(
    ([key, secret]) =>
      /TOKEN|SECRET|PASSWORD|API_KEY|^HUB_QA_/.test(key) &&
      secret &&
      secret.length > 7 &&
      value.includes(secret),
  );
}
export function childEnv(
  extra: Record<string, string> = {},
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: "test",
    PATH: process.env.PATH || "/usr/bin:/bin",
    HOME: homedir(),
    LANG: "en_US.UTF-8",
    TMPDIR: process.env.TMPDIR || "/tmp",
    CI: "1",
    NO_COLOR: "1",
  };
  return { ...env, ...extra };
}
export function escapeHtml(value: unknown) {
  return String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
