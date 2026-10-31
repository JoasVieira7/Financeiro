# ⚡ Financeiro Express — Gestão Financeira Express & Metas de Economia

Aplicativo comercial (SaaS) moderno de controle financeiro pessoal e metas de economia construído para **alta velocidade e retenção diária**, com experiência nativa para smartphones (iPhone/iPad e Android) e web, interface 100% em Português do Brasil e integração segura com **Supabase Auth & PostgreSQL com Row Level Security (RLS)**.

---

## 🌟 Funcionalidades do Núcleo Financeiro

### 1. ⚡ Lançamento Express (< 3 Segundos)
- **Ação Rápida:** Registro instantâneo de transações com teclado numérico nativo.
- **Múltiplos Métodos de Pagamento:** Suporte a **Pix, Cartão de Crédito, Cartão de Débito, Dinheiro e Outros**.
- **Entradas e Saídas:** Suporte a despesas e receitas (ex: Salário, Vendas).
- **Categorias Comerciais:** Alimentação, Transporte, Moradia, Contas, Saúde, Lazer, Compras, Salário e Outros.
- **Edição e Exclusão:** Gestão completa com confirmação destrutiva de segurança.

### 2. 🎯 Orçamento Inteligente & Limite Diário
- **Limite Diário Projetado:** *"Você pode gastar aproximadamente R$ XX por dia"* calculado dinamicamente com base no orçamento restante e dias restantes do mês.
- **Alertas Proativos e Discretos:** Notificações contextuais ao atingir 80%, 90% e 100% do orçamento mensal.
- **Limites por Categoria:** Acompanhamento de progresso percentual e tetos mensais personalizáveis por categoria.
- **Comparação Mensal:** Indicador de evolução percentual comparando o mês atual com o mês anterior.

### 3. 🏆 Metas de Economia
- **Objetivos Pessoais:** Definição de metas com título, valor desejado, valor acumulado e prazos.
- **Aportes e Resgates:** Depósito (`+ Adicionar Valor`) e retirada (`- Retirar Valor`) com validação de saldo disponível.
- **Histórico de Contribuições:** Registro detalhado com data, hora, tipo e notas para cada aporte.
- **Arquitetura SaaS:** Limite estrito de até 2 metas ativas no Plano Gratuito e metas ilimitadas no Plano Premium (R$ 4,90/mês).

### 4. 🔒 Segurança & Isolamento Multiusuário (RLS)
- Autenticação via **Supabase Auth** (E-mail, Senha e fluxo de recuperação).
- **Row Level Security (RLS)** ativo em 100% das tabelas:
  - `profiles`
  - `transactions`
  - `savings_goals`
  - `recurring_expenses`
  - `goal_contributions`
- Função RPC `delete_user_account()` para exclusão total de dados e conformidade com as diretrizes da Apple App Store e Google Play.
- **Modo Sandbox / Demonstração:** Permite avaliar o app imediatamente com perfis de demonstração isolados sem expor chaves.

---

## 🛠️ Stack Tecnológica

- **Frontend:** React 19 + TypeScript + Vite 6
- **Estilização:** Tailwind CSS + Plus Jakarta Sans
- **Ícones & Microinterações:** Lucide React + Canvas Confetti
- **Banco de Dados & Auth:** Supabase JS v2 + PostgreSQL com RLS
- **Mobile Container:** Capacitor (App ID `com.financeiroexpress.app`)

---

## 🚀 Como Executar Localmente

### 1. Clonar e Instalar Dependências:
```bash
git clone <url-do-seu-repositorio>
cd Financeiro
npm install
```

### 2. Iniciar o Servidor de Desenvolvimento:
```bash
npm run dev
```
O aplicativo abrirá em: `http://localhost:3000`

### 3. Configurar o Supabase (Produção / Multiusuário):
1. Crie um projeto em [supabase.com](https://supabase.com).
2. Acesse a aba **SQL Editor** no painel do Supabase.
3. Execute o script completo [`supabase/schema.sql`](./supabase/schema.sql).
4. Copie o arquivo `.env.example` para `.env` e preencha suas variáveis:
   ```env
   VITE_SUPABASE_URL=https://seu-projeto.supabase.co
   VITE_SUPABASE_ANON_KEY=sua-chave-publica-anon
   ```
5. Reinicie o servidor com `npm run dev`.

---

## 📱 Build para Produção
```bash
npm run build
```
O bundle otimizado com divisão de código (code-splitting) será gerado na pasta `/dist`.
