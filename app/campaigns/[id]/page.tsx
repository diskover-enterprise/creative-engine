import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { deleteCampaign } from "../actions";
import DeleteButton from "@/components/DeleteButton";
import SuggestAdSetsButton from "@/components/SuggestAdSetsButton";
import RunAutomationButton from "@/components/RunAutomationButton";
import type { Campaign, AdSet } from "@/types";

type CampaignDetail = Campaign & {
  campaign_images: { id: string; url: string; position: number }[];
};

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<Campaign["status"], string> = {
  draft: "Draft",
  active: "Active",
  paused: "Paused",
  completed: "Completed",
};

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();

  const [{ data: campaignData }, { data: adSetsData }] = await Promise.all([
    supabase
      .from("campaigns")
      .select("*, campaign_images(id, url, position)")
      .eq("id", id)
      .single(),
    supabase
      .from("ad_sets")
      .select("id, name, format")
      .eq("campaign_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (!campaignData) {
    notFound();
  }

  const campaign = campaignData as CampaignDetail;
  const images = [...campaign.campaign_images].sort((a, b) => a.position - b.position);
  const adSets = (adSetsData ?? []) as Pick<AdSet, "id" | "name" | "format">[];
  const boundDelete = deleteCampaign.bind(null, campaign.id);

  return (
    <div className="max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          {campaign.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={campaign.logo_url} alt="" className="h-14 w-14 rounded object-cover" />
          ) : null}
          <h1 className="text-2xl font-semibold">{campaign.name}</h1>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/campaigns/${campaign.id}/edit`}
            className="rounded-md border border-black/15 px-4 py-2 text-sm font-medium dark:border-white/15"
          >
            Edit
          </Link>
          <DeleteButton
            action={boundDelete}
            confirmText={`Delete "${campaign.name}"? This also deletes its ${adSets.length} ad set(s) and their ads. This cannot be undone.`}
          />
        </div>
      </div>

      {campaign.product_image_url ? (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-foreground/40">
            Product Image
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={campaign.product_image_url}
            alt=""
            className="mt-1 h-32 w-32 rounded-lg object-cover"
          />
        </div>
      ) : null}

      {images.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((image) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={image.id}
              src={image.url}
              alt=""
              className="aspect-square rounded-lg object-cover"
            />
          ))}
        </div>
      )}

      <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Detail label="Description" value={campaign.description} />
        <Detail label="Brand Voice" value={campaign.brand_voice} />
        <Detail label="Visual Style" value={campaign.visual_style} />
        <Detail
          label="Landing Page"
          value={
            campaign.landing_page_url ? (
              <a
                href={campaign.landing_page_url}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                {campaign.landing_page_url}
              </a>
            ) : null
          }
        />
        <Detail label="Target Audience" value={campaign.audience} />
        <Detail label="Benefits" value={campaign.benefits} />
        <Detail label="Offer" value={campaign.offer} />
        <Detail label="Status" value={STATUS_LABELS[campaign.status]} />
        <Detail label="Objective" value={campaign.objective} />
        <Detail label="Start Date" value={campaign.start_date} />
        <Detail label="End Date" value={campaign.end_date} />
        <div className="sm:col-span-2">
          <Detail label="Notes" value={campaign.notes} />
        </div>
      </dl>

      {campaign.auto_generate ? (
        <div className="mt-6">
          <RunAutomationButton campaignId={campaign.id} />
        </div>
      ) : null}

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Ad Sets</h2>
          <Link
            href={`/campaigns/${campaign.id}/ad-sets/new`}
            className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background"
          >
            + New Ad Set
          </Link>
        </div>

        <div className="mt-3">
          <SuggestAdSetsButton campaignId={campaign.id} />
        </div>

        {adSets.length === 0 ? (
          <p className="mt-2 text-sm text-foreground/60">No ad sets yet.</p>
        ) : (
          <ul className="mt-3 space-y-1">
            {adSets.map((adSet) => (
              <li key={adSet.id} className="text-sm">
                <Link href={`/ad-sets/${adSet.id}`} className="hover:underline">
                  {adSet.name}
                </Link>
                <span className="text-foreground/50">
                  {" "}
                  — {adSet.format === "video" ? "Video" : "Static Image"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
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
