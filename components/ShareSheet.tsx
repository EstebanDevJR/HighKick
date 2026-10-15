"use client";

import Sheet, { SheetAction } from "@/components/Sheet";
import { useI18n } from "@/components/I18nProvider";
import {
  ChatIcon,
  CodeIcon,
  ExternalIcon,
  KickBoltIcon,
  LinkIcon,
  SendIcon,
  ShareIcon,
  XLogoIcon,
} from "@/components/icons";
import { clipPath, kickClipUrl, type Clip } from "@/lib/kick/types";
import { toast } from "@/lib/toast";

export function shareUrls(clip: Clip) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const highkick = `${origin}${clipPath(clip)}`;
  const embed = `<iframe src="${origin}/embed/${clip.channel.slug}?clip=${encodeURIComponent(
    clip.id,
  )}" width="360" height="640" style="border:0;border-radius:12px" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen title="${clip.channel.username} clips on HighKick"></iframe>`;
  return { highkick, kick: kickClipUrl(clip), embed };
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function ShareSheet({
  clip,
  open,
  onClose,
}: {
  clip: Clip;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  if (!open) return null;

  const urls = shareUrls(clip);
  const text = t("share.text", { title: clip.title || clip.channel.username, name: clip.channel.username });
  const encodedUrl = encodeURIComponent(urls.highkick);
  const encodedText = encodeURIComponent(text);
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function copyAndClose(value: string, message: string) {
    if (await copy(value)) toast(message);
    onClose();
  }

  return (
    <Sheet open={open} title={t("share.title")} onClose={onClose} closeLabel={t("share.close")}>
      <div className="grid grid-cols-4 gap-2 pb-3">
        <ShareTarget
          label="X"
          href={`https://x.com/intent/post?text=${encodedText}&url=${encodedUrl}`}
          icon={<XLogoIcon width={20} height={20} />}
        />
        <ShareTarget
          label="WhatsApp"
          href={`https://wa.me/?text=${encodeURIComponent(`${text} ${urls.highkick}`)}`}
          icon={<ChatIcon width={20} height={20} />}
        />
        <ShareTarget
          label="Telegram"
          href={`https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`}
          icon={<SendIcon width={20} height={20} />}
        />
        <ShareTarget
          label="Reddit"
          href={`https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedText}`}
          icon={<ExternalIcon width={20} height={20} />}
        />
      </div>
      <div className="flex flex-col border-t border-white/5 pt-2">
        <SheetAction
          icon={<LinkIcon width={18} height={18} />}
          label={t("share.copyLink")}
          onClick={() => void copyAndClose(urls.highkick, t("share.copied"))}
        />
        <SheetAction
          tone="kick"
          icon={<KickBoltIcon width={18} height={18} />}
          label={t("share.copyKick")}
          onClick={() => void copyAndClose(urls.kick, t("share.copied"))}
        />
        <SheetAction
          icon={<CodeIcon width={18} height={18} />}
          label={t("share.copyEmbed")}
          onClick={() => void copyAndClose(urls.embed, t("share.embedCopied"))}
        />
        {canNativeShare && (
          <SheetAction
            icon={<ShareIcon width={18} height={18} />}
            label={t("share.native")}
            onClick={() => {
              navigator.share({ title: clip.title, text, url: urls.highkick }).catch(() => {});
              onClose();
            }}
          />
        )}
      </div>
    </Sheet>
  );
}

function ShareTarget({ label, href, icon }: { label: string; href: string; icon: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col items-center gap-1.5 rounded-xl py-2 text-fog/80 transition-colors hover:bg-white/5 hover:text-fog"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-ink/60 ring-1 ring-white/10">
        {icon}
      </span>
      <span className="font-mono text-[10px] uppercase tracking-wide">{label}</span>
    </a>
  );
}
