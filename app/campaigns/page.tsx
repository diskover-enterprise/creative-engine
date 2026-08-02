import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Campaign } from "@/types";

type CampaignListItem = Campaign & {
  campaign_images: { url: string; position: number }[];
};

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const supabase = getSupabaseServerClient();
  const { data } = await supabase
    .from("campaigns")
    .select("*, campaign_images(url, position)")
    .order("created_at", { ascending: false });

  const campaigns = (data ?? []) as CampaignListItem[];

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Campaigns</h1>
        <Link
          href="/campaigns/new"
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background"
        >
          + Create Campaign
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <p className="mt-6 text-foreground/60">No campaigns yet.</p>
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {campaigns.map((campaign) => {
            const [image] = [...campaign.campaign_images].sort(
              (a, b) => a.position - b.position
            );
            return (
              <li
                key={campaign.id}
                className="rounded-lg border border-black/10 p-4 dark:border-white/10"
              >
                <Link href={`/campaigns/${campaign.id}`} className="block">
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={image.url}
                      alt=""
                      className="mb-3 h-32 w-full rounded object-cover"
                    />
                  ) : campaign.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={campaign.logo_url}
                      alt=""
                      className="mb-3 h-10 w-10 rounded object-cover"
                    />
                  ) : null}
                  <span className="font-medium hover:underline">{campaign.name}</span>
                </Link>
                {campaign.description ? (
                  <p className="mt-2 line-clamp-2 text-sm text-foreground/60">
                    {campaign.description}
                  </p>
                ) : null}
                {campaign.auto_generate ? (
                  <span className="mt-2 inline-block rounded bg-foreground/10 px-1.5 py-0.5 text-xs text-foreground/60">
                    Auto-generate
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
