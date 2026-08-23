# WHITE CHAT — Plano de Tráfego Pago e Performance (90 dias)
### Autor: Diego, Gestor de Tráfego Pago | Data: 22/08/2026

> Aviso de honestidade obrigatório: a conta é NOVA. Zero histórico, zero pixel aquecido, zero base de remarketing. Todo número abaixo marcado como **[BENCHMARK]** vem de faixas conhecidas do mercado brasileiro de SaaS B2B — não é o que a WHITE CHAT vai performar, é o ponto de partida para calibrar expectativa e critério de decisão. Não existe ROAS prometido neste documento.

---

## 1. Diagnóstico honesto do budget

**R$2.000/mês é orçamento de teste de canal, não de geração de volume.** Isso precisa ficar claro antes de qualquer estrutura de campanha, porque muda a estratégia inteira: com esse valor a meta dos 90 dias não é "gerar trials", é **descobrir com o mínimo de ruído possível qual canal tem chance de funcionar** — o volume real só vem depois, com orçamento maior.

### Conta de padaria, com transparência

| Canal | Budget/mês proposto | CPC **[BENCHMARK]** | Cliques/mês | CVR clique→cadastro **[BENCHMARK]** | Cadastros/mês |
|---|---|---|---|---|---|
| Google Ads Search | R$1.100 | R$4,50 (termos de nicho, não genéricos) | ~244 | 10-14% (tráfego de busca, alta intenção) | ~28-30 |
| Meta Ads (frio) | R$900 | R$2,20 (feed/reels, tráfego frio) | ~409 | 4-6% (tráfego frio, sem intenção de busca) | ~18-22 |
| **Total** | **R$2.000** | — | **~650 cliques** | — | **~46-50 cadastros/mês** |

Isso dá **10-13 cadastros por semana**, divididos em dois canais e (no caso do Meta) potencialmente vários públicos. É pouco. Não dá pra fingir que dá mais.

### Qual canal é viável nesse patamar — e qual não é

- **Google Ads Search — viável, é onde o dinheiro rende mais por real.** Busca é o único canal onde intenção já existe antes do clique ("chatbot whatsapp com ia", "prospecção de leads google maps"). Com CVR mais alta e volume de leads menor, é o canal certo pra validar mensagem e oferta com pouco desperdício. É também o canal que sofre menos com "aprendizado de algoritmo" — leilão de busca não tem fase de aprendizado tão dependente de volume de conversão quanto o Meta.
- **Meta Ads — viável, mas como motor de reconhecimento + aquecimento de pixel, não de conversão direta no mês 1.** Serve pra gerar clique barato, popular o pixel com sinal (view content, lead) e testar criativo/proposta de valor. Não vai sair da fase de aprendizado de forma saudável nesse orçamento (ver problema abaixo) — e está tudo bem, desde que a gente meça pelo evento certo.
- **LinkedIn Ads — NÃO viável nesse orçamento. Ponto.** CPC de LinkedIn Ads no Brasil para B2B **[BENCHMARK]** fica na faixa de R$15 a R$40. Com R$2.000/mês inteiros só em LinkedIn, isso dá entre 50 e 130 cliques no mês inteiro — menos de 5 cliques por dia. Não dá pra rodar teste estatístico relevante, não dá pra sair da curva de aprendizado, e o CPL resultante provavelmente estouraria o CAC de qualquer plano abaixo do Enterprise. Detalhe completo na seção 3.

### O problema real: fase de aprendizado do Meta com budget baixo

O Meta recomenda ~50 conversões por semana **por conjunto de anúncios** para o algoritmo sair da fase de aprendizado e estabilizar entrega/custo. Com R$900/mês em Meta (~R$30/dia) otimizando direto para o evento "Trial concluído" (evento raro, profundo no funil), a conta simplesmente **nunca vai gerar 50 trials/semana** — nem perto. Isso significa: CPL instável, entrega errática, e a plataforma testando audiência aleatória sem nunca "aprender" de verdade.

**Como eu resolvo isso, na prática, e não finjo que não é problema:**

