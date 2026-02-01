create policy "service role access daily page views"
on public.daily_page_views
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create policy "service role access daily unique page views"
on public.daily_unique_page_views
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
