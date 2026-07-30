import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { deleteCampaign } from "../actions";
import DeleteButton from "@/components/DeleteButton";
import SuggestConceptsButton from "@/components/SuggestConceptsButton";
import type { Campaign, Concept } from "@/types";

export const dynamic = "force-dynamic";

type CampaignWithProduct = Campaign & { products: { id: string; name: string } | null };

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

  const [{ data: campaignData }, { data: conceptsData }] = await Promise.all([
    supabase
      .from("campaigns")
      .select("*, products(id, name)")
      .eq("id", id)
      .single(),
    supabase
      .from("concepts")
      .select("id, name, format")
      .eq("campaign_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (!campaignData) {
    notFound();
  }

  const campaign = campaignData as CampaignWithProduct;
  const concepts = (conceptsData ?? []) as Pick<Concept, "id" | "name" | "format">[];
  const boundDelete = deleteCampaign.bind(null, campaign.id);

  return (
    <div className="max-w-2xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          {campaign.products ? (
            <Link
              href={`/products/${campaign.products.id}`}
              className="text-sm text-foreground/60 hover:underline"
            >
              {campaign.products.name}
            </Link>
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
            confirmText={`Delete "${campaign.name}"? This also deletes its ${concepts.length} concept(s) and their creatives. This cannot be undone.`}
          />
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Detail label="Status" value={STATUS_LABELS[campaign.status]} />
        <Detail label="Objective" value={campaign.objective} />
        <Detail label="Start Date" value={campaign.start_date} />
        <Detail label="End Date" value={campaign.end_date} />
        <div className="sm:col-span-2">
          <Detail label="Notes" value={campaign.notes} />
        </div>
      </dl>

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Concepts</h2>
          <Link
            href={`/campaigns/${campaign.id}/concepts/new`}
            className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background"
          >
            + New Concept
          </Link>
        </div>

        <div className="mt-3">
          <SuggestConceptsButton campaignId={campaign.id} />
        </div>

        {concepts.length === 0 ? (
          <p className="mt-2 text-sm text-foreground/60">No concepts yet.</p>
        ) : (
          <ul className="mt-3 space-y-1">
            {concepts.map((concept) => (
              <li key={concept.id} className="text-sm">
                <Link href={`/concepts/${concept.id}`} className="hover:underline">
                  {concept.name}
                </Link>
                <span className="text-foreground/50">
                  {" "}
                  — {concept.format === "video" ? "Video" : "Static Image"}
                </span>
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
