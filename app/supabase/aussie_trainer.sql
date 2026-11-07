-- ============================================================================
-- Aussie Trainer — общая собака в облаке Supabase
-- Выполнить один раз в том же проекте, что и «Бережно»:
--   Supabase → SQL Editor → New query → вставить весь файл → Run.
-- Скрипт можно запускать повторно: он ничего не удаляет.
-- Все объекты называются с префиксом aussie_ — таблицы и функции «Бережно» не затрагиваются.
-- ============================================================================
--
-- Модель: «стая» (pack) — одна общая собака. Участники стаи (муж, жена) видят и меняют
-- одни и те же данные. Присоединиться можно по коду приглашения из 8 символов.
--
--   aussie_packs    — стая: название, код приглашения
--   aussie_members  — участники: кто, как подписывать тренировки
--   aussie_records  — все записи приложения в «конверте»:
--                     store (тип записи), id, data (jsonb), deleted (мягкое удаление),
--                     updated_at (время изменения на телефоне — побеждает более позднее),
--                     server_updated_at (курсор синхронизации)
--   storage: бакет aussie-photos — фото собаки и дневника, папка = id стаи
-- ============================================================================

-- ---------- Таблицы ----------
create table if not exists public.aussie_packs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'Собака' check (char_length(name) <= 100),
  invite_code text not null unique check (invite_code ~ '^[A-Z0-9]{8}$'),
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.aussie_members (
  pack_id      uuid not null references public.aussie_packs(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 60),
  email        text,
  joined_at    timestamptz not null default now(),
  primary key (pack_id, user_id)
);
create index if not exists aussie_members_user_idx on public.aussie_members (user_id);

create table if not exists public.aussie_records (
  pack_id           uuid not null references public.aussie_packs(id) on delete cascade,
  store             text not null check (store in ('dogs','programs','days','sessions','trainings','results','attempts',
                                                   'levels','levelChanges','journal','customExercises','reports','photos')),
  id                text not null check (char_length(id) between 1 and 200),
  data              jsonb check (data is null or octet_length(data::text) < 1000000),
  deleted           boolean not null default false,
  updated_at        timestamptz not null,
  server_updated_at timestamptz not null default clock_timestamp(),
  updated_by        uuid references auth.users(id) on delete set null,
  device_id         text,
  primary key (pack_id, store, id)
);
create index if not exists aussie_records_sync_idx on public.aussie_records (pack_id, server_updated_at);

-- ---------- Проверка участия (используется в правилах доступа) ----------
create or replace function public.aussie_is_member(p_pack uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.aussie_members m
    where m.pack_id = p_pack and m.user_id = (select auth.uid())
  );
$$;

-- Путь файла в хранилище: «<id стаи>/<id фото>»
create or replace function public.aussie_is_member_path(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  folder text := split_part(coalesce(p_name, ''), '/', 1);
begin
  if folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.aussie_is_member(folder::uuid);
end;
$$;

-- ---------- Правила доступа (RLS) ----------
alter table public.aussie_packs   enable row level security;
alter table public.aussie_members enable row level security;
alter table public.aussie_records enable row level security;
alter table public.aussie_packs   force row level security;
alter table public.aussie_members force row level security;
alter table public.aussie_records force row level security;

drop policy if exists "aussie packs: members read" on public.aussie_packs;
create policy "aussie packs: members read" on public.aussie_packs
  for select to authenticated using (public.aussie_is_member(id));

drop policy if exists "aussie members: members read" on public.aussie_members;
create policy "aussie members: members read" on public.aussie_members
  for select to authenticated using (public.aussie_is_member(pack_id));

drop policy if exists "aussie records: members read" on public.aussie_records;
drop policy if exists "aussie records: members insert" on public.aussie_records;
drop policy if exists "aussie records: members update" on public.aussie_records;
create policy "aussie records: members read" on public.aussie_records
  for select to authenticated using (public.aussie_is_member(pack_id));
create policy "aussie records: members insert" on public.aussie_records
  for insert to authenticated with check (public.aussie_is_member(pack_id));
create policy "aussie records: members update" on public.aussie_records
  for update to authenticated using (public.aussie_is_member(pack_id)) with check (public.aussie_is_member(pack_id));

revoke all on table public.aussie_packs, public.aussie_members, public.aussie_records from anon, public;
grant select on table public.aussie_packs, public.aussie_members to authenticated;
grant select, insert, update on table public.aussie_records to authenticated;

-- ---------- Серверное время изменения и автор ----------
create or replace function public.aussie_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.server_updated_at := clock_timestamp();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;

drop trigger if exists aussie_touch on public.aussie_records;
create trigger aussie_touch before insert or update on public.aussie_records
  for each row execute function public.aussie_touch();

-- ---------- Служебные функции ----------
-- Код приглашения: 8 символов без похожих (нет I, O, 0, 1), из криптостойкого генератора UUID
create or replace function public.aussie_random_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea := uuid_send(gen_random_uuid());
  idx int[] := array[0, 1, 2, 3, 4, 5, 10, 11];
  i int;
  code text := '';
begin
  foreach i in array idx loop
    code := code || substr(alphabet, (get_byte(b, i) % 32) + 1, 1);
  end loop;
  return code;
end;
$$;

create or replace function public.aussie_pack_info(p_pack uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id, 'name', p.name, 'invite_code', p.invite_code, 'created_at', p.created_at,
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'display_name', m.display_name, 'email', m.email, 'joined_at', m.joined_at)
                       order by m.joined_at)
      from public.aussie_members m where m.pack_id = p.id
    ), '[]'::jsonb)
  )
  from public.aussie_packs p where p.id = p_pack;
