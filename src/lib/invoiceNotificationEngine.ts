/**
 * Motor Inteligente de Alertas e Notificações de Vencimento de Faturas e Compromissos
 * ETAPA 34 — Fluxo Financeiro
 *
 * Características:
 * - Identifica faturas e compromissos reais do usuário (nunca inventa valores).
 * - Identifica: 3 dias antes, 1 dia antes (amanhã), dia do vencimento (hoje) e vencidas pendentes.
 * - Anti-duplicação rigorosa baseada em dedup_key idempotente (chave por usuário, transação e evento).
 * - Não avisa sobre transações já pagas.
 * - Respeita preferências de notificação do usuário.
 */

import { Transaction, AppNotification } from '../types';
import { roundToCents } from './budgetCalculations';
import { isTransactionPaid } from './formatters';

export interface GeneratedInvoiceAlert {
  notification: Omit<AppNotification, 'id'> & { id?: string; dedup_key: string };
  shouldPush: boolean;
}

export function generateInvoiceAlerts(
  transactions: Transaction[],
  existingNotifications: AppNotification[],
  userId: string,
  notificationsEnabled: boolean,
  formatCurrencyFn: (val: number) => string
): GeneratedInvoiceAlert[] {
  if (!userId || !notificationsEnabled) {
    return [];
  }

  const existingDedupKeys = new Set<string>();
  for (const n of existingNotifications) {
    if (n.dedup_key) {
      existingDedupKeys.add(n.dedup_key);
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString().split('T')[0];

  const alerts: GeneratedInvoiceAlert[] = [];

  for (const tx of transactions) {
    // Apenas despesas com valor válido
    if (tx.type !== 'expense' || !tx.amount || Number(tx.amount) <= 0) {
      continue;
    }

    // Ignora se já estiver paga
    if (isTransactionPaid(tx)) {
      continue;
    }

    // Identifica a data de vencimento real
    const rawDueDate = tx.due_date || (tx.installment_group_id ? tx.purchase_date : null);
    if (!rawDueDate) {
      continue;
    }

    const dueDateStr = String(rawDueDate).substring(0, 10);
    const dueDateParts = dueDateStr.split('-');
    if (dueDateParts.length !== 3) {
      continue;
    }

    const dueYear = parseInt(dueDateParts[0], 10);
    const dueMonth = parseInt(dueDateParts[1], 10) - 1;
    const dueDay = parseInt(dueDateParts[2], 10);

    const dueDateObj = new Date(dueYear, dueMonth, dueDay);
    dueDateObj.setHours(0, 0, 0, 0);

    // Diferença em dias inteiros
    const diffTime = dueDateObj.getTime() - today.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    const formattedAmount = formatCurrencyFn(roundToCents(Number(tx.amount)));
    const description = tx.description?.trim() || 'Fatura / Compromisso';

    // 1. Alerta: Vence em 3 dias
    if (diffDays === 3) {
      const dedupKey = `due_3d_${tx.id}_${dueDateStr}`;
      if (!existingDedupKeys.has(dedupKey)) {
        alerts.push({
          notification: {
            user_id: userId,
            title: 'Sua fatura vence em 3 dias 💳',
            message: `A despesa "${description}" no valor de ${formattedAmount} vence em 3 dias. Reserve o valor para pagamento.`,
            type: 'expense_due',
            is_read: false,
            link: '/transactions',
            dedup_key: dedupKey,
            created_at: new Date().toISOString(),
            metadata: {
              transaction_id: tx.id,
              due_date: dueDateStr,
              amount: Number(tx.amount),
              alert_type: 'due_3d',
            },
          },
          shouldPush: true,
        });
      }
    }

    // 2. Alerta: Vence amanhã (1 dia antes)
    if (diffDays === 1) {
      const dedupKey = `due_1d_${tx.id}_${dueDateStr}`;
      if (!existingDedupKeys.has(dedupKey)) {
        alerts.push({
          notification: {
            user_id: userId,
            title: 'Sua fatura vence amanhã ⚠️',
            message: `Lembrete: sua fatura "${description}" vence amanhã. Valor previsto: ${formattedAmount}.`,
            type: 'expense_due',
            is_read: false,
            link: '/transactions',
            dedup_key: dedupKey,
            created_at: new Date().toISOString(),
            metadata: {
              transaction_id: tx.id,
              due_date: dueDateStr,
              amount: Number(tx.amount),
              alert_type: 'due_1d',
            },
          },
          shouldPush: true,
        });
      }
    }

    // 3. Alerta: Vence hoje (dia do vencimento)
    if (diffDays === 0) {
      const dedupKey = `due_today_${tx.id}_${dueDateStr}`;
      if (!existingDedupKeys.has(dedupKey)) {
        alerts.push({
          notification: {
            user_id: userId,
            title: 'Hoje é o vencimento da sua fatura ⏰',
            message: `Hoje vence "${description}" no valor de ${formattedAmount}. Não esqueça de efetuar o pagamento.`,
            type: 'expense_due',
            is_read: false,
            link: '/transactions',
            dedup_key: dedupKey,
            created_at: new Date().toISOString(),
            metadata: {
              transaction_id: tx.id,
              due_date: dueDateStr,
              amount: Number(tx.amount),
              alert_type: 'due_today',
            },
          },
          shouldPush: true,
        });
      }
    }

    // 4. Alerta: Fatura vencida e ainda pendente (atraso de 1 a 30 dias)
    if (diffDays < 0 && diffDays >= -30) {
      const pastDays = Math.abs(diffDays);
      // Alerta semanal de atraso para não inundar o usuário (dias 1, 3, 7, 15)
      if (pastDays === 1 || pastDays === 3 || pastDays === 7 || pastDays === 15) {
        const dedupKey = `overdue_${pastDays}d_${tx.id}_${dueDateStr}`;
        if (!existingDedupKeys.has(dedupKey)) {
          alerts.push({
            notification: {
              user_id: userId,
              title: 'Atenção: Fatura vencida e pendente 🚨',
              message: `A despesa "${description}" (${formattedAmount}) venceu há ${pastDays} dia${pastDays > 1 ? 's' : ''} e ainda consta como pendente.`,
              type: 'expense_overdue',
              is_read: false,
              link: '/transactions',
              dedup_key: dedupKey,
              created_at: new Date().toISOString(),
              metadata: {
                transaction_id: tx.id,
                due_date: dueDateStr,
                amount: Number(tx.amount),
                days_overdue: pastDays,
                alert_type: 'overdue',
              },
            },
            shouldPush: true,
          });
        }
      }
    }
  }

  return alerts;
}
