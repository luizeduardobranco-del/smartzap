# WHITE CHAT — Sistema Visual da Campanha de Lançamento
### Por LUNA · Design & Direção de Arte · White Marketing Team

---

## 0. CONTEXTO DO REBRAND

WHITE ZAP → **WHITE CHAT**. Mesma plataforma, mesmo produto, novo nome por conflito de marca registrada. A entrega abaixo assume:

- Nome oficial da peça de software: **WHITE CHAT**
- Nome da família: **White** (WHITE ERP, WHITE FLEET, WHITE TRACKERS, WHITE CHAT)
- Logo-fonte: `apps/web/public/logo.png` (repo zapagent) — mesmo arquivo de logo usado hoje, aplicado **pequeno, numa extremidade**, nunca como hero
- Cor proibida em qualquer peça: **verde**, incluindo o verde do WhatsApp — mesmo em prints de tela do produto, qualquer elemento decorativo próximo (ícone de WhatsApp, chip de status) deve ser recolorido para azul/slate

---

## 1. MINI BRAND GUIDELINE — WHITE CHAT

### 1.1 Paleta

| Papel | HEX | Uso |
|---|---|---|
| **Primária — Azul White** | `#2563eb` | CTA, links, ícone ativo, destaque de headline, barra de progresso, elementos de marca. É A cor. Usar em pelo menos 1 elemento de destaque por peça. |
| Azul escuro (hover/profundidade) | `#1D4ED8` | Estados de hover/pressed de botões primários, gradientes com a primária |
| Azul claro (fundo suave) | `#DBEAFE` | Fundos de card, badges, chips de tag, fundo de citação |
| Azul gelo (superfície) | `#EFF6FF` | Fundo de seção alternada em landing/apresentação, fundo de tabela zebrada |
| **Slate 900 (texto/fundo escuro)** | `#0F172A` | Fundo dark de peças, texto principal sobre branco em headlines grandes, footer |
| Slate 800 | `#1E293B` | Fundo dark secundário, cards sobre fundo escuro, navbar |
| Slate 600 | `#475569` | Texto de apoio/corpo sobre fundo claro |
| Slate 400 | `#94A3B8` | Texto terciário, placeholder, ícone inativo |
| Slate 200 | `#E2E8F0` | Bordas, divisores, fundo de input |
| Slate 50 | `#F8FAFC` | Fundo de página claro (base neutra) |
| **Branco** | `#FFFFFF` | Fundo padrão, texto sobre fundo escuro/azul |

**Estados (sem verde — resolvido com azul e âmbar/vermelho, nunca semáforo clássico):**

| Estado | HEX | Racional |
|---|---|---|
| Sucesso / concluído | `#2563eb` (azul primário) + ícone de check | Em vez do verde-sucesso padrão de mercado, sucesso na marca White é **azul** — reforça identidade e evita a cor proibida. Diferencia-se com o ícone (check em círculo preenchido), não com a cor. |
| Atenção / pendente | `#D97706` (âmbar) | Neutro entre azul e vermelho, não compete com a primária |
| Erro / crítico | `#DC2626` (vermelho) | Convenção universal mantida — erro precisa ser reconhecido instantaneamente, não é área de diferenciação de marca |
| Informativo / neutro | `#64748B` (slate médio) | Estados informativos, "em andamento" |

Regra de aplicação: **sucesso nunca é um chip verde**. Em telas de produto (CRM Kanban, automações), o card "Ganho"/"Fechado" usa fundo azul-gelo `#DBEAFE` com texto `#1D4ED8` e ícone de check — não fundo verde. Isso deve ser aplicado nos mockups e nas capturas de tela usadas em peças de marketing (retocar prints reais do produto se necessário).

### 1.2 Tipografia

Família: **Plus Jakarta Sans** (display/headlines) + **Inter** (corpo/UI). Fallback: Geist, system-ui, sans-serif. (Ambas grátis no Google Fonts, cobrem PT-BR com acentuação completa.)

| Nível | Fonte | Peso | Tamanho (desktop/peça grande) | Tamanho (mobile/post) | Uso |
|---|---|---|---|---|---|
| H1 | Plus Jakarta Sans | ExtraBold (800) | 64–96px | 44–56px | Headline hero, capa de deck, título de campanha |
| H2 | Plus Jakarta Sans | Bold (700) | 40–48px | 32–36px | Título de seção, título de slide |
| H3 | Plus Jakarta Sans | SemiBold (600) | 24–28px | 20–22px | Subtítulo, nome de feature/card |
| Corpo | Inter | Regular (400) / Medium (500 para ênfase) | 16–18px | 15–16px | Texto de apoio, parágrafos, descrição de card |
| Legenda / caption | Inter | Medium (500) | 12–13px | 11–12px | Rodapé, crédito, disclaimer, label de eixo |
| Botão/CTA | Inter | SemiBold (600) | 15–16px, all-caps ou title-case | 14–15px | Texto de botão, tag |

Regra de contraste: texto de corpo nunca abaixo de `#475569` sobre branco; título grande pode ser `#0F172A` (mais dramático que preto puro) ou branco sobre fundo slate/azul.

### 1.3 Grid, raio e sombra

