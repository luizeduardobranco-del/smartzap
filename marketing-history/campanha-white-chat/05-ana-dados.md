# WHITE CHAT — Medição, Métricas e Metas dos 90 Dias
**Autor:** Ana (Analista de Marketing e Dados) · **Data:** 22/08/2026

---

## ⚠️ 0. AVISO DE BASELINE — LEIA ANTES DE USAR QUALQUER NÚMERO DESTE DOCUMENTO

**Não existe nenhum dado histórico do WHITE CHAT.** Nenhuma campanha rodou, nenhum evento está instrumentado no produto, não há GA4 configurado, não há histórico de trial→paid, churn ou CAC real.

Por isso:
- **Todo número neste documento é META (o que queremos atingir) ou BENCHMARK (referência de mercado SaaS Brasil)** — nenhum é medição.
- Toda vez que um número aparece, ele vem rotulado: `[META]`, `[BENCHMARK]` ou `[PREMISSA]`.
- A prioridade #1 dos próximos 90 dias não é bater a meta — é **instrumentar o produto para que, em 90 dias, esses números deixem de ser estimativa e passem a ser medição real.**
- Todas as metas do documento devem ser revisadas assim que os primeiros 30 dias de dado real existirem (recalibração planejada na seção 5).

---

## 1. Árvore de Métricas do WHITE CHAT

### 1.1 Métrica-norte (North Star Metric): **Trials Ativados por Semana**

> Definição: número de contas trial que atingem o **momento de ativação** (definido na seção 3.2) dentro de 7 dias do cadastro, medido semanalmente.

**Por que essa e não as alternativas nesta fase:**

| Candidata | Por que NÃO é a métrica-norte agora |
|---|---|
| **Cadastros/Trials iniciados** | Vanity metric — cresce com lead ruim, tráfego mal segmentado ou bot. Não mede se o produto entregou valor. |
| **MRR** | Métrica de resultado, mas é **lagging** (atraso de semanas) e, com volume baixo em 90 dias (poucas dezenas de clientes), fica estatisticamente ruidosa — 1 venda a mais ou a menos muda o gráfico inteiro sem sinal real. |
| **Trial → Paid %** | Ótima métrica de eficiência, mas depende de uma base de trials ativados grande o suficiente para ser lida com confiança; nos primeiros 60 dias o n será baixo demais. |
| **NPS** | Não temos base de clientes pagantes para medir. Impossível de coletar hoje. |
| **WAU / Logins** | Mede engajamento, mas alguém pode logar sem o agente nunca ter respondido um cliente real — não prova entrega de valor. |

**Trials Ativados** é a métrica certa para os 90 dias porque:
1. É **leading** (antecede receita em dias, não meses) — dá tempo de corrigir campanha antes do fim do trimestre.
2. É **acionável semanalmente** — cada canal, cada criativo, cada etapa de onboarding pode ser testado contra ela.
3. Reflete **entrega real de valor** (o agente respondeu um cliente de verdade), que é o melhor preditor conhecido de conversão para pago em produtos self-serve de IA conversacional.
4. Tem **volume suficiente** para leitura estatística mesmo em 90 dias, ao contrário de MRR ou Trial→Paid.

### 1.2 Árvore completa (do topo de funil à métrica-norte e ao resultado financeiro)

```
                    ┌───────────────────────────┐
                    │   MRR (resultado final)    │
                    └─────────────┬─────────────┘
                                  │ alimentado por
                    ┌─────────────┴─────────────┐
                    │  Pagantes novos - Churn     │
                    └─────────────┬─────────────┘
                                  │ depende de
                    ┌─────────────┴─────────────┐
                    │   Trial → Paid (%)          │
                    └─────────────┬─────────────┘
                                  │ depende de
              ┌───────────────────┴───────────────────┐
              │   ★ TRIALS ATIVADOS/SEMANA (NORTH STAR) │
              └───────────────────┬───────────────────┘
                                  │ depende de
                    ┌─────────────┴─────────────┐
                    │   Trials Iniciados (signup) │
                    └─────────────┬─────────────┘
                                  │ depende de
                    ┌─────────────┴─────────────┐
                    │   Leads (cadastro iniciado) │
                    └─────────────┬─────────────┘
                                  │ depende de
                    ┌─────────────┴─────────────┐
                    │  Visitantes qualificados    │
                    │  (por canal/UTM)             │
                    └─────────────┬─────────────┘
                                  │ depende de
        ┌────────────┬────────────┼────────────┬────────────┐
        │  CPL/CPC     │  CTR criativo│  Volume de   │  Segmentação │
        │  por canal   │  e anúncio   │  impressões  │  ICP (agência│
        │              │              │  (budget)    │  / comercial)│
        └────────────┘└────────────┘└────────────┘└────────────┘

  Métricas de entrada (inputs que a equipe controla diretamente):
  - CPC/CPL por canal (Google, Meta, LinkedIn, orgânico, outbound)
  - Taxa de conclusão do cadastro (signup_started → signup_completed)
  - Taxa de conexão de canal (WhatsApp QR / Instagram / widget conectado)
  - Tempo até a 1ª resposta de IA a um cliente real (velocidade de ativação)
  - Taxa de ativação (% de trials que chegam ao aha moment)
```

