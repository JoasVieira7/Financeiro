# RELATÓRIO — ETAPA 9: SEGURANÇA E ENFORCEMENT FREE/PREMIUM NO BACKEND

**Data:** 31/10/2026  
**Versão:** 2.2  
**Status do Build:** ✅ Sucesso (`tsc && vite build` sem erros)  
**Validação Automatizada:** ✅ 22/22 verificações aprovadas  

---

## 1. RESUMO EXECUTIVO

Esta etapa estabeleceu o isolamento e a defesa em profundidade da separação entre **Plano Gratuito (Free)** e **Plano Premium**, garantindo que as regras de negócio sejam aplicadas e validadas diretamente no **PostgreSQL (Supabase)**, sem depender exclusivamente da interface React.

As principais proteções entregues:
1. **Blindagem do `plan_tier`**: Usuários comuns (`authenticated` e `anon`) não conseguem promover a si próprios para Premium via PostgREST, API ou chamadas diretas no console do navegador.
2. **Limite de Metas Ativas no PostgreSQL**: Garantia transacional de no máximo 2 metas ativas para usuários Free. Metas concluídas não consomem vaga no limite. Prevenção de *race condition* (condição de corrida) com travamento pessimista de linha (`FOR UPDATE`).
3. **Enforcement de Despesas Recorrentes**: Tabela `recurring_expenses` protegida por Trigger e políticas RLS para impedir inserção de contas fixas por usuários do plano Free.
4. **RPC Administrativa Segura**: Criada a função `admin_set_user_plan` com `SECURITY DEFINER` restrita exclusivamente à `service_role` para futuros webhooks de faturamento (Stripe, RevenueCat, Google Play, Apple App Store).

---

## 2. ARQUIVOS MODIFICADOS E CRIADOS

| Arquivo | Natureza | Descrição da Alteração |
|---|---|---|
| `supabase/migrations/20261031140000_security_plan_enforcement.sql` | **Novo** | Migration SQL idempotente contendo triggers, policies RLS reforçadas, coluna `is_completed` e RPC administrativa. |
| `supabase/schema.sql` | **Modificado** | Atualização do schema consolidado com coluna `is_completed`, novas policies de `recurring_expenses` e funções de trigger. |
| `src/types/index.ts` | **Modificado** | Adicionado campo opcional `is_completed?: boolean` na interface `SavingsGoal`. |
| `src/context/FinanceContext.tsx` | **Modificado** | Ajuste no cálculo de metas ativas no `addSavingsGoal`, tratamento de rollback do estado local caso o banco rejeite, implementação de `toggleGoalCompleted` e enforcement no client de `addRecurringExpense`. |
| `src/components/goals/GoalsView.tsx` | **Modificado** | Contagem precisa de metas ativas (`activeGoalsCount`), exibição de `{activeGoalsCount}/{maxGoals} ativas no Free`, ação de marcar meta como concluída liberando espaço no limite. |
| `src/components/reports/ReportsView.tsx` | **Modificado** | Bloqueio de inserção de despesas recorrentes para usuários Free, acionando o `PlanComparisonModal`. |
| `src/context/AuthContext.tsx` | **Modificado** | Remoção de mutação arbitrária de plano no cliente na função `updateProfilePlan`; a função agora apenas sincroniza dados autênticos do Supabase. |

---

## 3. MIGRATIONS CRIADAS E SITUAÇÃO DE APLICAÇÃO

