# RELATÓRIO DA ETAPA 11 — AUDITORIA FUNCIONAL COMPLETA ANTES DA APLICAÇÃO DO SUPABASE

**Data:** 31 de outubro de 2026  
**Responsável:** Engenheiro Sênior Especializado em PostgreSQL, Supabase e React/TypeScript  
**Status da Auditoria:** AUDITORIA CONCLUÍDA (Leitura estática de 100% da base e verificação de build)  

---

> [!IMPORTANT]
> **DECLARAÇÃO DE ESTADO DO BANCO REMOTO:**  
> **Nenhuma migration foi aplicada ao Supabase remoto nesta etapa.**  
> O banco remoto continua em seu estado anterior não atualizado. O presente documento audita se o código e os scripts SQL estão estruturados de forma coerente para quando a aplicação remota for autorizada e executada.

---

## A. RESUMO EXECUTIVO POR ÁREA

| Área do Sistema | Status | Resumo da Avaliação |
|---|:---:|---|
| **Lógica de Parcelamento (Etapa 10)** | ✅ OK | Modelagem com `due_date`, `purchase_date`, `paid_at`, `status` integrada e consistente em todos os pontos críticos. |
| **Atividade Recente (Home)** | ✅ OK | Consolidação inteligente ativa. Compras parceladas em até 12x aparecem uma única vez, liberando o feed. |
| **Compromissos Futuros (12 meses)** | ✅ OK | Projeção mensal e totalizadores independentes funcionando sem duplicação de saldo. |
| **Fluxo Financeiro (Pagas vs Previstas)** | ✅ OK | Despesas pagas separadas das previstas a vencer no mês; saldo do orçamento devidamente protegido. |
| **Nomenclatura Profissional** | ✅ OK | "Registrar Pix" e "Registrar entrada" erradicados dos fluxos principais. Pix posicionado como meio de pagamento. |
| **Integridade de Metas & Limites Free** | ✅ OK | Frontend valida 2 metas ativas no plano Free; backend possui triggers prontas nas migrations. |
| **Relatórios e Fechamento (`ReportsView`)** | ⚠️ Atenção | O botão "Mês Anterior" altera o estado do filtro, mas a tela continua consumindo os dados do mês atual (`stats.monthlyIncome`/`monthlyExpense`). |
| **Indicador Semanal (`WeeklyGoalCard`)** | ⚠️ Atenção | Uso de operador `||` em vez de `??` causa exibição de R$ 450 e 75% quando a economia semanal real for R$ 0,00. |
| **Dispositivos Móveis (Safari/iOS)** | ⚠️ Atenção | Inputs secundários com `text-xs` (12px) podem acionar auto-zoom indesejado no Safari/iPhone (recomendado `text-base` / 16px). |
| **Migrations Incrementais vs Banco Limpo** | ❌ Problema | As 3 migrations existentes são estritamente **incrementais**. Se rodadas num Supabase zerado sem antes executar `schema.sql`, falharão por ausência de tabelas base. |
| **Compatibilidade Frontend com Supabase Atual** | ❌ Problema | O código atual já envia `due_date`, `purchase_date`, `paid_at`, `status`. Conectar agora ao Supabase remoto (sem rodar as migrations) causará erro de coluna inexistente no PostgREST (`PGRST204`). |

---

## B. FLUXO FINANCEIRO COMPLETO

1. **Dashboard & Saldo (`BalanceOverview.tsx` e `FinanceContext.tsx`):**
   - O saldo disponível agora é calculado com base nas despesas efetivamente pagas e previne estouro orçamentário somando as parcelas previstas que vencerão até o final do mês.
   - O gasto diário permitido (`dailyAllowance`) divide o saldo real pelos dias restantes sem distorções.

2. **Receitas e Despesas Avulsas:**
   - Compras à vista e receitas normais recebem `status = 'paid'`, `purchase_date = now()`, `due_date = today` e `paid_at = now()`.

