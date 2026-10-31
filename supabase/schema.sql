-- ==============================================================================
-- SCHEMA SUPABASE - FINANCEIRO EXPRESS SAAS (COMMERCIAL STORE-READY)
-- Políticas de Row Level Security (RLS) Ativas em 100% das Tabelas
-- ==============================================================================

-- Habilita extensão de UUID caso necessário
create extension if not exists "pgcrypto";

-- 1. Tabela de Perfis de Usuário
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  full_name text,
  avatar_url text,
  plan_tier text not null default 'free' check (plan_tier in ('free', 'premium')),
  subscription_status text not null default 'inactive' check (subscription_status in ('active', 'trialing', 'past_due', 'canceled', 'inactive')),
  trial_ends_at timestamp with time zone,
  current_period_end timestamp with time zone,
  monthly_budget numeric(12,2) not null default 3500.00,
  weekly_saving_target numeric(12,2) not null default 250.00,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Tabela de Transações (Receitas e Despesas Comerciais)
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  type text not null check (type in ('expense', 'income')),
  category text not null check (category in (
    'Alimentação', 'Transporte', 'Moradia', 'Contas', 'Saúde', 'Lazer', 'Compras', 'Salário', 'Outros'
  )),
  payment_method text not null default 'pix' check (payment_method in (
    'pix', 'cartao_credito', 'cartao_debito', 'dinheiro', 'ted', 'outros'
  )),
  is_recurring boolean default false,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Tabela de Metas de Economia
create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  target_amount numeric(12,2) not null check (target_amount > 0),
  current_amount numeric(12,2) default 0.00 not null check (current_amount >= 0),
  icon text default 'target',
  color text default 'emerald',
  deadline date,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Tabela de Despesas Recorrentes (Assinaturas, Aluguel, Planos Fixos)
create table if not exists public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  category text not null check (category in (
    'Alimentação', 'Transporte', 'Moradia', 'Contas', 'Saúde', 'Lazer', 'Compras', 'Salário', 'Outros'
  )),
  payment_method text not null default 'cartao_credito' check (payment_method in (
    'pix', 'cartao_credito', 'cartao_debito', 'dinheiro', 'ted', 'outros'
  )),
  due_day integer not null check (due_day between 1 and 31),
  is_active boolean default true not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. Tabela de Contribuições e Resgates de Metas
create table if not exists public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid references public.savings_goals(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  amount numeric(12,2) not null check (amount > 0),
  type text not null check (type in ('deposit', 'withdraw')),
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) - ISOLAMENTO ESTRITO POR USUÁRIO
-- ==============================================================================
alter table public.profiles enable row level security;
alter table public.transactions enable row level security;
alter table public.savings_goals enable row level security;
alter table public.recurring_expenses enable row level security;
alter table public.goal_contributions enable row level security;

-- Políticas de Segurança: Profiles
create policy "Usuários podem ver apenas o próprio perfil"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Usuários podem atualizar apenas o próprio perfil"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Usuários podem excluir o próprio perfil"
  on public.profiles for delete
  using (auth.uid() = id);

create policy "Inserção de perfil permitida apenas para o próprio usuário autenticado"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Políticas de Segurança: Transactions
create policy "Usuários gerenciam exclusivamente suas próprias transações"
  on public.transactions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Políticas de Segurança: Savings Goals
create policy "Usuários gerenciam exclusivamente suas próprias metas"
  on public.savings_goals for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Políticas de Segurança: Recurring Expenses
create policy "Usuários gerenciam exclusivamente suas despesas recorrentes"
  on public.recurring_expenses for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Políticas de Segurança: Goal Contributions
create policy "Usuários gerenciam exclusivamente suas contribuições de metas"
  on public.goal_contributions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ==============================================================================
-- ÍNDICES DE PERFORMANCE DE ALTA VELOCIDADE
-- ==============================================================================
create index if not exists idx_transactions_user_date on public.transactions (user_id, created_at desc);
create index if not exists idx_transactions_user_category on public.transactions (user_id, category);
create index if not exists idx_savings_goals_user on public.savings_goals (user_id);
create index if not exists idx_recurring_user on public.recurring_expenses (user_id);
create index if not exists idx_goal_contributions_goal on public.goal_contributions (goal_id, user_id);

-- ==============================================================================
-- TRIGGER AUTOMÁTICO DE CRIAÇÃO DE PERFIL AO CADASTRAR NO AUTH
-- ==============================================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (
    id,
    email,
    full_name,
    plan_tier,
    subscription_status,
    monthly_budget,
    weekly_saving_target
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'free',
    'trialing',
    3500.00,
    250.00
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

-- Registra gatilho em auth.users
create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ==============================================================================
-- FUNÇÃO RPC PARA EXCLUSÃO COMPLETA DE CONTA (CONFORMIDADE LOJAS DE APPS)
-- ==============================================================================
create or replace function public.delete_user_account()
returns void as $$
begin
  -- Exclui o perfil do usuário logado (o trigger de cascade limpa auth e tabelas filhas)
  delete from public.profiles where id = auth.uid();
  delete from auth.users where id = auth.uid();
end;
$$ language plpgsql security definer;