1. **Otimizar por evento mais raso no início.** Em vez de otimizar direto para "Trial concluído", a campanha do mês 1 otimiza para **"Lead" (cadastro)** — evento com volume 3-5x maior que trial pago. Isso dá ao algoritmo sinal suficiente pra aprender mais rápido, mesmo sem bater os 50/semana ideais.
2. **Consolidar, não pulverizar.** Um único conjunto de anúncios por campanha, público amplo (Advantage+ Audience), em vez de 3-4 conjuntos testando públicos diferentes em paralelo. Cada divisão de conjunto divide o orçamento e joga cada fatia ainda mais longe da fase de aprendizado. Testes de público acontecem **sequencialmente** (um público ativo por 10-14 dias, depois troca), não em paralelo.
3. **Aceitar que a conta vai viver em "aprendizado ativo/limitado" por boa parte dos 90 dias** e julgar por **tendência de custo por evento raso** (Lead), não pelo selo de "saiu do aprendizado". É assim que se mede performance numa conta nova com budget de teste — pretender o contrário é maquiar o resultado pro cliente.
4. **Migrar o evento de otimização conforme o volume permite**: Mês 1 otimiza para Lead → Mês 2, se o volume de Lead for saudável e o Trial já tiver massa mínima, testa otimizar para Trial → Mês 3 só otimiza para evento de Upgrade/Compra se o volume permitir (provavelmente não vai permitir em 90 dias com esse budget, e tudo bem).

---

## 2. Setup técnico antes de gastar o primeiro real

Nada de verba entra em campanha antes desses itens estarem prontos e validados. Ordem importa.

### Checklist ordenado

1. **GA4 + Google Tag (gtag.js)** instalado no site institucional (whitechat.com.br ou domínio equivalente) e na aplicação (app.whitechat.com.br). Property GA4 única, cross-domain tracking configurado entre site institucional e app (senão perde a jornada de quem visita o site e cadastra no app).
2. **Google Ads ↔ GA4 vinculado**, conversões importadas do GA4 para o Google Ads (não usar Global Site Tag separada e duplicada).
3. **Meta Pixel instalado no site + Conversions API (CAPI) no backend do produto.** CAPI não é opcional aqui: tráfego de SaaS B2B sofre bastante perda de sinal client-side por ad blocker, Safari ITP e Enhanced Tracking Protection do Firefox. Sem CAPI, o Meta otimiza com dado incompleto — que é exatamente o problema que a seção 1 tenta mitigar, então não faz sentido sabotar sinal por não implementar isso.
4. **Eventos customizados que precisam existir no PRODUTO** (implementação do time de dev, dispara para GA4 + Meta CAPI + Google Ads Enhanced Conversions em paralelo, todos batendo no mesmo `user_id`/e-mail hasheado pra permitir match):

   | Nome do evento (exato) | Quando dispara | Parâmetros obrigatórios |
   |---|---|---|
   | `sign_up` | Cadastro concluído (conta criada) | `plan: free`, `signup_method` |
   | `agent_created` | Primeiro agente de IA criado | `agent_type` (RAG/scripted) |
   | `channel_connected` | Canal conectado (QR WhatsApp, Instagram, widget) | `channel_type: whatsapp\|instagram\|widget` |
   | `first_conversation` | Primeira conversa respondida pelo agente | `channel_type` |
   | `maps_prospecting_used` | Uso da prospecção via Google Maps (diferencial forte — vale trackear separado para medir quem usou o feature-chave) | `niche`, `city` |
   | `plan_upgraded` | Upgrade de Free/Starter para plano pago superior | `from_plan`, `to_plan`, `value`, `billing_cycle: monthly\|annual` |

   `sign_up` = evento raso pra otimização do Meta no mês 1. `plan_upgraded` = evento de valor real, usado pra cálculo de CAC (seção 6), mas não tem volume suficiente pra otimizar campanha nesse orçamento.

