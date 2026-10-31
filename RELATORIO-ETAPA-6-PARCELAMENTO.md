# FINANCEIRO EXPRESS — RELATÓRIO DA ETAPA 6: PARCELAMENTO DE DESPESAS

**Data de Implementação:** 31 de Outubro de 2026  
**Status do Build:** ✅ Aprovado com Sucesso (`npm run build` — 0 erros)  
**Ambiente:** Clean White Design System • TypeScript • React • Supabase / Demo Storage

---

## 1. Análise Prévia do Fluxo de Transações

Antes de qualquer alteração no código, foi realizada a auditoria do ciclo de vida das transações no Financeiro Express:

| Etapa | Comportamento Anterior | Impacto Identificado |
|---|---|---|
| **Criação** | `ExpressPixModal` recebia valor único no teclado numérico e chamava `addTransaction` gerando 1 registro com a data do momento (`new Date().toISOString()`). | Não havia suporte nativo a compras divididas no cartão ou carnês. Se o usuário registrasse R$ 600,00 de uma compra em 6x, o mês atual absorvia o impacto integral de R$ 600,00, distorcendo o orçamento mensal. |
| **Edição** | `updateTransaction` recebia o ID da transação e sobrescrevia os campos daquela linha isolada. | Sem vínculo entre parcelas, qualquer edição precisava ser repetida manualmente mês a mês. |
| **Exclusão** | `deleteTransaction` removia exclusivamente a linha do ID fornecido. | Se o usuário cancelasse uma compra parcelada, precisaria encontrar e apagar cada parcela individualmente. |
| **Exibição** | `TransactionsView` e `RecentTransactions` agrupavam transações pela data e exibiam Título e Subtítulo via `getTransactionDisplay`. | Não havia indicador visual da relação da parcela com o total da compra (ex: `1/6`). |
| **Cálculo de Saldo** | `FinanceContext` filtra transações pelo mês e ano de `created_at` (`d.getMonth() === currentMonth`). | O isolamento mensal por data é perfeito: basta que cada parcela seja gerada com seu `created_at` no respectivo mês futuro com o valor da parcela. |

---

## 2. Alterações de Schema Necessárias (Supabase / PostgreSQL)

Para suportar parcelamentos no banco de dados sem quebrar nenhuma transação existente e sem recriar tabelas ou políticas RLS, as seguintes colunas opcionais (`NULL`) foram documentadas no arquivo real `supabase/schema.sql`:

```sql
-- Migration retrocompatível para despesas parceladas
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS installment_group_id text NULL,
  ADD COLUMN IF NOT EXISTS installment_number integer NULL CHECK (installment_number IS NULL OR installment_number > 0),
  ADD COLUMN IF NOT EXISTS installment_total integer NULL CHECK (installment_total IS NULL OR installment_total >= installment_number),
  ADD COLUMN IF NOT EXISTS installment_purchase_amount numeric(12,2) NULL CHECK (installment_purchase_amount IS NULL OR installment_purchase_amount > 0);

-- Índice de performance para consultas e exclusões de grupos parcelados
CREATE INDEX IF NOT EXISTS idx_transactions_installment_group
  ON public.transactions (installment_group_id)
  WHERE installment_group_id IS NOT NULL;
```

### Justificativa Técnica:
1. **Campos Opcionais (`NULL`)**: Todas as transações antigas e compras à vista continuam com `NULL`, sem qualquer migração de dados ou incompatibilidade.
2. **`installment_group_id` como `text`**: Permite compatibilidade transparente com UUIDs do PostgreSQL e identificadores gerados no cliente em modo demonstração (`localStorage`).
3. **Restrições de Integridade (`CHECK`)**: Garante que o número da parcela seja positivo e nunca superior ao total de parcelas.
4. **Índice Condicional (`WHERE NOT NULL`)**: Otimiza a busca das parcelas vinculadas sem inflar o índice com transações à vista.

---

## 3. Arquitetura da Solução de Parcelamento

