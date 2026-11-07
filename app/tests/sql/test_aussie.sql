-- Проверки общей собаки: участники, коды приглашения, RLS, push/pull, конфликты, фото, выход.
\set ON_ERROR_STOP 1
\set A '11111111-1111-4111-8111-111111111111'
\set B '22222222-2222-4222-8222-222222222222'
\set C '33333333-3333-4333-8333-333333333333'

insert into auth.users values (:'A', 'husband@example.com'), (:'B', 'wife@example.com'), (:'C', 'stranger@example.com')
  on conflict do nothing;

-- ——— A создаёт общую собаку ———
set role authenticated;
select set_config('request.jwt.claim.sub', :'A', false);
select (public.aussie_create_pack('Луна', 'Саша'))->>'id' as pack \gset
reset role;
select invite_code as code from public.aussie_packs where id = :'pack' \gset
set role authenticated;

do $$
declare p jsonb;
begin
  p := public.aussie_my_packs();
  assert jsonb_array_length(p) = 1, 'у A одна стая';
  assert p->0->>'name' = 'Луна', 'название стаи';
  assert (p->0->>'invite_code') ~ '^[A-HJ-NP-Z2-9]{8}$', 'код из 8 символов без похожих букв';
  assert jsonb_array_length(p->0->'members') = 1 and p->0->'members'->0->>'display_name' = 'Саша', 'A — участник';
  raise notice 'ok: стая создана, код %', p->0->>'invite_code';
end $$;

-- A отправляет записи
select public.aussie_push(:'pack', '[
  {"store":"dogs","id":"dog-main","data":{"id":"dog-main","name":"Луна"},"deleted":false,"updated_at":"2026-11-07T10:00:00.000Z","device_id":"iphone-a"},
  {"store":"attempts","id":"trn-1:e1:1:aa","data":{"id":"trn-1:e1:1:aa","outcome":"success"},"deleted":false,"updated_at":"2026-11-07T10:00:01.000Z","device_id":"iphone-a"}
]'::jsonb) is not null as pushed \gset

-- ——— C (посторонний) не видит и не может писать ———
select set_config('request.jwt.claim.sub', :'C', false);
do $$
declare n int; ok boolean := false;
begin
  select count(*) into n from public.aussie_records;
  assert n = 0, 'посторонний не видит записи';
  select count(*) into n from public.aussie_packs;
  assert n = 0, 'посторонний не видит стаю';
  assert jsonb_array_length(public.aussie_my_packs()) = 0, 'у постороннего нет стай';
  begin
    perform public.aussie_join_pack('ZZZZZZZZ', 'Чужой');
  exception when others then ok := sqlerrm like 'Код приглашения не найден%';
  end;
  assert ok, 'неверный код отклоняется понятной ошибкой';
  raise notice 'ok: посторонний ничего не видит, неверный код отклонён';
end $$;

do $$
declare ok boolean := false;
begin
  perform public.aussie_pull('00000000-0000-4000-8000-000000000000'::uuid, null, 100);
exception when others then ok := sqlerrm like 'Вы не участник%';
  assert ok, 'pull чужой стаи запрещён';
end $$;

\set ON_ERROR_STOP 0
\echo 'ожидаемая ошибка доступа ниже:'
select public.aussie_pull(:'pack', null, 100);
insert into public.aussie_records (pack_id, store, id, data, updated_at) values (:'pack', 'dogs', 'x', '{}', now());
\set ON_ERROR_STOP 1

-- ——— B присоединяется по коду (строчные буквы и дефис допускаются) ———
select set_config('request.jwt.claim.sub', :'B', false);
select public.aussie_join_pack(lower(substr(:'code', 1, 4) || '-' || substr(:'code', 5)), 'Аня') is not null as joined \gset
do $$
declare p jsonb; rows jsonb;
begin
  p := public.aussie_my_packs();
  assert jsonb_array_length(p) = 1, 'B в одной стае';
  assert jsonb_array_length(p->0->'members') = 2, 'в стае два участника';
  rows := public.aussie_pull((p->0->>'id')::uuid, null, 1000);
  assert jsonb_array_length(rows) = 2, format('B видит 2 записи, а видит %s', jsonb_array_length(rows));
  assert rows->0->'data'->>'name' = 'Луна', 'данные собаки дошли';
  raise notice 'ok: B присоединилась и получила данные';
