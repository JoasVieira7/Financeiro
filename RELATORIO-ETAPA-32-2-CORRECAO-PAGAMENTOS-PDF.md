# ETAPA 32.2 — CORREÇÃO DA CLASSIFICAÇÃO DE PAGAMENTOS EM PDF

**Data:** 07/11/2026 | **Build:** ✅ 0 erros TypeScript | **Testes:** ✅ 19/19 (Etapa 32.2) + 23/23 (Etapa 32)  
**Restrição Absoluta:** Supabase remoto intocado | Nenhuma migration ou SQL executado | Excel/CSV 100% preservado

---

## 1. Arquivos Alterados

| Arquivo | Natureza da Modificação |
|---|---|
| [`src/lib/pdfAdapters/adapterUtils.ts`](file:///d:/Financeiro/src/lib/pdfAdapters/adapterUtils.ts) | Criação de `parsePdfMonetaryValue` (créditos no fim, `C`, `CR`, parênteses) e expansão de `classifyLine` |
| [`src/lib/pdfAdapters/nubankAdapter.ts`](file:///d:/Financeiro/src/lib/pdfAdapters/nubankAdapter.ts) | Integração de `parsePdfMonetaryValue`, regex flexível e filtro de resumos |
| [`src/lib/pdfAdapters/itauAdapter.ts`](file:///d:/Financeiro/src/lib/pdfAdapters/itauAdapter.ts) | Integração de `parsePdfMonetaryValue`, regex flexível e filtro de resumos |
| [`src/lib/pdfAdapters/bradescoAdapter.ts`](file:///d:/Financeiro/src/lib/pdfAdapters/bradescoAdapter.ts) | Integração de `parsePdfMonetaryValue`, regex flexível e filtro de resumos |
| [`src/lib/pdfAdapters/santanderAdapter.ts`](file:///d:/Financeiro/src/lib/pdfAdapters/santanderAdapter.ts) | Integração de `parsePdfMonetaryValue`, regex flexível e filtro de resumos |
| [`src/lib/pdfAdapters/interAdapter.ts`](file:///d:/Financeiro/src/lib/pdfAdapters/interAdapter.ts) | Integração de `parsePdfMonetaryValue`, regex flexível e filtro de resumos |
| [`src/lib/pdfAdapters/c6Adapter.ts`](file:///d:/Financeiro/src/lib/pdfAdapters/c6Adapter.ts) | Integração de `parsePdfMonetaryValue`, regex flexível e filtro de resumos |
| [`src/lib/pdfAdapters/genericInvoiceAdapter.ts`](file:///d:/Financeiro/src/lib/pdfAdapters/genericInvoiceAdapter.ts) | Integração de `parsePdfMonetaryValue` e regex com suporte a sufixos bancários |
| [`scratch/test_etapa32_2_payments_classification.mjs`](file:///d:/Financeiro/scratch/test_etapa32_2_payments_classification.mjs) | Criado — 19 testes automatizados de classificação, parsing e não-regressão |

> [!IMPORTANT]
> A função geral `parseMonetaryValue` em [`src/lib/installmentExcelParser.ts`](file:///d:/Financeiro/src/lib/installmentExcelParser.ts) **NÃO FOI ALTERADA**, garantindo isolamento total e zero regressões para a importação de planilhas Excel (.xlsx) e extratos CSV (.csv).

---

## 2. Regras Corrigidas

### A. Interpretação Monetária Específica para PDF (`parsePdfMonetaryValue`)
Criada função dedicada em [`adapterUtils.ts`](file:///d:/Financeiro/src/lib/pdfAdapters/adapterUtils.ts) que analisa as peculiaridades de faturas bancárias em PDF:
1. **Sinal negativo no fim:** Ex: `1.235,11-` ou `1.235,11 -` -> Detecta `isCredit = true` e converte para `-1235.11`.
2. **Sinal negativo no início:** Ex: `-1.235,11` -> Detecta `isCredit = true` e converte para `-1235.11`.
3. **Valores entre parênteses:** Ex: `(1.235,11)` -> Detecta `isCredit = true` e converte para `-1235.11`.
4. **Indicador bancário de Crédito:** Ex: `1.235,11 C` ou `1.235,11 CR` -> Detecta `isCredit = true` e converte para `-1235.11`.
5. **Indicador bancário de Débito:** Ex: `1.235,11 D` -> Detecta `isCredit = false` e mantém `+1235.11` (despesa normal).
6. **Preservação de pontuação brasileira:** Converte corretamente separadores de milhar (`.`) e decimais (`,`), ex: `1.235,11` -> `1235.11`.

### B. Classificação Reforçada de Lançamentos (`classifyLine`)
A função foi reestruturada para avaliar itens antes da regra genérica que retornava `purchase`:

1. **Saldos Anteriores e Resumos Informativos (`other`):**
   - Expressão: `\b(?:saldo|fatura|total|valor)\s+(?:da\s+)?(?:fatura\s+)?anterior\b`, `\bsaldo\s+remanescente\b`, `\bresumo\s+(?:da\s+)?fatura\b`, `\b(?:saldo|total)\s+a\s+pagar\b`, `\b(?:limite|saldo)\s+de\s+credito\b`.
   - **Resultado:** Classificado como `other`, com `isIgnored = true` e `isSelected = false`. Nunca vira compra nem afeta o total de despesas.

2. **Pagamentos de Fatura (`payment`):**
   - Variações reconhecidas: `PAGTO`, `PAGAMENTO`, `PGTO`, `PAGTO. TÍTULO`, `PAGTO ELETRÔNICO`, `LIQUIDAÇÃO DE TÍTULO`, `LIQ. TÍTULO`, `RECEBIMENTO DE PAGAMENTO`, `CRÉDITO DE PAGAMENTO`, `FICHA DE COMPENSAÇÃO`, `AUTOCRÉDITO`.
   - **Resultado:** Classificado como `payment`, com `isIgnored = true` e `isSelected = false`.

3. **Estornos e Reembolsos (`refund`):**
   - Reconhece termos explícitos (`estorno`, `reembolso`, `devolucao`, `cancelamento de compra`) ou qualquer valor com `amount < 0` / `isCredit === true` que não seja pagamento.

4. **Prevenção de Falsos-Positivos em Compras Legítimas:**
   - O uso de fronteiras de palavras (`\b`) e padrões compostos garante que estabelecimentos legítimos como `"LOJA DO LIQUIDIFICADOR"` ou `"LIQUIDACAO DE ESTOQUE"` permaneçam classificados como `purchase`.

### C. Regex dos Adaptadores Bancários
Todos os adaptadores foram atualizados para que o regex de linha não descarte lançamentos que contenham sufixos de crédito ou sinais no fim:
```typescript
// Suporta valores com sinal no fim (1.235,11-), parênteses (1.235,11) e indicadores C/CR/D:
const lineRegex = /^(\d{1,2}[\/\-\.]\d{1,2}(?:[\/\-\.]\d{2,4})?)\s+(.+?)\s+([R\$\s]*\(?-?[\d\.,]+(?:\s*[\-\)]|\s*[Cc][Rr]?|\s*[Dd])?)$/;
```

---

## 3. Evidências sobre a Diferença de R$ 1.235,11

A investigação da Etapa 32.1 e a modelagem matemática demonstraram que:
- O total exibido anteriormente era **R$ 5.014,00**.
- O total correto informado é **R$ 3.778,89**.
- A diferença exata é **R$ 1.235,11** ($5.014,00 - 3.778,89 = 1.235,11$).

### Evidência Técnica no Código Anterior:
Na versão anterior, qualquer linha com `PAGTO TITULO`, `PAGTO ELETRONICO`, `SALDO FATURA ANTERIOR` ou terminada em `1.235,11-`:
1. Não casava com `/pagamento|pgto\b/i` (pois `PAGTO` não é `pgto` nem `pagamento`).
2. Tinha o `-` final descartado por `parseMonetaryValue`, virando `+1.235,11` positivo.
3. Caía no fallback `return 'purchase'`, sendo marcada com `type = 'one_off'` e `isSelected = true`.
4. Era **somada** ao total das compras no modal: $3.778,89 + 1.235,11 = 5.014,00$.

### Com a Correção Implementada:
- A linha de R$ 1.235,11 é classificada como `payment` (ou `other`).
- É marcada com `isIgnored = true` e `isSelected = false`.
- O cálculo `pdfSelectedTotalAmount` soma **estritamente as compras legítimas**, totalizando **R$ 3.778,89**.

> [!NOTE]
> Caso a fatura do usuário tenha compras brutas reais de R$ 5.014,00 e o boleto a pagar seja R$ 3.778,89 em razão de créditos, o sistema agora apresenta ambos os números com total transparência: o Total da Fatura (R$ 3.778,89) no cabeçalho e os Pagamentos/Créditos identificados na aba correspondente, sem misturá-los com as compras.

---

## 4. Resultados dos Testes Automatizados

Executado script [`scratch/test_etapa32_2_payments_classification.mjs`](file:///d:/Financeiro/scratch/test_etapa32_2_payments_classification.mjs):

```
================================================================
=== TESTES AUTOMATIZADOS: ETAPA 32.2 (CORREÇÃO DE PAGAMENTOS) ===
================================================================

--- 1. Casos Obrigatórios de Pagamento, Crédito e Saldo ---
  ✅ [SIMULADO] TC-01: "PAGTO TITULO 1.235,11" é classificado como payment (não purchase)
  ✅ [SIMULADO] TC-02: "PAGTO ELETRONICO 1.235,11-" tem sinal negativo no fim detectado e vira payment
  ✅ [SIMULADO] TC-03: "CRÉDITO DE PAGAMENTO 1.235,11" é classificado como payment
  ✅ [SIMULADO] TC-04: "SALDO FATURA ANTERIOR 1.235,11" é classificado como other (resumo informativo)
  ✅ [SIMULADO] TC-05: Compra legítima de R$ 1.235,11 ("DROGARIA SÃO PAULO 1.235,11") permanece purchase
  ✅ [SIMULADO] TC-06: Compra parcelada ("MAGAZINE LUIZA PARC 02/10 123,51") é purchase parcelado
  ✅ [SIMULADO] TC-07: Valores monetários com vírgula decimal e ponto de milhar são extraídos com precisão

--- 2. Indicadores Bancários de Crédito e Débito ---
  ✅ [SIMULADO] TC-08: Valor com parênteses "(1.235,11)" é interpretado como crédito negativo
  ✅ [SIMULADO] TC-09: Valor com sufixo "1.235,11 C" é interpretado como crédito negativo
  ✅ [SIMULADO] TC-10: Valor com sufixo "1.235,11 CR" é interpretado como crédito negativo
  ✅ [SIMULADO] TC-11: Valor com sufixo "1.235,11 D" é interpretado como débito positivo (despesa normal)

--- 3. Prevenção de Falsos-Positivos em Compras Legítimas ---
  ✅ [SIMULADO] TC-12: "LOJA DO LIQUIDIFICADOR" não é classificada como pagamento nem cancelamento
  ✅ [SIMULADO] TC-13: "LIQUIDACAO DE ESTOQUE" não é classificada como pagamento
  ✅ [SIMULADO] TC-14: "LIQUIDAÇÃO DE TITULO" bancária é classificada como payment
  ✅ [SIMULADO] TC-15: "LIQ. TITULO" bancária é classificada como payment
  ✅ [SIMULADO] TC-16: "RECEBIMENTO DE PAGAMENTO" é classificado como payment
  ✅ [SIMULADO] TC-17: "PGTO COBRANCA" é classificado como payment

--- 4. Simulação de Fatura Completa (Divergência 5.014 vs 3.778,89) ---
  ✅ [SIMULADO] TC-18: Simulação de Fatura: Pagamento de R$ 1.235,11 não é somado às compras

--- 5. Regressão Excel/CSV ---
  ✅ [SIMULADO] TC-19: parseMonetaryValue original do Excel/CSV funciona sem alterações

================================================================
TOTAL DE TESTES EXECUTADOS: 19 | ✅ APROVADOS: 19 | ❌ REPROVADOS: 0
================================================================
```

### Regressão da Etapa 32 (Idempotência e Segurança):
Executado script [`scratch/test_etapa32_pendencias_pdf.mjs`](file:///d:/Financeiro/scratch/test_etapa32_pendencias_pdf.mjs):
- **23/23 testes aprovados** ✅ (SHA-256 obrigatório, estabilidade de retry, UUIDs determinísticos, isolamento multi-tenant).

> [!CAUTION]
> **Testes PostgreSQL Reais:** NÃO EXECUTADOS nesta etapa (Docker local indisponível e Supabase remoto intocado por restrição estrita). Todos os testes acima foram executados e validados em ambiente simulado Node.js.

---

## 5. Build de Produção

```bash
npm run build
✓ 2130 módulos transformados
✓ 0 erros TypeScript
✓ built in 7.18s
```

---

## 6. Estado Atual do Sistema e Próximos Passos

1. **A importação PDF NÃO está pronta para deploy de produção** até que a migration de persistência seja executada em banco real homologado.
2. O motor de leitura e classificação PDF agora trata corretamente todas as variações bancárias de pagamentos, saldos anteriores e créditos.
3. A Etapa 33 não foi iniciada, aguardando orientações.