### 3.1. Divisão Contábil Rigorosa de Centavos
Quando uma compra não possui divisão exata (ex: R$ 1.000,00 em 12 parcelas = 83,3333...), o Financeiro Express utiliza a função contábil `calculateInstallmentAmounts`:
- Calcula a parcela base truncada em centavos: `Math.floor(totalCents / totalInstallments)`.
- Calcula o resto de centavos: `totalCents - (baseCents * totalInstallments)`.
- Adiciona o resto à **primeira parcela** (Parcela 1: R$ 83,37; Parcelas 2 a 12: R$ 83,33).
- **Resultado:** A soma exata das 12 parcelas é rigorosamente R$ 1.000,00, sem perda ou acréscimo de centavos.

### 3.2. Projeção de Datas de Vencimento Mensais
A função `getInstallmentDates` projeta os vencimentos mensais mantendo o dia base escolhido pelo usuário:
- **Exemplo do Requisito:**
  - Compra de R$ 600,00 em 6 parcelas
  - Primeira parcela: `10/11/2026`
  - Parcelas geradas:
    - 1ª: `10/11/2026` (R$ 100,00)
    - 2ª: `10/12/2026` (R$ 100,00)
    - 3ª: `10/01/2027` (R$ 100,00)
    - 4ª: `10/02/2027` (R$ 100,00)
    - 5ª: `10/03/2027` (R$ 100,00)
    - 6ª (Última): `10/04/2027` (R$ 100,00)
- **Ajuste para Meses Curtos:** Se a compra for feita em 31/01, a parcela de fevereiro é automaticamente ajustada para 28/02 (ou 29/02 se bissexto), e a de março retoma o dia 31/03, evitando avanço acidental para o mês seguinte.

---

## 4. Isolamento Mensal no Dashboard, Gráficos e Saldo

### Como foi evitada a duplicação indevida do valor total:
- O valor registrado no campo `amount` de cada uma das N transações é **exclusivamente o valor da parcela** (R$ 100,00 no exemplo).
- O valor total da compra (R$ 600,00) fica registrado como metadado informativo em `installment_purchase_amount`.
- Como o `FinanceContext` filtra transações pelo mês de competência (`new Date(t.created_at).getMonth()`):
  - Em Novembro de 2026: computa **apenas R$ 100,00** de despesa.
  - Em Dezembro de 2026: computa **apenas R$ 100,00** de despesa.
  - O gráfico de rosca (`DonutChart`), a quebra de categorias (`categoryBreakdown`), a meta semanal e o saldo restante do mês são calculados com absoluta precisão no fluxo de caixa real de cada mês.

---

## 5. Comportamento Seguro de Edição e Exclusão

### 5.1. Exclusão Segura
Ao clicar no ícone de lixeira em uma transação parcelada, o usuário recebe um diálogo contextual com opções claras:
1. **Excluir apenas esta parcela (ex: 1/6):** Remove apenas a parcela selecionada, mantendo as demais parcelas intactas.
2. **Excluir todas as parcelas da compra (ex: 6 parcelas):** Remove todas as transações com o mesmo `installment_group_id`, garantindo cancelamento completo da compra.
3. **Cancelar:** Fecha o diálogo sem nenhuma alteração.

### 5.2. Edição Inteligente com Sincronização Opcional
Ao abrir uma parcela para edição:
- Exibe o cabeçalho informativo com o número da parcela e o valor total original: `Parcela 1 de 6 • Total: R$ 600,00`.
- Oferece a caixa de seleção: `[x] Sincronizar categoria e estabelecimento em todas as 6 parcelas`.
- Se marcada, a alteração de categoria ou estabelecimento é propagada automaticamente para todo o grupo, mantendo o histórico consistente sem que o usuário precise editar parcela por parcela.

---

## 6. Interface do Usuário (Clean White Mobile-First)

1. **Seletor À vista / Parcelado:**
   - Adicionado pill discreto e intuitivo logo abaixo do seletor de Despesa/Receita.
   - Aparece **somente** para despesas (receitas permanecem à vista).
   - Ao selecionar "Parcelado", alterna inteligentemente o método de pagamento padrão para "Crédito".

2. **Configuração Rápida de Parcelas:**
   - Botões de seleção rápida em 1 toque: `2x`, `3x`, `4x`, `5x`, `6x`, `10x`, `12x`.
   - Campo nativo de data para a 1ª parcela (padrão na data de hoje).

