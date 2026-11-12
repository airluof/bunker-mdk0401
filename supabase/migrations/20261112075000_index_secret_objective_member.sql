begin;
create index if not exists game_secret_objectives_member_id_idx
  on private.game_secret_objectives(member_id);
commit;