---

## 2. Momento de Ativação (Aha Moment)

### 2.1 Definição

> **Ativação = o trial configurou pelo menos 1 agente de IA, conectou pelo menos 1 canal real (WhatsApp por QR code, Instagram ou widget de site) E esse agente enviou automaticamente a primeira resposta de IA a uma mensagem de um cliente/lead real — tudo dentro de 7 dias do cadastro.**

Evento consolidado: `trial_activated`, disparado quando `channel_connected` E `first_ai_reply_sent` já ocorreram para a mesma conta, dentro da janela de 7 dias.

### 2.2 Por que esse é o aha moment (e não outro)

- **Criar o agente sozinho não é ativação** — é configuração. O usuário pode montar o agente e nunca conectar um canal (fricção comum: QR code do WhatsApp, aprovação de widget). Medir só "agente criado" infla artificialmente a ativação.
- **Conectar o canal sozinho também não é** — o usuário pode conectar e não receber nenhuma conversa real, ou a IA pode falhar em responder (base de conhecimento vazia, erro de configuração).
- **A primeira resposta de IA a um cliente real** é o ponto em que o usuário **vê o produto funcionando de ponta a ponta** — a promessa central do WHITE CHAT ("agente de IA que atende e vende sozinho") se prova, não é só configurada. É o evento mais correlato, em produtos de atendimento conversacional, com "eu entendi por que isso vale a pena" — e é o gatilho natural para o usuário voltar e testar mais, convidar o time, e eventualmente pagar.
- Janela de **7 dias**: alinhada ao ciclo de decisão B2B curto e ao fato de que o plano Free já entrega 100 créditos/mês — se a ativação não acontece na primeira semana, a chance de o trial "esfriar" sobe muito (padrão observado em onboarding de SaaS self-serve).

---

## 3. Plano de Instrumentação

### 3.1 Convenções gerais
- Nomes de evento em **snake_case**, verbo no particípio quando descreve algo concluído (`signup_completed`), presente para ações imediatas (`page_view`).
- Todo evento carrega `account_id` (ou `anonymous_id` antes do cadastro), `utm_source`, `utm_medium`, `utm_campaign`, `timestamp`.
- "Onde é medido": GA4 (comportamento web anônimo), **Supabase** (banco de produto — fonte de verdade para tudo pós-cadastro), **Meta CAPI** (eventos de conversão enviados de volta ao Meta Ads para otimização de campanha).

### 3.2 Tabela de eventos — funil completo

