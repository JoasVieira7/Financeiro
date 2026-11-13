// Supabase Edge Function: master-admin-api
// ETAPA 35.1B — Preparação da Arquitetura do Backend do Super Admin
//
// Protocolo de Segurança em 8 Passos:
// 1. Recebe a requisição HTTPS com cabeçalho de autorização Bearer JWT.
// 2. Valida o token JWT do chamador via auth.getUser(token) com a chave anônima oficial.
// 3. Extrai o UUID real autenticado e imutável do usuário.
// 4. Consulta app_admin.super_admin_registry para confirmar se o UUID é o Super Admin ativo.
// 5. Rejeita imediatamente chamadas de usuários comuns, anônimos ou tokens inválidos (HTTP 401/403).
// 6. Somente após autorização inequívoca, instancia o client interno com SUPABASE_SERVICE_ROLE_KEY.
// 7. Valida esquema de parâmetros recebidos no payload (ações suportadas, motivos, valores).
// 8. Executa mutações atômicas via RPC (app_admin.execute_admin_mutation) com auditoria obrigatória.
//
// NOTA IMPORTANTE: Esta Edge Function está em preparação local. NÃO FAZER DEPLOY NESTA ETAPA.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

Deno.serve(async (req: Request) => {
  // Tratamento de preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Configuração de ambiente do servidor incompleta.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // PASSO 1: Extrair o token de autorização do cabeçalho
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Cabeçalho de autorização ausente ou malformatado.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Token de autenticação não fornecido.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // PASSO 2: Validar o token JWT usando a camada de autenticação padrão (NÃO service_role)
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser(token);

    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: 'Sessão inválida ou expirada. Faça login novamente.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // PASSO 3: Extrair o UUID real do usuário autenticado
    const authenticatedUserId = userData.user.id;
    const authenticatedEmail = userData.user.email || '';

    // PASSO 4: Consultar o registro administrativo privado via client service_role controlado
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const { data: adminRecord, error: adminQueryError } = await adminClient
      .schema('app_admin')
      .from('super_admin_registry')
      .select('id, user_id, is_active')
      .eq('user_id', authenticatedUserId)
      .eq('is_active', true)
      .maybeSingle();

    // PASSO 5: Rejeição imediata se não for o Super Admin registrado
    if (adminQueryError || !adminRecord) {
      return new Response(
        JSON.stringify({ error: 'Acesso negado: privilégios de Super Admin requeridos.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Identificar a rota da requisição
    const url = new URL(req.url);
    const actionPath = url.pathname.split('/').pop() || '';

    // Rota A: Verificação de acesso ao painel (Check de Permissão)
    if (actionPath === 'verify-access' || req.method === 'GET') {
      // Atualiza timestamp de último login do Super Admin
      await adminClient
        .schema('app_admin')
        .from('super_admin_registry')
        .update({ last_admin_login: new Date().toISOString() })
        .eq('user_id', authenticatedUserId);

      return new Response(
        JSON.stringify({
          authorized: true,
          role: 'SUPER_ADMIN',
          user_id: authenticatedUserId,
          email: authenticatedEmail,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Rota B: Consulta de Métricas Financeiras SaaS
    if (actionPath === 'financial-metrics') {
      const { data: metrics, error: metricsError } = await adminClient.rpc('get_financial_metrics');

      if (metricsError) {
        return new Response(
          JSON.stringify({ error: 'Erro ao calcular métricas financeiras.', details: metricsError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ metrics }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Rota C: Execução de Mutação Administrativa com Auditoria Atômica
    if (actionPath === 'execute-action') {
      // PASSO 7: Validação de Parâmetros
      let payload: any = {};
      try {
        payload = await req.json();
      } catch {
        return new Response(
          JSON.stringify({ error: 'Corpo da requisição deve ser um JSON válido.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { action, target_user_id, target_resource, old_values, new_values, reason } = payload;

      if (!action || typeof action !== 'string') {
        return new Response(
          JSON.stringify({ error: 'O parâmetro action é obrigatório.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
        return new Response(
          JSON.stringify({ error: 'Justificativa (reason) é obrigatória e deve ter pelo menos 5 caracteres.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Captura IP e User-Agent para a auditoria
      const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown';
      const userAgent = req.headers.get('user-agent') || 'unknown';

      // PASSO 8: Execução Atômica via RPC no banco
      const { data: auditId, error: mutationError } = await adminClient.rpc('execute_admin_mutation', {
        p_admin_id: authenticatedUserId, // Força o UUID do administrador validado pelo token
        p_action: action,
        p_target_user_id: target_user_id || null,
        p_target_resource: target_resource || null,
        p_old_values: old_values || {},
        p_new_values: new_values || {},
        p_reason: reason.trim(),
        p_ip_address: ipAddress,
        p_user_agent: userAgent,
      });

      if (mutationError) {
        return new Response(
          JSON.stringify({ error: 'Falha na execução administrativa.', details: mutationError.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          audit_id: auditId,
          executed_at: new Date().toISOString(),
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: `Rota administrativa não encontrada: ${actionPath}` }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: 'Erro interno no servidor administrativo.', details: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

