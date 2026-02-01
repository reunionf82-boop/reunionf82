create or replace function public.increment_daily_page_view(p_page text, p_day date)
returns integer
language plpgsql
as $$
declare
  new_count integer;
begin
  insert into public.daily_page_views (page, day, view_count)
  values (p_page, p_day, 1)
  on conflict (page, day)
  do update set view_count = public.daily_page_views.view_count + 1
  returning view_count into new_count;

  return new_count;
end;
$$;
