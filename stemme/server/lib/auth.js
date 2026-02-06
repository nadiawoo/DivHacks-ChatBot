import { sanitizeUserId } from "../db.js";

export const SESSION_IDLE_TIMEOUT_MS = Number(
  process.env.SESSION_IDLE_TIMEOUT_MS || 5 * 60 * 1000
);

export const clientIpFromRequest = (req) => {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "";
};

export const userIdFromRequest = (req) => {
  const rawIp = clientIpFromRequest(req).toLowerCase();
  const normalized = rawIp
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const baseId = normalized ? `ip-${normalized}` : "ip-unknown";
  return sanitizeUserId(baseId);
};