| Evento (snake_case) | Quando dispara | Propriedades principais | Onde é medido | Por que importa |
|---|---|---|---|---|
| `page_view` | Toda visita a página do site/landing | `page_path`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `referrer` | GA4 | Base de todo o funil de topo; permite calcular CVR por página e por canal |
| `lp_cta_click` | Clique no CTA principal da landing ("Comece grátis") | `cta_location`, `cta_text`, `utm_*` | GA4 | Mede atrito entre visita e intenção; separa problema de tráfego de problema de página |
| `signup_started` | Usuário abre o formulário de cadastro / OAuth | `utm_*`, `signup_method` (email/google) | GA4 + Supabase | Marca o "Lead" no funil — primeira ação de intenção real |
| `signup_completed` | Conta criada com sucesso (trial iniciado) | `account_id`, `plan` (free/trial), `utm_*`, `icp_guess` (agência/comercial, se coletado) | GA4 + Supabase + Meta CAPI (evento `CompleteRegistration`) | Marca o "Trial iniciado"; é o evento que dispara toda a régua de onboarding |
| `onboarding_step_viewed` | Cada etapa do wizard de onboarding é vista | `account_id`, `step_name`, `step_number` | Supabase | Identifica em qual etapa o onboarding trava (diagnóstico de fricção) |
| `agent_created` | Agente de IA é criado (nome + persona definidos) | `account_id`, `agent_id`, `ai_model` | Supabase | Primeiro passo de configuração real |
| `knowledge_base_document_uploaded` | Documento enviado à base de conhecimento (RAG) | `account_id`, `agent_id`, `doc_count`, `doc_type` | Supabase | Sinal de investimento — quem alimenta a base RAG ativa mais e converte mais |
| `channel_connected` | Canal conectado com sucesso (QR WhatsApp escaneado / Instagram autorizado / widget publicado) | `account_id`, `agent_id`, `channel_type` (whatsapp/instagram/widget) | Supabase + GA4 | Pré-requisito técnico da ativação; separa "configurou" de "publicou" |
| `first_conversation_received` | Primeira mensagem de um contato real chega ao agente | `account_id`, `agent_id`, `channel_type`, `contact_id` | Supabase | Prova que existe demanda real chegando (não só configuração) |
| `first_ai_reply_sent` | Agente de IA responde automaticamente à primeira mensagem real | `account_id`, `agent_id`, `channel_type`, `response_time_seconds` | Supabase | Metade final do aha moment — a IA "funcionou" de verdade |
| `trial_activated` | `channel_connected` + `first_ai_reply_sent` ocorrem dentro de 7 dias do `signup_completed` (evento derivado/consolidado) | `account_id`, `days_to_activation`, `activation_channel`, `utm_*` (herdado do signup) | Supabase (view/job) + GA4 (evento enviado via Measurement Protocol) + Meta CAPI | **É o evento da métrica-norte.** Todo o resto do relatório semanal gira em torno dele |
| `credits_50pct_consumed` | Conta consome 50% dos créditos mensais | `account_id`, `plan`, `credits_used` | Supabase | Sinal de engajamento/uso real, preditor de upgrade |
| `credits_exhausted` | Créditos do mês zerados | `account_id`, `plan` | Supabase | Gatilho natural de upsell — momento de ofertar upgrade |
| `automation_created` | Usuário cria uma automação visual (com handoff humano) | `account_id`, `automation_id` | Supabase | Uso avançado — preditor de retenção de longo prazo |
| `campaign_sent` | Disparo de campanha agendada executado | `account_id`, `campaign_id`, `contacts_count` | Supabase | Uso de feature "poder" — associado a contas de agência/ICP prioritário |
| `pricing_page_viewed` | Visita à página de planos | `account_id`/`anonymous_id`, `utm_*` | GA4 | Sinal de intenção de compra |
| `checkout_started` | Início do checkout de upgrade | `account_id`, `plan_target` | GA4 + Meta CAPI (`InitiateCheckout`) | Meio do funil de conversão paga |
| `plan_purchased` | Assinatura paga confirmada (Starter/Pro/Enterprise) | `account_id`, `plan`, `billing_cycle` (mensal/anual), `mrr_value` | Supabase + GA4 + Meta CAPI (`Purchase`, com `value`) | **Evento de receita** — fecha o funil de aquisição |
| `plan_upgraded` / `plan_downgraded` | Mudança de plano de conta existente | `account_id`, `plan_from`, `plan_to` | Supabase | Expansão de receita (expansion MRR) |
| `payment_failed` | Cobrança recorrente falha | `account_id`, `plan`, `failure_reason` | Supabase | Preditor de churn involuntário — gatilho de ação de recuperação |
| `login` | Login autenticado | `account_id`, `days_since_signup` | Supabase | Base para retenção (WAU/MAU) |
| `subscription_canceled` | Cancelamento de assinatura paga | `account_id`, `plan`, `tenure_days`, `cancel_reason` (se coletado) | Supabase + GA4 | Evento de churn — alimenta a métrica de retenção |

**Observação de implementação:** como o produto já roda em Supabase/Postgres, os eventos pós-cadastro (tudo a partir de `signup_completed`) devem ser gravados **diretamente nas tabelas de produto** (ex.: timestamps em `agents`, `channels`, `conversations`, `subscriptions`) ou em uma tabela de eventos genérica (`analytics_events` com colunas `account_id`, `event_name`, `properties jsonb`, `created_at`). Isso evita depender só do GA4 client-side (que perde eventos server-to-server e não é fonte confiável para billing/ativação).

