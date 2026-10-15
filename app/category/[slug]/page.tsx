import { notFound, redirect } from "next/navigation";
import { SLUG_RE } from "@/lib/kick/types";

// kick.com/category/{slug} → HighKick's category feed.
export default async function CategoryMirror({ params }: PageProps<"/category/[slug]">) {
  const { slug } = await params;
  const normalized = slug.toLowerCase();
  if (!SLUG_RE.test(normalized)) notFound();
  redirect(`/g/${normalized}`);
}
