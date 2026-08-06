import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { deleteAd } from "../actions";
import DeleteButton from "@/components/DeleteButton";
import GenerateVideoButton from "@/components/GenerateVideoButton";
import type { Ad } from "@/types";

export const dynamic = "force-dynamic";

type AdWithAdSet = Ad & {
  ad_sets: { id: string; name: string; format: string } | null;
};

const STATUS_LABELS: Record<Ad["status"], string> = {
  draft: "Draft",
  approved: "Approved",
  rejected: "Rejected",
};

export default async function AdDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();

  const { data } = await supabase
    .from("ads")
    .select("*, ad_sets(id, name, format)")
    .eq("id", id)
    .single();

  if (!data) {
    notFound();
  }

  const ad = data as AdWithAdSet;
  const boundDelete = deleteAd.bind(null, ad.id);

  let sourceAd: { id: string; label: string | null } | null = null;
  if (ad.source_ad_id) {
    const { data: source } = await supabase
      .from("ads")
      .select("id, label")
      .eq("id", ad.source_ad_id)
      .single();
    sourceAd = source;
  }

  const { data: activeVideoJob } = await supabase
    .from("generation_jobs")
    .select("id")
    .eq("source_ad_id", ad.id)
    .eq("provider", "higgsfield")
    .eq("status", "processing")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <div className="max-w-2xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          {ad.ad_sets ? (
            <Link
              href={`/ad-sets/${ad.ad_sets.id}`}
              className="text-sm text-foreground/60 hover:underline"
            >
              {ad.ad_sets.name}
            </Link>
          ) : null}
          <h1 className="text-2xl font-semibold">
            {ad.label || (ad.type === "video" ? "Video ad" : "Image ad")}
          </h1>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/ads/${ad.id}/edit`}
            className="rounded-md border border-black/15 px-4 py-2 text-sm font-medium dark:border-white/15"
          >
            Edit
          </Link>
          <DeleteButton
            action={boundDelete}
            confirmText={`Delete this ad? This cannot be undone.`}
          />
        </div>
      </div>

      {ad.asset_url ? (
        <div className="mt-4">
          {ad.type === "video" ? (
            <video src={ad.asset_url} controls className="max-h-96 rounded-lg" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ad.asset_url} alt="" className="max-h-96 rounded-lg object-cover" />
          )}
        </div>
      ) : (
        <p className="mt-4 text-sm text-foreground/60">No asset uploaded yet.</p>
      )}

      {ad.headline || ad.caption ? (
        <div className="mt-4">
          {ad.headline ? <p className="text-lg font-semibold">{ad.headline}</p> : null}
          {ad.caption ? <p className="mt-1 text-foreground/70">{ad.caption}</p> : null}
        </div>
      ) : null}

      {ad.type === "image" && ad.asset_url && ad.ad_sets ? (
        <div className="mt-4">
          {ad.ad_sets.format === "video" ? (
            <GenerateVideoButton
              adId={ad.id}
              adSetId={ad.ad_sets.id}
              initialJobId={activeVideoJob?.id}
            />
          ) : (
            <p className="text-sm text-foreground/40">
              Set this ad set&rsquo;s format to Video to generate a video from this image.
            </p>
          )}
        </div>
      ) : null}

      <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Detail label="Type" value={ad.type === "video" ? "Video" : "Image"} />
        <Detail label="Status" value={STATUS_LABELS[ad.status]} />
        <Detail
          label="Source"
          value={ad.source === "ai_generated" ? "AI Generated" : "Manual Upload"}
        />
        {ad.provider ? <Detail label="Provider" value={ad.provider} /> : null}
        {sourceAd ? (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-foreground/40">
              Source Image
            </dt>
            <dd className="mt-1 text-sm">
              <Link href={`/ads/${sourceAd.id}`} className="underline">
                {sourceAd.label || "Image ad"}
              </Link>
            </dd>
          </div>
        ) : null}
        <div className="sm:col-span-2">
          <Detail label="Notes" value={ad.notes} />
        </div>
        {ad.generation_prompt ? (
          <div className="sm:col-span-2">
            <Detail label="Generation Prompt" value={ad.generation_prompt} />
          </div>
        ) : null}
      </dl>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-foreground/40">
        {label}
      </dt>
      <dd className="mt-1 text-sm">
        {value || <span className="text-foreground/40">—</span>}
      </dd>
    </div>
  );
}