- **Grid:** 12 colunas em desktop/apresentação (gutter 24px), 4 colunas em post quadrado/story (gutter 16px). Margem de segurança: 8% da largura da peça em todas as bordas para texto (crítico em Stories, onde topo/base são cobertos por UI do Instagram).
- **Raio de borda:** 16px para cards grandes e telas de produto em mockup; 12px para botões e chips; 999px (pill) para badges/tags de feature. Consistente com o visual "software moderno" que WHITE ERP já usa — herdar o mesmo raio cria a irmandade visual.
- **Sombra:** sombra suave e difusa, nunca dura. `0 8px 24px rgba(15, 23, 42, 0.08)` para cards sobre fundo claro; sobre fundo escuro, usar glow azul sutil em vez de sombra preta: `0 0 40px rgba(37, 99, 235, 0.25)` em elementos de destaque (ex.: mockup de celular flutuando no hero).
- **Estilo de ícone:** linha (outline/stroke), peso 1.5–2px, cantos levemente arredondados, estilo Lucide/Phosphor/Feather — nunca ícone 3D, nunca flat cartoon, nunca emoji como ícone funcional em UI. Cor de ícone: slate para neutro, azul primário para ativo/selecionado.

### 1.4 Como o WHITE CHAT se diferencia do WHITE ERP (mesma família)

Ambos compartilham a base: azul `#2563eb`, slate, Inter/Plus Jakarta Sans, raio 16px, sombra suave — isso é o "sotaque White" que faz alguém reconhecer as duas marcas como irmãs.

A diferenciação visual entre eles é de **temperatura e movimento**, não de paleta:

- **WHITE ERP** (gestão, retaguarda, número, planilha): composição mais estática, densidade de informação alta, azul usado com mais moderação (predominância de slate/branco, azul só em destaque pontual), tom "confiável e sério".
- **WHITE CHAT** (IA, conversa, agilidade): composição mais dinâmica — usa gradiente azul (`#2563eb` → `#1D4ED8` → toques de `#0F172A`), elementos com leve profundidade/glow (remete a IA/tecnologia), balões de conversa e formas orgânicas suaves (nunca quadradas puras), mais espaço em branco, tom "vivo e conversacional". Azul é usado com mais intensidade e presença — é o produto mais "de ponta" da família, então pode ousar mais em gradiente e glow sem sair da paleta.

Um jeito prático de lembrar: ERP = azul como pontuação. CHAT = azul como atmosfera.

### 1.5 Regra de aplicação do logo (inegociável)

- Logo-fonte: `apps/web/public/logo.png`.
- Tamanho: **pequeno**, ocupando no máximo 6–8% da largura da peça.
- Posição: **canto** — preferencialmente inferior direito ou superior esquerdo, nunca centralizado, nunca sobreposto ao rosto/produto principal da composição.
- Nunca é o elemento mais chamativo da peça. Contraste suficiente para legibilidade (usar versão do logo compatível com fundo claro/escuro), mas sem glow, sem sombra dramática, sem animação de destaque.
- Em posts de Instagram/LinkedIn: logo entra no canto + wordmark "WHITE CHAT" pode acompanhar em Inter SemiBold pequeno, mas o headline da peça é sempre maior que a marca.
- Em apresentações: logo no canto de todo slide-mestre (rodapé), tamanho fixo, nunca redimensionado slide a slide.

---

## 2. DIREÇÃO DE ARTE DA CAMPANHA

**Conceito visual (1 parágrafo):** a campanha de lançamento do WHITE CHAT trata a interface do produto como o próprio herói visual — telas reais de WhatsApp, mapa de prospecção e Kanban flutuam levemente inclinadas sobre um fundo slate profundo com gradiente azul e partículas/linhas de conexão sutis, como se a IA estivesse "viva" conectando pontos no espaço; a composição é limpa e respirada (muito espaço negativo), o azul é a única cor de acento permitida, e a tensão visual vem da profundidade (camadas, blur, glow) e não de cor — o objetivo é parecer software premium de ponta, não um anúncio de app genérico.

**3 referências de estilo (descritas, sem citar concorrente):**

1. **"Dashboard flutuante em ambiente escuro"** — telas de produto renderizadas com leve perspectiva 3D, flutuando sobre fundo gradiente slate-para-azul-escuro, com glow azul suave saindo de trás da tela como fonte de luz. Cria sensação de profundidade e tecnologia sem precisar de ilustração figurativa.
2. **"Editorial tech minimalista"** — grandes blocos de espaço em branco, tipografia extra bold em preto/slate como protagonista, uma única foto ou ilustração pequena e bem posicionada, paleta reduzidíssima. Comunica confiança e maturidade de produto B2B.
3. **"Linhas de conexão em rede"** — padrão de fundo abstrato feito de linhas finas e nós conectados (grafo), em tons de azul sobre slate escuro, sugerindo automação/IA/rede sem usar clip-art de robô. Usado como textura de fundo em capas e stories, nunca como elemento central.

**O que evitar:**
- Verde em qualquer tom, incluindo o verde-WhatsApp em ícones, chips de status ou screenshots não retocados.
- Robô humanoide genérico, clip-art de "IA" (cérebro brilhante, circuito na cabeça), ícone de robô de brinquedo.
- Gradiente arco-íris ou paleta múltipla — a marca é monocromática em azul + neutros.
- Fotos de banco de imagens genéricas de "pessoa de terno sorrindo para laptop".
- Excesso de texto na peça — headline curta, apoio curto, respiro.
- Sombra dura preta, bordas quadradas retas sem raio, ícones 3D/skeuomórficos ou emoji como ícone de UI.
- Qualquer composição em que o logo WHITE CHAT vire o elemento principal da peça.

