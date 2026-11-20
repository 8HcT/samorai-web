-- ============================================================
-- Etiquetas de producto editables desde /admin/precios
--
-- Una etiqueta opcional por acabado («Nuevo», «Últimas unidades»…) que se
-- muestra en la esquina de la foto, en el listado y en la ficha. Sin fila =
-- sin etiqueta. La etiqueta de las promociones («Black Friday −20%») es
-- aparte y automática (tabla promotions).
--
-- Solo el servidor (service_role) lee y escribe: RLS activada sin
-- políticas, igual que product_prices y promotions.
-- ============================================================

create table if not exists public.product_labels (
  product_slug  text not null check (product_slug ~ '^[a-z0-9-]{1,80}$'),
  finish_id     text not null check (finish_id ~ '^[a-z0-9-]{1,80}$'),
  label         text not null check (char_length(btrim(label)) between 1 and 24),
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  primary key (product_slug, finish_id)
);

alter table public.product_labels enable row level security;
revoke all on table public.product_labels from anon, authenticated;
