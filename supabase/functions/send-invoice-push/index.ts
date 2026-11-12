// Supabase Edge Function: send-invoice-push
// ETAPA 34.2 — Fluxo Financeiro: Hardening de Segurança Web Push
//
// Correções Implementadas:
// - SEC-01: Autenticação estrita via segredo de servidor CRON_SECRET (apenas POST).
// - SEC-03: Padronização determinística da dedup_key (invoice_${alertType}_${tx.id}_${dueDateStr}).
// - SEC-04: Proteção contra SSRF com allowlist estrita dos provedores oficiais de Web Push.
// - SEC-02: Limpeza automática de endpoints expirados (HTTP 410/404).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push';

/**
 * SEC-04: Validador de endpoints de Web Push no servidor contra SSRF.
 */
function isValidPushEndpoint(endpointStr: string): boolean {
  if (!endpointStr || typeof endpointStr !== 'string') return false;

  let url: URL;
  try {
    url = new URL(endpointStr);
  } catch {
    return false;
  }

  // 1. Apenas protocolo seguro HTTPS
  if (url.protocol !== 'https:') return false;

  // 2. Não permite credenciais embutidas
  if (url.username || url.password) return false;

  // 3. Porta deve ser 443 ou vazia (padrão HTTPS)
  if (url.port && url.port !== '443') return false;

  const hostname = url.hostname.toLowerCase();

  // 4. Rejeita localhost, IPs (v4/v6) e redes locais
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) ||
    /^\[?[0-9a-f:]+\]?$/i.test(hostname)
  ) {
    return false;
  }

  // 5. Allowlist explícita dos provedores oficiais de Web Push
  const isGoogle = hostname === 'fcm.googleapis.com' || hostname.endsWith('.push.googleapis.com');
  const isApple = hostname.endsWith('.push.apple.com');
  const isMozilla =
    hostname === 'updates.push.services.mozilla.com' ||
    hostname.endsWith('.push.services.mozilla.com');
  const isMicrosoft =
    hostname.endsWith('.notify.windows.com') || hostname.endsWith('.wns.windows.com');

  return isGoogle || isApple || isMozilla || isMicrosoft;
}