---

## 3. KIT DE PEÇAS DA CAMPANHA

### 3.1 Perfis sociais

**Capa LinkedIn (Company Page)** — 1128 x 191px
- Objetivo: primeira impressão institucional, reforçar posicionamento "agentes de IA para WhatsApp, Instagram e site".
- Texto: Headline "Agentes de IA que vendem no WhatsApp." / Apoio: "White Chat — atendimento e vendas automatizados para agências e times comerciais."
- Composição: fundo gradiente slate→azul escuro com textura de linhas de conexão sutil à direita; texto alinhado à esquerda em branco; logo pequeno no canto inferior direito.

**Foto de perfil (LinkedIn/Instagram)** — 400 x 400px (LinkedIn exibe circular, Instagram também — manter elementos centrais)
- Objetivo: reconhecimento de marca em miniatura, precisa funcionar em 40px.
- Texto: nenhum (símbolo apenas).
- Composição: fundo azul primário `#2563eb` sólido ou gradiente sutil azul→slate, símbolo/monograma do logo White centralizado em branco, bem simples e de alto contraste.

**Capa Instagram (destaque de story "Sobre")** — usar 1080 x 1920px recortado para thumbnail circular, ver Stories abaixo.

### 3.2 Posts de feed (1080 x 1080px) — 6 peças

1. **Post "Anúncio de lançamento"**
   - Objetivo: anunciar o rebrand/lançamento do WHITE CHAT.
   - Texto: Headline "Chegou o White Chat." / Apoio: "A nova casa da IA que atende e vende por você."
   - Composição: fundo slate escuro com glow azul central, wordmark grande em branco, mockup de tela de WhatsApp flutuando levemente à direita, logo pequeno inferior direito.

2. **Post "Feature — Prospecção por Google Maps"** (diferencial mais forte)
   - Objetivo: mostrar o recurso de extrair leads de nicho+cidade+raio direto do mapa.
   - Texto: Headline "Encontre 500 leads no seu bairro. Em minutos." / Apoio: "Prospecção automática por nicho, cidade e raio — direto pro seu funil."
   - Composição: mockup de mapa estilizado (pins azuis) ocupando 60% da peça à esquerda, painel lateral simulando resultado (nome/telefone/endereço) à direita em card branco com sombra suave, headline no topo.

3. **Post "Feature — Agente de IA com personalidade"**
   - Objetivo: mostrar que o agente é configurável e tem base de conhecimento.
   - Texto: Headline "Seu agente. Sua cara. Seu conhecimento." / Apoio: "Treine com PDFs, links e FAQs — sem escrever uma linha de código."
   - Composição: mockup de conversa de WhatsApp com bolhas de mensagem (azul para o agente, cinza para o cliente — nunca verde), ícone de "documento sendo processado" ao lado.

4. **Post "Feature — CRM Kanban"**
   - Objetivo: mostrar organização visual de leads.
   - Texto: Headline "Do primeiro 'oi' ao contrato fechado." / Apoio: "CRM Kanban integrado — cada lead, no lugar certo."
   - Composição: mockup de board Kanban simplificado (3-4 colunas) em cards brancos com raio 16px sobre fundo azul-gelo, cabeçalhos de coluna em slate, card "Fechado" em azul (não verde) com ícone de check.

5. **Post "Prova social / matemática de revenda"**
   - Objetivo: atrair agências com o modelo white-label.
   - Texto: Headline "Revenda IA. Fature em cima." / Apoio: "Plano Pro com sua marca — você define o preço."
   - Composição: dois cards lado a lado comparando "Você paga" (R$297) vs "Você cobra" (valor livre, ex. R$797+), seta azul entre eles, tom mais "negócio", menos "produto".

6. **Post "Planos e CTA"**
   - Objetivo: conversão direta, close de funil.
   - Texto: Headline "Comece grátis. Escale quando quiser." / Apoio: "Free · Starter R$97 · Pro R$297 · Enterprise sob consulta."
   - Composição: 4 cards de plano em coluna ou grid 2x2, card "Pro" com destaque de borda azul (mais recomendado), CTA "Teste grátis" em botão azul.

### 3.3 Stories (1080 x 1920px) — 4 peças

Margem de segurança obrigatória: 250px no topo e 250px na base livres de texto (área coberta por UI do Instagram/reply bar).

1. **Story "Teaser de lançamento"** — Headline "Algo novo está chegando." + contador ou "em breve", fundo com textura de linhas de conexão animável (versão estática para produção em Canva), logo pequeno no rodapé acima da margem de segurança.
2. **Story "Swipe up / Link na bio — Prospecção Maps"** — mockup vertical do mapa com pins, headline curta "Leads no piloto automático", seta indicando "arrasta pra cima"/botão de link.
3. **Story "Depoimento/caso de uso"** (placeholder de cliente/agência) — citação curta entre aspas grandes em Plus Jakarta Sans, fundo azul-gelo, foto circular pequena (placeholder), nome e cargo em legenda.
4. **Story "Contagem regressiva de oferta/lançamento"** — número grande em destaque (ex. "48H"), headline "Condição de lançamento", CTA "Toque para testar".

### 3.4 Criativos Meta Ads — 3 peças