5. **UTM — convenção obrigatória, sem exceção, em todo link pago:**

   ```
   utm_source={google|meta|linkedin}
   utm_medium={cpc|paid-social}
   utm_campaign={canal}_{objetivo}_{icp}_{mesano}
     ex: google_search_agencias_ago26 | meta_prospeccao_comercial_ago26
   utm_content={formato}_{variacao}
     ex: rsa_v1 | reels_demo_v2 | carrossel_prospeccao_v1
   utm_term={palavra-chave}  (somente Search, usar {keyword} dinâmico do Google Ads)
   ```

   Regra fixa: tudo em minúsculo, sem acento, sem espaço (usar `_`). Sem isso o GA4 vira sopa de letra em 2 semanas e nenhum kill/scale da seção 4 é possível de calcular.

6. **Conversões importadas no Google Ads**: `sign_up` (conversão primária, contabiliza no leilão) + `plan_upgraded` (conversão secundária, só observação — não usar pra Smart Bidding ainda, volume baixo demais vai quebrar o algoritmo).
7. **Evento customizado no Meta Ads Manager**: mapear `sign_up` como evento padrão "Lead" (ou Custom Conversion "Lead_WhiteChat") e configurar como evento de otimização da campanha de prospecção fria.
8. **Landing pages segmentadas por ICP** (mínimo 2: uma para "agências/revenda white-label", uma para "times comerciais B2B/prospecção") com o pixel e tag disparando corretamente em cada uma — testável antes do primeiro real gasto.
9. **QA final**: rodar Tag Assistant (Google) e Meta Pixel Helper em cada página/fluxo (home → cadastro → criar agente → conectar canal) confirmando que todo evento da tabela acima dispara uma vez só (não duplicado) e chega ao GA4, Meta Events Manager e Google Ads.

**Nada disso está pronto hoje.** Isso precisa ser tratado como pré-requisito de bloqueio, não como tarefa paralela — rodar campanha sem isso é queimar os R$2.000 do mês 1 sem conseguir aprender nada, o que nesse orçamento é o pior erro possível.

---

## 3. Plano de campanha, canal a canal

### 📊 Plano de Campanha — WHITE CHAT | Google Ads Search

🎯 **Objetivo:** validar CPL de cadastro via busca de alta intenção; identificar quais termos/ICP têm o menor custo por sinal.
💰 **Budget e período:** R$1.100/mês (~R$36/dia), mês 1-3, sujeito a redistribuição pelos critérios da seção 4.
👥 **Público-alvo:** pessoas pesquisando ativamente soluções de atendimento automatizado, chatbot com IA, ou automação de prospecção — sem segmentação demográfica adicional (busca já filtra por intenção). Geolocalização: Brasil, excluindo tráfego de fora do país.

🏗️ **Estrutura (campanha → grupo de anúncios → palavras-chave):**

**Campanha 1: WhiteChat_Search_Categoria** — R$22/dia

| Grupo de anúncios | Palavras-chave (tipo de correspondência) |
|---|---|
| Chatbot IA / Atendimento | "chatbot com inteligência artificial" [frase], "agente de ia para atendimento" [exata], "atendimento automatizado whatsapp" [frase] |
| WhatsApp Business + IA | "automação whatsapp com ia" [frase], "chatbot para whatsapp business" [frase], "multiatendimento whatsapp com ia" [exata] |

**Campanha 2: WhiteChat_Search_Diferencial** — R$8/dia

| Grupo de anúncios | Palavras-chave (tipo de correspondência) |
|---|---|
| Prospecção Google Maps | "prospecção automática de clientes" [frase], "gerador de leads google maps" [exata], "extrair leads do google maps" [frase] |

**Campanha 3: WhiteChat_Search_Agencias** — R$6/dia

| Grupo de anúncios | Palavras-chave (tipo de correspondência) |
|---|---|
| Revenda / White Label | "chatbot white label" [frase], "revenda de chatbot ia" [frase], "plataforma de ia para revender" [exata] |

Tipo de correspondência: **apenas Frase e Exata** nos 3 primeiros meses. Correspondência Ampla fica de fora — com R$36/dia, ampla sem histórico de conversão suficiente para Smart Bidding vira ralo de orçamento em termos genéricos ("o que é chatbot", "curso de ia"). Reavaliar ampla + Smart Bidding automático só a partir do momento em que houver >30 conversões acumuladas numa campanha (threshold mínimo do Google pra Bidding automático funcionar razoavelmente).

