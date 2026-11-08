-- ==============================================================================
-- Migration: 20261103140000_profile_budget_period_preference.sql
-- Description: Adiciona preferência de período de orçamento/metas (weekly/monthly)
--              na tabela profiles para persistência unificada entre sessões e dispositivos.
-- Safe: Idempotente com IF NOT EXISTS e constraints verificadas.
-- ==============================================================================

DO $$
BEGIN
  -- 1. Adiciona coluna budget_period_preference se não existir
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'budget_period_preference'
  ) THEN
    ALTER TABLE public.profiles
      ADD COLUMN budget_period_preference text NOT NULL DEFAULT 'monthly';
  END IF;

  -- 2. Adiciona constraint CHECK para 'weekly' ou 'monthly'
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_budget_period_preference_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_budget_period_preference_check
      CHECK (budget_period_preference IN ('weekly', 'monthly'));
  END IF;
END $$;

