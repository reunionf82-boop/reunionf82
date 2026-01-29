create policy "service role access daily unique content views"
on public.daily_unique_content_views
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
