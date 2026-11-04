-- Desde 2026-10-30 Supabase ya no expone automáticamente las tablas nuevas de public a la
-- Data API: sin estos grants, supabase-js recibe "permission denied" aunque RLS lo permita.
-- anon queda sin acceso porque toda la app funciona con sesión iniciada.
grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on
  public.professionals,
  public.oficios,
  public.professional_oficios,
  public.clients,
  public.budgets,
  public.budget_items,
  public.jobs,
  public.job_photos,
  public.budget_pdfs
to authenticated, service_role;

-- Las policies la llaman en cada consulta.
grant execute on function public.current_professional_id() to authenticated, service_role;