1. **Ad 1 — Quadrado (1080 x 1080px), topo de funil**
   - Objetivo: geração de reconhecimento/tráfego frio, ICP times comerciais B2B.
   - Texto: Headline "Pare de perder lead no WhatsApp." / Apoio: "IA responde na hora, 24h. Teste grátis."
   - Composição: mockup de celular centralizado com notificação de nova conversa, fundo gradiente azul-slate, botão CTA simulado "Testar grátis".

2. **Ad 2 — Retangular (1200 x 628px), topo de funil**
   - Objetivo: mesmo objetivo, formato para feed/audience network.
   - Texto: Headline "Sua equipe comercial + IA." / Apoio: "Atenda WhatsApp, Instagram e site em um só lugar."
   - Composição: layout horizontal, texto à esquerda (60%), mockup de dashboard/telas sobrepostas à direita (40%).

3. **Ad 3 — Quadrado (1080 x 1080px), ICP agências/white-label**
   - Objetivo: geração de lead qualificado para agências revendedoras.
   - Texto: Headline "Sua agência com produto de IA próprio." / Apoio: "White-label completo. Você marca, você fatura."
   - Composição: mockup de app com logo genérico de "agência" customizado na tela (mostrando white-label), selo/badge "100% sua marca" em azul, CTA "Fale com a gente".

### 3.5 Outras peças

**Banner de topo da landing page** — 1920 x 600px (desktop) — recomenda-se também variante 1080 x 1350px para mobile
- Objetivo: hero da homepage.
- Texto: Headline "Agentes de IA que atendem e vendem por você." / Apoio: "WhatsApp, Instagram e site — em um só lugar. Comece grátis."
- Composição: fundo gradiente slate→azul com textura de linhas de conexão à direita, texto e CTA à esquerda, mockup de produto (tela de conversa + Kanban) flutuando à direita com glow azul, logo no canto.

**Capa de apresentação comercial** — 1920 x 1080px (16:9)
- Objetivo: abrir o deck de vendas para agências/revendedores.
- Texto: "WHITE CHAT — Agentes de IA para atendimento e vendas" / apoio menor: "Proposta comercial para parceiros e revendedores."
- Composição: fundo slate escuro, textura de rede de conexão discreta, wordmark grande centralizado ou à esquerda, logo pequeno no rodapé.

**Assinatura de e-mail** — 600 x 150px (padrão de assinatura, largura máxima recomendada para clientes de e-mail)
- Objetivo: reforço de marca em toda comunicação 1:1.
- Texto: Nome / Cargo / "White Chat" em azul / telefone / site.
- Composição: logo pequeno à esquerda, linha vertical divisória fina slate, bloco de texto à direita, um único link em azul sublinhado (CTA "Conheça o White Chat").

---

## 4. PROMPTS PARA IA GERADORA DE IMAGEM

Todos os prompts em inglês incluem instrução explícita de paleta azul/slate e proibição de verde, pois modelos de imagem tendem a "puxar" verde em qualquer contexto de chat/mensagem (viés do ícone do WhatsApp) — essa instrução negativa é obrigatória em todos os 10.

---

**1. Hero da landing page — mockup de produto flutuante**

🎨 Midjourney v6.1
📐 16:9 (1920x1080 crop)

PROMPT (EN):
`Floating 3D mockup of a modern messaging app interface tilted at a slight angle, glowing softly against a deep dark slate background (#0F172A), abstract thin connecting lines and nodes in the background suggesting a network, cinematic tech product photography style, dramatic rim lighting in electric blue (#2563eb), soft blue glow emanating from behind the screen, camera angle slightly low looking up at the floating screen, three-quarter perspective, color palette strictly blue and dark slate and white only, absolutely no green anywhere in the image, no green UI elements, no green icons, high detail, premium SaaS product render, octane render quality, ultra sharp, 8k --ar 16:9`

PROMPT (PT):
`Mockup 3D flutuante de uma interface de app de mensagens moderna, levemente inclinado, brilhando suavemente contra um fundo slate escuro profundo (#0F172A), linhas finas abstratas conectando nós ao fundo sugerindo uma rede, estilo de fotografia de produto tech cinematográfico, luz de contorno dramática em azul elétrico (#2563eb), glow azul suave saindo de trás da tela, câmera em ângulo levemente baixo olhando para cima em direção à tela flutuante, perspectiva de três quartos, paleta de cores estritamente azul, slate escuro e branco, absolutamente nenhum verde em qualquer parte da imagem, nenhum elemento de UI verde, nenhum ícone verde, alto detalhe, render de produto SaaS premium, qualidade octane render, ultra nítido, 8k`

---

**2. Ilustração — agente de IA atendendo no WhatsApp**

🎨 DALL-E 3
📐 1:1 (1080x1080)

PROMPT (EN):
`Flat minimalist vector illustration of an AI chat assistant represented as an abstract glowing blue orb with subtle circuit-like light trails, positioned inside a stylized smartphone chat bubble interface, clean geometric shapes, message bubbles in electric blue (#2563eb) and light slate gray (#E2E8F0) only, modern tech editorial illustration style similar to premium SaaS websites, soft ambient lighting, flat front-facing composition, generous negative white space, color palette limited to blue, slate, white and dark navy, strictly no green color anywhere, no green message bubbles, no green icons, no WhatsApp logo, no robot mascot with face, clean vector art, high resolution`

