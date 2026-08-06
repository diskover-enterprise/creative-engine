import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { deleteAdSet } from "../actions";
import DeleteButton from "@/components/DeleteButton";
import CopyPromptButton from "@/components/CopyPromptButton";
import GenerateImageButton from "@/components/GenerateImageButton";
import ClipScriptPanel from "@/components/ClipScriptPanel";
import type { AdSet, Ad, AdClip } from "@/types";

export const dynamic = "force-dynamic";

type AdSetWithCampaign = AdSet & { campaigns: { id: string; name: string } | null };
type AdListItem = Pick<Ad, "id" | "label" | "type" | "status" | "source" | "headline" | "caption">;

export default async function AdSetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();

  const [{ data: adSetData }, { data: adsData }, { data: activeFalJob }, { data: clipsData }] =
    await Promise.all([
      supabase
        .from("ad_sets")
        .select("*, campaigns(id, name)")
        .eq("id", id)
        .single(),
      supabase
        .from("ads")
        .select("id, label, type, status, source, headline, caption")
        .eq("ad_set_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("generation_jobs")
        .select("id")
        .eq("ad_set_id", id)
        .eq("provider", "fal-ai")
        .eq("status", "processing")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("ad_clips")
        .select("*")
        .eq("ad_set_id", id)
        .order("clip_number", { ascending: true }),
    ]);

  if (!adSetData) {
    notFound();
  }

  const adSet = adSetData as AdSetWithCampaign;
  const ads = (adsData ?? []) as AdListItem[];
  const clips = (clipsData ?? []) as AdClip[];
  const boundDelete = deleteAdSet.bind(null, adSet.id);

  // Ad rows are only ever inserted once their asset finishes uploading (see
  // lib/generationPoll.ts), so merely existing means the reference image is done.
  const referenceImageReady = ads.some((ad) => ad.label === "Reference Image");

  // Clip job statuses for the panel's own polling -- fetched separately so we
  // don't have to widen the ads/generation_jobs queries above.
  const { data: clipJobs } = clips.length
    ? await supabase
        .from("generation_jobs")
        .select("id, clip_id, status")
        .in(
          "clip_id",
          clips.map((clip) => clip.id)
        )
        .eq("status", "processing")
    : { data: [] };

  return (
    <div className="max-w-2xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          {adSet.campaigns ? (
            <Link
              href={`/campaigns/${adSet.campaigns.id}`}
              className="text-sm text-foreground/60 hover:underline"
            >
              {adSet.campaigns.name}
            </Link>
          ) : null}
          <h1 className="text-2xl font-semibold">{adSet.name}</h1>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/ad-sets/${adSet.id}/edit`}
            className="rounded-md border border-black/15 px-4 py-2 text-sm font-medium dark:border-white/15"
          >
            Edit
          </Link>
          <DeleteButton
            action={boundDelete}
            confirmText={`Delete "${adSet.name}"? This also deletes its ${ads.length} ad(s). This cannot be undone.`}
          />
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Detail label="Messaging Angle" value={adSet.messaging_angle} />
        <Detail label="Target Emotion" value={adSet.target_emotion} />
        <Detail label="Visual Style Override" value={adSet.visual_style_override} />
        <Detail label="Tone Override" value={adSet.tone_override} />
        <Detail label="Setting / Scene" value={adSet.setting_scene} />
        <Detail label="Key Message" value={adSet.key_message} />
        <Detail label="Call To Action" value={adSet.call_to_action} />
        <Detail label="Format" value={adSet.format === "video" ? "Video" : "Static Image"} />
        <Detail label="Aspect Ratio" value={adSet.aspect_ratio} />
      </dl>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Generated Prompt</h2>
          {adSet.generated_prompt ? <CopyPromptButton text={adSet.generated_prompt} /> : null}
        </div>
        <p className="mt-2 rounded-md border border-black/10 bg-black/[.02] p-3 text-sm dark:border-white/10 dark:bg-white/[.03]">
          {adSet.generated_prompt || (
            <span className="text-foreground/40">Not generated.</span>
          )}
        </p>
      </section>

      {adSet.format === "video" ? (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">UGC Video Script</h2>
          <ClipScriptPanel
            adSetId={adSet.id}
            clips={clips}
            referenceImageReady={referenceImageReady}
            referenceJobId={referenceImageReady ? undefined : activeFalJob?.id}
            activeClipJobIds={(clipJobs ?? []).map((job) => job.id)}
            hasFinalVideo={ads.some((ad) => ad.label === "Final Video Ad")}
          />
        </section>
      ) : null}

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Ads</h2>
          <Link
            href={`/ad-sets/${adSet.id}/ads/new`}
            className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background"
          >
            + New Ad
          </Link>
        </div>

        {adSet.format === "static_image" ? (
          <div className="mt-3">
            <GenerateImageButton adSetId={adSet.id} initialJobId={activeFalJob?.id} />
          </div>
        ) : null}

        {ads.length === 0 ? (
          <p className="mt-4 text-sm text-foreground/60">No ads yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {ads.map((ad) => (
              <li key={ad.id} className="text-sm">
                <Link href={`/ads/${ad.id}`} className="hover:underline">
                  {ad.label || `${ad.type === "video" ? "Video" : "Image"} ad`}
                </Link>
                <span className="text-foreground/50"> — {ad.status}</span>
                {ad.source === "ai_generated" ? (
                  <span className="ml-1 rounded bg-foreground/10 px-1.5 py-0.5 text-xs text-foreground/60">
                    AI
                  </span>
                ) : null}
                {ad.headline ? (
                  <p className="mt-0.5 font-medium">{ad.headline}</p>
                ) : null}
                {ad.caption ? (
                  <p className="text-foreground/60">{ad.caption}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
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