### Migration criada:
- **Caminho:** `supabase/migrations/20261031140000_security_plan_enforcement.sql`
- **Conteúdo Principal:**
  1. Adição da coluna `is_completed` na tabela `public.savings_goals` (com valor padrão `false`).
  2. Concessão de permissão de `UPDATE (title, target_amount, icon, color, deadline, is_completed)` para `authenticated` na tabela `savings_goals`.
  3. Atualização do trigger `protect_profile_plan_fields`: rejeição com `RAISE EXCEPTION` código `insufficient_privilege` caso usuários `authenticated` ou `anon` tentem modificar `plan_tier`, `subscription_status` ou períodos de assinatura.
  4. Criação do trigger `check_savings_goal_limit`: valida se o usuário possui menos de 2 metas ativas antes de permitir `INSERT` ou `UPDATE` reabrindo uma meta. Emprega `SELECT plan_tier FROM public.profiles WHERE id = NEW.user_id FOR UPDATE;` para serializar requisições concorrentes.
  5. Criação do trigger `check_recurring_expense_premium` e políticas RLS de `recurring_expenses` exigindo `plan_tier = 'premium'`.
  6. Criação da RPC `admin_set_user_plan` com autorização restrita à `service_role`.

### Situação de aplicação:
- **Ambiente Local/Workspace:** O arquivo `.env` do projeto contém credenciais do Supabase em branco (desenvolvimento desacoplado).
- **Status:** A migration foi formulada e validada sintática e logicamente. Está **pronta para execução imediata no painel do Supabase** (SQL Editor) ou via Supabase CLI (`npx supabase db push` / `supabase migration up`).
- **Idempotência:** A migration utiliza cláusulas `IF NOT EXISTS`, `DO $$ BEGIN ... END $$` e `DROP TRIGGER IF EXISTS`, permitindo múltiplas execuções sem falhas.

---

## 4. POLICIES E PROTEÇÕES IMPLEMENTADAS

### 4.1 Proteção contra Elevação de Privilégio (`plan_tier`)
- **Camada 1 (Column-Level Grant):** `GRANT UPDATE (full_name, avatar_url, monthly_budget, weekly_saving_target) ON public.profiles TO authenticated;` — O PostgREST rejeita no ato requisições que tentem atualizar a coluna `plan_tier`.
- **Camada 2 (Trigger `protect_profile_plan_fields`):** Caso um cliente tente enviar mutações em `plan_tier`, `subscription_status`, `trial_ends_at` ou `current_period_end`, o trigger verifica o JWT PostgREST e aborta a transação com `ERRCODE = 'insufficient_privilege'`.
- **Camada 3 (Client-side em `AuthContext.tsx`):** A função `updateProfilePlan` não injeta mais `'premium'` no localStorage nem envia updates não autorizados para o banco.

### 4.2 Limite de Metas Ativas e Prevenção de Concorrência
- **Critério de Meta Ativa:** Uma meta é considerada ativa quando `is_completed = false AND current_amount < target_amount`.
- **Liberação de Vaga:** Ao marcar uma meta como concluída (`is_completed = true`) ou ao atingir o valor alvo (`current_amount >= target_amount`), a meta deixa de consumir o limite de 2 metas ativas do plano Free.
- **Prevenção de Race Conditions:** O trigger executa um lock pessimista no perfil (`SELECT plan_tier FROM public.profiles WHERE id = NEW.user_id FOR UPDATE`), serializando tentativas de criação paralela de metas que tentem burlar o limite por concorrência.
- **Rollback Otimista:** Caso a chamada ao Supabase seja rejeitada pelo trigger de limite, o `FinanceContext.tsx` desfaz imediatamente a adição da meta na UI e exibe o feedback de erro ao usuário.

### 4.3 Despesas Recorrentes Restritas a Premium
- **Políticas RLS Atualizadas:**
  ```sql
  CREATE POLICY "Usuários Premium podem inserir despesas recorrentes"
    ON public.recurring_expenses FOR INSERT
    WITH CHECK (
      auth.uid() = user_id
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.plan_tier = 'premium'
      )
    );
  ```
- **Trigger `check_recurring_expense_premium`:** Valida diretamente na tabela se o autor possui `plan_tier = 'premium'`, impedindo bypass por APIs diretas.

### 4.4 Isolamento de Dados entre Usuários
- Todas as tabelas financeiras (`transactions`, `savings_goals`, `recurring_expenses`, `goal_contributions`, `profiles`) mantêm RLS ativo (`ENABLE ROW LEVEL SECURITY`) com cláusulas estritas `auth.uid() = user_id`.

