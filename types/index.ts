export interface Brand {
  id: string;
  name: string;
  description: string | null;
  brand_voice: string | null;
  visual_style: string | null;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  brand_id: string;
  name: string;
  description: string | null;
  landing_page_url: string | null;
  audience: string | null;
  benefits: string | null;
  offer: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductImage {
  id: string;
  product_id: string;
  url: string;
  position: number;
  created_at: string;
}

export type CampaignStatus = "draft" | "active" | "paused" | "completed";

export interface Campaign {
  id: string;
  product_id: string;
  name: string;
  objective: string | null;
  status: CampaignStatus;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type ConceptFormat = "static_image" | "video";

export interface Concept {
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
  format: ConceptFormat;
  aspect_ratio: string;
  generated_prompt: string | null;
  created_at: string;
  updated_at: string;
}

export type CreativeType = "image" | "video";
export type CreativeSource = "manual_upload" | "ai_generated";
export type CreativeStatus = "draft" | "approved" | "rejected";

export interface Creative {
  id: string;
  concept_id: string;
  label: string | null;
  type: CreativeType;
  source: CreativeSource;
  provider: string | null;
  generation_prompt: string | null;
  asset_url: string | null;
  status: CreativeStatus;
  notes: string | null;
  source_creative_id: string | null;
  created_at: string;
  updated_at: string;
}

export type GenerationJobStatus = "processing" | "completed" | "failed";

export interface GenerationJob {
  id: string;
  concept_id: string;
  provider: string;
  external_request_id: string;
  status: GenerationJobStatus;
  prompt: string | null;
  error: string | null;
  creative_id: string | null;
  source_creative_id: string | null;
  created_at: string;
  updated_at: string;
}