PROMPT (PT):
`Ilustração vetorial flat minimalista de um assistente de IA de chat representado como um orbe azul brilhante abstrato com sutis rastros de luz tipo circuito, posicionado dentro de uma interface estilizada de balão de chat de smartphone, formas geométricas limpas, balões de mensagem em azul elétrico (#2563eb) e cinza slate claro (#E2E8F0) apenas, estilo de ilustração editorial tech moderna similar a sites SaaS premium, iluminação ambiente suave, composição frontal plana, bastante espaço negativo branco, paleta de cores limitada a azul, slate, branco e azul-marinho escuro, estritamente nenhuma cor verde em qualquer lugar, nenhum balão de mensagem verde, nenhum ícone verde, sem logo do WhatsApp, sem mascote robô com rosto, arte vetorial limpa, alta resolução`

---

**3. Visual — prospecção de leads por mapa**

🎨 Midjourney v6.1
📐 1:1 (1080x1080)

PROMPT (EN):
`Stylized isometric digital map interface with glowing blue location pin markers scattered across a dark slate city grid, clean UI overlay panel showing abstract data cards floating beside the pins, modern SaaS dashboard aesthetic, top-down isometric camera angle, soft blue glow around each pin, thin white grid lines on dark navy background, color palette strictly electric blue (#2563eb), dark slate (#0F172A) and white, absolutely no green, no green map elements, no traditional green Google Maps pin color, clean tech illustration, high detail vector-like render, 8k --ar 1:1`

PROMPT (PT):
`Interface de mapa digital isométrica estilizada com marcadores de pin de localização azuis brilhantes espalhados por uma grade de cidade slate escura, painel de UI limpo mostrando cards de dados abstratos flutuando ao lado dos pins, estética de dashboard SaaS moderno, ângulo de câmera isométrico de cima para baixo, glow azul suave ao redor de cada pin, linhas de grade brancas finas sobre fundo azul-marinho escuro, paleta de cores estritamente azul elétrico (#2563eb), slate escuro (#0F172A) e branco, absolutamente nenhum verde, nenhum elemento verde no mapa, sem a cor verde tradicional de pin do Google Maps, ilustração tech limpa, render de alto detalhe tipo vetor, 8k`

---

**4. Visual — CRM Kanban de leads**

🎨 DALL-E 3
📐 1:1 (1080x1080)

PROMPT (EN):
`Clean flat illustration of a Kanban board interface with four columns of rounded rectangular cards, floating slightly with soft drop shadows, cards in white and light blue tones (#DBEAFE), column headers in dark slate text, one highlighted card in solid electric blue (#2563eb) with a checkmark icon representing a closed deal, minimalist SaaS dashboard illustration style, soft studio lighting, front flat perspective, generous white background negative space, color palette strictly blue, slate and white, absolutely no green cards, no green status indicators, no green checkmarks, clean vector UI illustration, high resolution`

PROMPT (PT):
`Ilustração flat limpa de uma interface de board Kanban com quatro colunas de cards retangulares arredondados, flutuando levemente com sombras suaves, cards em tons de branco e azul claro (#DBEAFE), cabeçalhos de coluna em texto slate escuro, um card destacado em azul elétrico sólido (#2563eb) com ícone de check representando negócio fechado, estilo de ilustração de dashboard SaaS minimalista, iluminação de estúdio suave, perspectiva frontal plana, bastante espaço negativo branco de fundo, paleta de cores estritamente azul, slate e branco, absolutamente nenhum card verde, nenhum indicador de status verde, nenhum check verde, ilustração vetorial de UI limpa, alta resolução`

---

**5. Cena — agência revendendo o produto (white-label)**

🎨 Midjourney v6.1
📐 4:5 (1080x1350)

PROMPT (EN):
`Modern minimalist illustration of two overlapping smartphone mockups showing a chat app interface, one branded generically and one showing a customizable logo placeholder area highlighted with a subtle blue outline, suggesting white-label branding, clean corporate tech style, soft studio lighting from top left, three-quarter camera angle, dark slate background (#1E293B) with subtle blue gradient glow, color palette strictly blue (#2563eb), slate and white, absolutely no green anywhere, no green UI, professional B2B SaaS marketing illustration, high detail, 8k --ar 4:5`

PROMPT (PT):
`Ilustração minimalista moderna de dois mockups de smartphone sobrepostos mostrando uma interface de app de chat, um com marca genérica e outro mostrando uma área de logo customizável destacada com contorno azul sutil, sugerindo marca white-label, estilo tech corporativo limpo, iluminação de estúdio suave vinda de cima à esquerda, ângulo de câmera de três quartos, fundo slate escuro (#1E293B) com glow gradiente azul sutil, paleta de cores estritamente azul (#2563eb), slate e branco, absolutamente nenhum verde em lugar algum, nenhuma UI verde, ilustração de marketing B2B SaaS profissional, alto detalhe, 8k`

---

**6. Background abstrato tech azul (uso geral em peças/fundos)**

🎨 Midjourney v6.1
📐 9:16 (1080x1920, para stories) — também gerar variante 1:1

PROMPT (EN):
`Abstract dark technology background with thin glowing blue connecting lines forming a subtle network/graph pattern, small glowing nodes at intersections, deep navy slate background (#0F172A) with soft radial blue gradient glow (#2563eb) in one corner, minimal, elegant, premium SaaS brand background texture, no text, no logos, no human figures, no objects, color palette strictly dark slate and electric blue and white highlights only, absolutely no green tint anywhere in the image, clean digital art, subtle depth of field, high resolution 8k --ar 9:16`

