# AUDITORIA TÉCNICA E PLANO DE MELHORIAS — FINANCEIRO EXPRESS

**Data:** 31/10/2026  
**Status do Projeto:** Fase Pré-Implementação (Modo Auditoria)  
**Objetivo:** Mapear o funcionamento real, identificar vulnerabilidades, inconsistências e planejar as melhorias de produto sem alterar código ou executar SQL prematuramente.

---

## 1. PONTO 1: LOGIN E FLUXO DE ENTRADA

### 1.1 Arquivos e Componentes Envolvidos
- `src/App.tsx` (linhas 17-46)
- `src/context/AuthContext.tsx` (linhas 41-104, 153-200)
- `src/components/auth/AuthModal.tsx` (linhas 35-68, 255-294)
- `src/lib/demoStorage.ts` (`DEMO_USERS`)
- `src/lib/supabase.ts` (`isSupabaseConfigured`)

### 1.2 Como Funciona Atualmente
1. **Auto-Login Forçado no Fallback:** Ao inicializar, `initAuth()` no `AuthContext.tsx` verifica se o Supabase possui sessão ativa. Caso o Supabase não esteja conectado com chaves válidas ou não haja sessão JWT, ele executa:
   ```ts
   // AuthContext.tsx (linhas 61-75)
   const savedProfile = localStorage.getItem(LOCAL_STORAGE_PROFILE_KEY);
   if (savedProfile) {
     // carrega perfil salvo...
   } else {
     useDefaultDemoUser(); // <- Força imediatamente o primeiro usuário demo!
   }
   ```
2. **Definição Imediata de Sessão Fictícia:** A função `useDefaultDemoUser()` define o usuário `DEMO_USERS[0]` (`carlos.eduardo@email.com`), salva no `localStorage` e atribui o estado `user = { id, email }`.
3. **Bloqueio da Tela de Autenticação:** No `App.tsx` (linha 43), a condição para exibir a tela de login inicial é `if (!user) return <AuthModal ... />;`. Como o `user` é instantaneamente preenchido pelo demo default, a tela de login nunca é exibida na primeira visita, e o aplicativo entra direto no Dashboard.
4. **Botões Sociais Simulados:** Em `AuthModal.tsx` (linhas 259 e 286), os botões do Google e da Apple chamam `handleSelectQuickDemo(DEMO_USERS[0].id)` e `handleSelectQuickDemo(DEMO_USERS[1].id)`. Eles simulam uma troca de usuário de demonstração, em vez de disparar provedores OAuth reais ou avisar o status de configuração.

### 1.3 Problemas Encontrados
- **Ausência de Escolha do Usuário:** Novos usuários nunca veem a tela de boas-vindas/login; entram automaticamente logados na conta do Carlos Eduardo.
- **Falsa Impressão de Autenticação Social:** Clicar no botão do Google ou da Apple não faz requisição de autenticação real nem informa que a integração OAuth requer credenciais na nuvem.
- **Acoplamento Sandbox x Produção:** Se as chaves do Supabase não estiverem no `.env`, o app assume silenciosamente que deve logar como demo, mascarando a necessidade de login real.

### 1.4 Alterações Necessárias (Planejamento)
- **Frontend (`AuthContext.tsx`):**
  - Modificar a inicialização para que, na ausência de sessão ativa (seja no Supabase ou no `localStorage`), o estado `user` permaneça `null`.
  - O app deve abrir obrigatoriamente a tela de login (`AuthModal`) com as opções:
    1. E-mail e Senha (Login / Cadastro).
    2. Botão "Experimentar Modo Demonstração" ou seleção explícita de usuário de teste.
    3. Botões Google e Apple: integrar com `supabase.auth.signInWithOAuth({ provider: 'google' | 'apple' })`. Se o Supabase não estiver configurado ou retornar erro de provedor desabilitado, apresentar feedback amigável ("Autenticação Google/Apple em configuração para publicação nas lojas").
- **Backend / Supabase:**
  - Preservar o trigger `handle_new_user()` já auditado no `schema.sql` (que cria automaticamente o perfil em `public.profiles` quando um usuário se cadastra por e-mail ou OAuth).