end $$;

-- Повторное присоединение не дублирует участника
select public.aussie_join_pack(:'code', '') is not null as rejoined \gset
do $$ begin
  assert (select count(*) from public.aussie_members) = 2, 'участник не задвоился';
  assert (select display_name from public.aussie_members where user_id = auth.uid()) = 'Аня', 'пустое имя не затирает прежнее';
end $$;

-- ——— Конфликты: побеждает более позднее изменение ———
do $$
declare res jsonb; pid uuid := (public.aussie_my_packs()->0->>'id')::uuid;
begin
  res := public.aussie_push(pid, '[{"store":"dogs","id":"dog-main","data":{"id":"dog-main","name":"СТАРОЕ"},"deleted":false,"updated_at":"2026-11-07T09:00:00.000Z","device_id":"iphone-b"}]');
  assert res->0->'data'->>'name' = 'Луна', 'старая правка не побеждает';
  assert (res->0->>'updated_at')::timestamptz = '2026-11-07T10:00:00Z'::timestamptz, 'сервер вернул актуальную версию';

  res := public.aussie_push(pid, '[{"store":"dogs","id":"dog-main","data":{"id":"dog-main","name":"Луна Мун"},"deleted":false,"updated_at":"2026-11-07T11:00:00.000Z","device_id":"iphone-b"}]');
  assert res->0->'data'->>'name' = 'Луна Мун', 'новая правка принята';
  assert (select updated_by from public.aussie_records where store = 'dogs' and id = 'dog-main') = auth.uid(), 'автор изменения записан';

  -- одинаковое время: повтор той же версии ничего не меняет
  res := public.aussie_push(pid, '[{"store":"dogs","id":"dog-main","data":{"id":"dog-main","name":"ДРУГОЕ"},"deleted":false,"updated_at":"2026-11-07T11:00:00.000Z","device_id":"iphone-a"}]');
  assert res->0->'data'->>'name' = 'Луна Мун', 'при равном времени остаётся сохранённая версия';

  -- мягкое удаление
  res := public.aussie_push(pid, '[{"store":"attempts","id":"trn-1:e1:1:aa","data":null,"deleted":true,"updated_at":"2026-11-07T12:00:00.000Z","device_id":"iphone-b"}]');
  assert (res->0->>'deleted')::boolean and res->0->'data' = 'null'::jsonb, 'удаление сохраняется без данных';
  raise notice 'ok: конфликты и удаление';
end $$;

-- Курсор: pull после времени возвращает только новые изменения
do $$
declare pid uuid := (public.aussie_my_packs()->0->>'id')::uuid; all_rows jsonb; tail jsonb;
begin
  all_rows := public.aussie_pull(pid, null, 1000);
  tail := public.aussie_pull(pid, (all_rows->0->>'server_updated_at')::timestamptz, 1000);
  assert jsonb_array_length(tail) = jsonb_array_length(all_rows) - 1, 'курсор отсекает уже полученное';
  assert jsonb_array_length(public.aussie_pull(pid, null, 1)) = 1, 'лимит работает';
  raise notice 'ok: курсор и лимит';
end $$;

-- Недопустимый тип записи отклоняется
do $$
declare ok boolean := false; pid uuid := (public.aussie_my_packs()->0->>'id')::uuid;
begin
  begin
    perform public.aussie_push(pid, '[{"store":"settings","id":"app","data":{},"deleted":false,"updated_at":"2026-11-07T12:00:00Z"}]');
  exception when check_violation then ok := true;
  end;
  assert ok, 'настройки телефона в облако не попадают';
