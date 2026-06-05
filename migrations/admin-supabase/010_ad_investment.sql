-- 010_ad_investment.sql
-- Campo "Inversión en publicidad" por entorno (clients_config) — base del ROAS de CEFEMEX
-- Casa de Empeño:  ROAS = monto empeñado (Presupuesto Kommo, por fecha) ÷ ad_investment.
-- Lo captura SOLO Intra desde admin.html (pestaña Identidad). El cliente solo VE el ROAS.

alter table public.clients_config
  add column if not exists ad_investment numeric not null default 0;

notify pgrst, 'reload schema';