### 1.5 Riscos e Compatibilidade
- **Risco:** Usuários locais que já estavam usando o demo podem ser desconectados se a chave do `localStorage` for apagada.
- **Mitigação:** Manter a opção de "Entrar como Convidado / Demo" de forma explícita na tela de login.

---

## 2. PONTO 2: CATEGORIAS E ESTABELECIMENTOS / DETALHAMENTO

### 2.1 Arquivos e Componentes Envolvidos
- `supabase/schema.sql` (tabela `transactions`, colunas `description` e `notes`)
- `src/types/index.ts` (interfaces `TransactionCategory`, `Transaction`)
- `src/components/express/ExpressPixModal.tsx` (linhas 60-86, 123-158, 310-344)
- `src/components/transactions/TransactionsView.tsx` (renderização do histórico)
- `src/context/FinanceContext.tsx` (`addTransaction`, `updateTransaction`)

### 2.2 Como Funciona Atualmente
1. **Categorias Estritas:** Existem 9 categorias fixas validadas por CHECK constraint no SQL e union type no TypeScript: `'Alimentação'`, `'Transporte'`, `'Moradia'`, `'Contas'`, `'Saúde'`, `'Lazer'`, `'Compras'`, `'Salário'`, `'Outros'`.
2. **Geração Automática de Descrição:** No modal de registro rápido (`ExpressPixModal.tsx`), o usuário escolhe a categoria e o meio de pagamento, mas **não existe um campo de texto visível** no layout para digitar onde o gasto foi feito.
3. **Descrição Genérica Forçada:** O código executa:
   ```ts
   description.trim() || `${selectedCategory} (${paymentMethod.toUpperCase()})`
   ```
   Como o estado `description` está sempre vazio, todas as despesas são gravadas com textos genéricos como `"Alimentação (PIX)"` ou `"Compras (CARTAO_CREDITO)"`.
4. **Campo `notes` Subutilizado:** A coluna `notes text` existe no banco e na interface TypeScript, mas não é exposta na UI rápida do modal.

### 2.3 Problemas Encontrados
- Impossibilidade de o usuário saber se a despesa de "Compras" foi no "Atacadão", "Mercado Livre" ou "Farmácia São João".
- Falta de identificação clara no extrato e nos relatórios de gastos.

### 2.4 Alterações Necessárias (Planejamento)
- **Frontend (`ExpressPixModal.tsx`):**
  - Adicionar um campo de entrada sutil, opcional e limpo:
    `Placeholder: "Estabelecimento ou detalhe (ex: Atacadão, Uber, Padaria)"`.
  - Se preenchido, armazenar como `description` (ex: "Atacadão"), mantendo a categoria intacta (ex: "Compras").
  - Se deixado em branco, manter o fallback elegante atual (`"${selectedCategory}"`).
- **Frontend (`TransactionsView.tsx`):**
  - Exibir a categoria como badge e o estabelecimento como título principal do lançamento (ou vice-versa), garantindo clareza instantânea.
- **Backend / Banco de Dados:**
  - **Zero impacto destrutivo:** A tabela `transactions` já possui `description text NOT NULL` e `notes text`. Não há necessidade de criar novas tabelas nem quebrar relacionamentos. Preservação de 100% dos dados legados.

---

## 3. PONTO 3: CORES DOS GRÁFICOS E IDENTIDADE VISUAL DAS CATEGORIAS

### 3.1 Arquivos e Componentes Envolvidos
- `src/components/common/DonutChart.tsx` (linhas 8-63)
- `src/components/home/CategoryBreakdownCard.tsx` (linhas 10-58)
- `src/context/FinanceContext.tsx` (`CATEGORY_COLORS`, linhas 23-36)

### 3.2 Como Funciona Atualmente
1. **Divergência Total de Cores:**
   - Em `FinanceContext.tsx`, cada categoria tem uma cor definida (ex: Alimentação é Âmbar `#F59E0B`, Transporte é Azul Céu `#38BDF8`, Moradia é Índigo `#818CF8`).
   - Na legenda de `CategoryBreakdownCard.tsx`, os círculos coloridos usam `cat.color` da categoria correspondente.