$$;

-- ---------- Функции для приложения ----------
-- Создать общую собаку (стаю). Создатель сразу становится участником.
create or replace function public.aussie_create_pack(p_name text default null, p_display_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  code text;
  pid uuid;
  em text;
begin
  if uid is null then raise exception 'Нужно войти в аккаунт' using errcode = '42501'; end if;
  select email into em from auth.users where id = uid;
  loop
    code := public.aussie_random_code();
    exit when not exists (select 1 from public.aussie_packs where invite_code = code);
  end loop;
  insert into public.aussie_packs (name, invite_code, created_by)
  values (left(coalesce(nullif(trim(p_name), ''), 'Собака'), 100), code, uid)
  returning id into pid;
  insert into public.aussie_members (pack_id, user_id, display_name, email)
  values (pid, uid, left(coalesce(trim(p_display_name), ''), 60), em);
  return public.aussie_pack_info(pid);
end;
$$;

-- Присоединиться по коду приглашения
create or replace function public.aussie_join_pack(p_code text, p_display_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  pid uuid;
  em text;
  clean text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if uid is null then raise exception 'Нужно войти в аккаунт' using errcode = '42501'; end if;
  select id into pid from public.aussie_packs where invite_code = clean;
  if pid is null then raise exception 'Код приглашения не найден. Проверьте 8 символов.' using errcode = 'P0002'; end if;
  select email into em from auth.users where id = uid;
  insert into public.aussie_members as m (pack_id, user_id, display_name, email)
  values (pid, uid, left(coalesce(trim(p_display_name), ''), 60), em)
  on conflict (pack_id, user_id) do update
    set display_name = case when excluded.display_name <> '' then excluded.display_name else m.display_name end,
        email = excluded.email;
  return public.aussie_pack_info(pid);
end;
$$;

-- Мои общие собаки
create or replace function public.aussie_my_packs()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(public.aussie_pack_info(m.pack_id) order by m.joined_at), '[]'::jsonb)
  from public.aussie_members m
  where m.user_id = (select auth.uid());
$$;

-- Имя, которым подписываются тренировки
create or replace function public.aussie_set_name(p_pack uuid, p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.aussie_is_member(p_pack) then raise exception 'Вы не участник этой общей собаки' using errcode = '42501'; end if;
  update public.aussie_members set display_name = left(coalesce(trim(p_display_name), ''), 60)
  where pack_id = p_pack and user_id = auth.uid();
  return public.aussie_pack_info(p_pack);
end;
$$;

-- Новый код приглашения (старый перестаёт работать)
create or replace function public.aussie_new_invite(p_pack uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  code text;
begin
  if not public.aussie_is_member(p_pack) then raise exception 'Вы не участник этой общей собаки' using errcode = '42501'; end if;
  loop
    code := public.aussie_random_code();
    exit when not exists (select 1 from public.aussie_packs where invite_code = code);
  end loop;
  update public.aussie_packs set invite_code = code where id = p_pack;
  return public.aussie_pack_info(p_pack);
end;
$$;

-- Выйти из общей собаки. Если участников не осталось, данные стаи удаляются.
create or replace function public.aussie_leave_pack(p_pack uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.aussie_members where pack_id = p_pack and user_id = auth.uid();
  if not exists (select 1 from public.aussie_members where pack_id = p_pack) then
    delete from public.aussie_packs where id = p_pack;
  end if;
end;
$$;

-- Принять пакет изменений с телефона. Запись меняется, только если пришедшая версия новее.
-- Возвращает итоговое состояние каждой записи: телефон видит, чья версия победила.
create or replace function public.aussie_push(p_pack uuid, p_rows jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r jsonb;
  is_deleted boolean;
  saved jsonb;
  result jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'Нужно войти в аккаунт' using errcode = '42501'; end if;
  if not public.aussie_is_member(p_pack) then raise exception 'Вы не участник этой общей собаки' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'rows must be an array'; end if;
  if jsonb_array_length(p_rows) > 500 then raise exception 'too many rows in one batch (max 500)'; end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    is_deleted := coalesce((r->>'deleted')::boolean, false);
    insert into public.aussie_records as x (pack_id, store, id, data, deleted, updated_at, device_id)
    values (p_pack, r->>'store', r->>'id',
            case when is_deleted or jsonb_typeof(r->'data') <> 'object' then null else r->'data' end,
            is_deleted, (r->>'updated_at')::timestamptz, r->>'device_id')
    on conflict (pack_id, store, id) do update
      set data = excluded.data,
          deleted = excluded.deleted,
          updated_at = excluded.updated_at,
          device_id = excluded.device_id
      where x.updated_at < excluded.updated_at;

    select jsonb_build_object('store', x.store, 'id', x.id, 'data', x.data, 'deleted', x.deleted,
                              'updated_at', x.updated_at, 'server_updated_at', x.server_updated_at)
      into saved
      from public.aussie_records x
     where x.pack_id = p_pack and x.store = r->>'store' and x.id = r->>'id';
    if saved is not null then result := result || jsonb_build_array(saved); end if;
  end loop;
  return result;
end;
$$;

-- Изменения после курсора, по возрастанию серверного времени
create or replace function public.aussie_pull(p_pack uuid, p_since timestamptz default null, p_limit integer default 1000)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  lim integer := least(greatest(coalesce(p_limit, 1000), 1), 5000);
  out jsonb;
begin
  if auth.uid() is null then raise exception 'Нужно войти в аккаунт' using errcode = '42501'; end if;
  if not public.aussie_is_member(p_pack) then raise exception 'Вы не участник этой общей собаки' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('store', s.store, 'id', s.id, 'data', s.data, 'deleted', s.deleted,
                                               'updated_at', s.updated_at, 'server_updated_at', s.server_updated_at)
                            order by s.server_updated_at, s.store, s.id), '[]'::jsonb)
    into out
    from (select * from public.aussie_records x
           where x.pack_id = p_pack and (p_since is null or x.server_updated_at > p_since)
           order by x.server_updated_at, x.store, x.id
           limit lim) s;
  return out;
end;
$$;

-- ---------- Права на функции ----------
revoke all on function public.aussie_is_member(uuid) from public, anon;
revoke all on function public.aussie_is_member_path(text) from public, anon;
revoke all on function public.aussie_touch() from public, anon, authenticated;
revoke all on function public.aussie_random_code() from public, anon, authenticated;
revoke all on function public.aussie_pack_info(uuid) from public, anon, authenticated;
revoke all on function public.aussie_create_pack(text, text) from public, anon;
revoke all on function public.aussie_join_pack(text, text) from public, anon;
revoke all on function public.aussie_my_packs() from public, anon;
revoke all on function public.aussie_set_name(uuid, text) from public, anon;
revoke all on function public.aussie_new_invite(uuid) from public, anon;
revoke all on function public.aussie_leave_pack(uuid) from public, anon;
revoke all on function public.aussie_push(uuid, jsonb) from public, anon;
revoke all on function public.aussie_pull(uuid, timestamptz, integer) from public, anon;

grant execute on function public.aussie_is_member(uuid) to authenticated;
grant execute on function public.aussie_is_member_path(text) to authenticated;
grant execute on function public.aussie_create_pack(text, text) to authenticated;
grant execute on function public.aussie_join_pack(text, text) to authenticated;
grant execute on function public.aussie_my_packs() to authenticated;
grant execute on function public.aussie_set_name(uuid, text) to authenticated;
grant execute on function public.aussie_new_invite(uuid) to authenticated;
grant execute on function public.aussie_leave_pack(uuid) to authenticated;
grant execute on function public.aussie_push(uuid, jsonb) to authenticated;
grant execute on function public.aussie_pull(uuid, timestamptz, integer) to authenticated;

-- ---------- Фото: закрытый бакет, доступ только участникам стаи ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('aussie-photos', 'aussie-photos', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "aussie photos: read" on storage.objects;
drop policy if exists "aussie photos: upload" on storage.objects;
drop policy if exists "aussie photos: update" on storage.objects;
drop policy if exists "aussie photos: delete" on storage.objects;
create policy "aussie photos: read" on storage.objects
  for select to authenticated using (bucket_id = 'aussie-photos' and public.aussie_is_member_path(name));
create policy "aussie photos: upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'aussie-photos' and public.aussie_is_member_path(name));
create policy "aussie photos: update" on storage.objects
  for update to authenticated using (bucket_id = 'aussie-photos' and public.aussie_is_member_path(name))
  with check (bucket_id = 'aussie-photos' and public.aussie_is_member_path(name));
create policy "aussie photos: delete" on storage.objects
  for delete to authenticated using (bucket_id = 'aussie-photos' and public.aussie_is_member_path(name));

-- Обновить кеш схемы PostgREST, чтобы функции стали доступны сразу
notify pgrst, 'reload schema';
