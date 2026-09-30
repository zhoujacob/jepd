import "server-only";

export function getSiteOrigin() {
  try {
    const url = new URL(process.env.SITE_URL ?? "");
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}
