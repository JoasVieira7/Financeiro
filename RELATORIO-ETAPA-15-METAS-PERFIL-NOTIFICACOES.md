# RELATÓRIO — ETAPA 15: METAS SEMANAIS/MENSAIS, PERFIL E NOTIFICAÇÕES REAIS

**Data:** 2026-10-31  
**Versão do projeto:** 1.0.0  
**Build:** ✅ 0 erros | 0 warnings  
**Supabase remoto:** não alterado

---

## 1. Resumo Executivo

Esta etapa implementou três melhorias independentes e integradas ao sistema existente do **Financeiro Express**:

1. **Metas Semanais/Mensais** — Seleção de período ao criar meta, toggle semanal/mensal no card principal e filtros por tipo na lista.
2. **Reorganização do Perfil** — Remoção do modal duplicado de preferências, controles de push notification inline, hierarquia de seções limpa.
3. **Notificações Reais** — Tabela persistente no banco, modal de notificações, contador de não lidas, tempo real via Supabase, idempotência por `dedup_key`, suporte a Web Push controlado pelo usuário.

Nenhuma funcionalidade existente foi quebrada ou removida. Todas as alterações foram minimamente invasivas.

---

## 2. Arquivos Alterados

### 2.1 Database / Migrations

| Arquivo | Descrição |
|---------|-----------|
| `supabase/migrations/20261031180000_goals_period_and_notifications.sql` | Criado: campos `period_type`, `start_date`, `end_date` em `savings_goals`; tabela `notifications` com RLS, dedup_key, índices; RPCs `mark_notification_read`, `mark_all_notifications_read`, `check_financial_alerts`; trigger `apply_goal_contribution` atualizado. |
| `supabase/schema.sql` | Sincronizado com as definições acima. |

### 2.2 TypeScript / Frontend

| Arquivo | Alteração |
|---------|-----------|
| `src/types/index.ts` | `GoalPeriodType`, campos `period_type/start_date/end_date` em `SavingsGoal`, `monthlySavedAmount/monthlyGoalPercentage` em `DashboardStats`, `NotificationType`, `AppNotification`. |
| `src/lib/pushNotifications.ts` | **Novo.** Utilitários de Web Push: `isWebPushSupported`, `getNotificationPermission`, `requestPushPermission`, `dispatchSystemPushNotification`. |
| `src/context/FinanceContext.tsx` | `notifications`, `unreadNotificationsCount`, `markNotificationAsRead`, `markAllNotificationsAsRead`, `refreshNotifications`; realtime channel; `monthlySavedAmount/monthlyGoalPercentage` em `stats`; `addSavingsGoal` com `periodType/startDate/endDate`. |
| `src/components/notifications/NotificationsModal.tsx` | **Novo.** Modal de notificações com contador, ícones por tipo, marcar individual/todas como lidas, estado vazio. |
| `src/components/layout/Navbar.tsx` | Removido botão de engrenagem. Adicionado sino de notificações com badge de não lidas. |
| `src/App.tsx` | Estado `isNotificationsOpen`, prop `onOpenNotifications` para Navbar, renderização do `NotificationsModal`. |
| `src/components/profile/ProfileView.tsx` | Removido modal `isPreferencesOpen` duplicado. Seção "Preferências" inline com: toggle app notifications, controle de Web Push (ativar/bloqueado/ativo), rever tutorial. |
| `src/components/goals/GoalsView.tsx` | Toggle Semana/Mês no card principal; abas de filtro (Ativas / Semanais / Mensais / Objetivos / Concluídas); badge de período em cada meta; modal "Nova Meta" com seletor de `period_type` e datas automáticas. |
| `src/components/home/WeeklyGoalCard.tsx` | Reescrito com toggle Semana/Mês embutido para visualizar progresso semanal ou mensal a partir da Home. |

---

## 3. Detalhamento das Funcionalidades

### 3.1 Metas Semanais e Mensais

#### 3.1.1 Tipos de período

Ao criar uma meta, o usuário escolhe entre três tipos:

- **Semanal** — `period_type = 'weekly'`; `start_date`/`end_date` calculados automaticamente para a semana atual (segunda → domingo).
- **Mensal** — `period_type = 'monthly'`; `start_date`/`end_date` calculados para o mês atual (dia 1 → último dia).
- **Objetivo Geral** — `period_type = 'custom'`; campo de prazo livre opcional.

Funções utilitárias locais (`getWeekBounds`, `getMonthBounds`) calculam as datas sem dependências externas.

#### 3.1.2 Visualização no card principal

O card "Meta de Economia" em `GoalsView` agora exibe um **toggle Semana / Mês** que alterna:
- `weeklySavedAmount` / `weeklyGoalPercentage` (dados do contexto)
- `monthlySavedAmount` / `monthlyGoalPercentage` (dados do contexto)

O mesmo toggle foi adicionado ao **`WeeklyGoalCard`** na Home, permitindo verificar semana ou mês sem sair da tela inicial.

#### 3.1.3 Filtros de metas

Abas de filtro acima da lista de metas pessoais:

