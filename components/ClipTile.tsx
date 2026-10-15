import Link from "next/link";
import { formatCount, formatDuration } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import type { Clip } from "@/lib/kick/types";
import { EyeIcon } from "@/components/icons";

// Presentational thumbnail used by Explore (server) and Library (client),
// so it stays hook-free.
export default function ClipTile({
  clip,
  locale,
  href,
  onClick,
}: {
  clip: Clip;
  locale: Locale;
  href?: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className="relative block aspect-video overflow-hidden rounded-lg bg-smoke ring-1 ring-white/10">
        {clip.thumbnailUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={clip.thumbnailUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        )}
        <span className="absolute bottom-1 right-1 rounded bg-ink/80 px-1 font-mono text-[10px] text-fog/90">
          {formatDuration(clip.duration)}
        </span>
        {clip.mature && (
          <span className="absolute left-1 top-1 rounded bg-red-600/90 px-1 font-mono text-[10px] font-bold text-white">
            18+
          </span>
        )}
      </span>
      <span className="mt-1.5 line-clamp-2 text-left text-xs font-medium leading-snug text-fog/90">
        {clip.title || clip.channel.username}
      </span>
      <span className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] text-fog/45">
        <span className="truncate">@{clip.channel.username}</span>
        <span aria-hidden>·</span>
        <EyeIcon width={10} height={10} className="shrink-0" />
        {formatCount(clip.views, locale)}
      </span>
    </>
  );

  const className = "group flex min-w-0 flex-col";
  if (onClick) {
    return (
      <button onClick={onClick} className={className}>
        {body}
      </button>
    );
  }
  return (
    <Link href={href ?? "#"} className={className}>
      {body}
    </Link>
  );
}