---

## 4. Convenção de UTM

### 4.1 Padrão

| Parâmetro | Regra | Valores permitidos |
|---|---|---|
| `utm_source` | Onde o clique aconteceu (plataforma) | `google`, `meta`, `linkedin`, `email`, `instagram-organic`, `whatsapp`, `direct` |
| `utm_medium` | Tipo de tráfego | `cpc`, `paid-social`, `email`, `organic-social`, `outbound`, `referral` |
| `utm_campaign` | `{objetivo}-{icp}-{mesano}` — tudo minúsculo, hífen, sem acento | ex.: `leadgen-agencias-ago26`, `leadgen-comercial-set26` |
| `utm_content` | Identifica a variação (criativo, posição, versão do e-mail) | ex.: `video-demo-v1`, `banner-quadrado-v2`, `email-01-oferta` |
| `utm_term` | Palavra-chave (Search) ou segmento de audiência (Social) | ex.: `agente+ia+whatsapp`, `lookalike-trials-1pct` |

Regra fixa: sempre minúsculo, sempre hífen (nunca underscore ou espaço), sempre com o mês/ano no `utm_campaign` para permitir corte temporal fácil em qualquer relatório.

### 4.2 Exemplos preenchidos por canal

| Canal | utm_source | utm_medium | utm_campaign | utm_content | utm_term |
|---|---|---|---|---|---|
| Google Search | `google` | `cpc` | `leadgen-comercial-ago26` | `rsa-headline-v1` | `agente+de+ia+whatsapp` |
| Meta (Instagram/Facebook Ads) | `meta` | `paid-social` | `leadgen-agencias-ago26` | `video-demo-15s-v1` | `lookalike-icp-agencias` |
| LinkedIn Ads | `linkedin` | `paid-social` | `leadgen-comercial-set26` | `carrossel-whitelabel-v1` | `cargo-gerente-comercial` |
| E-mail (nutrição/lançamento rebrand) | `email` | `email` | `rebrand-whitechat-ago26` | `email-01-anuncio` | *(não se aplica)* |
| Orgânico social (Instagram/LinkedIn owned) | `instagram-organic` | `organic-social` | `conteudo-agencias-ago26` | `reels-bastidores-v3` | *(não se aplica)* |
| Outbound WhatsApp (prospecção ativa) | `whatsapp` | `outbound` | `outbound-agencias-ago26` | `abordagem-01-cold` | `lista-google-maps-sp` |

---

## 5. Modelo de Metas dos 90 Dias

**Premissas gerais (rotuladas, todas revisáveis com dado real a partir do dia 30):**
- Orçamento de mídia: R$2.000/mês, 100% em paid media (Google Search + Meta) nos meses 1–2; considerar LinkedIn no mês 3 se CAC permitir.
- CPC médio blended `[PREMISSA]`: R$3,00 (mês 1) → R$2,80 (mês 2, otimização) → R$2,50 (mês 3, mais dado + melhor segmentação de ICP).
- Tráfego orgânico/direto adicional (não pago) `[PREMISSA]`: ~30% do volume pago, crescendo com o rebrand e conteúdo orgânico.
- CVR visita→lead (cadastro iniciado) `[BENCHMARK]`: landing page tráfego frio 2–5%; usamos 3% (mês 1) → 4% (mês 2) → 5% (mês 3, faixa alta do benchmark, assumindo otimização de página).
- Taxa de conclusão do cadastro (signup_started → signup_completed) `[PREMISSA]`: 70% → 72% → 75%.
- Taxa de ativação (trial iniciado → trial ativado) `[PREMISSA — sem benchmark de mercado disponível para este nicho, é a hipótese nº1 a validar]`: 30% → 33% → 35%.
- Trial → Paid `[BENCHMARK]`: 15–25% é bom; usamos 15% (mês 1, produto novo/rebrand) → 17% (mês 2) → 20% (mês 3).
- Ticket médio blend Starter/Pro `[PREMISSA]`: 70% Starter (R$97) + 30% Pro (R$297) = **R$157**/pagante novo.
- Churn nos primeiros 90 dias: assumido ~0 (base muito jovem, sem tempo de dar churn ainda) — não zerar nos meses seguintes.

### 5.1 Tabela mês a mês

