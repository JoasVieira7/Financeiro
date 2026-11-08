# RELATÓRIO DE AUDITORIA TÉCNICA FINAL — ETAPA 13
## AUDITORIA DAS MIGRATIONS, SCHEMA E PREPARAÇÃO PARA DEPLOY NO SUPABASE

**Data:** 31 de Outubro de 2026  
**Projeto:** Financeiro Express (SaaS Financeiro Pessoal)  
**Ambiente:** Pré-Deploy Remoto (Local Workspace Audit)  
**Status de Execução:** Nenhuma SQL foi executada no banco remoto. Auditoria 100% analítica e estática.

---

## A. VEREDITO GERAL

### Status: APROVADO COM RESSALVAS TÉCNICAS ESTRUTURAIS

O conjunto de regras de negócio, integridade relacional, segurança RLS e triggers de enforcement Free/Premium foi projetado com excelência técnica e padrões de maturidade bancária/comercial.

No entanto, a auditoria identificou **3 incoerências críticas de implantação e integração** que causariam falhas se o banco fosse provisionado na sequência atual sem os ajustes prévios:

1. **Inexistência de Migration Baseline:** As migrations na pasta `supabase/migrations/` contêm apenas instruções de alteração incremental (`ALTER TABLE`, triggers específicos). Não existe um arquivo `0000_initial_schema.sql` na pasta de migrations. Executar ferramentas automatizadas de migration (como `supabase db push` ou `supabase migration up`) em um projeto Supabase novo falharia imediatamente na migration `140000` com erro `relation "public.savings_goals" does not exist`.
2. **Conflito de RLS vs Trigger em Despesas Recorrentes (Pós-Downgrade):** O trigger hardened da Etapa 9.2 (`check_recurring_expense_premium`) autoriza legitimamente usuários Free a desativarem suas despesas recorrentes (`NEW.is_active = false`). Todavia, a Policy RLS de UPDATE em `recurring_expenses` possui a cláusula restritiva `AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.plan_tier = 'premium')`. Como consequência direta, o PostgreSQL bloqueia a query no nível do RLS antes mesmo de atingir o trigger, impedindo o usuário Free de desativar assinaturas antigas.
3. **Chamada Redundante de UPDATE no Frontend ao Contribuir em Metas:** No arquivo `FinanceContext.tsx` (linha 878), o cliente web tenta executar diretamente `supabase.from('savings_goals').update({ current_amount })`. Como o banco aplica o princípio do menor privilégio (`Least Privilege`) revogando UPDATE em `current_amount` para a role `authenticated`, o PostgREST retornará erro `403 Forbidden / Permission denied for column current_amount`. A atualização real do saldo já é garantida atomicamente pelo trigger `apply_goal_contribution_trigger` disparado pelo `insert` em `goal_contributions`.

---

## B. AUDITORIA DO SCHEMA BASE (`supabase/schema.sql`)

O arquivo `supabase/schema.sql` (894 linhas) foi analisado integralmente. Trata-se de um schema consolidado e robusto.

### 1. Tabelas, Colunas e Tipagem
* **`public.profiles`**: 12 colunas. Contém chaves essenciais de monetização (`plan_tier`, `subscription_status`, `trial_ends_at`, `current_period_end`). Restrições `CHECK` garantem valores válidos para plano e status. Orçamentos possuem constraints `>= 0`.
* **`public.transactions`**: 17 colunas. Inclui suporte nativo à inteligência de parcelamento (`installment_group_id text`, `installment_number`, `installment_total`, `installment_purchase_amount`) e temporalidade (`purchase_date timestamptz`, `due_date date`, `paid_at timestamptz`, `status text`).
* **`public.savings_goals`**: 10 colunas. Possui `is_completed boolean DEFAULT false`, `target_amount > 0` e `current_amount >= 0`.
* **`public.recurring_expenses`**: 8 colunas. Categorias e métodos de pagamento validados via `CHECK`. Restrição `due_day BETWEEN 1 AND 31`.
* **`public.goal_contributions`**: 7 colunas. Registro histórico de depósitos e resgates com tipo validado (`deposit`, `withdraw`) e `amount > 0`.

