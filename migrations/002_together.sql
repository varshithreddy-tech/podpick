-- Together mode (join codes, lobby readiness, per-person fallback picks) and session claiming.

alter table sessions add column started_at timestamptz;
alter table session_participants add column ready boolean not null default false;
alter table recommendations add column for_profile int references profiles(id);