end $$;

-- ——— Фото: доступ только участникам ———
insert into storage.objects (bucket_id, name) values ('aussie-photos', :'pack' || '/pho-1');
select set_config('request.jwt.claim.sub', :'C', false);
do $$ begin
  assert (select count(*) from storage.objects) = 0, 'посторонний не видит фото';
  raise notice 'ok: фото видны только участникам';
end $$;
\set ON_ERROR_STOP 0
\echo 'ожидаемая ошибка доступа к фото ниже:'
insert into storage.objects (bucket_id, name) values ('aussie-photos', :'pack' || '/pho-2');
insert into storage.objects (bucket_id, name) values ('aussie-photos', 'not-a-uuid/pho-3');
\set ON_ERROR_STOP 1
select set_config('request.jwt.claim.sub', :'A', false);
do $$ begin
  assert (select count(*) from storage.objects where bucket_id = 'aussie-photos') = 1, 'A видит фото, загруженное B';
end $$;

-- ——— Имя, новый код, выход ———
do $$
declare pid uuid := (public.aussie_my_packs()->0->>'id')::uuid; old text; p jsonb;
begin
  old := public.aussie_my_packs()->0->>'invite_code';
  p := public.aussie_set_name(pid, 'Александр');
  assert (select display_name from public.aussie_members where user_id = auth.uid()) = 'Александр', 'имя изменено';
  p := public.aussie_new_invite(pid);
  assert p->>'invite_code' <> old, 'код приглашения обновлён';
  raise notice 'ok: имя и новый код';
end $$;

select set_config('request.jwt.claim.sub', :'B', false);
select public.aussie_leave_pack(:'pack');
do $$ begin
  assert jsonb_array_length(public.aussie_my_packs()) = 0, 'B вышла';
  assert (select count(*) from public.aussie_records) = 0, 'после выхода B не видит данные';
end $$;
select set_config('request.jwt.claim.sub', :'A', false);
do $$ begin
  assert (select count(*) from public.aussie_records) = 2, 'у A данные остались';
end $$;
select public.aussie_leave_pack(:'pack');
reset role;
do $$ begin
  assert (select count(*) from public.aussie_packs) = 0, 'последний участник вышел — стая удалена';
  assert (select count(*) from public.aussie_records) = 0, 'записи удалены каскадно';
  raise notice 'ok: выход из стаи';
end $$;

-- Служебные функции недоступны пользователям
set role authenticated;
\set ON_ERROR_STOP 0
\echo 'ожидаемый отказ на служебную функцию ниже:'
select public.aussie_pack_info(gen_random_uuid());
\set ON_ERROR_STOP 1
reset role;

-- ——— anon не имеет доступа ———
set role anon;
\set ON_ERROR_STOP 0
\echo 'ожидаемый отказ для anon ниже:'
select public.aussie_my_packs();
select * from public.aussie_records;
\set ON_ERROR_STOP 1
reset role;

-- Удаление аккаунта создателя не удаляет стаю второго участника
insert into auth.users values ('44444444-4444-4444-8444-444444444444', 'x@example.com'), ('55555555-5555-4555-8555-555555555555', 'y@example.com');
set role authenticated;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', false);
select (public.aussie_create_pack('Тест', 'X'))->>'invite_code' as code2 \gset
select set_config('request.jwt.claim.sub', '55555555-5555-4555-8555-555555555555', false);
select public.aussie_join_pack(:'code2', 'Y') is not null as j2 \gset
reset role;
delete from auth.users where id = '44444444-4444-4444-8444-444444444444';
do $$ begin
  assert (select count(*) from public.aussie_packs) = 1, 'стая осталась у второго участника';
  assert (select created_by from public.aussie_packs) is null, 'создатель обнулён';
  raise notice 'ok: удаление аккаунта одного участника не удаляет общую собаку';
end $$;
