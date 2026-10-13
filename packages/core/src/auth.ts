import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
export function localRequest(request: Request) {
  const host = request.headers.get("host");
  const port = process.env.HUB_PORT || "3000";
  if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`)
    throw new Error("Forbidden Host");
  const origin = request.headers.get("origin");
  if (origin && origin !== `http://${host}`)
    throw new Error("Forbidden Origin");
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new Error("Cross-site request denied");
}
export function secret(root: string) {
  const path = join(root, "session-secret");
  try {
    return readFileSync(path, "utf8");
  } catch {
    const value = randomBytes(32).toString("hex");
    try {
      writeFileSync(path, value, { flag: "wx", mode: 0o600 });
      return value;
    } catch {
      return readFileSync(path, "utf8");
    }
  }
}
function equal(a: string, b: string) {
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function session(root: string) {
  const cookie = createHmac("sha256", secret(root))
    .update("local-session")
    .digest("hex");
  const csrf = createHmac("sha256", secret(root)).update(cookie).digest("hex");
  return { cookie, csrf };
}
export function authenticate(request: Request, root: string) {
  localRequest(request);
  const cookie =
    request.headers
      .get("cookie")
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("hub_session="))
      ?.slice(12) || "";
  const expected = session(root);
  if (!equal(cookie, expected.cookie)) throw new Error("Session required");
  if (!["GET", "HEAD"].includes(request.method)) {
    if (!request.headers.get("origin")) throw new Error("Origin required");
    if (!equal(request.headers.get("x-hub-csrf") || "", expected.csrf))
      throw new Error("CSRF rejected");
  }
}
