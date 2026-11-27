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

-- 共有データの書き込みは revision 検証付きRPCだけに限定する。
drop policy if exists "team members can insert shared documents" on public.shared_documents;
drop policy if exists "team members can update shared documents" on public.shared_documents;
revoke all on public.team_members from anon, authenticated;
grant select on public.team_members to authenticated;
revoke all on public.shared_documents from anon, authenticated;
grant select on public.shared_documents to authenticated;

-- revision を比較してから保存。別端末が先に更新した場合は上書きせず競合として返す。
-- SECURITY DEFINER はテーブルへの直接書き込み権限を利用者に与えずにRPC内で検証・保存するため。
create or replace function public.save_shared_document(
  p_document_key text,
  p_payload jsonb,
  p_expected_revision bigint
)
returns table(document_key text, revision bigint, updated_at timestamptz)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  saved public.shared_documents%rowtype;
  caller_id uuid := auth.uid();
begin
  if caller_id is null or not exists (
    select 1 from public.team_members where user_id = caller_id
  ) then
    raise exception 'not_a_team_member';
  end if;
  if p_document_key not in ('field_data','invoice_data') then
    raise exception 'invalid_document_key';
  end if;
  if p_payload is null then
    raise exception 'payload_required';
  end if;

  if p_expected_revision = 0 then
    insert into public.shared_documents(document_key, payload, revision, updated_at, updated_by)
    values (p_document_key, p_payload, 1, now(), caller_id)
    on conflict (document_key) do nothing
    returning * into saved;
  elsif p_expected_revision > 0 then
    update public.shared_documents
       set payload = p_payload,
           revision = revision + 1,
           updated_at = now(),
           updated_by = caller_id
     where shared_documents.document_key = p_document_key
       and shared_documents.revision = p_expected_revision
    returning * into saved;
  else
    raise exception 'invalid_expected_revision';
  end if;

  if saved.document_key is null then
    raise exception 'revision_conflict';
  end if;

  return query select saved.document_key, saved.revision, saved.updated_at;
end;
$$;

revoke all on function public.save_shared_document(text,jsonb,bigint) from public, anon;
grant execute on function public.save_shared_document(text,jsonb,bigint) to authenticated;

-- 重要: team_members へのメンバー追加は管理者が Dashboard の SQL Editor から行う。
-- 例: insert into public.team_members(user_id, display_name, role)
--     values ('Auth画面で確認したUUID', '担当者名', 'admin');