2. **Gráfico Donut 100% Estático e Hardcoded:**
   - Em `DonutChart.tsx`, o componente **não recebe dados do usuário**.
   - As fatias SVG são geradas com valores fixos em código:
     - 45% com `#00D26A` (Verde)
     - 35% com `#1E293B` (Chumbo escuro)
     - 20% com `#7C3AED` (Roxo)
3. **Resultado Visual Conflitante:** Se o maior gasto do usuário for "Alimentação", a legenda mostra a bolinha amarela com o valor real, mas a fatia do gráfico acima é verde ou roxa, quebrando a integridade de dados e a leitura visual.

### 3.3 Problemas Encontrados
- Gráfico puramente ilustrativo que não reflete a realidade financeira do usuário.
- Dissonância cognitiva: a cor da fatia não bate com a cor da legenda abaixo dela.

### 3.4 Alterações Necessárias (Planejamento)
- **Refatorar `DonutChart.tsx`:**
  - Transformar o componente em um gráfico dinâmico orientado a dados:
    `interface DonutChartProps { data: { category: string; amount: number; percentage: number; color: string }[]; size?: number; strokeWidth?: number; }`.
  - Calcular o comprimento do `strokeDasharray` e o deslocamento (`strokeDashoffset`) dinamicamente com base nas porcentagens reais calculadas em `stats.categoryBreakdown`.
  - Caso não haja lançamentos no mês (100% sem dados), renderizar um anel de estado vazio elegante em cinza claro (`#E2E8F0`).
- **Alinhar a Paleta de Cores de Referência:**
  - Garantir consistência nas cores entre:
    - Fatias do Gráfico (`DonutChart`).
    - Marcadores da Legenda (`CategoryBreakdownCard`).
    - Ícones das categorias no extrato e nos cards de despesas.

---

## 4. PONTO 4: GESTÃO DE PLANOS (FREE VS. PREMIUM) E LIMITES SEGUROS

### 4.1 Arquivos e Componentes Envolvidos
- `supabase/schema.sql` (tabelas `profiles`, `savings_goals`, `transactions`)
- `src/types/index.ts` (`PLAN_LIMITS`, `SaaSPlanFeatureLimits`)
- `src/context/FinanceContext.tsx` (`addSavingsGoal`, exportação de dados)
- `src/components/goals/GoalsView.tsx` (bloqueio visual de 2 metas)
- `src/components/transactions/TransactionsView.tsx` (exportação CSV e filtros)

### 4.2 Como Funciona Atualmente
1. **Tabela de Limites no Frontend:** `PLAN_LIMITS` em `src/types/index.ts` define:
   - `free`: `maxGoals = 2`, `allowRecurringExpenses = false`, `allowAdvancedReports = false`, `allowFullCsvExport = false`, `allowBudgetAlerts = false`.
   - `premium`: `maxGoals = 9999`, acesso a todos os recursos.
2. **Bloqueio Inseguro Apenas no Cliente:**
   - Em `FinanceContext.tsx` (linhas 354-359), a verificação `if (goals.length >= limit)` é executada no código JavaScript do navegador.
   - No Supabase, **não há nenhuma restrição de banco**. Um usuário com conhecimentos básicos de requisições HTTP pode chamar `POST /rest/v1/savings_goals` e cadastrar 20 metas no plano gratuito.
3. **Recursos de Relatório e Histórico:**
   - Todas as transações do usuário são retornadas pela query do Supabase, sem distinção de plano.
   - Não há implementação de exportação CSV estruturada nem bloqueio seguro no backend.

### 4.3 Problemas Encontrados
- **Segurança Frágil:** Regra de negócio monetizável validada exclusivamente no lado do cliente.
- **Falta de Diferenciação Real:** O usuário gratuito consegue ver todo o extrato sem limitações de período, reduzindo o incentivo para assinar o Premium.