**Lista de palavras negativas (aplicar a nível de conta, todas as campanhas):**
`grátis`, `gratuito`, `download`, `baixar`, `apk`, `curso`, `o que é`, `como funciona`, `pdf`, `apostila`, `emprego`, `vaga`, `vagas`, `trabalhe conosco`, `whatsapp web`, `whatsapp business baixar`, `número de whatsapp`, `atendente humano`, `telefone suporte`, `reclame aqui`, `reclamação`, `cancelar assinatura`, `open source`, `código aberto`, `github`

**Campanha de conquista (opcional, só ligar se mês 1 validar CPL saudável — não faz parte do orçamento inicial):** "alternativa ao manychat", "alternativa ao botconversa" — cuidado jurídico com marca registrada de terceiros, revisar política de trademark do Google Ads antes de ativar.

📈 **Meta de CPL:** benchmark inicial de referência **[BENCHMARK]** R$70-100 por cadastro nos primeiros 14 dias (custo mais alto no início por falta de Quality Score histórico). Meta de maturação a partir do dia 30: R$50-80.
📅 **Cronograma de otimização:** dia 1-14 sem mexer em lance (deixar o leilão calibrar); dia 14 revisão de termos de pesquisa (Search Terms Report) e primeira leva de negativação; dia 21 primeira pausa de palavra-chave sem conversão e custo > 2x a meta; dia 30 revisão completa de CPL por campanha e decisão de redistribuição de orçamento entre as 3 campanhas.

---

### 📊 Plano de Campanha — WHITE CHAT | Meta Ads

🎯 **Objetivo:** aquecer pixel, gerar sinal de evento raso (`sign_up`) a custo controlado, testar criativo e proposta de valor com tráfego frio.
💰 **Budget e período:** R$900/mês (~R$30/dia), mês 1-3.
👥 **Público-alvo:** SEM público personalizado ou lookalike no mês 1 (zero pixel = zero base). Usar **Advantage+ Audience** (público amplo controlado pelo algoritmo) com direcionamento mínimo: Brasil, 25-55 anos, interesses amplos de marketing digital/automação/pequenas empresas apenas como sinal inicial (não como restrição rígida).

🏗️ **Estrutura (campanha → conjunto → anúncio):**

**Campanha: WhiteChat_Meta_Prospeccao_Fria** — R$30/dia, objetivo "Cadastro" (Leads/Conversões), evento de otimização = `sign_up` (evento raso, ver seção 1).

- **1 único conjunto de anúncios** (consolidação deliberada, ver problema de aprendizado na seção 1), Advantage+ Audience, posicionamento automático (Feed + Reels + Stories).
- 3 variações de anúncio rodando em teste sequencial dentro do mesmo conjunto:
  - Anúncio A: vídeo curto (15-30s) demonstrando o agente respondendo no WhatsApp — foco em "atendimento automático"
  - Anúncio B: carrossel estático focado no diferencial prospecção via Google Maps ("extraia leads de qualquer nicho e cidade")
  - Anúncio C: estático focado em white-label para agências ("revenda com sua marca")

📈 **Meta de CPL:** benchmark **[BENCHMARK]** R$35-55 por cadastro (tráfego frio, sem intenção prévia — naturalmente mais barato por clique, mas CVR menor).
📅 **Cronograma de otimização:** dia 1-7 sem mexer (fase de aprendizado inicia); dia 7 checar frequência e CTR, mas não pausar nada ainda; dia 14 primeira decisão real — pausar o anúncio de pior CPL dos 3, manter os 2 melhores rodando; dia 21 se `sign_up` estiver com volume >15 no acumulado, testar migrar 30% do orçamento pra um segundo conjunto com público de interesse mais restrito (ex: só "agências de marketing digital") para começar a segmentar por ICP.

**Remarketing:** não existe base hoje (pixel zero). A partir do dia 15-20, quando o pixel já tiver ~300-400 visitantes de site acumulados dos cliques pagos + eventual tráfego orgânico, criar público personalizado de "visitantes que não converteram em 30 dias" e reservar um pedaço do orçamento do Mês 2 pra essa camada — CPL de remarketing tende a ser bem menor que frio, é a primeira alavanca real de eficiência que a conta vai ganhar.

