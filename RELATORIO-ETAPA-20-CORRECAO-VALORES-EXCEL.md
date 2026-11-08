# RELATÓRIO — ETAPA 20: CORREÇÃO DA LEITURA DOS VALORES DA PLANILHA EXCEL

**Sistema:** Financeiro Express  
**Data:** 07 de Novembro de 2026  
**Responsável:** Engenheiro Sênior Full Stack & Auditor Financeiro  
**Status:** CONCLUÍDO COM 100% DE SUCESSO  

---

## 1. RESUMO EXECUTIVO

Na Etapa 19, foi implementado o importador de compras parceladas via Excel (`.xlsx`) e CSV. Durante a validação com a planilha real do usuário (`FATURA MES DEZEMBRO 2026.xlsx`), identificou-se uma divergência severa na interpretação dos valores monetários e cabeçalhos.

Nesta Etapa 20, a causa raiz foi diagnosticada no nível de célula binária do SheetJS, corrigida no parser de strings/números monetários e validada diretamente contra o arquivo original de referência.

### Referências Exigidas vs. Obtidas:

| Métrica | Referência Exigida | Obtido pelo Parser Corrigido | Status |
|---|---|---|---|
| **Quantidade de Compras** | 12 compras | 12 compras | 100% Conforme |
| **Soma dos Valores Totais** | R$ 12.185,51 | **R$ 12.185,51** | 100% Conforme |
| **Soma dos Valores das Parcelas** | R$ 1.506,80 | **R$ 1.506,80** | 100% Conforme |
| **Cartão Identificado** | Cartão AVO | Cartão AVO | 100% Conforme |
| **Vencimento como Data de Pagamento** | Vencimento pendente | Mantido pendente (sem quitação) | 100% Conforme |
| **Testes Automatizados** | Bateria completa | 36 / 36 aprovados | 100% Conforme |
| **Compilação TypeScript & Vite** | 0 erros | `tsc && vite build` com 0 erros | 100% Conforme |
| **Supabase Remoto** | Intocado | 100% Intocado | 100% Conforme |

---

## 2. CAUSA EXATA DO ERRO

A auditoria direta na planilha original revelou **três causas interligadas**:

### Causa A: Inversão de separadores na função `parseMonetaryValue`
- No Excel, as células numéricas foram formatadas sob a máscara monetária padrão americana/internacional com `R$`: `" R$ 1,078.38 "` e `" R$ 2,248.71 "`. Nesse formato, a vírgula `,` é o separador de milhar e o ponto `.` é o separador decimal.
- O parser anterior continha a seguinte lógica ingênua:
  ```ts
  if (cleanStr.includes(',') && cleanStr.includes('.')) {
    return parseFloat(cleanStr.replace(/\./g, '').replace(',', '.')) || 0;
  }
  ```
- **Consequência desastrosa:** Como o valor continha tanto `,` quanto `.`, o código removeu o ponto (eliminando a casa decimal) e converteu a vírgula para ponto.
  - O valor `1,078.38` tornou-se `1.07838` (R$ 1,08 em vez de R$ 1.078,38).
  - O valor `2,248.71` tornou-se `2.24871` (R$ 2,25 em vez de R$ 2.248,71).
  - O valor `1,200.00` tornou-se `1.20000` (R$ 1,20 em vez de R$ 1.200,00).

### Causa B: Uso de `raw: false` no SheetJS forçando conversão para string formatada
- O SheetJS estava configurado com `{ raw: false }`, o que forçava a extração da representação visual (`cell.w`) em vez do valor numérico real (`cell.v`).
- No arquivo original, as células da coluna `VALOR TOTAL` continham números puros (`1078.38`, `2248.71`) e a coluna `VALOR PARCELA` continha fórmulas nativas do Excel (`=C2/E2`, `=C3/E3`, etc.) que avaliavam para floats com dízimas (ex: `134.7975`, `224.871`, `116.92333333333333`).
- Ao usar `raw: false`, SheetJS devolvia strings mascaradas, sujeitas a falhas de parsing de locale.