### 4.4 Alterações Necessárias (Planejamento)
- **Defesa no Banco de Dados (Supabase Server-Side):**
  - Implementar uma função trigger no PostgreSQL (`BEFORE INSERT ON public.savings_goals`):
    ```sql
    -- Consulta o plano do usuário na tabela profiles
    -- Se plan_tier = 'free' e contagem de metas do usuário >= 2, emite RAISE EXCEPTION
    ```
    Isso impede qualquer criação de 3ª meta por fora do app.
- **Frontend:**
  - **Metas:** No plano gratuito, exibir botão de criar nova meta com bloqueio visual e modal informativo quando atingir 2 metas.
  - **Exportação CSV:** No extrato de transações, adicionar o botão "Exportar Extrato (CSV)". Se o usuário for `free`, apresentar o card/modal de benefício Premium. Se for `premium`, gerar e baixar o arquivo `.csv` formatado.
  - **Histórico Completo vs. Essencial:** No plano `free`, limitar filtros históricos aos últimos 30-60 dias; no `premium`, histórico irrestrito desde o início.
  - **Sem Gateway de Pagamento:** Manter a estrutura de UI de upgrade (R$ 4,90/mês ou R$ 39,90/ano) sem processamento bancário real nesta etapa, aguardando integração oficial das lojas (In-App Purchases / Stripe).

---

## 5. PONTO 5: TUTORIAL E ONBOARDING INICIAL

### 5.1 Arquivos e Componentes Envolvidos
- `src/components/onboarding/OnboardingModal.tsx` (linhas 1-135)
- `src/context/AuthContext.tsx` (`hasSeenOnboarding`, `completeOnboarding`, `replayOnboarding`)
- `src/App.tsx` (linha 23)

### 5.2 Como Funciona Atualmente
1. **Design System Antigo Desalinhado:** O componente `OnboardingModal.tsx` foi construído com a paleta escura antiga (`bg-dark-950/90`, `bg-dark-900`, `text-white`, `border-slate-800`, `bg-brand-500`).
2. **Quebra Visual Abrupta:** Enquanto o restante do aplicativo utiliza o padrão moderno Clean White & Mint Green (`#FAFAFC`, `#00D26A`, texto `#0F172A`), o tutorial surge como um bloco preto no centro da tela.
3. **Problemas em Telas Menores (Mobile):** O modal utiliza largura fixa `max-w-sm` sem padding responsivo seguro para telas de 360px (Android compactos e iPhone SE).

### 5.3 Problemas Encontrados
- Inconsistência visual severa entre o app claro e o tutorial escuro.
- Baixo contraste do texto de apoio (`text-slate-300` sobre cinza escuro).
- Falta de hierarquia e botão "Começar a Usar" com cores legadas.

### 5.4 Alterações Necessárias (Planejamento)
- **Migração para o Design System Clean White:**
  - Fundo do modal em branco puro (`bg-white`) com bordas suaves (`border-slate-100`) e sombra profunda suave (`shadow-2xl`).
  - Títulos em `text-slate-900 font-extrabold`.
  - Descrições em `text-slate-500 text-xs font-medium`.
  - Indicadores de etapas (dots) em `#00D26A` (ativo) e `bg-slate-200` (inativos).
  - Ícones com fundo mint suave (`bg-[#E8FBF0]`) e ícone verde `#00D26A`.
  - Botão principal no verde padrão `#00D26A` com texto em branco (`text-white font-bold`).
- **Navegação Mobile:**
  - Adicionar suporte a swipe touch ou botões amplos de fácil toque (`h-[48px]`).
  - Garantir `max-h-[90vh]` e rolagem segura para aparelhos compactos.

---

## 6. PONTO 6: ABA PERFIL E AVALIAÇÃO DO ÍCONE DE ENGRENAGEM

### 6.1 Arquivos e Componentes Envolvidos
- `src/components/profile/ProfileView.tsx` (linhas 89-101, 220-235)

