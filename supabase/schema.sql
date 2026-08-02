-- Creative Engine — Phase 1 schema (Brands + Products)
-- Run this once in the Supabase SQL Editor for your project.

create extension if not exists "pgcrypto";

create table if not exists brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  brand_voice text,
  visual_style text,
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands (id) on delete cascade,
  name text not null,
  description text,
  landing_page_url text,
  audience text,
  benefits text,
  offer text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_brand_id_idx on products (brand_id);

-- Product images are uploaded to the `product-images` storage bucket;
-- this table just stores references to them.
create table if not exists product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  url text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists product_images_product_id_idx on product_images (product_id);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists brands_set_updated_at on brands;
create trigger brands_set_updated_at
before update on brands
for each row execute function set_updated_at();

drop trigger if exists products_set_updated_at on products;
create trigger products_set_updated_at
before update on products
for each row execute function set_updated_at();

-- Storage buckets for logo/product images. Public read so uploaded images can
-- be shown directly via their public URL.
insert into storage.buckets (id, name, public)
values ('brand-logos', 'brand-logos', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

-- RLS is enabled with no policies, so anon/authenticated roles get no access
-- by default. The app has no auth system yet: all reads/writes go through the
-- server using the service role key, which always bypasses RLS. This just
-- keeps the tables closed to the anon key in case a future phase ever calls
-- Supabase from the browser. Add real policies once user accounts arrive.
alter table brands enable row level security;
alter table products enable row level security;
alter table product_images enable row level security;

-- Creative Engine — Phase 2 schema (Campaign -> Concept -> Creative)
-- Run this addition once in the Supabase SQL Editor for your project.

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  name text not null,
  objective text,
  status text not null default 'draft',
  start_date date,
  end_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists campaigns_product_id_idx on campaigns (product_id);

-- Concepts hold a structured creative brief. `generated_prompt` is computed
-- deterministically (see lib/promptTemplate.ts) from these fields plus the
-- parent Brand's voice/style and Product's audience/benefits -- no AI model
-- is called to produce it.
create table if not exists concepts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns (id) on delete cascade,
  name text not null,
  messaging_angle text,
  target_emotion text,
  visual_style_override text,
  tone_override text,
  setting_scene text,
  key_message text,
  call_to_action text,
  format text not null default 'static_image',
  aspect_ratio text not null default '1:1',
  generated_prompt text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists concepts_campaign_id_idx on concepts (campaign_id);

-- Creatives can be manually uploaded ('manual_upload') or produced by an AI
-- provider ('ai_generated'); `provider` and `generation_prompt` are only set
-- for the latter (a snapshot of the prompt actually used, since the parent
-- Concept's generated_prompt can change later).
create table if not exists creatives (
  id uuid primary key default gen_random_uuid(),
  concept_id uuid not null references concepts (id) on delete cascade,
  label text,
  type text not null default 'image',
  source text not null default 'manual_upload',
  provider text,
  generation_prompt text,
  asset_url text,
  status text not null default 'draft',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists creatives_concept_id_idx on creatives (concept_id);

drop trigger if exists campaigns_set_updated_at on campaigns;
create trigger campaigns_set_updated_at
before update on campaigns
for each row execute function set_updated_at();

drop trigger if exists concepts_set_updated_at on concepts;
create trigger concepts_set_updated_at
before update on concepts
for each row execute function set_updated_at();

drop trigger if exists creatives_set_updated_at on creatives;
create trigger creatives_set_updated_at
before update on creatives
for each row execute function set_updated_at();

insert into storage.buckets (id, name, public)
values ('creative-assets', 'creative-assets', true)
on conflict (id) do nothing;

alter table campaigns enable row level security;
alter table concepts enable row level security;
alter table creatives enable row level security;

-- Creative Engine — Phase 3 schema addition (fal.ai image generation)
-- If you already ran the Phase 2 section above, run just this addition.
alter table creatives add column if not exists provider text;
alter table creatives add column if not exists generation_prompt text;

-- Phase 3b: async generation job tracking, so a Route Handler can poll fal.ai
-- in short-lived requests instead of one request blocking until it's done
-- (which would time out on serverless deployments for slower generations).
create table if not exists generation_jobs (
  id uuid primary key default gen_random_uuid(),
  concept_id uuid not null references concepts (id) on delete cascade,
  provider text not null default 'fal-ai',
  external_request_id text not null,
  status text not null default 'processing',
  prompt text,
  error text,
  creative_id uuid references creatives (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists generation_jobs_concept_id_idx on generation_jobs (concept_id);

drop trigger if exists generation_jobs_set_updated_at on generation_jobs;
create trigger generation_jobs_set_updated_at
before update on generation_jobs
for each row execute function set_updated_at();

alter table generation_jobs enable row level security;

-- Creative Engine — Phase 4 schema addition (Higgsfield image-to-video)
-- source_creative_id tracks which image Creative a video job/video Creative
-- was generated from.
alter table generation_jobs add column if not exists source_creative_id uuid references creatives (id) on delete set null;
alter table creatives add column if not exists source_creative_id uuid references creatives (id) on delete set null;

-- Creative Engine — Phase 5 schema addition (automated concept + creative generation)
-- `auto_generate` opts a Product into the automated pipeline. `triggered_by`
-- distinguishes automated jobs from manual ones so the daily generation cap
-- only gates the automated pipeline, not a user's own manual clicks.
alter table products add column if not exists auto_generate boolean not null default false;
alter table generation_jobs add column if not exists triggered_by text not null default 'manual';

-- Creative Engine — Phase 6 schema addition (merge Brand + Product + Campaign
-- into a single Campaign entity). Keeping three separate records per ad line
-- added form fatigue without real benefit, so Concepts now attach directly to
-- one Campaign that carries everything: brand identity, product details, and
-- campaign scheduling. Guarded by the `products` table's existence so this
-- whole block is a no-op once it's already run.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'products') then

    alter table campaigns add column if not exists description text;
    alter table campaigns add column if not exists brand_voice text;
    alter table campaigns add column if not exists visual_style text;
    alter table campaigns add column if not exists logo_url text;
    alter table campaigns add column if not exists landing_page_url text;
    alter table campaigns add column if not exists audience text;
    alter table campaigns add column if not exists benefits text;
    alter table campaigns add column if not exists offer text;
    alter table campaigns add column if not exists auto_generate boolean not null default false;

    -- Campaigns created below from a standalone Brand (no Product) have no
    -- product_id to set. It's dropped entirely at the end of this block, but
    -- must stop being NOT NULL before then.
    alter table campaigns alter column product_id drop not null;

    -- Backfill Campaigns that already exist from their Product + Brand.
    update campaigns c
    set
      description = p.description,
      brand_voice = b.brand_voice,
      visual_style = b.visual_style,
      logo_url = b.logo_url,
      landing_page_url = p.landing_page_url,
      audience = p.audience,
      benefits = p.benefits,
      offer = p.offer,
      auto_generate = p.auto_generate
    from products p
    join brands b on b.id = p.brand_id
    where c.product_id = p.id;

    -- Products that never had a Campaign yet become their own Campaign, so no
    -- data entered so far is lost. product_id is kept for one more step (the
    -- campaign_images backfill below) and dropped at the end of this block.
    insert into campaigns (
      product_id, name, description, brand_voice, visual_style, logo_url,
      landing_page_url, audience, benefits, offer, auto_generate, status
    )
    select
      p.id, p.name, p.description, b.brand_voice, b.visual_style, b.logo_url,
      p.landing_page_url, p.audience, p.benefits, p.offer, p.auto_generate, 'draft'
    from products p
    join brands b on b.id = p.brand_id
    where not exists (select 1 from campaigns c where c.product_id = p.id);

    -- Brands with no Products at all still become a standalone Campaign.
    insert into campaigns (name, description, brand_voice, visual_style, logo_url, status)
    select b.name, b.description, b.brand_voice, b.visual_style, b.logo_url, 'draft'
    from brands b
    where not exists (select 1 from products p where p.brand_id = b.id);

    -- Product images move onto whichever Campaign their Product became.
    alter table product_images add column if not exists campaign_id uuid references campaigns (id) on delete cascade;
    update product_images pi
    set campaign_id = c.id
    from campaigns c
    where c.product_id = pi.product_id;

    alter table product_images rename to campaign_images;
    alter table campaign_images alter column campaign_id set not null;
    alter table campaign_images drop column product_id;

    alter table campaigns drop column product_id;
    drop table products;
    drop table brands;

  end if;
end $$;

create index if not exists campaign_images_campaign_id_idx on campaign_images (campaign_id);

-- Creative Engine — Phase 7 schema addition (rename Concept -> Ad Set,
-- Creative -> Ad). Matches standard ad-platform vocabulary (Campaign > Ad Set
-- > Ad). Pure rename, no structural change -- guarded by the `concepts`
-- table's existence so this whole block is a no-op once it's already run.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'concepts') then

    alter table creatives rename column concept_id to ad_set_id;
    alter table creatives rename column source_creative_id to source_ad_id;
    alter table generation_jobs rename column concept_id to ad_set_id;
    alter table generation_jobs rename column creative_id to ad_id;
    alter table generation_jobs rename column source_creative_id to source_ad_id;

    alter table concepts rename to ad_sets;
    alter table creatives rename to ads;

    alter index concepts_campaign_id_idx rename to ad_sets_campaign_id_idx;
    alter index creatives_concept_id_idx rename to ads_ad_set_id_idx;
    alter index generation_jobs_concept_id_idx rename to generation_jobs_ad_set_id_idx;

    alter trigger concepts_set_updated_at on ad_sets rename to ad_sets_set_updated_at;
    alter trigger creatives_set_updated_at on ads rename to ads_set_updated_at;

  end if;
end $$;