### 2. Integridade Referencial e Cascateamento
* Todas as 5 tabelas possuem chave estrangeira explícita referenciando `auth.users(id) ON DELETE CASCADE`.
* `goal_contributions.goal_id` referencia `savings_goals(id) ON DELETE CASCADE`.
* Exclusões de conta no Supabase Auth propagam-se de forma consistente e limpa por toda a árvore relacional.

### 3. Row Level Security (RLS) e Least Privilege
* RLS ativado em 100% das tabelas (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`).
* Acesso anônimo (`anon`) 100% revogado em todas as tabelas e funções.
* **Segurança de Coluna (Column-Level Grants):**
  * Em `profiles`: `authenticated` só pode atualizar `full_name`, `avatar_url`, `monthly_budget` e `weekly_saving_target`. Atualizações em `plan_tier` ou datas de assinatura são rejeitadas em nível de catálogo SQL.
  * Em `savings_goals`: `authenticated` só pode atualizar `title`, `target_amount`, `icon`, `color`, `deadline` e `is_completed`. A coluna `current_amount` está bloqueada para UPDATE do cliente.
  * Em `goal_contributions`: `authenticated` possui apenas `SELECT` e `INSERT`. `UPDATE` e `DELETE` estão revogados, tornando o histórico de depósitos/resgates estritamente imutável (append-only ledger).

### 4. Triggers e Funções de Segurança
* **`protect_profile_plan_fields()`**: Executa como `SECURITY INVOKER`. Valida se `auth.jwt() ->> 'role'` é `authenticated` ou `anon` e aborta com `insufficient_privilege` caso haja tentativa de alterar campos de plano.
* **`initialize_goal_balance()`**: Força `NEW.current_amount := 0.00` em todo INSERT proveniente de cliente, impedindo a criação de metas pré-infladas.
* **`protect_goal_balance()`**: Impede que updates diretos alterem `current_amount`, mas permite quando `pg_trigger_depth() > 1` (disparado pelo trigger de contribuição).
* **`apply_goal_contribution()`**: Executa com `SECURITY DEFINER`. Realiza `SELECT ... FOR UPDATE` na linha da meta, serializando transações concorrentes e impedindo race conditions. Valida saldo suficiente no resgate (`amount <= current_amount`) e rejeita depósitos em metas já concluídas.
* **`handle_new_user()`**: `SECURITY DEFINER` acoplado ao `auth.users`. Provisiona o perfil inicial com plano `'free'`.
* **`delete_user_account()`**: `SECURITY DEFINER`. Valida `auth.uid() IS NOT NULL` e exclui os dados em cascata até remover o usuário em `auth.users`.
* **`check_savings_goal_limit()`**: `SECURITY DEFINER`. Lock pessimista no perfil (`SELECT plan_tier ... FOR UPDATE`), rejeição de metas ativas `> 2` no Free, e bloqueio de `is_completed = true` em metas com saldo zero.
* **`check_recurring_expense_premium()`**: `SECURITY DEFINER`. Restringe criação e reativação ao plano Premium.
* **`admin_set_user_plan()`**: `SECURITY DEFINER`. Restrito exclusivamente à `service_role` ou `postgres`.

---

## C. AUDITORIA DAS MIGRATIONS INDIVIDUAIS

### 1. Migration `20261031140000_security_plan_enforcement.sql`
* **Escopo:** Primeira versão do enforcement de planos (Etapa 9/9.1).
* **Operações:**
  * Adiciona coluna `is_completed` em `savings_goals` caso não exista.
  * Cria índice `idx_savings_goals_active_user`.
  * Cria triggers `protect_profile_plan_fields`, `check_savings_goal_limit` (v1), `check_recurring_expense_premium` (v1) e a RPC `admin_set_user_plan` (v1).
  * Cria policies de RLS para `recurring_expenses`.
* **Avaliação:** Código bem escrito, porém substitui funções que são posteriormente aprimoradas na migration 150000.

### 2. Migration `20261031150000_security_hardening.sql`
* **Escopo:** Hardening residual (Etapa 9.2).
* **Operações:**
  * Atualiza `check_savings_goal_limit` com regra anti-metas fantasmas (`is_completed = true AND current_amount = 0`), forçamento de `auth.uid()` em INSERT e imutabilidade de `user_id` em UPDATE.
  * Atualiza `apply_goal_contribution` com bloqueio de depósitos em metas com 100% concluídas.
  * Atualiza `check_recurring_expense_premium` autorizando desativação legítima (`is_active = false`) no pós-downgrade.
  * Atualiza `admin_set_user_plan` com validação de parâmetros obrigatórios, status aceitos e duração positiva.
* **Avaliação:** Substituições limpas via `CREATE OR REPLACE FUNCTION`. Não deixa resíduos órfãos.

### 3. Migration `20261031160000_installment_intelligence.sql`
* **Escopo:** Inteligência de parcelamentos e ciclo de despesas (Etapa 10).
* **Operações:**
  * Executa `ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS` para `purchase_date`, `due_date`, `paid_at`, `status`.
  * Adiciona constraint `CHECK` para status (`paid`, `pending`, `overdue`).
  * Executa `UPDATE` seguro com `COALESCE` para backfill retroativo de transações normais e parceladas legadas.
  * Cria índices: `idx_transactions_user_due_date`, `idx_transactions_user_status`, `idx_transactions_user_purchase_date`.
* **Avaliação:** Totalmente retrocompatível, idempotente e segura para dados pré-existentes.

---

## D. AUDITORIA DA SEQUÊNCIA DE IMPLANTAÇÃO E DEPENDÊNCIAS

### Cenário 1: Aplicação Direta via Supabase CLI (`supabase db push`) em Banco Limpo
* **Resultado: FALHA IMEDIATA.**
* **Motivo:** O diretório `supabase/migrations/` não possui um arquivo baseline inicial. A primeira migration (`140000`) tenta alterar `public.savings_goals` e criar policies em `public.recurring_expenses`, tabelas que ainda não existem.

### Cenário 2: Aplicação do `schema.sql` seguida das Migrations `140000` -> `150000` -> `160000`
* **Resultado: SUCESSO COM RISCO DE SOBREPOSIÇÃO TRANSITÓRIA.**
* **Motivo:** Se o `schema.sql` for executado primeiro, todas as tabelas são criadas. Em seguida:
  * A migration `140000` rebaixa temporariamente `check_savings_goal_limit` e `check_recurring_expense_premium` para suas versões v1.
  * A migration `150000` imediatamente atualiza as funções para as versões v2 (hardened).
  * A migration `160000` verifica que as colunas já existem e executa o backfill e a criação dos índices.
  * Ao final da cadeia, o banco estará no estado desejado v2, porém com execuções redundantes.

### Auditoria de Idempotência
| Instrução | Idempotente? | Comentário |
| :--- | :---: | :--- |
| `CREATE TABLE IF NOT EXISTS` | Sim | Seguro para re-execuções. |
| `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` | Sim | Não gera erro se a coluna já existir. |
| `CREATE OR REPLACE FUNCTION` | Sim | Substitui a definição sem alterar dependências de trigger. |
| `DROP TRIGGER IF EXISTS ... CREATE TRIGGER` | Sim | Remove antes de recriar, evitando duplicidade. |
| `DROP POLICY IF EXISTS ... CREATE POLICY` | Sim | Idempotente em todas as políticas RLS. |
| `CREATE INDEX IF NOT EXISTS` | Sim | Não duplica índices existentes. |
| `UPDATE ... WHERE ...` (Backfill da 160000) | Sim | Usa `COALESCE`, preservando dados já preenchidos. |

---

## E. AUDITORIA DE COMPATIBILIDADE COM O FRONTEND REAL

Auditamos minuciosamente o código do frontend (`FinanceContext.tsx`, `AuthContext.tsx`, `TransactionsView.tsx`, `CommitmentsView.tsx`, `ReportsView.tsx`):

### 1. Transações e Parcelamentos
* **Compatibilidade: 100% OK.**
* O frontend gera payloads contendo exatamente as colunas suportadas pelo banco: `installment_group_id`, `installment_number`, `installment_total`, `installment_purchase_amount`, `purchase_date`, `due_date`, `paid_at` e `status`.
* As operações de exclusão em massa (`delete().eq('installment_group_id', groupId)`) e edição em massa (`update().eq('installment_group_id', groupId)`) são plenamente autorizadas pela policy `transactions FOR ALL USING (auth.uid() = user_id)`.

### 2. Metas de Economia (Savings Goals)
* **Compatibilidade: Inconsistência identificada na contribuição de metas.**
* No método `contributeToGoal` (`src/context/FinanceContext.tsx`, linha 878):
  ```typescript
  // Chamada 1: Tentativa direta de alterar saldo via UPDATE
  await supabase.from('savings_goals').update({ current_amount: nextAmount }).eq('id', goalId);

  // Chamada 2: Inserção do aporte no histórico imutável
  await supabase.from('goal_contributions').insert([...]);
  ```
* **Impacto:** Como o schema revoga expressamente `UPDATE (current_amount)` do role `authenticated`, a Chamada 1 falhará com erro do Supabase. No entanto, a Chamada 2 é bem-sucedida e o trigger `apply_goal_contribution_trigger` atualiza o `current_amount` com lock e segurança. A Chamada 1 é desnecessária e deve ser removida do frontend.

### 3. Despesas Recorrentes (Recurring Expenses)
* **Compatibilidade: Conflito no ciclo pós-downgrade.**
* O método `toggleRecurringExpense` tenta executar:
  ```typescript
  await supabase.from('recurring_expenses').update({ is_active: nextState }).eq('id', id);
  ```
* Se o usuário foi rebaixado para `free` e deseja pausar sua despesa recorrente (`is_active = false`), o trigger da migration `150000` autoriza a operação. Contudo, a policy RLS de UPDATE na tabela exige `p.plan_tier = 'premium'`, fazendo com que o Supabase filtre a linha e retorne 0 linhas afetadas, impossibilitando a desativação.

### 4. Perfil de Usuário (Profiles)
* **Compatibilidade: 100% OK.**
* O método `updateProfileData` envia estritamente: `full_name`, `avatar_url`, `monthly_budget` e `weekly_saving_target`. Todas essas colunas possuem `GRANT UPDATE` concedido.
* O método `updateProfilePlan` não envia mutações para o banco, apenas sincroniza a leitura via `fetchSupabaseProfile`.
* O método `deleteAccount` invoca a RPC `supabase.rpc('delete_user_account')`, que possui concessão explícita para `authenticated`.

---

## F. AUDITORIA DE SEGURANÇA E ENFORCEMENT DE PLANOS (FREE / PREMIUM)

| Recurso / Regra | Validação no PostgreSQL | Resistência a Manipulação Direta (PostgREST / DevTools) |
| :--- | :---: | :---: |
| **Imutabilidade do Plano** | Dupla camada: Column Grant revogado + Trigger `protect_profile_plan_fields` | **100% Blindado.** Chamadas `PATCH /rest/v1/profiles` com `plan_tier` são rejeitadas imediatamente. |
| **Alteração de Plano** | Restrita à RPC `admin_set_user_plan` acessível exclusivamente pela `service_role` | **100% Blindado.** `authenticated` recebe 403 Forbidden se tentar invocar a RPC. |
| **Limite de Metas (Free: máx 2 ativas)** | Trigger `check_savings_goal_limit` com `SELECT FOR UPDATE` no perfil | **100% Blindado.** Condições de corrida são eliminadas por lock transacional no perfil do usuário. |
| **Metas Fantasmas (Bypass de limite)** | Trigger rejeita `is_completed = true` em metas com saldo zero | **100% Blindado.** Usuário não pode burlar o limite marcando metas vazias como concluídas. |
| **Saldo Inicial Forjado** | Trigger `initialize_goal_balance` força `current_amount := 0.00` | **100% Blindado.** Tentativa de enviar `current_amount: 50000` no INSERT é ignorada e zerada. |
| **Alteração Direta de Saldo de Metas** | Column Grant revogado + Trigger `protect_goal_balance` | **100% Blindado.** Saldo só sobe ou desce via registros em `goal_contributions`. |
| **Despesas Recorrentes (Premium)** | Trigger `check_recurring_expense_premium` bloqueia INSERT no Free | **100% Blindado.** Usuário Free não consegue registrar despesas recorrentes via API. |
| **Isolamento de Tenants (Multi-tenancy)** | RLS em 100% das tabelas com `auth.uid() = user_id` | **100% Blindado.** Usuário A não enxerga nem manipula dados do Usuário B. |

---

## G. RISCOS RESIDUAIS IDENTIFICADOS

1. **Risco de Deploy Quebrado via CLI:** Tentar aplicar o repositório em um Supabase novo sem unificar o baseline fará o processo de deploy automatizado abortar na primeira migration.
2. **Risco de Bloqueio em Pós-Downgrade de Assinaturas:** Usuários antigos que perderem a assinatura Premium ficarão impedidos de desligar a flag `is_active` de suas despesas recorrentes existentes devido ao bloqueio da Policy RLS de UPDATE.
3. **Risco de Alertas de Console / Erro 403 na UI:** A tentativa redundante do frontend de atualizar `current_amount` diretamente em `savings_goals` durante um depósito gerará exceção de permissão no console do navegador.
4. **Índices de Performance Ausentes no `schema.sql`:** Os índices criados na migration `160000` (`idx_transactions_user_due_date`, `idx_transactions_user_status`, `idx_transactions_user_purchase_date`) e na `140000` (`idx_savings_goals_active_user`) não constam no arquivo `supabase/schema.sql`.

---

## H. AJUSTES NECESSÁRIOS ANTES DA EXECUÇÃO REAL

*(Conforme as instruções da Etapa 13, nenhum código foi modificado. Os pontos abaixo devem ser ajustados antes da aplicação definitiva no Supabase remoto):*

### 1. No Banco de Dados (SQL)
* **Ajustar a Policy de UPDATE de `recurring_expenses`:**
  A política deve permitir que o proprietário atualize o registro (`USING (auth.uid() = user_id)`), transferindo a restrição de campos e status exclusivamente para o trigger `check_recurring_expense_premium()`. Isso permitirá que o usuário Free atualize `is_active = false` legitimamente, mantendo o bloqueio de reativação (`is_active = true`) e de alterações de valores no trigger.
* **Unificar o Baseline de Migrations:**
  Criar a migration inicial `supabase/migrations/20261031000000_baseline_schema.sql` contendo o schema base das tabelas, garantindo que o ciclo de migrations do Supabase CLI seja 100% autossuficiente e rastreável.
* **Incluir Índices no Schema Base:**
  Adicionar formalmente os 4 índices de performance em `supabase/schema.sql` para manter paridade absoluta entre o schema consolidado e a pasta de migrations.

### 2. No Frontend (`src/context/FinanceContext.tsx`)
* **Remover o UPDATE direto em `contributeToGoal`:**
  Excluir a linha 878 (`await supabase.from('savings_goals').update({ current_amount: nextAmount }).eq('id', goalId);`). O saldo da meta é atualizado pelo trigger PostgreSQL com garantia ACID e sem disparar erro de permissão.

---

## I. ROTEIRO RECOMENDADO PARA APLICAÇÃO NO SUPABASE

Quando a autorização para aplicação remota for concedida, a execução deve seguir rigorosamente a sequência abaixo:

```
Passo 1: Backup / Snapshot do Supabase Remoto (se houver dados existentes).
Passo 2: Consolidação dos ajustes técnicos apontados na Seção H.
Passo 3: Execução da baseline inicial no Supabase SQL Editor ou via `supabase db push`.
Passo 4: Verificação de tabelas, índices e grants no catálogo `pg_tables` e `information_schema`.
Passo 5: Execução do Roteiro de Testes de Penetração e Validação de Segurança (Seção 7 do schema.sql):
         - Teste 1: Tentativa de UPDATE em plan_tier via token autenticado (deve ser rejeitado).
         - Teste 2: Inserção de meta com current_amount forjado (deve gravar 0.00).
         - Teste 3: Tentativa de aporte com saldo insuficiente em saque (deve abortar).
         - Teste 4: Tentativa de criar 3ª meta ativa no plano Free (deve lançar exceção).
Passo 6: Deploy do build do frontend atualizado e validação funcional ponta a ponta.
```

---

> **Supabase remoto não foi alterado e nenhuma SQL foi executada nesta etapa.**

