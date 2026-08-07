export type CampaignStatus = "draft" | "active" | "paused" | "completed";

// A Campaign is the single top-level entity: brand identity (voice, visual
// style, logo), product details (audience, benefits, offer), and campaign
// scheduling all live on one record. Ad Sets attach directly to it.
export interface Campaign {
  id: string;
  name: string;
  description: string | null;
  brand_voice: string | null;
  visual_style: string | null;
  logo_url: string | null;
  landing_page_url: string | null;
  audience: string | null;
  benefits: string | null;
  offer: string | null;
  auto_generate: boolean;
  objective: string | null;
  status: CampaignStatus;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  product_image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignImage {
  id: string;
  campaign_id: string;
  url: string;
  position: number;
  created_at: string;
}

export type AdSetFormat = "static_image" | "video";

export interface AdSet {
  id: string;
  campaign_id: string;
  name: string;
  messaging_angle: string | null;
  target_emotion: string | null;
  visual_style_override: string | null;
  tone_override: string | null;
  setting_scene: string | null;
  key_message: string | null;
  call_to_action: string | null;
  format: AdSetFormat;
  aspect_ratio: string;
  generated_prompt: string | null;
  created_at: string;
  updated_at: string;
}

export type AdType = "image" | "video";
export type AdSource = "manual_upload" | "ai_generated";
export type AdStatus = "draft" | "approved" | "rejected";

export interface Ad {
  id: string;
  ad_set_id: string;
  label: string | null;
  type: AdType;
  source: AdSource;
  provider: string | null;
  generation_prompt: string | null;
  asset_url: string | null;
  status: AdStatus;
  notes: string | null;
  source_ad_id: string | null;
  headline: string | null;
  caption: string | null;
  created_at: string;
  updated_at: string;
}

export type AdClipStatus = "draft" | "processing" | "completed" | "failed";
export type AdClipRole = "ugc" | "broll";

// One scene of a video Ad Set's script. Written up front (via
// lib/anthropic.ts generateClipScript) so the script can be reviewed/edited
// before spending on Higgsfield generation for each clip. A 'ugc' clip
// animates from the Ad Set's shared model-consistency image; a 'broll' clip
// gets its own fresh scene image (preview_image_url) generated just for it.
export interface AdClip {
  id: string;
  ad_set_id: string;
  clip_number: number;
  script: string;
  role: AdClipRole;
  status: AdClipStatus;
  asset_url: string | null;
  preview_image_url: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export type GenerationJobStatus = "processing" | "completed" | "failed";
export type GenerationJobTrigger = "manual" | "automated";

export interface GenerationJob {
  id: string;
  ad_set_id: string;
  provider: string;
  external_request_id: string;
  status: GenerationJobStatus;
  prompt: string | null;
  error: string | null;
  ad_id: string | null;
  source_ad_id: string | null;
  clip_id: string | null;
  triggered_by: GenerationJobTrigger;
  created_at: string;
  updated_at: string;
}
