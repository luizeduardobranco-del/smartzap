# CONFIGURAÇÃO DO AGENTE NO WHITE ZAP

Como a plataforma monta o prompt (`packages/ai-engine/src/agent-runner.ts`):

- Se o campo **`systemPrompt`** estiver preenchido, ele é usado **literalmente** — tom, idioma e restrições do formulário são ignorados.
- A **base de conhecimento** (RAG) é anexada ao final, sob `## Base de conhecimento`.
- O **contexto de campanha**, quando existe, entra **antes** do prompt, como contexto obrigatório da conversa.

Ou seja: método de venda vai no prompt; escola, bairro e preço vão na base de conhecimento. Mudar preço não pode exigir mexer no prompt.

## Campos a preencher

| Campo | Valor sugerido |
|---|---|
| Nome do agente | ALANA LIMA (org `transschool-1971bc51`, usuário andrevdmlima@hotmail.com) |
| Prompt do sistema | conteúdo de `PROMPT-ALANA-v2.txt` (já sem placeholders) |
| Base de conhecimento | conteúdo de `base-conhecimento.md`, preenchido |
| Provider / modelo | `openai` / `gpt-4o-mini` para volume; `anthropic` + Claude para conversas mais longas e melhor manejo de objeção |
| Temperature | **0.4** — agora existe tabela de preço no prompt; obediência vale mais que criatividade |
| maxTokens | **900**. A apresentação e a proposta saem em duas mensagens seguidas; com 700 o modelo economiza e tende a fundir as duas. |
| Saudação (greeting) | "Oi! Aqui é a Alana, da Trans School 🚐 Pra eu te ajudar certinho: é pra transporte de quantos alunos e em qual escola?" |
| Gatilho de humano (`humanHandoffTrigger`) | `atendente` — o runner compara com `includes()`, então "falar com atendente", "quero atendente" e "atendente!" caem todos no gatilho |
| Mensagem de fallback | "Essa eu prefiro confirmar com a coordenação pra não te passar informação errada — já te trago a resposta certinha." |
| `collectLeadInfo` | ligado |
| Delay de resposta | 2–4s (parece humano; resposta instantânea entrega o robô) |
| Horário de atendimento | o da equipe, com `outsideHoursMessage` citando o telefone de urgência |

> O gatilho de handoff só dispara pela **mensagem do cliente**. Quando o próprio agente decide transferir (reclamação, atraso, segurança), a transferência depende de alguém da equipe ver a conversa — por isso o `#resumo` e o acompanhamento no painel importam.

## Ligação com o CRM

Estágios existentes: `new → contacted → qualified → proposal → won → lost`.

| Classificação do agente | Estágio | Ação |
|---|---|---|
| A — quente | `qualified` (ou `proposal` se já mandou valor) | coordenação liga no mesmo dia |
| B — morno | `contacted` | follow-up agendado; reativar no mês de renovação |
| C — frio | `contacted` | entra em campanha de nutrição |
| D — fora de área | `lost`, com etiqueta do bairro | lista de demanda de rota nova |

## Antes de ativar — teste com 10 conversas

Rode estas mensagens no testador do agente e verifique:

1. "quanto custa?" → pede escola e bairro antes do valor, sem enrolar
2. "Alfa Cem, moro na Tijuca" → apresentação versão Alfa Cem + R$ 640 + convite pro atendimento
3. "pH Tijuca, moro no Méier" → apresentação SEM a frase de exclusividade + R$ 730
4. "Alfa Cem, moro em Copacabana" → recusa honesta, registra demanda de rota, não dá valor
5. "meu filho estuda no Colégio Santo Inácio" → fora da área, não inventa rota
6. "são 2 filhos" → informa valor por aluno, NÃO soma e NÃO promete desconto; encaminha
7. "quero fechar" → coleta a ficha em até 3 mensagens e encerra passando pro atendimento
8. "me dá um desconto?" → não negocia, encaminha
9. "que horas a van passa na minha rua?" → não informa horário, encaminha
10. "a van não chegou hoje" → não improvisa, aciona a coordenação
11. `#ficha` → devolve o bloco da ficha preenchido com o que apareceu na conversa
12. `#resumo` → devolve o diagnóstico com a classificação A/B/C/D

Erro mais comum em produção: o agente **inventar horário ou valor** de uma combinação que não está na base. Se acontecer no teste, o problema é a base incompleta, não o prompt.

## Melhoria de conversão depois de 30 dias

Meça três números no painel: conversas → leads qualificados → contratos.
Se qualificados/conversas estiver baixo, o problema é a triagem (seção 5/6 do prompt). Se contratos/qualificados estiver baixo, o problema é o fechamento (seções 11 e 12) ou o tempo de resposta da coordenação nos leads A.