3. **Histórico Financeiro (`TransactionsView.tsx`):**
   - Filtro "Este Mês": agora avalia `getTransactionDueDate(tx)` para transações parceladas. Uma parcela com vencimento em Dezembro não aparece incorretamente em Outubro só porque a compra foi feita em Outubro.
   - Seletor de visão entre "Histórico Financeiro" e "Compromissos Futuros" permite alternar a visualização sem recarregar o estado.

4. **Exportação CSV:**
   - O gerador de CSV em `TransactionsView.tsx` foi atualizado para incluir as novas dimensões contábeis: `Data da Compra`, `Vencimento`, `Data de Pagamento` e `Situação` (`Paga`, `Pendente`, `Vencida`).

---

## C. PARCELAMENTOS (AUDITORIA DA ETAPA 10 NO FRONTEND)

- **Unicidade na Atividade Recente:** Uma compra parcelada em 12x gera 12 registros de controle no banco/contexto, mas o hook `useMemo` em `RecentTransactions.tsx` agrupa pelo `installment_group_id`. O feed exibe **apenas uma linha** da compra com o badge `12x de R$ 100,00` e progresso `1/12 pagas`.
- **Acesso Individual:** Ao clicar na compra na Atividade Recente ou no Histórico, abre o modal `InstallmentDetailModal.tsx`, permitindo ver as 12 parcelas, seus vencimentos e alterar o status individualmente.
- **Pertença Temporal:** Cada parcela tem seu próprio `due_date` calculado preservando o dia de vencimento (e ajustando meses curtos).
- **Não Duplicação:** Em nenhum momento o valor total da compra (ex: R$ 1.200,00) é somado como gasto do mês junto com a parcela (R$ 100,00). O total é exibido estritamente como metadado informativo.
- **Independência de Pagamento:** Ao marcar a parcela 2 como "Paga", apenas o seu `status` e `paid_at` são alterados. As parcelas 3 a 12 continuam pendentes.
- **Exclusão Segura:** Ao excluir uma transação de compra parcelada, o usuário recebe confirmação com 2 botões explícitos: excluir apenas a parcela selecionada ou todas as parcelas do grupo.

---

## D. FREE VS PREMIUM: FRONTEND VS BACKEND

| Recurso | Proteção no Frontend Atual | Proteção no Backend Remoto (Supabase) | Dependência para Produção |
|---|---|---|---|
| **Limite de Metas (Max 2 no Free)** | Bloqueia tentativa de criar 3ª meta ativa via formulário (`GoalsView.tsx` e `FinanceContext.tsx`). | **INEXISTENTE NO MOMENTO** (migration `140000`/`150000` ainda não foi aplicada remotamente). | Chamadas diretas à API PostgREST por usuário Free podem criar metas ilimitadas até a migration ser rodada. |
| **Despesas Recorrentes (Exclusivo Premium)** | Bloqueia abertura de formulário e rejeita inserção no `FinanceContext.tsx`. | **INEXISTENTE NO MOMENTO** (policies e trigger de bloqueio aguardando aplicação da migration `140000`/`150000`). | Usuário Free com token JWT conseguiria fazer POST em `/rest/v1/recurring_expenses` até aplicação das policies. |
| **Exportação CSV & Relatórios Avançados** | Bloqueado na interface com abertura de `PlanComparisonModal`. | Natureza exclusivamente frontend (o CSV é gerado client-side a partir do array de transações). | Proteção suficiente para o objetivo atual (recurso de apresentação). |
| **Alteração de `plan_tier`** | Função `updateProfilePlan` neutra no client (não grava no Supabase). | **INEXISTENTE NO MOMENTO** (a trigger `protect_profile_plan_fields` está na migration `140000` aguardando aplicação). | Se um usuário autenticado fizer PATCH em `/rest/v1/profiles` com `{"plan_tier": "premium"}`, o banco remoto aceitará até a trigger ser aplicada. |

---

## E. AUDITORIA DAS MIGRATIONS E ORDEM DE EXECUÇÃO