Deno.serve(async req => {
  // --------------------------------------------------------------------------
  // SEC-01: Validação de Método HTTP (Apenas POST permitido)
  // --------------------------------------------------------------------------
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Método não permitido. Utilize POST.' }),
      { status: 405, headers: { 'Content-Type': 'application/json', Allow: 'POST' } }
    );
  }

  // --------------------------------------------------------------------------
  // SEC-01: Validação Rigorosa do Segredo CRON_SECRET
  // --------------------------------------------------------------------------
  const serverCronSecret = Deno.env.get('CRON_SECRET');
  if (!serverCronSecret || serverCronSecret.trim().length < 16) {
    // Segredo de servidor não configurado ou muito curto: bloqueia qualquer acionamento
    return new Response(
      JSON.stringify({
        error: 'CRON_SECRET não configurado ou inseguro no servidor. Acionamento bloqueado por segurança.',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // O chamador pode fornecer o segredo via header Authorization: Bearer <SECRET> ou x-cron-secret: <SECRET>
  const authHeader = req.headers.get('Authorization') || '';
  const xCronSecret = req.headers.get('x-cron-secret') || '';

  let providedSecret = '';
  if (authHeader.startsWith('Bearer ')) {
    providedSecret = authHeader.substring(7).trim();
  } else if (xCronSecret) {
    providedSecret = xCronSecret.trim();
  }

  // Comparação segura sem logar segredos
  if (!providedSecret || providedSecret !== serverCronSecret) {
    return new Response(
      JSON.stringify({ error: 'Acesso não autorizado. Segredo de agendamento inválido ou ausente.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // --------------------------------------------------------------------------
  // Processamento Seguro dos Alertas de Faturas
  // --------------------------------------------------------------------------
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY') || '';
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') || '';
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:suporte@fluxofinanceiro.com.br';

    if (!supabaseUrl || !supabaseServiceKey || !vapidPublicKey || !vapidPrivateKey) {
      return new Response(
        JSON.stringify({
          error: 'Credenciais de servidor incompletas (SUPABASE_SERVICE_ROLE_KEY ou VAPID_KEYS ausentes).',
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Busca todas as despesas pendentes dos usuários
    const { data: pendingExpenses, error: expError } = await supabase
      .from('transactions')
      .select('id, user_id, description, amount, due_date, status, paid_at')
      .eq('type', 'expense')
      .neq('status', 'paid')
      .is('paid_at', null)
      .not('due_date', 'is', null);

    if (expError) throw expError;

    let dispatchedCount = 0;
    let expiredEndpointsCleaned = 0;
    let ssrfBlockedCount = 0;

    for (const tx of pendingExpenses || []) {
      const dueDateStr = String(tx.due_date).substring(0, 10);
      const dueDateParts = dueDateStr.split('-');
      if (dueDateParts.length !== 3) continue;

      const dueYear = parseInt(dueDateParts[0], 10);
      const dueMonth = parseInt(dueDateParts[1], 10) - 1;
      const dueDay = parseInt(dueDateParts[2], 10);

      const dueDate = new Date(dueYear, dueMonth, dueDay);
      dueDate.setHours(0, 0, 0, 0);

      const diffDays = Math.round((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      let alertType = '';
      let title = '';
      let body = '';

      const formattedAmount = `R$ ${Number(tx.amount).toFixed(2)}`;
      const description = tx.description?.trim() || 'Fatura / Compromisso';

      if (diffDays === 3) {
        alertType = 'due_3d';
        title = 'Sua fatura vence em 3 dias 💳';
        body = `A despesa "${description}" (${formattedAmount}) vence em 3 dias. Reserve o valor para pagamento.`;
      } else if (diffDays === 1) {
        alertType = 'due_1d';
        title = 'Sua fatura vence amanhã ⚠️';
        body = `Lembrete: sua fatura "${description}" vence amanhã. Valor previsto: ${formattedAmount}.`;
      } else if (diffDays === 0) {
        alertType = 'due_today';
        title = 'Hoje é o vencimento da sua fatura ⏰';
        body = `Hoje vence "${description}" no valor de ${formattedAmount}. Não esqueça de pagar.`;
      } else if (diffDays < 0 && diffDays >= -30) {
        const pastDays = Math.abs(diffDays);
        if (pastDays === 1 || pastDays === 3 || pastDays === 7 || pastDays === 15) {
          alertType = `overdue_${pastDays}d`;
          title = 'Atenção: Fatura vencida e pendente 🚨';
          body = `A despesa "${description}" (${formattedAmount}) venceu há ${pastDays} dia${pastDays > 1 ? 's' : ''} e ainda está pendente.`;
        }
      }

      if (!alertType) continue;

      // ----------------------------------------------------------------------
      // SEC-03: Chave Padronizada Idêntica ao Frontend
      // Formato Oficial: invoice_${alertType}_${tx.id}_${dueDateStr}
      // ----------------------------------------------------------------------
      const dedupKey = `invoice_${alertType}_${tx.id}_${dueDateStr}`;

      // Verifica se a notificação já foi registrada na tabela de notificações
      const { data: existingNotif } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', tx.user_id)
        .eq('dedup_key', dedupKey)
        .maybeSingle();

      if (existingNotif) {
        // Já notificado pelo servidor ou pelo app, evita duplicidade
        continue;
      }

      // Busca as inscrições Push ativas deste usuário
      const { data: subscriptions } = await supabase
        .from('push_subscriptions')
        .select('id, endpoint, p256dh, auth')
        .eq('user_id', tx.user_id);

      if (!subscriptions || subscriptions.length === 0) {
        continue;
      }

      const payload = JSON.stringify({
        title,
        body,
        icon: '/icon.svg',
        badge: '/icon.svg',
        url: '/transactions',
      });

      for (const sub of subscriptions) {
        // --------------------------------------------------------------------
        // SEC-04: Proteção contra SSRF e Endpoints Não Confiáveis
        // --------------------------------------------------------------------
        if (!isValidPushEndpoint(sub.endpoint)) {
          ssrfBlockedCount++;
          continue;
        }

        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        };

        try {
          await webpush.sendNotification(pushSubscription, payload);
          dispatchedCount++;
        } catch (sendErr: any) {
          // SEC-02: Se a inscrição expirou no navegador (410 Gone ou 404 Not Found), remove automaticamente
          if (sendErr.statusCode === 410 || sendErr.statusCode === 404) {
            await supabase.from('push_subscriptions').delete().eq('id', sub.id);
            expiredEndpointsCleaned++;
          }
        }
      }

      // Registra a notificação com a dedup_key padronizada para idempotência absoluta
      await supabase.from('notifications').insert({
        user_id: tx.user_id,
        title,
        message: body,
        type: diffDays < 0 ? 'expense_overdue' : 'expense_due',
        is_read: false,
        link: '/transactions',
        dedup_key: dedupKey,
        metadata: {
          transaction_id: tx.id,
          due_date: dueDateStr,
          amount: tx.amount,
          alert_type: alertType,
        },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        dispatchedCount,
        expiredEndpointsCleaned,
        ssrfBlockedCount,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || 'Erro durante envio de push.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
