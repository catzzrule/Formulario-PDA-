-- ============================================================================
-- Schema do Sistema PDA (Plano de Dados Abertos) - MESP
-- Rode este script inteiro em: Supabase -> SQL Editor -> New query -> Run
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. Perfis (perfil master = CGTI, perfil normal = área)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'normal' check (role in ('master', 'normal')),
  area text,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists must_change_password boolean not null default false;

alter table public.profiles enable row level security;

-- Função auxiliar (security definer) para checar se o usuário logado é master,
-- sem causar recursão nas políticas de RLS da própria tabela profiles.
create or replace function public.is_master()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'master'
  );
$$;

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (auth.uid() = id or public.is_master());

-- ----------------------------------------------------------------------------
-- 2. Gatilho: ao criar um usuário no Auth, copia a área dos metadados.
--    IMPORTANTE: o "role" NUNCA é lido dos metadados aqui — sempre entra como
--    'normal'. Isso impede que alguém se autopromova a "master" chamando a
--    API pública de cadastro (auth.signUp) com {"role":"master"} nos metadados.
--    Uma conta só vira master por ação manual da CGTI (UPDATE nesta tabela).
--    Toda conta nova já nasce com must_change_password = true, pois foi
--    criada pela CGTI com uma senha provisória.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role, area, must_change_password)
  values (
    new.id,
    new.email,
    'normal',
    new.raw_user_meta_data ->> 'area',
    true
  )
  on conflict (id) do update set
    email = excluded.email,
    area = excluded.area;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Cada usuário só pode alterar a própria flag "must_change_password" (depois
-- de trocar a senha) — nunca o próprio role, area ou email. A restrição de
-- coluna abaixo garante isso mesmo que a política de RLS libere a linha.
revoke update on public.profiles from authenticated;
grant update (must_change_password) on public.profiles to authenticated;

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- ----------------------------------------------------------------------------
-- 3. Respostas enviadas pelas áreas
-- ----------------------------------------------------------------------------
create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  area text,
  data jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.submissions enable row level security;

drop policy if exists "submissions_insert_own" on public.submissions;
create policy "submissions_insert_own" on public.submissions
  for insert with check (auth.uid() = user_id);

drop policy if exists "submissions_select" on public.submissions;
create policy "submissions_select" on public.submissions
  for select using (auth.uid() = user_id or public.is_master());

drop policy if exists "submissions_delete_master" on public.submissions;
create policy "submissions_delete_master" on public.submissions
  for delete using (public.is_master());

-- ----------------------------------------------------------------------------
-- 4. Armazenamento de arquivos (recurso + dicionário de dados anexados)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('pda-arquivos', 'pda-arquivos', false)
on conflict (id) do nothing;

drop policy if exists "pda_arquivos_insert_own" on storage.objects;
create policy "pda_arquivos_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'pda-arquivos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "pda_arquivos_select" on storage.objects;
create policy "pda_arquivos_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'pda-arquivos'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_master())
  );

-- ============================================================================
-- Cadastro de usuários:
--
-- Áreas (perfil normal): use o botão "Cadastrar Área" no Painel Admin (dentro
-- do próprio site), ou cadastre manualmente em Supabase -> Authentication ->
-- Users -> Add user (marcando "Auto Confirm User"; o campo "area" pode ser
-- preenchido em User Metadata como { "area": "Nome da Área" } — opcional).
-- Toda conta nova entra automaticamente como perfil "normal".
--
-- CGTI (perfil master): não existe cadastro por metadata, por segurança.
-- Crie a conta normalmente (dashboard ou botão do painel) e depois promova
-- rodando no SQL Editor:
--   update public.profiles set role = 'master', area = 'CGTI' where id = 'UUID-DO-USUARIO';
--
-- Senha provisória: toda conta nova entra com must_change_password = true,
-- então a pessoa é obrigada a definir sua própria senha no primeiro login
-- (o site cuida disso automaticamente). Se quiser isentar alguém dessa
-- exigência (ex.: sua própria conta master já em uso), rode:
--   update public.profiles set must_change_password = false where id = 'UUID-DO-USUARIO';
-- ============================================================================
