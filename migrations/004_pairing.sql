-- Codeless together mode: "Both" on two phones pairs automatically.
-- At most one open pairing session exists at a time (there are only two people).

alter table sessions add column pair boolean not null default false;
create unique index one_open_pair on sessions ((1)) where pair and status = 'open';