---

### 📊 Avaliação — LinkedIn Ads (ICP agências)

**Veredito: NÃO entra no plano pago dos 90 dias com esse orçamento.**

Justificativa com números: CPC de LinkedIn Ads B2B no Brasil **[BENCHMARK]** fica entre R$15 e R$40 — 4 a 10x mais caro que Google Search e 7 a 18x mais caro que Meta nesse plano. Com R$2.000 (o budget inteiro, hipoteticamente), isso dá entre 50 e 130 cliques no mês. Aplicando a mesma CVR de cadastro de ~8-10% **[BENCHMARK]** (LinkedIn costuma converter melhor por qualificação de audiência, mas o volume de clique é tão baixo que o resultado é entre 4 e 13 cadastros/mês) — não dá massa suficiente pra sair de ruído estatístico, e mata a possibilidade de testar Google e Meta ao mesmo tempo, que é onde a matemática do CPC realmente compensa.

**Alternativa recomendada para o ICP agências sem gastar em LinkedIn Ads:** prospecção ativa/orgânica em LinkedIn (outbound manual do time comercial, conteúdo orgânico da marca, grupos de agências e revendedores) — custo zero de mídia, e o ICP de agência tende a responder bem a abordagem direta/consultiva de qualquer forma, já que é uma decisão de parceria, não de compra por impulso.

**Quando reconsiderar:** se o budget subir para R$5.000+/mês (ponto em que R$1.500-2.000 dedicados a LinkedIn já geram volume mínimo testável) ou se Google/Meta comprovarem CAC muito acima do LTV do Pro nos 90 dias, valendo a pena pagar mais caro por um lead mais qualificado.

---

## 4. Divisão do orçamento mês a mês

| Mês | Canal | Valor | Hipótese testada | Critério de kill | Critério de scale |
|---|---|---|---|---|---|
| **1** | Google Search | R$1.100 | Busca de nicho converte a CPL viável mesmo sem histórico de Quality Score | CPL de cadastro > R$150 após R$600 investidos (~14 dias) → pausar campanha/grupo pior performance | CPL de cadastro < R$70 com ≥8 cadastros no período → aumentar orçamento da campanha em 20% no mês seguinte |
| **1** | Meta Ads | R$900 | Otimizar por evento raso (`sign_up`) consegue custo por lead sustentável mesmo sem sair do aprendizado | CPL > R$100 após R$450 investidos (~14 dias) → pausar o anúncio de pior desempenho, manter conjunto único ativo | CPL < R$40 com ≥12 cadastros no período → começar segundo conjunto testando público de interesse mais restrito |
| **2** | Google Search | R$1.200-1.400* | Ajustar mix de grupos de anúncio conforme CPL real do mês 1; testar 1ª leva de negativação | Campanha/grupo específico com CPL > 2x a meta do mês 1 e zero conversão em 14 dias → pausar definitivamente | Grupo com CPL 30% abaixo da meta → realocar orçamento dos grupos fracos pra esse grupo |
| **2** | Meta Ads | R$600-800* | Remarketing (público de visitantes não convertidos) tem CPL sensivelmente menor que tráfego frio | CPL de remarketing > CPL de frio do mês 1 → descartar hipótese, manter 100% em frio | CPL de remarketing < 50% do CPL frio → realocar até 30% do budget Meta pra remarketing |
| **3** | Canal vencedor (Google ou Meta, conforme CAC acumulado) | ~70% do budget | Consolidação no canal com melhor CPL→ativação acumulado dos meses 1-2 | Se nenhum canal atingir CPL dentro do benchmark em 60 dias → replanejar oferta/landing antes de aumentar verba, não aumentar budget cegamente | CAC do canal vencedor dentro da faixa saudável (seção 6) → recomendar aumento de budget total para mês 4 em diante |
| **3** | Segundo canal | ~30% do budget | Manter diversificação mínima — nunca 100% num canal só, mesmo com vencedor claro | — | — |

\*Valores de mês 2 dependem do resultado real do mês 1; a tabela mostra a faixa de redistribuição possível dentro do teto de R$2.000/mês total, não aumento de orçamento.

