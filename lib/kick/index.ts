// Server-only entry point for Kick data. Client components must import from
// "@/lib/kick/types" instead: this module pulls in the native impit client.
export * from "@/lib/kick/types";
export {
  getChannel,
  getClip,
  getClips,
  getTopCategories,
  searchKickDirectory,
  type ClipScope,
  type GetClipsOptions,
} from "@/lib/kick/api";
export { getUpstreamStats, UpstreamError } from "@/lib/kick/http";