Foram auditados os 3 arquivos presentes em `supabase/migrations/`:
1. `20261031140000_security_plan_enforcement.sql`
2. `20261031150000_security_hardening.sql`
3. `20261031160000_installment_intelligence.sql`

### Análise de Dependências e Conflitos:
- **Dependência de Schema Prévio:**  
  Nenhuma das 3 migrations contém comandos de `CREATE TABLE` para as tabelas principais (`profiles`, `transactions`, `savings_goals`, `recurring_expenses`). Todas usam `ALTER TABLE ... ADD COLUMN`, `CREATE TRIGGER ... ON ...` e `CREATE POLICY ... ON ...`.  
  **Impacto:** Elas pressupõem que as tabelas já foram criadas pelo script base `supabase/schema.sql`.
- **Compatibilidade entre Migrations:**
  - A migration `150000` sobrescreve de forma incremental e consciente as funções `check_savings_goal_limit()`, `check_recurring_expense_premium()` e `admin_set_user_plan()` criadas na `140000`, adicionando verificações mais estritas (`auth.uid() IS NULL` e imutabilidade de `user_id`). Não há conflito; é uma substituição segura via `CREATE OR REPLACE FUNCTION`.
  - A migration `160000` adiciona colunas à tabela `transactions` e índices de performance sem tocar nas triggers de metas ou perfis das migrations anteriores. Totalmente compatível.
- **Ordem de Execução Estrita:**
  1. `supabase/schema.sql` (criação das tabelas base e RLS básico)
  2. `20261031140000_security_plan_enforcement.sql` (enforcement inicial)
  3. `20261031150000_security_hardening.sql` (reforço de segurança e identidade)
  4. `20261031160000_installment_intelligence.sql` (inteligência de parcelamento)

---

## F. AUDITORIA DE COMPATIBILIDADE COM BANCO LIMPO

Caso um novo projeto Supabase seja criado e inicializado do zero, os seguintes pontos foram identificados:

1. **Tentativa de executar apenas a pasta `migrations/` sem `schema.sql`:**
   - ❌ Falhará na linha 28 da migration `140000` com erro: `relation "public.savings_goals" does not exist`.
   - **Solução Recomendada:** Executar o `schema.sql` primeiro, ou gerar uma migration inicial `20261031130000_initial_schema.sql` contendo o DDL base.

2. **Garantia de Tipos e Roles:**
   - As funções com `SECURITY DEFINER` nas migrations `140000` e `150000` especificam corretamente `SET search_path = public, pg_temp;`, eliminando vulnerabilidades de injeção de search path no PostgreSQL.
   - A permissão da RPC `admin_set_user_plan` é revogada de `PUBLIC`, `anon` e `authenticated`, sendo concedida exclusivamente a `service_role`. Isso impede que qualquer cliente autenticado execute a função via RPC.

3. **Constraints de Integridade:**
   - `transactions_status_check` (`paid`, `pending`, `overdue`) é seguro e idempotente (envolto em bloco `DO $$` para não gerar erro caso já exista).

---

## G. PROBLEMAS E INCONSISTÊNCIAS ENCONTRADOS

