import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { deleteCreative } from "../actions";
import DeleteButton from "@/components/DeleteButton";
import GenerateVideoButton from "@/components/GenerateVideoButton";
import type { Creative } from "@/types";

export const dynamic = "force-dynamic";

type CreativeWithConcept = Creative & {
  concepts: { id: string; name: string; format: string } | null;
};

const STATUS_LABELS: Record<Creative["status"], string> = {
  draft: "Draft",
  approved: "Approved",
  rejected: "Rejected",
};

export default async function CreativeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();

  const { data } = await supabase
    .from("creatives")
    .select("*, concepts(id, name, format)")
    .eq("id", id)
    .single();

  if (!data) {
    notFound();
  }

  const creative = data as CreativeWithConcept;
  const boundDelete = deleteCreative.bind(null, creative.id);

  let sourceCreative: { id: string; label: string | null } | null = null;
  if (creative.source_creative_id) {
    const { data: source } = await supabase
      .from("creatives")
      .select("id, label")
      .eq("id", creative.source_creative_id)
      .single();
    sourceCreative = source;
  }

  const { data: activeVideoJob } = await supabase
    .from("generation_jobs")
    .select("id")
    .eq("source_creative_id", creative.id)
    .eq("provider", "higgsfield")
    .eq("status", "processing")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <div className="max-w-2xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          {creative.concepts ? (
            <Link
              href={`/concepts/${creative.concepts.id}`}
              className="text-sm text-foreground/60 hover:underline"
            >
              {creative.concepts.name}
            </Link>
          ) : null}
          <h1 className="text-2xl font-semibold">
            {creative.label || (creative.type === "video" ? "Video creative" : "Image creative")}
          </h1>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/creatives/${creative.id}/edit`}
            className="rounded-md border border-black/15 px-4 py-2 text-sm font-medium dark:border-white/15"
          >
            Edit
          </Link>
          <DeleteButton
            action={boundDelete}
            confirmText={`Delete this creative? This cannot be undone.`}
          />
        </div>
      </div>

      {creative.asset_url ? (
        <div className="mt-4">
          {creative.type === "video" ? (
            <video src={creative.asset_url} controls className="max-h-96 rounded-lg" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={creative.asset_url}
              alt=""
              className="max-h-96 rounded-lg object-cover"
            />
          )}
        </div>
      ) : (
        <p className="mt-4 text-sm text-foreground/60">No asset uploaded yet.</p>
      )}

      {creative.type === "image" && creative.asset_url && creative.concepts ? (
        <div className="mt-4">
          {creative.concepts.format === "video" ? (
            <GenerateVideoButton
              creativeId={creative.id}
              conceptId={creative.concepts.id}
              initialJobId={activeVideoJob?.id}
            />
          ) : (
            <p className="text-sm text-foreground/40">
              Set this concept&rsquo;s format to Video to generate a video from this image.
            </p>
          )}
        </div>
      ) : null}

      <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Detail label="Type" value={creative.type === "video" ? "Video" : "Image"} />
        <Detail label="Status" value={STATUS_LABELS[creative.status]} />
        <Detail
          label="Source"
          value={creative.source === "ai_generated" ? "AI Generated" : "Manual Upload"}
        />
        {creative.provider ? <Detail label="Provider" value={creative.provider} /> : null}
        {sourceCreative ? (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-foreground/40">
              Source Image
            </dt>
            <dd className="mt-1 text-sm">
              <Link href={`/creatives/${sourceCreative.id}`} className="underline">
                {sourceCreative.label || "Image creative"}
              </Link>
            </dd>
          </div>
        ) : null}
        <div className="sm:col-span-2">
          <Detail label="Notes" value={creative.notes} />
        </div>
        {creative.generation_prompt ? (
          <div className="sm:col-span-2">
            <Detail label="Generation Prompt" value={creative.generation_prompt} />
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