PROMPT (PT):
`Fundo tech escuro abstrato com linhas finas azuis brilhantes formando um padrão sutil de rede/grafo, pequenos nós brilhantes nas interseções, fundo slate azul-marinho profundo (#0F172A) com glow gradiente radial azul suave (#2563eb) em um canto, minimalista, elegante, textura de fundo de marca SaaS premium, sem texto, sem logos, sem figuras humanas, sem objetos, paleta de cores estritamente slate escuro e azul elétrico e destaques brancos apenas, absolutamente nenhum tom de verde em qualquer parte da imagem, arte digital limpa, profundidade de campo sutil, alta resolução 8k`

---

**7. Ícones — set de linha para features do produto**

🎨 Ideogram (bom para consistência de ícone/linha limpa)
📐 1:1 (gerar em grid, recortar individualmente)

PROMPT (EN):
`Set of six minimalist line icons on a white background, arranged in a clean grid, representing: chat bubble, map pin, kanban board, automation flow arrows, whatsapp-style phone, artificial intelligence spark — all drawn in a consistent thin outline style, 1.5px stroke weight, rounded corners, single color electric blue (#2563eb) line art on white background, no fill, no gradient, no shadow, modern SaaS UI icon set style similar to Lucide or Phosphor icons, absolutely no green color, flat vector icon design, high resolution, clean and precise`

PROMPT (PT):
`Conjunto de seis ícones de linha minimalistas sobre fundo branco, organizados em uma grade limpa, representando: balão de chat, pin de mapa, board kanban, setas de fluxo de automação, telefone estilo whatsapp, faísca de inteligência artificial — todos desenhados em estilo de contorno fino consistente, espessura de traço 1.5px, cantos arredondados, arte em linha de cor única azul elétrico (#2563eb) sobre fundo branco, sem preenchimento, sem gradiente, sem sombra, estilo de conjunto de ícones de UI SaaS moderno similar aos ícones Lucide ou Phosphor, absolutamente nenhuma cor verde, design de ícone vetorial flat, alta resolução, limpo e preciso`

---

**8. Cena — dashboard de automação/fluxo visual**

🎨 DALL-E 3
📐 16:9 (1200x628, para ad retangular)

PROMPT (EN):
`Clean isometric illustration of an automation flow diagram with connected rounded rectangular nodes and arrows, representing a visual workflow builder interface, nodes in white and light blue (#DBEAFE) with icons inside, connecting lines in electric blue (#2563eb), floating slightly above a soft light gray background (#F8FAFC), minimal shadows, modern B2B SaaS product illustration style, front three-quarter isometric angle, soft even studio lighting, color palette strictly blue, slate and white, absolutely no green nodes, no green connectors, no green icons, high detail flat vector illustration, 8k`

PROMPT (PT):
`Ilustração isométrica limpa de um diagrama de fluxo de automação com nós retangulares arredondados conectados e setas, representando uma interface de construtor de workflow visual, nós em branco e azul claro (#DBEAFE) com ícones dentro, linhas de conexão em azul elétrico (#2563eb), flutuando levemente sobre fundo cinza claro suave (#F8FAFC), sombras mínimas, estilo de ilustração de produto B2B SaaS moderno, ângulo isométrico frontal de três quartos, iluminação de estúdio suave e uniforme, paleta de cores estritamente azul, slate e branco, absolutamente nenhum nó verde, nenhum conector verde, nenhum ícone verde, ilustração vetorial flat de alto detalhe, 8k`

---

**9. Capa/textura para apresentação comercial**

🎨 Midjourney v6.1
📐 16:9 (1920x1080)

PROMPT (EN):
`Minimalist premium corporate presentation background, deep dark slate gradient (#0F172A to #1E293B) with a single soft glowing blue accent (#2563eb) light source positioned in the lower right corner, extremely subtle thin network line texture barely visible in the dark area, vast empty negative space in the upper left for text placement, elegant, understated, high-end B2B SaaS pitch deck aesthetic, no objects, no text, no logos, no people, color palette strictly dark slate, electric blue and black, absolutely no green tint, cinematic subtle lighting, ultra clean, 8k --ar 16:9`

PROMPT (PT):
`Fundo de apresentação corporativa premium minimalista, gradiente slate escuro profundo (#0F172A a #1E293B) com uma única fonte de luz de destaque azul brilhante suave (#2563eb) posicionada no canto inferior direito, textura de linha de rede extremamente sutil mal visível na área escura, vasto espaço negativo vazio no canto superior esquerdo para posicionamento de texto, elegante, discreto, estética de pitch deck B2B SaaS de alto padrão, sem objetos, sem texto, sem logos, sem pessoas, paleta de cores estritamente slate escuro, azul elétrico e preto, absolutamente nenhum tom de verde, iluminação cinematográfica sutil, ultra limpo, 8k`

---

**10. Retrato conceitual — "time comercial + IA"**

🎨 Leonardo AI (bom para composição fotoreal com elementos de UI sobrepostos)
📐 4:5 (1080x1350)