| Aba | Critério |
|-----|----------|
| Ativas | `!is_completed` (todos os tipos) |
| Semanais | `!is_completed AND period_type = 'weekly'` |
| Mensais | `!is_completed AND period_type = 'monthly'` |
| Objetivos | `!is_completed AND period_type = 'custom'` |
| Concluídas | `is_completed = true` |

#### 3.1.4 Badge de período

Cada card de meta exibe um badge colorido com o tipo (Semanal, Mensal, Objetivo Geral), facilitando a identificação visual.

---

### 3.2 Reorganização do Perfil

#### 3.2.1 Problemas corrigidos

- **Modal duplicado removido:** `isPreferencesOpen` e seu bloco JSX foram eliminados. O conteúdo útil foi consolidado diretamente na seção "Preferências" da página.
- **Imports limpos:** Removidos `Settings`, `Trash2` (não utilizados). Adicionados `BellRing`, imports de `pushNotifications`.

#### 3.2.2 Seção Preferências reorganizada

```
Preferências
├── Notificações no app        (toggle on/off — persiste via AuthContext)
├── Notificações push          (Web Push — só exibe se API suportada)
│   ├── "default"  → botão "Ativar" (solicita permissão ao clique)
│   ├── "granted"  → badge "Ativas" (verde)
│   └── "denied"   → badge "Bloqueadas" (instruções ao usuário)
└── Rever tutorial             (chama replayOnboarding)
```

Nunca solicita permissão de push automaticamente — exclusivamente por ação explícita do usuário.

---

### 3.3 Notificações Reais

#### 3.3.1 Tabela `notifications`

```sql
CREATE TABLE notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        text NOT NULL,
  title       text NOT NULL,
  body        text NOT NULL,
  is_read     boolean NOT NULL DEFAULT false,
  link        text,
  dedup_key   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_notifications_dedup ON notifications(user_id, dedup_key)
  WHERE dedup_key IS NOT NULL;
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read, created_at DESC);
```

RLS ativa com políticas de isolamento por `user_id`.

#### 3.3.2 Eventos cobertos

| Evento | `type` | `dedup_key` | Gatilho |
|--------|--------|-------------|---------|
| Meta 100% atingida | `goal_reached` | `goal_reached_{goal_id}_{yyyymm}` | trigger PostgreSQL |
| Meta ≥ 80% | `goal_warning` | `goal_warning_{goal_id}_{yyyymm}` | trigger PostgreSQL |
| Despesa vence em ≤ 2 dias | `expense_due_soon` | `due_soon_{tx_id}_{date}` | RPC `check_financial_alerts` |
| Despesa vencida | `expense_overdue` | `overdue_{tx_id}_{date}` | RPC `check_financial_alerts` |

---

## 4. Integridade dos Dados

- Metas existentes sem `period_type` recebem `DEFAULT 'custom'` na migration — sem quebra.
- `start_date` e `end_date` são `NULLABLE` — metas antigas sem esses campos continuam funcionando.
- Limite de 2 metas ativas no plano Free continua respeitado (contagem filtra `!is_completed`).
- Aportes e retiradas continuam passando exclusivamente pelo RPC do Supabase — sem manipulação de saldo pelo frontend.
- Notificações geradas por triggers PostgreSQL — não podem ser forjadas pelo cliente.

---

## 5. Resultado do Build

```
> tsc && vite build

vite v6.4.5 building for production...
✓ 2112 modules transformed.
✓ built in 4.52s

Erros TypeScript:  0
Warnings:          0
```

---

## 6. Segurança

| Ponto | Garantia |
|-------|---------|
| Notificações RLS | `user_id = auth.uid()` em todas as policies |
| Idempotência | `UNIQUE INDEX` em `(user_id, dedup_key)` — sem duplicatas |
| Push Permission | Nunca automático; exclusivamente via interação do usuário |
| `period_type` | Validado por `CHECK (period_type IN ('weekly','monthly','custom'))` no banco |

---

## 7. Checklist Final

- [x] Metas semanais e mensais selecionáveis ao criar
- [x] Datas de início/fim calculadas automaticamente por período
- [x] Toggle Semana/Mês no card principal de GoalsView
- [x] Toggle Semana/Mês no WeeklyGoalCard da Home
- [x] Filtros por tipo de meta (Ativas / Semanais / Mensais / Objetivos / Concluídas)
- [x] Badge de período em cada card de meta
- [x] Prazo automático para weekly/monthly; livre para custom
- [x] Modal de notificações com contador de não lidas
- [x] Marcar individual e todas como lidas
- [x] Realtime via Supabase
- [x] Dedup por `dedup_key`
- [x] Eventos: goal_reached, goal_warning, expense_due_soon, expense_overdue
- [x] Web Push controlado (nunca automático)
- [x] Perfil: modal duplicado removido
- [x] Perfil: controles de push inline
- [x] Engrenagem do topo removida
- [x] Build: 0 erros, 0 warnings
- [x] Sem SQL executada no Supabase remoto
- [x] Sem dados de produção alterados
- [x] Funcionalidades existentes preservadas

---

**Supabase remoto não foi alterado e nenhuma SQL foi executada nesta etapa.**