3. **Card de Resumo em Tempo Real:**
   - Exibe antes de salvar exatamente o padrão solicitado:
     - **“6x de R$ 100,00”** (Valor de cada parcela)
     - **“Total: R$ 600,00”** (Valor total da compra)
     - **“Início: 10/11/2026 • Término: 10/04/2027”** (Datas formatadas no padrão brasileiro)

4. **Identificação Visual nas Listas (`TransactionsView` e `RecentTransactions`):**
   - Adicionado badge verde menta compacto ao lado do título da compra:
     `Atacadão [1/6]`
   - Subtítulo com detalhamento legível: `Compras · Crédito · 1/6`.

---

## 7. Validação dos 12 Cenários Solicitados

Todos os cenários foram testados e validados por rotina automatizada:

| Cenário | Entrada / Parâmetros | Resultado Obtido | Status |
|---|---|---|---|
| **1. Compra à vista** | Despesa simples R$ 48,50 | Gerada 1 transação padrão sem metadados de parcelamento. | ✅ Aprovado |
| **2. 2 Parcelas** | R$ 150,00 em 2x iniciando em 15/05/2026 | 2 parcelas de R$ 75,00 em 15/05/2026 e 15/06/2026. | ✅ Aprovado |
| **3. 6 Parcelas (Prompt)** | R$ 600,00 em 6x iniciando em 10/11/2026 | Início: 10/11/2026, Término: 10/04/2027, 6x de R$ 100,00. | ✅ Aprovado |
| **4. 12 Parcelas** | R$ 1.000,00 em 12x | 1x R$ 83,37 + 11x R$ 83,33 = Total R$ 1.000,00 exatos. | ✅ Aprovado |
| **5. Datas Diferentes** | Compra em 31/01/2027 em 3x | 31/01/2027 → 28/02/2027 → 31/03/2027 ajustado perfeitamente. | ✅ Aprovado |
| **6. Edição** | Alterar categoria da parcela 1/6 com sincronização | Categoria atualizada nas 6 parcelas sem alterar datas e valores. | ✅ Aprovado |
| **7. Exclusão** | Excluir parcela individual vs excluir compra inteira | Ambas as opções operam com confirmação e sem sobras no banco. | ✅ Aprovado |
| **8. Transações Antigas** | Transações legadas do `INITIAL_TRANSACTIONS` | Renderizadas perfeitamente sem crase, mantendo compatibilidade 100%. | ✅ Aprovado |
| **9. Dashboard** | Compra de R$ 600,00 em 6x no mês de Novembro | Novembro computa estritamente R$ 100,00 de despesa no cartão. | ✅ Aprovado |
| **10. Relatórios** | Filtro mensal em `ReportsView` | Considera apenas a competência de cada parcela do mês vigente. | ✅ Aprovado |
| **11. Gráficos** | `DonutChart` de Categorias | Fatias refletem a soma das parcelas daquele mês, sem inflação de total. | ✅ Aprovado |
| **12. Saldo Mensal** | Cálculo de orçamento restante | Reduzido apenas pelo valor da parcela vigente (R$ 100,00). | ✅ Aprovado |

---

## 8. Arquivos Modificados na Etapa 6

1. `src/types/index.ts`: Adição dos campos `installment_group_id`, `installment_number`, `installment_total`, `installment_purchase_amount` na interface `Transaction`.
2. `src/lib/formatters.ts`: Implementação de `formatDateBR`, `getInstallmentDates`, `calculateInstallmentAmounts` e inclusão do `installmentBadge` no `getTransactionDisplay`.
3. `src/context/FinanceContext.tsx`: Adição do método `addInstallmentExpense`, suporte a sincronização em grupo no `updateTransaction` e exclusão seletiva no `deleteTransaction`.
4. `src/components/express/ExpressPixModal.tsx`: Interface completa de parcelamento, seletor de parcelas, seletor de data, card de resumo em tempo real e diálogo de exclusão contextual.
5. `src/components/transactions/TransactionsView.tsx`: Exibição visual do badge de parcela `X/Y`.
6. `src/components/home/RecentTransactions.tsx`: Exibição visual do badge de parcela `X/Y`.
7. `supabase/schema.sql`: Atualização das definições da tabela `transactions` e inclusão do índice parcial `idx_transactions_installment_group`.
8. `RELATORIO-ETAPA-6-PARCELAMENTO.md`: Este relatório detalhado.