| Métrica | Mês 1 | Mês 2 | Mês 3 | Acumulado 90 dias |
|---|---:|---:|---:|---:|
| Budget mídia | R$2.000 | R$2.000 | R$2.000 | R$6.000 |
| CPC médio `[PREMISSA]` | R$3,00 | R$2,80 | R$2,50 | — |
| Visitantes pagos (budget/CPC) | 666 | 714 | 800 | 2.180 |
| Visitantes orgânicos (+30% `[PREMISSA]`) | 200 | 214 | 240 | 654 |
| **Visitantes totais** | **866** | **928** | **1.040** | **2.834** |
| CVR visita→lead `[BENCHMARK]` | 3% | 4% | 5% | — |
| **Leads (signup iniciado)** | **26** | **37** | **52** | **115** |
| Taxa conclusão cadastro `[PREMISSA]` | 70% | 72% | 75% | — |
| **Trials iniciados** | **18** | **27** | **39** | **84** |
| Taxa de ativação `[PREMISSA]` | 30% | 33% | 35% | — |
| **Trials ativados ★ (North Star)** | **5** | **9** | **14** | **28** |
| Trial→Paid `[BENCHMARK]` | 15% | 17% | 20% | — |
| **Pagantes novos** | **1** | **2** | **3** | **6** |
| MRR novo do mês (pagantes × R$157) | R$157 | R$314 | R$471 | — |
| **MRR acumulado (sem churn)** | **R$157** | **R$471** | **R$942** | **R$942** |
| CPL (budget/leads) | R$76,92 | R$54,05 | R$38,46 | R$52,17 |
| CAC (budget/pagantes novos) | R$2.000 | R$1.000 | R$666,67 | R$1.000 |

**Leitura honesta desses números (importante):** com esse orçamento, o volume de pagantes novos por mês (1, 2, 3) é **estatisticamente pequeno demais para decisões definitivas** — um único cliente a mais ou a menos muda o CAC do mês inteiro em centenas de reais. Os 90 dias servem para **validar direção e ordem de grandeza dos canais**, não para tirar conclusão estatística fina sobre CAC exato. A leitura confiável de CAC por canal só fica robusta com volume maior (mês 4+, orçamento maior, ou consolidando os 90 dias inteiros por canal em vez de por mês).

---

## 6. Unit Economics

### 6.1 LTV por plano (todas as premissas de churn são benchmark, não medição)

| Plano | ARPU mensal | Churn mensal `[BENCHMARK]` | Vida útil média (1/churn) | LTV (ARPU/churn) |
|---|---:|---:|---:|---:|
| Starter | R$97 | 2% (faixa "bom") | 50 meses | **R$4.850** |
| Starter (cenário otimista) | R$97 | 1% (faixa "excelente") | 100 meses | R$9.700 |
| Pro | R$297 | 2% (faixa "bom") | 50 meses | **R$14.850** |
| Pro (cenário otimista) | R$297 | 1% (faixa "excelente") | 100 meses | R$29.700 |

> LTV aqui é **receita bruta**, não margem líquida — não desconta custo de infraestrutura (Evolution API, custo de tokens de IA por modelo, Vercel/Supabase). Recomendação: assim que houver custo variável real por conta, recalcular LTV em cima de margem de contribuição, não de receita bruta — o teto de CAC abaixo fica mais conservador.

### 6.2 Teto de CAC por plano — a pergunta direta que o Diego precisa responder na campanha

Regra: LTV/CAC ≥3x é saudável, ≥5x é ótimo; payback deve ficar abaixo de 12 meses.

| Plano | CAC para LTV/CAC = 5x (ótimo) | CAC para LTV/CAC = 3x (mínimo saudável) | CAC para payback = 12 meses (ARPU×12) |
|---|---:|---:|---:|
| **Starter (R$97/mês)** | R$970 | R$1.617 | R$1.164 |
| **Pro (R$297/mês)** | R$2.970 | R$4.950 | R$3.564 |

