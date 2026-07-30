import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { deleteConcept } from "../actions";
import DeleteButton from "@/components/DeleteButton";
import CopyPromptButton from "@/components/CopyPromptButton";
import GenerateImageButton from "@/components/GenerateImageButton";
import type { Concept, Creative } from "@/types";

export const dynamic = "force-dynamic";

type ConceptWithCampaign = Concept & { campaigns: { id: string; name: string } | null };

export default async function ConceptDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();

  const [{ data: conceptData }, { data: creativesData }, { data: activeFalJob }] =
    await Promise.all([
      supabase
        .from("concepts")
        .select("*, campaigns(id, name)")
        .eq("id", id)
        .single(),
      supabase
        .from("creatives")
        .select("id, label, type, status, source")
        .eq("concept_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("generation_jobs")
        .select("id")
        .eq("concept_id", id)
        .eq("provider", "fal-ai")
        .eq("status", "processing")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  if (!conceptData) {
    notFound();
  }

  const concept = conceptData as ConceptWithCampaign;
  const creatives = (creativesData ?? []) as Pick<
    Creative,
    "id" | "label" | "type" | "status" | "source"
  >[];
  const boundDelete = deleteConcept.bind(null, concept.id);

  return (
    <div className="max-w-2xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          {concept.campaigns ? (
            <Link
              href={`/campaigns/${concept.campaigns.id}`}
              className="text-sm text-foreground/60 hover:underline"
            >
              {concept.campaigns.name}
            </Link>
          ) : null}
          <h1 className="text-2xl font-semibold">{concept.name}</h1>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/concepts/${concept.id}/edit`}
            className="rounded-md border border-black/15 px-4 py-2 text-sm font-medium dark:border-white/15"
          >
            Edit
          </Link>
          <DeleteButton
            action={boundDelete}
            confirmText={`Delete "${concept.name}"? This also deletes its ${creatives.length} creative(s). This cannot be undone.`}
          />
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Detail label="Messaging Angle" value={concept.messaging_angle} />
        <Detail label="Target Emotion" value={concept.target_emotion} />
        <Detail label="Visual Style Override" value={concept.visual_style_override} />
        <Detail label="Tone Override" value={concept.tone_override} />
        <Detail label="Setting / Scene" value={concept.setting_scene} />
        <Detail label="Key Message" value={concept.key_message} />
        <Detail label="Call To Action" value={concept.call_to_action} />
        <Detail
          label="Format"
          value={concept.format === "video" ? "Video" : "Static Image"}
        />
        <Detail label="Aspect Ratio" value={concept.aspect_ratio} />
      </dl>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Generated Prompt</h2>
          {concept.generated_prompt ? (
            <CopyPromptButton text={concept.generated_prompt} />
          ) : null}
        </div>
        <p className="mt-2 rounded-md border border-black/10 bg-black/[.02] p-3 text-sm dark:border-white/10 dark:bg-white/[.03]">
          {concept.generated_prompt || (
            <span className="text-foreground/40">Not generated.</span>
          )}
        </p>
      </section>

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Creatives</h2>
          <Link
            href={`/concepts/${concept.id}/creatives/new`}
            className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background"
          >
            + New Creative
          </Link>
        </div>

        <div className="mt-3">
          <GenerateImageButton conceptId={concept.id} initialJobId={activeFalJob?.id} />
        </div>

        {creatives.length === 0 ? (
          <p className="mt-4 text-sm text-foreground/60">No creatives yet.</p>
        ) : (
          <ul className="mt-4 space-y-1">
            {creatives.map((creative) => (
              <li key={creative.id} className="text-sm">
                <Link href={`/creatives/${creative.id}`} className="hover:underline">
                  {creative.label || `${creative.type === "video" ? "Video" : "Image"} creative`}
                </Link>
                <span className="text-foreground/50"> — {creative.status}</span>
                {creative.source === "ai_generated" ? (
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