### Causa C: Conflito de palavra-chave `'compra'` na detecção de colunas
- A lista de sinônimos para `colDescricao` continha a palavra `'compra'`.
- Como a primeira coluna da planilha chamava-se `'DATA COMPRA'`, o localizador de colunas encontrou `'compra'` na coluna 0 e mapeou a coluna de data como se fosse a descrição do produto.

---

## 3. ARQUIVOS CORRIGIDOS

1. **`src/lib/installmentExcelParser.ts`**:
   - `parseMonetaryValue`: reescrito para analisar a posição relativa do último separador (vírgula vs ponto), suportando com total fidelidade:
     - Números nativos do JavaScript (passagem direta);
     - Strings padrão brasileiro (`R$ 1.234,56`, `1.250,50`, `134,80`);
     - Strings padrão internacional/Excel (` R$ 1,078.38 `, `1,234.56`, `134.80`);
     - Múltiplos separadores de milhar (`1.000.000,00` e `1,000,000.00`);
     - Valores negativos com sinal ou parênteses.
   - `parseDateToIsoDate`: atualizado para usar métodos UTC (`getUTCFullYear`, `getUTCMonth`, `getUTCDate`), eliminando distorções de fuso horário de servidores/clientes e aceitando formatos ISO, BR (`DD/MM/YYYY`) e US curto (`MM/DD/YY`).
   - `findColumnIndex`: removido o token ambíguo `'compra'` da coluna de descrição; agora a descrição mapeia com precisão para `DESCRIÇÃO`.
   - `parseInstallmentFile`: configurado `raw: true` para ler os valores numéricos e datas reais calculadas pelo Excel, aplicando `roundToCents` nos valores de parcela e total.
   - Detecção de divergência: adicionado alerta visual caso haja inconsistência entre o valor da parcela vezes o total de parcelas e o valor total original.

2. **`src/context/FinanceContext.tsx`**:
   - Atualizado o método `importInstallmentPurchases` para utilizar `p.installmentAmount` diretamente como valor de cada parcela pendente criada, respeitando rigorosamente a regra de negócio de não recalcular ou reestimar o valor fixado na planilha.

3. **`src/components/transactions/ImportSpreadsheetModal.tsx`**:
   - Integração da sinalização visual de divergência na tabela de pré-visualização;
   - Garantia de recálculo com arredondamento contábil de centavos na edição inline de linhas.

4. **`.gitignore`**:
   - Adicionada exclusão para `*.xlsx`, `*.xls` e `scratch/`, protegendo planilhas pessoais do usuário contra versionamento acidental.

---

## 4. COMPARAÇÃO DOS 12 REGISTROS DA PLANILHA ORIGINAL

Auditoria linha por linha dos 12 registros extraídos diretamente do arquivo `FATURA MES DEZEMBRO 2026.xlsx`:

| Linha | Descrição | Valor Total (R$) | Cartão | Total Parc. | Parc. Atual | Parc. Pendentes | Valor Parcela (R$) | Data Compra | Vencimento | Divergência |
|:---:|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **2** | capa+capacete | R$ 1.078,38 | Cartão AVO | 8x | 6 | 3x | R$ 134,80 | 2025-12-21 | 2026-02-09 | Nenhuma |
| **3** | joas maciel | R$ 2.248,71 | Cartão AVO | 10x | 6 | 5x | R$ 224,87 | 2025-12-21 | 2026-02-09 | Nenhuma |
| **4** | mercado livre | R$ 701,54 | Cartão AVO | 6x | 6 | 1x | R$ 116,92 | 2025-09-06 | 2026-06-09 | Nenhuma |
| **5** | otica | R$ 1.200,00 | Cartão AVO | 10x | 5 | 6x | R$ 120,00 | 2025-09-06 | 2026-06-09 | Nenhuma |
| **6** | mercado livre | R$ 557,90 | Cartão AVO | 7x | 5 | 3x | R$ 79,70 | 2025-09-06 | 2026-06-09 | Nenhuma |
| **7** | shopee | R$ 1.671,05 | Cartão AVO | 8x | 5 | 4x | R$ 208,88 | 2025-09-06 | 2026-06-09 | Nenhuma |
| **8** | shopee | R$ 443,99 | Cartão AVO | 5x | 5 | 1x | R$ 88,80 | 2025-09-06 | 2026-06-09 | Nenhuma |
| **9** | amazon | R$ 508,64 | Cartão AVO | 7x | 5 | 3x | R$ 72,66 | 2025-09-06 | 2026-06-09 | Nenhuma |
| **10** | amil dental | R$ 1.198,00 | Cartão AVO | 12x | 4 | 9x | R$ 99,83 | 2025-09-06 | 2026-06-09 | Nenhuma |
| **11** | pneu motocruz | R$ 998,00 | Cartão AVO | 10x | 2 | 9x | R$ 99,80 | 2025-09-06 | 2026-06-09 | Nenhuma |
| **12** | barcia e pia banheiro | R$ 1.074,30 | Cartão AVO | 8x | 2 | 7x | R$ 134,29 | 2025-09-06 | 2026-06-09 | Nenhuma |
| **13** | Armazem | R$ 505,00 | Cartão AVO | 4x | 2 | 3x | R$ 126,25 | 2025-09-06 | 2026-06-09 | Nenhuma |

### Valores Consolidados:
- **Soma dos Valores Totais:** `1078.38 + 2248.71 + 701.54 + 1200.00 + 557.90 + 1671.05 + 443.99 + 508.64 + 1198.00 + 998.00 + 1074.30 + 505.00` = **R$ 12.185,51** (conferência 100% exata).
- **Soma dos Valores das Parcelas:** `134.80 + 224.87 + 116.92 + 120.00 + 79.70 + 208.88 + 88.80 + 72.66 + 99.83 + 99.80 + 134.29 + 126.25` = **R$ 1.506,80** (conferência 100% exata).

---

## 5. RESULTADO DOS TESTES AUTOMATIZADOS

Execução do script de validação rigorosa (`scratch/test_etapa20_validation.cjs`):