**Resposta direta — teto de gasto que a campanha precisa respeitar:**
- **Cliente Starter: CAC máximo aceitável = R$970.** Esse número cumpre as duas regras ao mesmo tempo (LTV/CAC ≥5x **e** payback <12 meses com folga). Até R$1.164 ainda cabe no critério de payback, mas cruza a folga de LTV/CAC — use como limite de tolerância, não como meta.
- **Cliente Pro: CAC máximo aceitável = R$2.970.** Mesma lógica; até R$3.564 é o limite duro de payback de 12 meses.
- Comparando com a projeção da seção 5: o **CAC projetado do mês 1 (R$2.000) fica acima do teto do Starter e abaixo do teto do Pro** — reforça que a campanha, se estiver trazendo Starter no mês 1, está gastando mais do que o cliente paga de volta em um ano. Isso é esperado em fase de aprendizado (mês 1), mas **se persistir no mês 3, é sinal de pausar o canal, não de aumentar budget nele.**
- ICP prioritário é agência/revenda (plano Pro white-label) — reforça a lógica de que a campanha deve, sempre que possível, qualificar para Pro/Enterprise antes de aceitar CAC alto: o teto de CAC do Pro é 3x maior que o do Starter, dando muito mais margem de mídia paga por lead qualificado.

---

## 7. Consultas SQL de Partida (Postgres / Supabase)

> **Aviso:** nomes de tabela/coluna abaixo são **genéricos e ilustrativos** (`accounts`, `subscriptions`, `analytics_events`, `agents`, `conversations`, `channels`). **Conferir contra o schema real do Supabase antes de rodar** (`list_tables` / inspeção do schema) — provavelmente os nomes reais divergem.

```sql
-- 1) Cadastros por dia e por origem (utm_source)
-- Pergunta: de onde estão vindo os trials, dia a dia?
SELECT
  date_trunc('day', created_at) AS dia,
  utm_source,
  utm_medium,
  utm_campaign,
  count(*) AS trials_iniciados
FROM public.accounts
WHERE created_at >= now() - interval '90 days'
GROUP BY 1, 2, 3, 4
ORDER BY 1 DESC, trials_iniciados DESC;
```

```sql
-- 2) Funil de ativação (signup -> canal conectado -> primeira resposta de IA)
-- Pergunta: em que etapa do onboarding os trials estão travando?
SELECT
  count(*) FILTER (WHERE a.created_at IS NOT NULL) AS trials_iniciados,
  count(*) FILTER (WHERE ag.first_agent_created_at IS NOT NULL) AS criou_agente,
  count(*) FILTER (WHERE ch.first_channel_connected_at IS NOT NULL) AS conectou_canal,
  count(*) FILTER (WHERE conv.first_ai_reply_at IS NOT NULL) AS respondeu_ia,
  count(*) FILTER (
    WHERE ch.first_channel_connected_at IS NOT NULL
      AND conv.first_ai_reply_at IS NOT NULL
      AND conv.first_ai_reply_at <= a.created_at + interval '7 days'
  ) AS ativados
FROM public.accounts a
LEFT JOIN (
  SELECT account_id, min(created_at) AS first_agent_created_at
  FROM public.agents GROUP BY account_id
) ag ON ag.account_id = a.id
LEFT JOIN (
  SELECT account_id, min(connected_at) AS first_channel_connected_at
  FROM public.channels WHERE status = 'connected' GROUP BY account_id
) ch ON ch.account_id = a.id
LEFT JOIN (
  SELECT account_id, min(created_at) AS first_ai_reply_at
  FROM public.conversations WHERE sender_type = 'ai' GROUP BY account_id
) conv ON conv.account_id = a.id
WHERE a.created_at >= now() - interval '90 days';
```

```sql
-- 3) Trial → Paid por coorte de mês de cadastro
-- Pergunta: qual % dos trials de cada mês virou pagante?
SELECT
  date_trunc('month', a.created_at) AS mes_cadastro,
  count(*) AS trials,
  count(*) FILTER (WHERE s.id IS NOT NULL) AS pagantes,
  round(
    100.0 * count(*) FILTER (WHERE s.id IS NOT NULL) / nullif(count(*), 0), 1
  ) AS trial_to_paid_pct
FROM public.accounts a
LEFT JOIN public.subscriptions s
  ON s.account_id = a.id AND s.status = 'active'
GROUP BY 1
ORDER BY 1;
```

