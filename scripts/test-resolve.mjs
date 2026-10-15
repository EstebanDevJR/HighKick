// Resolve hook for `node --test`: maps the "@/..." path alias from
// tsconfig.json and lets extensionless imports find their .ts files, so the
// unit tests run against the real sources with no build step or test
// framework dependency.
const ROOT = new URL("../", import.meta.url);
const EXTENSIONS = [".ts", ".tsx", "/index.ts"];

export async function resolve(specifier, context, nextResolve) {
  const target = specifier.startsWith("@/") ? new URL(specifier.slice(2), ROOT).href : specifier;
  try {
    return await nextResolve(target, context);
  } catch (err) {
    const relative = target.startsWith(".") || target.startsWith("file:");
    if (!relative || !["ERR_MODULE_NOT_FOUND", "ERR_UNSUPPORTED_DIR_IMPORT"].includes(err?.code)) {
      throw err;
    }
    for (const ext of EXTENSIONS) {
      try {
        return await nextResolve(target + ext, context);
      } catch {
        // try the next candidate
      }
    }
    throw err;
  }
}
