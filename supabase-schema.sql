-- 工事管理アプリ 5人共有用 Supabase schema
-- 現場データと見積・請求データは同一Supabaseプロジェクト・同一DBに保存し、document_keyで論理的に分離する。
-- Supabase SQL Editor で一度だけ実行する。service_role key は絶対にブラウザーへ置かない。

create table if not exists public.team_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null default 'member' check (role in ('admin','member')),
  created_at timestamptz not null default now()
);

create table if not exists public.shared_documents (
  document_key text primary key check (document_key in ('field_data','invoice_data')),
  payload jsonb not null,
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table public.team_members enable row level security;
alter table public.shared_documents enable row level security;

drop policy if exists "members can read own membership" on public.team_members;
create policy "members can read own membership"
on public.team_members for select to authenticated
using (user_id = auth.uid());

drop policy if exists "team members can read shared documents" on public.shared_documents;
create policy "team members can read shared documents"
on public.shared_documents for select to authenticated
using (exists (
  select 1 from public.team_members m where m.user_id = auth.uid()
));

drop policy if exists "team members can insert shared documents" on public.shared_documents;
create policy "team members can insert shared documents"
on public.shared_documents for insert to authenticated
with check (exists (
  select 1 from public.team_members m where m.user_id = auth.uid()
) and updated_by = auth.uid());

drop policy if exists "team members can update shared documents" on public.shared_documents;
create policy "team members can update shared documents"
on public.shared_documents for update to authenticated
using (exists (
  select 1 from public.team_members m where m.user_id = auth.uid()
))
with check (exists (
  select 1 from public.team_members m where m.user_id = auth.uid()
) and updated_by = auth.uid());

grant select on public.team_members to authenticated;
grant select, insert, update on public.shared_documents to authenticated;

-- revision を比較してから保存。別端末が先に更新した場合は上書きせず競合として返す。
create or replace function public.save_shared_document(
  p_document_key text,
  p_payload jsonb,
  p_expected_revision bigint
)
returns table(document_key text, revision bigint, updated_at timestamptz)
language plpgsql
security invoker
set search_path = public
as $$
declare
  saved public.shared_documents%rowtype;
begin
  if not exists (select 1 from public.team_members where user_id = auth.uid()) then
    raise exception 'not_a_team_member';
  end if;
  if p_document_key not in ('field_data','invoice_data') then
    raise exception 'invalid_document_key';
  end if;

  if p_expected_revision = 0 then
    insert into public.shared_documents(document_key, payload, revision, updated_at, updated_by)
    values (p_document_key, p_payload, 1, now(), auth.uid())
    on conflict (document_key) do nothing
    returning * into saved;
  else
    update public.shared_documents
       set payload = p_payload,
           revision = revision + 1,
           updated_at = now(),
           updated_by = auth.uid()
     where shared_documents.document_key = p_document_key
       and shared_documents.revision = p_expected_revision
    returning * into saved;
  end if;

  if saved.document_key is null then
    raise exception 'revision_conflict';
  end if;

  return query select saved.document_key, saved.revision, saved.updated_at;
end;
$$;

revoke all on function public.save_shared_document(text,jsonb,bigint) from public;
grant execute on function public.save_shared_document(text,jsonb,bigint) to authenticated;

-- 重要: team_members へのメンバー追加は管理者が Dashboard の SQL Editor から行う。
-- 例: insert into public.team_members(user_id, display_name, role)
--     values ('Auth画面で確認したUUID', '担当者名', 'admin');