```sql
-- 4) Churn mensal
-- Pergunta: que % da base paga ativa no início do mês cancelou até o fim do mês?
WITH base_inicio_mes AS (
  SELECT date_trunc('month', gs)::date AS mes,
         count(*) AS ativos_inicio_mes
  FROM generate_series(now() - interval '6 months', now(), interval '1 month') gs
  JOIN public.subscriptions s
    ON s.started_at <= gs
   AND (s.canceled_at IS NULL OR s.canceled_at > gs)
  GROUP BY 1
),
cancelamentos AS (
  SELECT date_trunc('month', canceled_at) AS mes, count(*) AS cancelados
  FROM public.subscriptions
  WHERE canceled_at IS NOT NULL
  GROUP BY 1
)
SELECT b.mes, b.ativos_inicio_mes, coalesce(c.cancelados, 0) AS cancelados,
       round(100.0 * coalesce(c.cancelados, 0) / nullif(b.ativos_inicio_mes, 0), 2) AS churn_pct
FROM base_inicio_mes b
LEFT JOIN cancelamentos c ON c.mes = b.mes
ORDER BY b.mes;
```

```sql
-- 5) MRR atual e evolução mensal
-- Pergunta: qual o MRR hoje e como evoluiu mês a mês?
SELECT
  date_trunc('month', gs)::date AS mes,
  sum(CASE WHEN s.billing_cycle = 'annual' THEN s.value / 12 ELSE s.value END) AS mrr
FROM generate_series(now() - interval '6 months', now(), interval '1 month') gs
JOIN public.subscriptions s
  ON s.started_at <= gs
 AND (s.canceled_at IS NULL OR s.canceled_at > gs)
 AND s.status = 'active'
GROUP BY 1
ORDER BY 1;
```

```sql
-- 6) Top canais por volume de trial ativado (proxy de CAC/CPL até termos tabela de spend)
-- Pergunta: qual utm_source/campaign gera mais trial ativado, não só mais cadastro?
SELECT
  a.utm_source,
  a.utm_campaign,
  count(*) AS trials,
  count(*) FILTER (WHERE ta.activated_at IS NOT NULL) AS ativados,
  round(100.0 * count(*) FILTER (WHERE ta.activated_at IS NOT NULL) / nullif(count(*), 0), 1) AS taxa_ativacao_pct
FROM public.accounts a
LEFT JOIN public.trial_activations ta ON ta.account_id = a.id -- ou view derivada do evento trial_activated
WHERE a.created_at >= now() - interval '90 days'
GROUP BY 1, 2
ORDER BY ativados DESC;
-- Para CPL/CAC de verdade, cruzar com uma tabela de investimento por campanha
-- (marketing_spend: date, utm_source, utm_campaign, spend) que precisa ser criada/alimentada manualmente
-- a partir do Google Ads / Meta Ads Manager, já que o Supabase não tem esse dado nativamente.
```

```sql
-- 7) Tempo médio até a ativação (por canal de origem)
-- Pergunta: quanto tempo leva, em média, do cadastro até o aha moment?
SELECT
  a.utm_source,
  count(*) AS ativados,
  round(avg(extract(epoch FROM (ta.activated_at - a.created_at)) / 86400.0), 1) AS dias_medios_ate_ativacao
FROM public.accounts a
JOIN public.trial_activations ta ON ta.account_id = a.id
WHERE a.created_at >= now() - interval '90 days'
GROUP BY 1
ORDER BY dias_medios_ate_ativacao;
```

```sql
-- 8) Retenção semanal (contas com pelo menos 1 login na semana, por coorte de cadastro)
-- Pergunta: quantas contas continuam voltando semana após semana?
SELECT
  date_trunc('week', a.created_at) AS semana_cadastro,
  date_trunc('week', l.created_at) AS semana_login,
  count(DISTINCT a.id) AS contas_ativas
FROM public.accounts a
JOIN public.login_events l ON l.account_id = a.id
WHERE a.created_at >= now() - interval '90 days'
GROUP BY 1, 2
ORDER BY 1, 2;
```

---

## 8. Modelo de Relatório Semanal