| # | Arquivo | Função / Componente | Descrição do Problema | Impacto | Prioridade | Recomendação |
|:---:|---|---|---|---|:---:|---|
| **1** | `src/context/FinanceContext.tsx` | `addTransaction` e `addInstallmentExpense` | O frontend já envia `purchase_date`, `due_date`, `paid_at` e `status` no payload do `insert` do Supabase. Como a migration 10 ainda não foi rodada no banco remoto, qualquer inserção em modo real falhará com erro `PGRST204` (coluna inexistente). | Bloqueante para o modo Supabase real enquanto a migration não for aplicada. | **Alta** | Aplicar a migration `160000` no Supabase antes de conectar o frontend com as chaves reais. |
| **2** | `src/components/reports/ReportsView.tsx` | Linhas 24, 71-91 e 101-125 | O seletor "Este Mês / Mês Anterior" altera o estado `period`, mas os cards de Receitas e Despesas consomem fixamente `stats.monthlyIncome` e `stats.monthlyExpense`. Ao clicar em "Mês Anterior", os números exibidos não mudam. | Visual / Funcional (relatório não reflete o mês anterior selecionado). | **Média** | Conectar `period === 'previous'` com `stats.previousMonthExpense` e adicionar cálculo de receitas do mês anterior. |
| **3** | `src/components/home/WeeklyGoalCard.tsx` | Linha 15: `const currentSaved = stats.weeklySavedAmount \|\| 450;` | Uso do operador OR lógico (`\|\|`) em vez de nullish coalescing (`??`). Quando o usuário economiza R$ 0,00 na semana (número 0 é falsy), o card assume o fallback e exibe falsamente que ele economizou R$ 450 (75%). | Matemático / Apresentação (exibe valor falso quando saldo for zero). | **Média** | Substituir `\|\| 450` por `?? 0` e `\|\| 75` por `?? 0`. |
| **4** | `src/components/express/ExpressPixModal.tsx` | Linhas 563-570 e inputs de formulário | Inputs com tamanho de fonte `text-xs` (12px) causam zoom automático involuntário da tela no Safari em dispositivos iPhone (iOS requer mínimo de 16px para não acionar zoom). | UX / Mobile (experiência no iPhone). | **Baixa** | Adicionar classe `text-base sm:text-xs` nos inputs de texto para dispositivos touch. |
| **5** | `supabase/migrations/` | Estrutura de arquivos | Inexistência de uma migration `20261031130000_initial_schema.sql` contendo o `schema.sql` base dentro da pasta `migrations/`. | Operacional (banco limpo exige rodar `schema.sql` manualmente antes das migrations). | **Baixa** | Manter o procedimento documentado ou transformar `schema.sql` na migration `00` do repositório. |

---

## H. TESTES REALIZADOS

1. **Build de Produção (`npm run build`):**
   - **Executado:** Sim, compilado com TypeScript 5 e empacotado com Vite 6.
   - **Resultado:** Código de saída 0 (zero erros, zero warnings em 4.87s).
   - **Ambiente:** Node.js local no sandbox.

2. **Testes de Lógica Financeira (Script Automatizado):**
   - **Executado:** 29 asserções cobrindo compras à vista, parcelamentos 2x, 6x (centavos residuais), 12x (virada de ano), consolidação na atividade recente, contabilidade por período e marcação atômica de pagamentos.
   - **Resultado:** 29 testes aprovados, 0 falhas.
   - **Ambiente:** Execução estática/local sem conexão com banco remoto.

3. **Testes contra Supabase Remoto:**
   - **Executado:** **NÃO EXECUTADO** (conforme exigência estrita da Etapa 11 para proteger o banco de produção e não gerar tráfego desautorizado).

---

## I. PRÓXIMOS PASSOS RECOMENDADOS

### O que deve ser feito ANTES de aplicar as migrations no Supabase remoto:
1. **Pequenos ajustes pontuais de robustez no frontend:**
   - Ajustar o fallback de `WeeklyGoalCard.tsx` (`?? 0` em vez de `|| 450`) para que novos usuários com zero de economia vejam seus dados reais.
   - Conectar a alternância de mês em `ReportsView.tsx` para que o botão "Mês Anterior" cumpra sua função.

### Roteiro Recomendado para Aplicação no Supabase Remoto:
Quando a etapa de aplicação for iniciada pelo usuário no painel do Supabase, executar exatamente nesta sequência no **SQL Editor**:
1. Executar `supabase/schema.sql` (caso o banco esteja virgem).
2. Executar `supabase/migrations/20261031140000_security_plan_enforcement.sql`.
3. Executar `supabase/migrations/20261031150000_security_hardening.sql`.
4. Executar `supabase/migrations/20261031160000_installment_intelligence.sql`.
5. Preencher a variável `VITE_SUPABASE_ANON_KEY` no `.env` do projeto e validar as credenciais de autenticação.

