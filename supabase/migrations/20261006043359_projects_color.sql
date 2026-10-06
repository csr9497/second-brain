-- Color del proyecto: clave de una paleta fija (los hex viven en apps/web/src/index.css).
-- Debe coincidir con `paletteColor` de packages/shared.
alter table public.projects
  add column color text not null default 'azul'
  check (color in ('azul','verde','ambar','rojo','violeta','rosa','cian','gris'));
