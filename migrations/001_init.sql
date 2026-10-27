-- PodPick schema. Run with: npm run migrate

create table profiles (
  id serial primary key,
  slot int not null unique check (slot in (1, 2)),
  name text not null,
  pin_hash text,
  pin_fails int not null default 0,
  locked_until timestamptz,
  visibility text not null default 'private' check (visibility in ('private', 'shared')),
  ratings_since_summary int not null default 0,
  created_at timestamptz not null default now()
);

create table sources (
  id serial primary key,
  kind text not null check (kind in ('youtube_channel', 'podcast', 'publication', 'transcript_site')),
  external_id text,
  name text not null,
  url text,
  thumbnail text,
  paywalled boolean not null default false,
  enabled boolean not null default true,
  we_subscribe boolean not null default false,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (kind, external_id)
);

create table profile_sources (
  profile_id int not null references profiles(id) on delete cascade,
  source_id int not null references sources(id) on delete cascade,
  origin text not null default 'starter' check (origin in ('starter', 'added')),
  primary key (profile_id, source_id)
);

create table content_items (
  id bigserial primary key,
  format text not null check (format in ('watch', 'listen', 'read')),
  external_id text,
  url text not null unique,
  title text not null,
  description text,
  thumbnail text,
  source_id int references sources(id),
  source_name text not null,
  duration_sec int,
  read_min int,
  views bigint,
  published_at timestamptz,
  hint_language text,
  is_quality boolean,
  check_reason text,
  language text,
  topic_tags text[] not null default '{}',
  mood_tags text[] not null default '{}',
  summary text,
  checked_at timestamptz,
  fetched_at timestamptz not null default now()
);
create unique index content_items_format_ext on content_items (format, external_id) where external_id is not null;
create index content_items_eligible on content_items (format, is_quality, duration_sec);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('solo', 'together')),
  join_code text unique,
  shared_format text not null default 'any',
  status text not null default 'open',
  ask_id text,
  created_by int references profiles(id),
  created_at timestamptz not null default now()
);

create table session_participants (
  session_id uuid not null references sessions(id) on delete cascade,
  profile_id int not null references profiles(id) on delete cascade,
  mood text,
  topic text,
  time_slot text,
  joined_at timestamptz not null default now(),
  primary key (session_id, profile_id)
);

create table recommendations (
  id bigserial primary key,
  session_id uuid not null references sessions(id) on delete cascade,
  item_id bigint not null references content_items(id),
  rank int not null,
  scores jsonb not null default '{}',
  reason text,
  shown_at timestamptz not null default now(),
  unique (session_id, item_id)
);

create table feedback (
  id bigserial primary key,
  profile_id int not null references profiles(id) on delete cascade,
  item_id bigint not null references content_items(id),
  session_id uuid references sessions(id),
  value text not null check (value in ('love', 'dislike', 'save')),
  created_at timestamptz not null default now(),
  unique (profile_id, item_id, value)
);

create table taste_summaries (
  profile_id int primary key references profiles(id) on delete cascade,
  summary text not null,
  updated_at timestamptz not null default now()
);

create table events (
  id bigserial primary key,
  type text not null check (type in ('ask_opened', 'item_opened')),
  ask_id text,
  profile_id int references profiles(id),
  session_id uuid references sessions(id),
  item_id bigint references content_items(id),
  created_at timestamptz not null default now()
);

create table api_usage (
  day date not null,
  service text not null,
  units int not null default 0,
  calls int not null default 0,
  tokens_in bigint not null default 0,
  tokens_out bigint not null default 0,
  cost numeric not null default 0,
  primary key (day, service)
);

create table fetch_log (
  id bigserial primary key,
  kind text not null,
  key text not null,
  result_count int not null default 0,
  ran_at timestamptz not null default now()
);
create index fetch_log_key on fetch_log (kind, key, ran_at desc);

create table settings (
  key text primary key,
  value jsonb not null
);
