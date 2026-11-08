# ETAPA 30 — VALIDAÇÃO FINAL DA RPC E IDEMPOTÊNCIA

**Data:** 07/11/2026  
**Escopo:** Auditoria técnica localizada — sem novas funcionalidades  
**Restrição:** Supabase remoto intocado | Sem execução SQL remota

---

## 1. Ambiente de Execução

| Item | Status |
|------|--------|
| Supabase CLI | ✅ Disponível (`supabase.ps1` via npm global) |
| Docker | ❌ Não instalado |
| PostgreSQL local | ❌ Sem banco local disponível |
| Testes de integração reais | ⚠️ **NÃO EXECUTADOS** — sem ambiente PostgreSQL local |
| Build TypeScript | ✅ 0 erros — 2130 módulos — 6,57s |

> [!IMPORTANT]
> Por ausência de Docker e PostgreSQL local, **nenhum teste de integração real PostgreSQL foi executado**.
> Todos os testes desta etapa são **simulados em JavaScript puro**. A atomicidade PostgreSQL declarada na migration é **lógicamente correta mas não homologada em banco real**.

---

## 2. Auditoria da Migration

**Arquivo:** [`supabase/migrations/20261107202000_pdf_import_idempotency_rpc.sql`](file:///d:/Financeiro/supabase/migrations/20261107202000_pdf_import_idempotency_rpc.sql)

### 2.1 Achados e Correções Aplicadas

#### ✅ CORRIGIDO — Achado A: `search_path` não-mínimo

**Antes:**
```sql
SET search_path = public, auth, pg_temp
```
**Depois:**
```sql
SET search_path = ''
```
Todos os objetos no corpo da função já estavam completamente qualificados (`public.transactions`, `public.import_operations`, `auth.uid()`), tornando a mudança segura e imediata. Elimina qualquer vetor de *search_path hijacking* conforme boas práticas Supabase/PostgreSQL.

---

#### ✅ CORRIGIDO — Achado B: `p_payload_hash` não validado

**Risco:** Se `null` ou string vazia fossem enviados, a checagem de conflito `IS DISTINCT FROM` poderia aceitar a operação e registrar um hash nulo — abrindo brecha para uma segunda importação com payload real que seria aceita sem conflito.

**Correção adicionada (após validação de `p_idempotency_key`):**
```sql
IF p_payload_hash IS NULL OR length(trim(p_payload_hash)) < 32 THEN
  RAISE EXCEPTION 'Hash do payload inválido ou ausente (mínimo 32 caracteres).';
END IF;
```

---

#### ✅ CORRIGIDO — Achado C: `v_status` sem validação de ENUM

**Risco:** Um cliente malicioso poderia enviar `"status": "paid"` no JSON e a função inseriria a transação como paga, afetando o cálculo de saldo.

**Correção adicionada (dentro do loop, após extração do status):**
```sql
IF v_status NOT IN ('pending', 'overdue') THEN
  v_status := 'pending';
END IF;
```
Importações nunca produzem transações com `status = 'paid'`. O campo `paid_at` já era `NULL` fixo — agora `status` também é sanitizado.

---

### 2.2 Pontos Auditados sem Alteração (Corretos)

| Verificação | Resultado |
|------------|-----------|
| `SECURITY DEFINER` declarado | ✅ Presente na linha 80 |
| `auth.uid()` validado antes de qualquer operação | ✅ Primeira instrução do BEGIN |
| Usuário não pode inserir em nome de outro | ✅ `user_id = v_user_id` sempre forçado pelo auth |
| `REVOKE EXECUTE FROM PUBLIC` | ✅ Linha 251 |
| `GRANT EXECUTE TO authenticated` | ✅ Linha 252 |
| `UNIQUE (user_id, idempotency_key)` | ✅ Constraint `uq_import_operations_user_key` |
| Mesma chave + payload diferente → rejeição | ✅ `IS DISTINCT FROM` → `RAISE EXCEPTION` |
| Transações e `import_operations` na mesma transação | ✅ Corpo único da função PL/pgSQL |
| `paid_at` sempre NULL em importações | ✅ Hardcoded `NULL` na linha 204 |
| RLS em `import_operations` | ✅ Políticas SELECT e INSERT com `auth.uid() = user_id` |

---

### 2.3 Ponto Documentado (sem alteração necessária)

**Achado D — Cast UUID sem mensagem clara:**  
`v_tx_id := COALESCE((v_tx->>'id')::uuid, gen_random_uuid())` — se o campo `id` for UUID inválido, o cast lança exceção não tratada. Isso provoca ROLLBACK completo (comportamento **correto**), mas sem identificar qual item falhou. Não foi alterado por ser comportamento seguro; mensagem de erro é melhorável em versão futura.

---

## 3. Auditoria do `idempotency.ts`

**Arquivo:** [`src/lib/idempotency.ts`](file:///d:/Financeiro/src/lib/idempotency.ts)

| Verificação | Resultado |
|------------|-----------|
| `computeSha256()` usa `crypto.subtle` com fallback FNV-1a | ✅ |
| Fallback FNV-1a produz 64 chars hex (≥ 32 chars exigidos pela migration) | ✅ |
| `idempotencyKey` inclui `userId.substring(0,8)` — isolamento multi-tenant | ✅ |
| Edição de qualquer campo gera novo hash → nova chave | ✅ Confirmado no TC-13 |
| Mesma importação (retry) gera exatamente a mesma chave | ✅ Determinístico |
| `generateDeterministicUuid()` gera UUID RFC4122 v4 válido | ✅ Bit 4xxx e 8xxx|9xxx|axxx|bxxx |
| Normalização ordena por `purchaseDate + desc + amount` | ✅ Ordem estável |

**Separação chave vs hash:**  
A `idempotencyKey` = `pdf_{userId8}_{hash24}` já carrega a identidade do conteúdo nos primeiros 24 chars do SHA-256. Um usuário diferente com mesmo payload produz chave diferente (userId8 diverge). Comportamento correto — sem alteração necessária.

---

## 4. Testes Simulados

**Arquivo:** [`scratch/test_etapa30_final_validation.mjs`](file:///d:/Financeiro/scratch/test_etapa30_final_validation.mjs)

```
=== ETAPA 30 — Testes Simulados ===

  ✅ TC-01: Usuário não autenticado → rejeição
  ✅ TC-02: p_payload_hash NULL → rejeição
  ✅ TC-03: p_payload_hash curto (< 32 chars) → rejeição
  ✅ TC-04: Payload válido → gravação bem-sucedida
  ✅ TC-05: Mesma chave + mesmo payload → idempotente (retorno sem duplicação)
  ✅ TC-06: Mesma chave, payload diferente → conflito rejeitado
  ✅ TC-07: Status "paid" no JSON → forçado para "pending"
  ✅ TC-08: Status inválido desconhecido → forçado para "pending" (sem erro)
  ✅ TC-09: Valor negativo → rejeição
  ✅ TC-10: Descrição vazia → rejeição
  ✅ TC-11: Isolamento multi-tenant — USER_B não vê operações de USER_A
  ✅ TC-12: Chave de idempotência inclui userId (8 chars) — isolamento confirmado
  ✅ TC-13: Edição de 1 centavo no payload gera chave diferente
  ✅ TC-14: search_path = "" não quebra objetos qualificados (simulação)
  ✅ TC-15: Regressão Excel/CSV — importação existente não afetada

──────────────────────────────────────────────────
Total: 15 | ✅ 15 aprovados | ❌ 0 reprovados
```

> [!NOTE]
> Estes são testes **simulados** em JS puro. Replicam a lógica PL/pgSQL da função mas não executam SQL real. Resultados documentam corretude lógica — não substituem testes de integração PostgreSQL.

---

## 5. Build de Produção

```
npm run build
✓ 2130 módulos transformados
✓ 0 erros TypeScript
✓ built in 6.57s
```

| Chunk | Tamanho |
|-------|---------|
| `pdf.worker.min-*.mjs` | 1.272 MB |
| `index-*.js` | 1.357 MB (gzip: 402 KB) |
| `supabase-vendor-*.js` | 227 KB |

> [!TIP]
> O aviso de chunks > 1 MB é esperado e pré-existente (pdf.worker + bundle principal). Não impede deploy.

---

## 6. Arquivos Alterados nesta Etapa

| Arquivo | Tipo de alteração |
|---------|------------------|
| [`supabase/migrations/20261107202000_pdf_import_idempotency_rpc.sql`](file:///d:/Financeiro/supabase/migrations/20261107202000_pdf_import_idempotency_rpc.sql) | 3 correções de segurança: `search_path`, validação de hash, sanitização de status |
| [`scratch/test_etapa30_final_validation.mjs`](file:///d:/Financeiro/scratch/test_etapa30_final_validation.mjs) | Criado — 15 testes simulados |

**Nenhum arquivo de produção React/TypeScript foi alterado nesta etapa.**

---

## 7. Pendências para Liberação em Produção

> [!CAUTION]
> As seguintes pendências **impedem** a ativação da importação PDF em produção:

### PENDÊNCIA 1 — Migration não aplicada no Supabase remoto
A migration `20261107202000_pdf_import_idempotency_rpc.sql` existe apenas localmente.  
Para ativá-la:
```bash
supabase db push   # ou migration apply via dashboard Supabase
```
**Ação necessária:** Revisão e aprovação da migration por responsável com acesso ao projeto Supabase remoto.

### PENDÊNCIA 2 — Testes de integração PostgreSQL reais não executados
Sem Docker ou PostgreSQL local disponível, nenhum teste real foi executado.  
Comportamentos que **requerem teste real** antes de produção:
- Atomicidade real do ROLLBACK ao falhar a N-ésima inserção de um lote de 50
- Comportamento de requisições concorrentes com a mesma `idempotency_key`
- Tempo de resposta da função sob carga moderada
- Validação do `ON CONFLICT` via constraint UNIQUE em concorrência real

### PENDÊNCIA 3 — Ausência de monitoramento pós-deploy
Sem alertas para:
- Importações com `already_processed: true` repetidas (possível bug no cliente)
- Importações que falham após retentativas (timeout, rede)
- Crescimento da tabela `import_operations` sem purga automática

---

## 8. Estado Atual do Sistema

| Componente | Estado |
|------------|--------|
| Motor PDF (`pdfInvoiceParser.ts`) | ✅ Funcional |
| Adaptadores bancários (6 bancos + genérico) | ✅ Funcional |
| Interface de importação (`ImportSpreadsheetModal.tsx`) | ✅ Funcional |
| Idempotência cliente (`idempotency.ts`) | ✅ Funcional |
| Migration RPC local | ✅ Corrigida e versionada |
| Migration RPC remota | ⚠️ **NÃO APLICADA** |
| Importação PDF em modo Supabase | ⚠️ **BLOQUEADA** até aplicar migration |
| Importação PDF em modo Demo (localStorage) | ✅ Funcional |
| Importação Excel/CSV | ✅ Preservada intacta |
| Supabase remoto | ✅ Intocado |

---

## 9. Decisões Técnicas Reafirmadas

| Decisão | Justificativa |
|---------|---------------|
| Fallback HTTP removido (Etapa 29) | Sem RPC disponível, retorna erro informativo; impede gravação parcial não atômica |
| `paid_at = NULL` hardcoded | Importações nunca criam lançamentos pagos |
| `status` sanitizado para `'pending'/'overdue'` | Clientes não controlam estado financeiro via JSON |
| `user_id` sempre de `auth.uid()` | Zero confiança no campo `user_id` vindo do cliente |
| Chave determinística inclui `userId` | Garantia de isolamento multi-tenant na camada de idempotência |
