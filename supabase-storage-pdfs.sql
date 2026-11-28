-- 写真PDF共有用の非公開Storageバケット
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('field-pdfs', 'field-pdfs', false, 52428800, array['application/pdf'])
on conflict (id) do update
set public = false,
    file_size_limit = 52428800,
    allowed_mime_types = array['application/pdf'];

drop policy if exists "team members can read field PDFs" on storage.objects;
create policy "team members can read field PDFs"
on storage.objects for select to authenticated
using (
  bucket_id = 'field-pdfs'
  and exists (select 1 from public.team_members m where m.user_id = auth.uid())
);

drop policy if exists "team members can upload field PDFs" on storage.objects;
create policy "team members can upload field PDFs"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'field-pdfs'
  and exists (select 1 from public.team_members m where m.user_id = auth.uid())
);

drop policy if exists "team members can update field PDFs" on storage.objects;
create policy "team members can update field PDFs"
on storage.objects for update to authenticated
using (
  bucket_id = 'field-pdfs'
  and exists (select 1 from public.team_members m where m.user_id = auth.uid())
)
with check (
  bucket_id = 'field-pdfs'
  and exists (select 1 from public.team_members m where m.user_id = auth.uid())
);
