-- Short clips and highlights attached to a suggested episode (looked up on demand and cached).

create table item_clips (
  item_id bigint not null references content_items(id) on delete cascade,
  clip_id bigint not null references content_items(id) on delete cascade,
  rank int not null default 0,
  created_at timestamptz not null default now(),
  primary key (item_id, clip_id)
);
create index item_clips_item on item_clips (item_id, rank);