PROMPT (EN):
`Modern editorial photograph style image of a diverse small business sales team looking at a laptop screen together in a bright minimalist office, warm natural window light mixed with a subtle blue screen glow reflecting on their faces, laptop screen showing an abstract blurred blue chat interface, shallow depth of field, candid professional photography, muted neutral office tones with electric blue (#2563eb) as the only strong accent color from the screen glow, medium shot, eye-level camera angle, color grading cool and blue-toned shadows, absolutely no green in clothing, decor or screen elements, high resolution realistic photography, 8k`

PROMPT (PT):
`Imagem em estilo de fotografia editorial moderna de uma pequena equipe comercial diversa olhando juntos para a tela de um laptop em um escritório minimalista iluminado, luz natural quente de janela misturada com um glow azul sutil de tela refletindo nos rostos, tela do laptop mostrando uma interface de chat azul abstrata desfocada, profundidade de campo rasa, fotografia profissional espontânea, tons neutros de escritório com azul elétrico (#2563eb) como única cor de destaque forte vinda do glow da tela, plano médio, ângulo de câmera na altura dos olhos, gradação de cor com sombras frias e azuladas, absolutamente nenhum verde em roupas, decoração ou elementos de tela, fotografia realista de alta resolução, 8k`

---

## 5. ESTRUTURA DA APRESENTAÇÃO COMERCIAL — WHITE CHAT PARA AGÊNCIAS/REVENDEDORES

Formato: 16:9, 1920x1080px, 15 slides. Tom: direto, orientado a negócio (não é pitch de investidor — é proposta comercial B2B).