```
================================================================
=== BATERIA DE TESTES AUTOMATIZADOS — ETAPA 20 (VALORES EXCEL) ===
================================================================

--- TESTE 1: PARSER MONETÁRIO BRL / US / NUMÉRICOS ---
  ✓ [PASS] Número nativo com decimais (1078.38)
  ✓ [PASS] Dízima periódica arredondada (134.7975 -> 134.80)
  ✓ [PASS] String formatada Excel US com R$ (" R$ 1,078.38 ")
  ✓ [PASS] String formatada brasileira ("R$ 1.250,50")
  ✓ [PASS] String com vírgula decimal única ("134,80")
  ✓ [PASS] String com ponto decimal único ("134.80")
  ✓ [PASS] String monetária brasileira de grande porte ("R$ 12.185,51")
  ✓ [PASS] Zero e nulos tratados como 0

--- TESTE 2: PARSER DE DATAS ---
  ✓ [PASS] Date object UTC preserva dia (2025-12-21T03:00:28Z)
  ✓ [PASS] Formato brasileiro DD/MM/YYYY ("15/01/2026")
  ✓ [PASS] Formato americano curto MM/DD/YY ("12/21/25")
  ✓ [PASS] Formato ISO YYYY-MM-DD ("2026-06-09")

--- TESTE 3: AUDITORIA DA PLANILHA ORIGINAL (FATURA MES DEZEMBRO 2026.xlsx) ---
  ✓ [PASS] Cabeçalho DATA COMPRA identificado
  ✓ [PASS] Cabeçalho DESCRIÇÃO identificado (sem conflito com compra)
  ✓ [PASS] Cabeçalho VALOR TOTAL identificado
  ✓ [PASS] Cabeçalho CARTÃO UTILIZADO identificado
  ✓ [PASS] Cabeçalho TOTAL PARCELAS identificado
  ✓ [PASS] Cabeçalho PARCELA ATUAL identificado
  ✓ [PASS] Cabeçalho VALOR PARCELA identificado
  ✓ [PASS] Cabeçalho DATA PAGAMENTO identificado
  ✓ [PASS] Cabeçalho STATUS identificado
  ✓ [PASS] Linha 2 (capa+capacete): Total = R$ 1078.38, Parcela = R$ 134.80, Pendentes = 3x
  ✓ [PASS] Linha 3 (joas maciel): Total = R$ 2248.71, Parcela = R$ 224.87, Pendentes = 5x
  ✓ [PASS] Linha 4 (mercado livre): Total = R$ 701.54, Parcela = R$ 116.92, Pendentes = 1x
  ✓ [PASS] Linha 5 (otica): Total = R$ 1200.00, Parcela = R$ 120.00, Pendentes = 6x
  ✓ [PASS] Linha 6 (mercado livre): Total = R$ 557.90, Parcela = R$ 79.70, Pendentes = 3x
  ✓ [PASS] Linha 7 (shopee): Total = R$ 1671.05, Parcela = R$ 208.88, Pendentes = 4x
  ✓ [PASS] Linha 8 (shopee): Total = R$ 443.99, Parcela = R$ 88.80, Pendentes = 1x
  ✓ [PASS] Linha 9 (amazon): Total = R$ 508.64, Parcela = R$ 72.66, Pendentes = 3x
  ✓ [PASS] Linha 10 (amil dental): Total = R$ 1198.00, Parcela = R$ 99.83, Pendentes = 9x
  ✓ [PASS] Linha 11 (pneu motocruz): Total = R$ 998.00, Parcela = R$ 99.80, Pendentes = 9x
  ✓ [PASS] Linha 12 (barcia e pia banheiro): Total = R$ 1074.30, Parcela = R$ 134.29, Pendentes = 7x
  ✓ [PASS] Linha 13 (Armazem): Total = R$ 505.00, Parcela = R$ 126.25, Pendentes = 3x

--- TESTE 4: SOMA DOS TOTAIS DA PLANILHA ---
  ✓ [PASS] Soma dos valores totais é R$ 12.185,51 (obtido: 12185.51)
  ✓ [PASS] Soma dos valores das parcelas é R$ 1.506,80 (obtido: 1506.80)

--- TESTE 5: PREVENÇÃO DE DUPLICIDADES E DETECÇÃO DE DIVERGÊNCIA ---
  ✓ [PASS] Detecção de divergência (1000 vs 5x300=1500 detectada)

================================================================
TOTAL DE TESTES: 36 | APROVADOS: 36 | FALHAS: 0
================================================================
🎉 TODOS OS TESTES PASSARAM COM 100% DE SUCESSO!
```

---

## 6. RESULTADO DA COMPILAÇÃO

Executado comando de build do ecossistema de produção:

```bash
npm run build (tsc && vite build)
```

Resultado:
- **TypeScript:** 0 erros de compilação.
- **Vite:** 2.116 módulos transformados com sucesso em 7.42s.
- **Chunks gerados:** `dist/index.html`, `dist/assets/*.js`, `dist/assets/*.css`.

---

## 7. CONFIRMAÇÃO DE SEGURANÇA E INTEGRIDADE

1. **Supabase Remoto Intocado:**
   - Nenhum comando SQL ou migração foi executado contra instâncias remotas.
   - Nenhuma credencial ou configuração de ambiente de produção foi modificada.
2. **Integridade Contábil:**
   - Nenhuma parcela é marcada como paga na importação (`paid_at = null`, `status = pending | overdue`).
   - O saldo de contas correntes/carteiras não sofre qualquer desconto na importação.
   - O parcelamento reutiliza a infraestrutura de `installment_group_id`, `installment_number`, `installment_total` e `installment_purchase_amount`.
3. **Privacidade de Dados:**
   - A planilha `FATURA MES DEZEMBRO 2026.xlsx` e a pasta temporária de testes `scratch/` foram adicionadas ao `.gitignore` para impedir que dados financeiros do usuário sejam enviados a repositórios externos.

