import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { deleteAdSet } from "../actions";
import DeleteButton from "@/components/DeleteButton";
import CopyPromptButton from "@/components/CopyPromptButton";
import GenerateImageButton from "@/components/GenerateImageButton";
import type { AdSet, Ad } from "@/types";

export const dynamic = "force-dynamic";

type AdSetWithCampaign = AdSet & { campaigns: { id: string; name: string } | null };

export default async function AdSetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();

  const [{ data: adSetData }, { data: adsData }, { data: activeFalJob }] = await Promise.all([
    supabase
      .from("ad_sets")
      .select("*, campaigns(id, name)")
      .eq("id", id)
      .single(),
    supabase
      .from("ads")
      .select("id, label, type, status, source")
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
  ]);

  if (!adSetData) {
    notFound();
  }

  const adSet = adSetData as AdSetWithCampaign;
  const ads = (adsData ?? []) as Pick<Ad, "id" | "label" | "type" | "status" | "source">[];
  const boundDelete = deleteAdSet.bind(null, adSet.id);

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

        <div className="mt-3">
          <GenerateImageButton adSetId={adSet.id} initialJobId={activeFalJob?.id} />
        </div>

        {ads.length === 0 ? (
          <p className="mt-4 text-sm text-foreground/60">No ads yet.</p>
        ) : (
          <ul className="mt-4 space-y-1">
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