**Slide 1 — Capa**
- Conteúdo: "White Chat — Agentes de IA para atendimento e vendas" + "Proposta para parceiros e revendedores"
- Visual: fundo slate com glow azul (prompt #9), logo pequeno no rodapé.
- Nota do apresentador: abrir perguntando o volume de clientes/leads que a agência atende hoje — ancora a conversa em números antes de mostrar produto.

**Slide 2 — O problema**
- Conteúdo: "70% dos leads que chegam no WhatsApp não recebem resposta em menos de 5 minutos" (dado de mercado a validar) + custo de contratar time humano 24h.
- Visual: estatística grande em destaque, ícone de relógio/chat.
- Nota: personalizar com a dor do cliente específico na reunião, se souber o segmento dele.

**Slide 3 — A solução em uma frase**
- Conteúdo: "White Chat: agentes de IA que atendem, qualificam e vendem em WhatsApp, Instagram e site — sem código."
- Visual: mockup central de conversa de WhatsApp com resposta automática.
- Nota: enfatizar "sem código" — é o principal objection-killer para agências sem time técnico.

**Slide 4 — Como funciona (visão geral)**
- Conteúdo: 4 passos — conectar canal (QR code) → treinar agente (base de conhecimento) → configurar automações → acompanhar no CRM.
- Visual: diagrama de fluxo horizontal com 4 ícones conectados (usar estilo do prompt #8).
- Nota: reforçar que a ativação leva minutos, não semanas.

**Slide 5 — Feature: Agentes de IA com personalidade**
- Conteúdo: múltiplos modelos (GPT-4o, Claude, LLaMA 3, DeepSeek, Groq), tom de voz customizável, base de conhecimento por PDF/link/FAQ/foto.
- Visual: mockup de configuração do agente + logos dos modelos como selo de "multi-modelo".
- Nota: multi-modelo é diferencial técnico real — não depender de um único provedor é argumento de resiliência para o cliente da agência.

**Slide 6 — Feature: Canais**
- Conteúdo: WhatsApp multi-número via QR code, Instagram, widget de site — tudo numa caixa de entrada.
- Visual: três mockups de canal lado a lado.
- Nota: perguntar quantos números de WhatsApp o cliente já opera — multi-número resolve dor real de agência com múltiplas contas.

**Slide 7 — Feature de destaque: Prospecção via Google Maps**
- Conteúdo: extrai nome, telefone e endereço por nicho, cidade e raio — importa direto pro funil.
- Visual: mockup do mapa com pins (prompt #3) + preview da lista importada.
- Nota: este é o gancho mais forte para agências — é geração de lead automatizada, não só atendimento. Deixar 1-2 minutos a mais aqui, é o "uau" do deck.

**Slide 8 — Feature: CRM Kanban**
- Conteúdo: cada conversa vira card, funil visual, sem precisar de outra ferramenta.
- Visual: mockup Kanban (prompt #4).
- Nota: mostrar que substitui planilha/CRM avulso — argumento de consolidação de ferramentas.

**Slide 9 — Feature: Automações e handoff humano**
- Conteúdo: gatilhos visuais, transferência para humano quando necessário, campanhas de disparo agendadas.
- Visual: diagrama de fluxo de automação (prompt #8).
- Nota: importante deixar claro que a IA sabe "quando chamar o humano" — mata a objeção de "IA vai fazer besteira com meu cliente".

**Slide 10 — Por que revender (não só usar)**
- Conteúdo: introdução ao conceito white-label — sua marca, sua precificação, seu cliente.
- Visual: mockup de app com área de logo customizável (prompt #5).
- Nota: transição do "produto" para o "modelo de negócio" — é aqui que muda o interlocutor de usuário para parceiro.

**Slide 11 — Planos**
- Conteúdo: Free R$0 · Starter R$97/mês · Pro R$297/mês (inclui white-label + API) · Enterprise sob consulta.
- Visual: 4 cards de plano, Pro destacado.
- Nota: deixar claro que white-label só existe a partir do Pro — é o gatilho de upgrade natural da conversa.

**Slide 12 — A matemática da revenda**
- Conteúdo: exemplo numérico — agência paga R$297/mês (Pro) por instância de cliente, revende com marca própria por R$797 a R$1.497/mês (faixa sugerida de mercado para produto white-label de IA) → margem de R$500 a R$1.200 por cliente/mês. Com 10 clientes ativos: custo de R$2.970 vs. receita de R$7.970–14.970 → margem líquida de R$5.000–12.000/mês só de revenda, sem contar setup/onboarding cobrado à parte.
- Visual: tabela/comparativo visual "custo vs. receita" com barra azul de margem em destaque (usar o padrão de dataviz da marca — azul primário para a barra de margem, slate para custo).
- Nota: este é o slide que fecha a decisão. Ajustar os números de exemplo ao ticket que a agência já pratica com o cliente dela, se souber. Perguntar quantos clientes ativos ela tem hoje e fazer a conta ao vivo.

**Slide 13 — Casos de uso por segmento**
- Conteúdo: exemplos rápidos de nicho (clínica, imobiliária, loja, serviço local) mostrando como o agente + prospecção por mapa se aplicam.
- Visual: 3-4 mini-cards com ícone de segmento.
- Nota: escolher o segmento que mais se aproxima do portfólio de clientes da agência na sala.

**Slide 14 — Suporte e onboarding do parceiro**
- Conteúdo: o que a White entrega para a agência decolar (materiais, suporte técnico, treinamento).
- Visual: checklist visual simples.
- Nota: reduzir a ansiedade de "vou vender uma coisa que não sei sustentar" — reforçar que o suporte é conjunto.

**Slide 15 — Próximos passos / CTA**
- Conteúdo: "Vamos ativar sua conta de parceiro hoje" + contato + prazo de teste grátis.
- Visual: fundo slate com glow azul (mesmo do slide 1, fecha o arco visual), CTA em botão azul.
- Nota: fechar com data/ação concreta (agendar onboarding, não "te mando um e-mail depois").

*(Nota: o briefing pediu 14 a 16 slides — a estrutura acima entrega 15, incluindo a matemática da revenda pedida explicitamente. Um slide 16 opcional de "Perguntas frequentes" pode ser adicionado se a agência costuma levantar objeções recorrentes específicas.)*

---

## 6. CHECKLIST DE PRODUÇÃO

### O que dá para fazer 100% em Canva (sem IA de imagem)
- Assinatura de e-mail
- Capa e foto de perfil LinkedIn/Instagram (usando logo + paleta, sem ilustração complexa)
- Posts de planos/CTA (Slide/post 6) — é essencialmente tabela + tipografia
- Post de prova social/matemática de revenda — tabela + seta, sem ilustração
- Estrutura base de todos os slides da apresentação comercial (texto, layout, tabelas, ícones de biblioteca do Canva em azul)
- Banner de topo da landing (se usar apenas mockup de tela real do produto retocado, sem ilustração gerada)

### O que precisa de IA geradora de imagem
- Hero da landing (mockup 3D flutuante com glow) — prompt #1
- Ilustração do agente IA / balão de chat estilizado — prompt #2
- Visual de prospecção por mapa (versão ilustrada, não screenshot) — prompt #3
- Visual de CRM Kanban (versão ilustrada) — prompt #4
- Cena de agência revendendo (white-label) — prompt #5
- Backgrounds abstratos tech azul para stories/capa de apresentação — prompts #6 e #9
- Set de ícones customizado (se não usar biblioteca do Canva) — prompt #7
- Diagrama de automação estilizado — prompt #8
- Imagem de "time comercial" para ad de topo de funil — prompt #10

### Ordem de produção recomendada

1. **Fundamentos (dia 1):** fechar paleta/tipografia neste guideline como referência única → configurar Brand Kit no Canva (cores, fontes, logo) — 1h
2. **Gerar imagens-base via IA (dia 1-2):** rodar os 10 prompts, gerar 2-3 variações de cada, selecionar os melhores → tratar/recortar fundo se necessário — 3-4h
3. **Kit de identidade social (dia 2):** capa e foto de perfil LinkedIn/Instagram, assinatura de e-mail — 1h
4. **Posts de feed (dia 2-3):** 6 posts, usando imagens geradas já prontas + Brand Kit do Canva — 2-3h
5. **Stories (dia 3):** 4 peças, reaproveitando assets dos posts em formato vertical — 1-2h
6. **Ads Meta (dia 3-4):** 3 criativos, reaproveitando hero/mockups já gerados, ajustando para dimensões de ads — 1-2h
7. **Landing banner (dia 4):** 1 peça, usando prompt #1 já gerado — 1h
8. **Apresentação comercial (dia 4-5):** 15 slides no Canva, usando backgrounds gerados (#6, #9) + diagramas (#8) + mockups já produzidos para os slides — 4-5h (é a peça mais longa)
9. **Revisão de marca (dia 5):** checar todas as peças contra a regra "sem verde" e "logo pequeno na extremidade" antes de publicar — 1h

**Estimativa total:** 3 a 5 dias úteis de produção para o kit completo, considerando uma pessoa trabalhando em Canva + geração de imagem, dentro do orçamento de R$2.000/mês (custo de produção é majoritariamente tempo + créditos de IA de imagem, sem estúdio).