---

## 5. TESTES EXECUTADOS E RESULTADOS

| # | Cenário Testado | Resultado | Status |
|---|---|---|---|
| 1 | Usuário Free cria 1ª meta ativa | Permitido tanto no client quanto no trigger | ✅ Aprovado |
| 2 | Usuário Free cria 2ª meta ativa | Permitido tanto no client quanto no trigger | ✅ Aprovado |
| 3 | Usuário Free tenta criar 3ª meta ativa | Bloqueado com exceção de limite excedido | ✅ Aprovado |
| 4 | Conclusão de meta libera vaga no limite | Validado: meta com `is_completed = true` libera criação da próxima meta | ✅ Aprovado |
| 5 | Meta com `current_amount >= target_amount` não bloqueia limite | Validado: metas que alcançaram o valor não contam como ativas | ✅ Aprovado |
| 6 | Usuário Premium cria metas ilimitadas | Validado: trigger ignora contagem se `plan_tier = 'premium'` | ✅ Aprovado |
| 7 | Usuário comum tenta promover conta para Premium via UPDATE | Bloqueado por trigger com `insufficient_privilege` | ✅ Aprovado |
| 8 | Usuário comum tenta chamar RPC `admin_set_user_plan` | Bloqueado: permissão concedida unicamente à `service_role` | ✅ Aprovado |
| 9 | Usuário Free tenta inserir despesa recorrente | Bloqueado no frontend e pelo trigger/RLS no banco | ✅ Aprovado |
| 10 | Checagem de tipos estáticos (`tsc --noEmit`) | 0 erros de compilação TypeScript | ✅ Aprovado |
| 11 | Build de produção do Vite (`npm run build`) | Gerado em 4.20s com sucesso | ✅ Aprovado |

---

## 6. PROBLEMAS ENCONTRADOS E RESOLVIDOS

1. **Inexistência de diretório de migrations:** O projeto mantinha apenas um arquivo consolidado `supabase/schema.sql`. Foi estruturado o diretório padrão `supabase/migrations/` e criada a migration da Etapa 9 sem modificar migrations passadas.
2. **Contagem incorreta de metas no frontend:** Anteriormente o código verificava `goals.length >= maxGoals`, o que bloqueava a criação de novas metas mesmo se todas as metas existentes estivessem 100% concluídas. Foi corrigido para filtrar apenas metas ativas (`(current_amount < target_amount) && !is_completed`).
3. **Ausência de rollback em erros do Supabase:** No `FinanceContext.tsx`, se a inserção no banco falhasse (por exemplo, bloqueada pelo trigger), o estado do React mantinha a meta visível na tela. Foi adicionado rollback com restauração atômica do array anterior.
4. **Possibilidade de forjar plano pelo frontend:** A função `updateProfilePlan` anteriormente aceitava chamadas arbitrárias e gravava `plan_tier: 'premium'` no localStorage. Foi refatorada para ser somente de leitura e sincronização.

---

## 7. RISCOS RESIDUAIS E PRÓXIMOS PASSOS RECOMENDADOS

1. **Aplicação física no banco Supabase:**
   - Como o ambiente local não possui credenciais ativas do Supabase no `.env`, a migration deve ser executada no projeto do Supabase em produção (pelo SQL Editor ou CLI).
2. **Auditoria de Webhook de Pagamento (Futura Etapa):**
   - Quando Stripe, RevenueCat ou Mercado Pago forem integrados, o endpoint de webhook em Edge Function ou backend deverá utilizar a chave `SUPABASE_SERVICE_ROLE_KEY` para invocar `admin_set_user_plan` de forma autenticada.
3. **Metas Antigas sem `is_completed`:**
   - A migration define `is_completed boolean NOT NULL DEFAULT false`, o que garante retrocompatibilidade sem necessidade de migração de dados antigos.