**Regra fixa em qualquer mês, qualquer canal:** nunca alocar 100% do budget num canal só, mesmo que um vença claramente cedo — dado o volume baixo (10-13 cadastros/semana no total), qualquer leitura de "vencedor" nos primeiros 14-21 dias ainda carrega risco alto de ruído estatístico. Diversificação mínima de 20-30% no segundo canal é seguro contra decisão precipitada.

---

## 5. Matriz de testes (hipóteses priorizadas)

| # | Hipótese | O que muda | Métrica que decide | Duração mínima | Prioridade |
|---|---|---|---|---|---|
| 1 | Otimizar Meta por evento raso (`sign_up`) gera CAC final menor que otimizar direto por evento profundo (`plan_upgraded`), dado o orçamento | Evento de otimização da campanha | CPL de `sign_up` + volume de saída do aprendizado | 21 dias | Alta |
| 2 | Anúncio focado no diferencial "prospecção via Google Maps" tem CTR maior que anúncio genérico de "agente de IA" | Criativo/copy | CTR e CPL | 14 dias | Alta |
| 3 | Palavra-chave "chatbot whatsapp com ia" converte a CPL menor que "atendimento automatizado" (termo mais genérico e disputado) | Segmentação de palavra-chave | CPL por grupo de anúncios | 14 dias | Alta |
| 4 | Landing page dedicada ao ICP "agências/revenda white-label" converte mais que landing genérica de produto | Página de destino | Taxa de conversão clique→cadastro | 14 dias | Alta |
| 5 | Criativo em vídeo (demo real do agente respondendo) tem CPL menor que criativo estático/carrossel no Meta | Formato de criativo | CPL | 14 dias | Alta |
| 6 | Consolidar 1 conjunto de anúncios (vs. dividir em 3+ públicos paralelos) reduz tempo em fase de aprendizado instável | Estrutura de conjuntos | Estabilidade de CPL semana a semana (variação %) | 21 dias | Alta |
| 7 | Remarketing (a partir do mês 2, quando existir base) recupera visitantes não convertidos a CPL menor que tráfego frio | Público (remarketing vs. frio) | CPL comparado | 14 dias | Média |
| 8 | Oferta "teste grátis sem cartão" vs. "agende demo" muda taxa de ativação (conectou canal), não só taxa de cadastro | CTA/oferta na landing e no anúncio | % de ativação (`channel_connected`) sobre cadastros | 21 dias | Média |
| 9 | Campanha de conquista por "alternativa a [concorrente]" tem CAC competitivo frente à campanha genérica de categoria | Segmentação por concorrente (branded conquest) | CPL/CAC comparado | 30 dias | Baixa — condicionada a mês 1 validar CPL saudável e revisão jurídica de trademark |

---

## 6. Funil de conversão pago — do anúncio ao cliente pagante

Toda taxa abaixo é **[BENCHMARK]** de mercado SaaS B2B self-serve brasileiro, aplicada aqui como estimativa de planejamento — não é o resultado real da WHITE CHAT, que só existe depois de rodar a conta.

| Etapa | Taxa de conversão **[BENCHMARK]** | Volume estimado (base: 650 cliques/mês) |
|---|---|---|
| Clique no anúncio | — | 650 cliques |
| Clique → Cadastro (`sign_up`) | 7-8% (blend Search 12% + Meta 5%) | ~48 cadastros |
| Cadastro → Ativação (`channel_connected` + `agent_created`) | 45-55% (PLG com onboarding simples) | ~24 ativados |
| Ativação → Upgrade pago (Starter ou Pro), dentro do período de teste, tráfego frio sem nutrição comercial ativa | 3-5% dos cadastros totais (self-serve puro, sem SDR tocando o lead) | **~2 clientes pagantes/mês** |

### A conta do CAC, sem maquiagem

- Investimento mensal: R$2.000
- Clientes pagantes estimados: ~2 por mês (pode ser 1, pode ser 3 — margem de erro grande nesse volume)
- **CAC estimado: R$2.000 ÷ 2 ≈ R$1.000 por cliente pagante** (blended, qualquer plano)

Agora compara com LTV:

