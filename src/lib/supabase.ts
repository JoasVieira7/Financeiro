import { createClient } from '@supabase/supabase-js';

// Apenas variáveis com prefixo VITE_ são expostas ao bundle do navegador pelo Vite.
// Nunca referenciar SUPABASE_SERVICE_ROLE_KEY ou qualquer segredo de servidor aqui.
const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '')
  .trim()
  .replace(/^['"]|['"]$/g, '');

const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '')
  .trim()
  .replace(/^['"]|['"]$/g, '');

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl.startsWith('https://') &&
  !supabaseUrl.includes('placeholder') &&
  !supabaseUrl.includes('seu-projeto') &&
  !supabaseAnonKey.includes('sua-chave')
);

// Fallback dummy client quando as credenciais não estão disponíveis,
// evitando crashes em tempo de execução. Nenhum dado real é enviado.
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : createClient('https://xyzcompany.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy', {
      auth: {
        persistSession: false,
      },
    });
