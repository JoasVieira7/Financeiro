# RELATÓRIO DA ETAPA 12 — CORREÇÕES PONTUAIS PRÉ-SUPABASE

**Data:** 31 de outubro de 2026  
**Responsável:** Engenharia de Frontend & Sistemas Financeiros  
**Status:** CONCLUÍDO COM SUCESSO (Build aprovado em 4.98s, 15/15 testes automatizados validados)

---

> [!IMPORTANT]
> **DECLARAÇÃO OBRIGATÓRIA:**  
> **O Supabase remoto não foi alterado e nenhuma SQL foi executada nesta etapa.**  
> Todas as correções foram estritamente localizadas no código do frontend, sem afetar o banco de dados remoto ou a infraestrutura existente.

---

## 1. ARQUIVOS ALTERADOS

1. `src/components/reports/ReportsView.tsx` (Linhas 1, 21-85, 175-235)
2. `src/components/home/WeeklyGoalCard.tsx` (Linhas 14-43)
3. `src/components/express/ExpressPixModal.tsx` (Linhas 511-517, 563-571)

---

## 2. CORREÇÕES REALIZADAS EM DETALHES

### A. "Mês Anterior" nos Relatórios (`ReportsView.tsx`)
- **Problema Anterior:** O seletor "Este Mês / Mês Anterior" alternava o estado interno `period`, mas o JSX consumia de forma estática `stats.monthlyIncome` e `stats.monthlyExpense`, fazendo com que os valores exibidos continuassem sendo os do mês atual.
- **Como passou a funcionar:**
  - Foi criado o hook memoizado `reportData` (`useMemo`), dependente de `period`, `stats` e `transactions`.
  - Quando `period === 'current'`: consome diretamente os consolidados do mês atual (`stats.monthlyIncome`, `stats.monthlyExpense`, `stats.categoryBreakdown`).
  - Quando `period === 'previous'`:
    - Calcula o mês e ano anterior tratando a virada de ano (Janeiro -> Dezembro do ano anterior).
    - Filtra as transações pertencentes ao mês anterior respeitando `getTransactionDueDate(t)` para parcelas e `isTransactionPaid(t)` para despesas pagas.
    - Totaliza dinamicamente as receitas consolidadas, despesas consolidadas, saldo líquido gerado, taxa de comprometimento de renda e distribuição percentual de centros de custo por categoria daquele período anterior.

### B. Fallback Seguro e Valor Zero no Card de Economia (`WeeklyGoalCard.tsx`)
- **Problema Anterior:** Existiam fallbacks com operador lógico OR (`||`) nas variáveis `currentSaved` (`|| 450`) e `percentage` (`|| 75`). Como o número `0` é falsy em JavaScript, qualquer usuário com R$ 0,00 de economia real acabava vendo R$ 450,00 e 75% na tela.
- **Como foi corrigido:**
  - Substituídos os operadores `||` por nullish coalescing (`??`), garantindo que o valor `0` seja preservado como número legítimo.
  - Se `currentSaved === 0`, o card exibe exatamente R$ 0,00 economizado.
  - O cálculo do percentual passou a ser matematicamente consistente: `stats.weeklyGoalPercentage ?? (weeklyTarget > 0 ? Math.min(100, Math.round((currentSaved / weeklyTarget) * 100)) : 0)`.
  - Se for `0`, a barra de progresso verde é renderizada com `0%` de preenchimento.

### C. Ajuste de Zoom Automático no iPhone Safari (`ExpressPixModal.tsx`)
- **Problema Anterior:** Inputs com tamanho de fonte menor que 16px (`text-xs` = 12px) acionam o mecanismo nativo de acessibilidade do Safari no iOS, provocando auto-zoom da página e desalinhamento de tela ao tocar no campo de texto.
- **Como foi corrigido:**
  - Ajustados especificamente os dois campos de digitação secundários do modal:
    1. Input de data da 1ª parcela (`firstInstallmentDate`): adicionada a classe `text-base sm:text-xs`.
    2. Input de estabelecimento/detalhe (`description`): adicionada a classe `text-base sm:text-xs`.
  - **Efeito:** Em telas mobile (largura `< 640px`), o Safari interpreta a fonte como 16px (`text-base`), eliminando o zoom indesejado ao abrir o teclado virtual, enquanto em telas maiores (`sm:`) o design permanece estético e compacto.

---

## 3. NÃO ALTERAÇÕES (PRESERVAÇÃO DO ESCOPO)

Conforme instruído, foram rigorosamente preservados:
- Toda a lógica de parcelamento (`installment_group_id`, `due_date`, `purchase_date`, `paid_at`, `status`).
- A tela e cálculos de Compromissos Futuros (`CommitmentsView.tsx`).
- O Clean White Design System e componentes visuais.
- O enforcement de planos Free/Premium (`PLAN_LIMITS`).
- Os arquivos SQL, migrations e schema.
- Nenhum acesso ou alteração foi executado no Supabase remoto.

---

## 4. TESTES EXECUTADOS

1. **Testes de Lógica Financeira e Regressão (`test_etapa12.mjs`):**
   - Validação de `currentSaved === 0` e `percentage === 0%`: **Aprovado ✓**
   - Validação de fallback nullish seguro (`null`/`undefined`): **Aprovado ✓**
   - Validação da alternância entre mês atual e mês anterior nos relatórios com dados distintos: **Aprovado ✓**
   - Validação de contabilidade de parcelas antigas no mês anterior: **Aprovado ✓**
   - Validação de não regressão do cálculo de parcelamento: **Aprovado ✓**
   - **Resultado:** 15/15 asserções passaram com 0 falhas.

2. **Compilação e Build de Produção (`npm run build`):**
   - **Comando:** `tsc && vite build`
   - **Resultado:** Código de saída 0 (zero erros, zero warnings em 4.98s).

---

## 5. STATUS FINAL E EVENTUAIS PENDÊNCIAS

- As 3 correções pontuais da Etapa 11 foram implementadas com precisão cirúrgica.
- O código do projeto está totalmente pronto, estável e testado localmente.
- **Única pendência para a próxima etapa:** Aplicação ordenada das migrations no console do Supabase remoto quando for autorizado.