```
═══════════════════════════════════════════
RELATÓRIO SEMANAL — WHITE CHAT MARKETING & DADOS
Semana: [dd/mm] a [dd/mm/aaaa]  |  Preparado por: Ana
═══════════════════════════════════════════

1. RESUMO EXECUTIVO (3-5 linhas)
   [O que aconteceu de mais importante essa semana — 1 frase por tema:
   funil, canal, produto/instrumentação.]

2. FUNIL DA SEMANA (real vs. meta)
   ┌─────────────────────┬────────┬────────┬───────────┐
   │ Métrica              │ Real   │ Meta   │ Δ vs meta │
   ├─────────────────────┼────────┼────────┼───────────┤
   │ Visitantes            │        │        │           │
   │ Leads (cadastro)      │        │        │           │
   │ Trials iniciados      │        │        │           │
   │ Trials ativados ★     │        │        │           │
   │ Pagantes novos         │        │        │           │
   │ MRR (acumulado)        │        │        │           │
   │ CPL                    │        │        │           │
   │ CAC                    │        │        │           │
   │ Trial → Paid %          │        │        │           │
   └─────────────────────┴────────┴────────┴───────────┘

3. DESEMPENHO POR CANAL
   ┌───────────────┬────────┬─────┬─────┬───────────────┐
   │ Canal           │ Gasto  │ CPL │ CAC │ Trials ativados│
   ├───────────────┼────────┼─────┼─────┼───────────────┤
   │ Google Search   │        │     │     │                │
   │ Meta             │        │     │     │                │
   │ LinkedIn          │        │     │     │                │
   │ Outbound WhatsApp │        │     │     │                │
   │ Orgânico/social    │        │     │     │                │
   └───────────────┴────────┴─────┴─────┴───────────────┘

4. INSIGHTS (o que os dados mostram, com contexto de benchmark)
   - [Insight 1: número + comparação com benchmark/meta + hipótese do porquê]
   - [Insight 2: ...]
   - [Insight 3: ...]

5. AÇÕES RECOMENDADAS
   ┌────────────────────────────┬─────────────┬───────────┐
   │ Ação                         │ Responsável  │ Prazo      │
   ├────────────────────────────┼─────────────┼───────────┤
   │ [ação específica e testável]  │ Diego/Ana/…  │ [dd/mm]    │
   └────────────────────────────┴─────────────┴───────────┘

6. STATUS DE INSTRUMENTAÇÃO (enquanto não estiver 100%)
   - Eventos já capturando corretamente: [lista]
   - Eventos pendentes/quebrados: [lista]
═══════════════════════════════════════════
```

---

## 9. Dashboard — Painéis, Ferramenta e Conteúdo

**Ferramentas recomendadas:**
- **GA4** — comportamento anônimo de topo de funil (visitas, CTR, origem).
- **Metabase ou Looker Studio conectado direto ao Postgres do Supabase** — fonte de verdade de tudo pós-cadastro (ativação, trial→paid, MRR, churn). Preferível ao GA4 para esses números porque GA4 perde eventos server-side e não é confiável para billing.
- **Google Ads / Meta Ads Manager** — origem do dado de investimento por canal, cruzado manualmente (ou por planilha ponte) com os dados de conversão do Supabase até existir uma tabela `marketing_spend`.
- **Looker Studio consolidado** — camada final que une GA4 + export do Supabase (via conector Postgres nativo ou Google Sheets como ponte) num único dashboard executivo semanal.

| Painel | Ferramenta | O que mostra |
|---|---|---|
| **1. Aquisição** | GA4 + Google Ads/Meta Ads Manager | Visitantes por canal/UTM, CTR, CPC, CPL por canal, evolução diária |
| **2. Funil de Produto** | Metabase/Looker (Supabase) | Leads → trials iniciados → ativados → pagantes, com taxa de conversão entre cada etapa e comparação com a meta do mês |
| **3. Ativação (o coração do North Star)** | Metabase/Looker (Supabase) | Trials ativados por semana (linha do tempo), tempo médio até ativação, % ativado por canal de origem, funil de onboarding (agente criado → doc enviado → canal conectado → 1ª resposta) |
| **4. Receita** | Metabase/Looker (Supabase) | MRR total, MRR novo, MRR de expansão, MRR perdido (churn), LTV/CAC por plano, payback period |
| **5. Retenção & Churn** | Metabase/Looker (Supabase) | Retenção por coorte de cadastro (heatmap semana a semana), churn mensal %, motivos de cancelamento |
| **6. Executivo (semanal)** | Looker Studio consolidado | Visão de uma tela só: funil real vs. meta, CPL/CAC por canal, MRR, e as 3 métricas da semana que mais desviaram do esperado — espelha o relatório semanal da seção 8 |

**Prioridade de construção:** painel 3 (Ativação) e painel 2 (Funil) primeiro — são os que dependem só da instrumentação da seção 3, que é o bloqueador real hoje. Painel 1 (Aquisição) pode nascer no GA4 assim que o GA4 for instalado, em paralelo.