### 6.2 Como Funciona Atualmente
1. **Engrenagem com Função Redundante:** No topo direito do cabeçalho da aba Perfil, há o ícone `<Settings className="w-5 h-5 ..." />`.
2. **Ação Vinculada:**
   ```tsx
   <button
     onClick={() => setIsPasswordModalOpen(true)}
     title="Configurações"
   >
     <Settings ... />
   </button>
   ```
   A engrenagem apenas abre o modal de alteração de senha (`isPasswordModalOpen`).
3. **Duplicidade:** Pouco abaixo, na mesma tela, existe uma lista de opções onde o item **"Segurança e Senha"** já faz exatamente a mesma ação de abrir a alteração de senha.

### 6.3 Problemas Encontrados
- Frustração de UX: O usuário clica na engrenagem esperando uma central de configurações do app e se depara apenas com o campo de trocar senha.
- Poluição visual e redundância funcional.

### 6.4 Alterações Necessárias (Planejamento)
- **Opção Recomendada (Acesso Real a Configurações):**
  - Substituir a chamada simples por um menu ou modal de **Preferências & Configurações da Conta**:
    - Ajuste de Moeda e Formato (R$ padrão).
    - Preferência de Limite Diário (ativar/desativar exibição no dashboard).
    - Repetir Tutorial (chamando `replayOnboarding()`, recurso útil que já existe no `AuthContext` mas não tem botão na tela).
    - Limpar dados em cache local (modo demo).
  - Caso prefira minimalismo máximo: remover a engrenagem do topo e manter o acesso a configurações e segurança centralizado na lista organizada abaixo.

---

## 7. MATRIZ DE RISCOS E IMPACTOS

| Ponto | Impacto no Banco | Risco de Quebra | Dificuldade |
|---|:---:|:---:|:---:|
| **1. Login Real** | Zero (já preparado com `handle_new_user`) | Baixo (requer testes de fluxo de sessão) | Média |
| **2. Estabelecimento** | Baixo (campo opcional em `description` ou `notes`) | Quase nulo (retrocompatível) | Baixa |
| **3. Cores dos Gráficos** | Nenhum (apenas componente frontend) | Baixo (matemática de SVG de fatias) | Média |
| **4. Free vs. Premium** | Baixo (trigger BEFORE INSERT para teto de 2 metas) | Baixo (regras claras sem alterar schema) | Média |
| **5. Tutorial Claro** | Nenhum (estilos CSS Tailwind) | Nulo | Baixa |
| **6. Engrenagem Perfil** | Nenhum (apenas frontend) | Nulo | Muito Baixa |

---

## 8. ORDEM RECOMENDADA DE IMPLEMENTAÇÃO EM ETAPAS PEQUENAS

Para garantir que o aplicativo continue funcionando perfeitamente a cada passo sem quebras:

1. **Etapa 1 — Cores dos Gráficos e Identidade Visual (Ponto 3):**
   - Refatorar `DonutChart.tsx` para consumir dados reais e as cores dinâmicas de `FinanceContext.tsx`.
   - Testar com 0 despesas, 1 despesa e múltiplas categorias.

2. **Etapa 2 — Estabelecimento / Detalhamento de Transação (Ponto 2):**
   - Incluir campo opcional no modal `ExpressPixModal.tsx`.
   - Exibir estabelecimento no extrato de `TransactionsView.tsx` mantendo retrocompatibilidade.

3. **Etapa 3 — Tutorial e Onboarding Clean White (Ponto 5):**
   - Migrar `OnboardingModal.tsx` para o tema claro, ajustando contraste e tipografia.

4. **Etapa 4 — Ajuste da Engrenagem do Perfil (Ponto 6):**
   - Transformar a engrenagem em acesso a preferências úteis (como "Rever Tutorial" e notificações) ou remover redundância.

5. **Etapa 5 — Diferenciação de Planos Free e Premium com Segurança (Ponto 4):**
   - Adicionar trava server-side de 2 metas no `schema.sql`.
   - Adicionar botão de Exportação CSV com bloqueio informativo para Free e liberação para Premium.

6. **Etapa 6 — Ajuste do Fluxo de Login (Ponto 1):**
   - Impedir o login demo automático na raiz quando o usuário deslogar.
   - Apresentar a tela de login como portão de entrada, preservando o atalho de teste.