- **LTV Starter (R$97/mês)**, assumindo churn mensal **[BENCHMARK]** de SaaS SMB brasileiro na faixa de 5-8%/mês (vida útil média de ~13-15 meses): LTV ≈ R$97 × 14 ≈ **R$1.360**
- **LTV Pro (R$297/mês)**, mesmo churn benchmark, plano mais "grudento" por causa do white-label (trocar de fornecedor branded custa mais caro pro cliente agência): LTV ≈ R$297 × 15 ≈ **R$4.455**

**Com CAC ≈ R$1.000:**

- Contra Starter: LTV:CAC ≈ 1,36:1. **Isso é matematicamente ruim.** A regra de ouro de SaaS é mirar 3:1 pra cima; abaixo de 1,5:1 significa que a operação praticamente paga o cliente pra existir, sem margem pra CS, suporte, infraestrutura.
- Contra Pro: LTV:CAC ≈ 4,45:1. **Isso é saudável e sustenta a operação.**

**Por isso o foco tem que estar nas agências (ICP 1) e no plano Pro, não em "trial genérico".** Se a campanha performar em volume de cadastro mas a maioria for gente entrando pelo Starter/Free sem intenção de revenda, o CAC de R$1.000 não se paga — o negócio perde dinheiro a cada cliente novo. A campanha de "Revenda/White Label" e as landing pages segmentadas por ICP (seção 2, item 8) não são um detalhe de segmentação, são o que decide se a conta de tráfego fecha ou não fecha nos 90 dias. Toda decisão de kill/scale da seção 4 deveria, idealmente, olhar CAC segmentado por ICP assim que o volume permitir (provavelmente só a partir do mês 3, dado o volume baixo) — até lá, CPL e taxa de ativação são os melhores proxies disponíveis.

**Nota de honestidade final sobre esse cálculo:** com apenas ~2 clientes pagantes/mês estimados, o CAC real vai oscilar violentamente mês a mês por pura amostra pequena — um mês pode fechar 0 clientes, outro pode fechar 4, e isso não significa que o canal piorou ou melhorou 100%, significa que o volume é baixo demais pra ler CAC mensal com confiança. A leitura confiável de CAC só existe olhando o acumulado dos 90 dias inteiros, não mês a mês isolado.

---

## 7. Painel semanal de acompanhamento

Métricas olhadas toda semana (segunda-feira, dados da semana anterior fechada) + gatilho de ação:

| Métrica | Onde olhar | Gatilho de ação |
|---|---|---|
| Ritmo de gasto vs. budget mensal (pacing) | Google Ads / Meta Ads Manager | Gasto <70% ou >110% do pacing linear esperado na semana → ajustar lance/orçamento diário |
| CPC e CTR por campanha | Google Ads / Meta Ads Manager | CTR Search < 3% ou CTR Meta < 0,8% → revisar copy/criativo da semana |
| CPL (`sign_up`) por canal e por campanha | GA4 + planilha de acompanhamento | Ver critérios de kill/scale da seção 4 |
| Quality Score (Search) | Google Ads | Qualquer palavra-chave com QS < 5 → revisar relevância do anúncio/landing daquele grupo |
| Termos de pesquisa não mapeados (Search Terms Report) | Google Ads | Qualquer termo com gasto > R$20 e zero conversão → adicionar à lista de negativas |
| Frequência de anúncio (Meta) | Meta Ads Manager | Frequência > 3 sem conversão nova → trocar criativo, sinal de fadiga |
| Status de fase de aprendizado (Meta) | Meta Ads Manager | Só registrar, não é gatilho de ação isolado — ver junto com CPL (seção 1) |
| Taxa de ativação (`channel_connected` sobre `sign_up`) | GA4 | Queda abaixo de 35% na semana → sinaliza problema de onboarding do produto, não de mídia — reportar ao time de produto |
| CAC acumulado (mês corrente) | Planilha consolidada (spend ÷ `plan_upgraded` acumulado) | Ver com cautela — volume baixo, olhar tendência de 4 semanas, não ponto único (seção 6) |

**Reunião de revisão:** semanal (15 min, tático — pacing e criativo) + mensal (60 min, estratégico — redistribuição de budget entre canais conforme seção 4).
