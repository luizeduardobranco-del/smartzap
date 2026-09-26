# BASE DE CONHECIMENTO — TRANS SCHOOL (agente Alana Lima)

> Vai no campo **Base de conhecimento** do agente. O WHITE ZAP anexa ao final do prompt.
>
> Escolas, bairros e valores **já estão dentro do prompt** (`PROMPT-ALANA-v2.txt`), porque são poucos e a Alana precisa deles em toda conversa. Esta base existe para o resto: contrato, horário, matrícula e FAQ. Tudo que estiver em branco aqui, a Alana vai encaminhar para o atendimento — que é o comportamento correto, não um defeito.

---

## 1. A EMPRESA

- Nome: **Trans School** (Trans School Serviço de Transportes) — organização `transschool-1971bc51`
- Praça: Rio de Janeiro. No mercado há 11 anos.
- Fundador: **André Lima** — pai de aluna do Alfa Cem Tijuca, já deu entrevistas sobre segurança no transporte escolar.
- Frota 2026: **11 vans dedicadas** ao Alfa Cem Unidade Tijuca.
- Instagram: instagram.com/transschoolrj · Facebook: facebook.com/transschoolrj
- Horário de atendimento humano: {{preencher}}
- Telefone de urgência (van não chegou, ocorrência com o aluno): {{preencher}}

## 2. ESCOLAS E VALORES (espelho do que está no prompt — não divergir)

| Escola | Endereço | Bairros atendidos | Ida e volta |
|---|---|---|---|
| Alfa Cem Global Academy — Unidade Tijuca | R. Isidro de Figueiredo, 47 — Maracanã/Tijuca, CEP 20271-100 | Tijuca, Andaraí, Vila Isabel, Grajaú, Usina, Praça da Bandeira, Muda, Engenho Novo | **R$ 640/mês** |
| Alfa Cem — Unidade Tijuca | idem | Méier | **R$ 730/mês** |
| pH Tijuca I | R. Prof. Gabizo, 211 — Tijuca, CEP 20271-064, tel (21) 2567-3377 | Tijuca, Andaraí, Vila Isabel, Grajaú, Usina, Praça da Bandeira, Muda, Engenho Novo | **R$ 640/mês** |
| pH Tijuca I | idem | Méier | **R$ 730/mês** |

> ⚠️ **Decisão pendente do André:** o texto de apresentação afirma atendimento *exclusivo* Alfa Cem, mas o pH Tijuca I está na tabela de preços. O prompt resolve com duas versões da apresentação (a de exclusividade só vai para o Alfa Cem). Se o pH for contrato novo, temporário ou exceção, escreva a regra aqui.

## 3. O QUE FALTA DEFINIR (cada linha em branco = uma transferência para humano)

**Preço e contrato**
- Valor de só ida, ou só volta: {{não existe hoje — definir ou manter escalando}}
- Desconto para 2º irmão: {{qual %?}}
- Taxa de matrícula ou adesão: {{existe? valor?}}
- Número de mensalidades no ano: {{11 ou 12?}}
- Vencimento e formas de pagamento: {{dia, PIX/boleto/cartão}}
- Reajuste anual: {{regra}}
- Rescisão e aviso prévio: {{regra e multa}}
- Duração do contrato: {{ano letivo?}}
- Documentos exigidos na matrícula: {{lista — coletados pelo atendente, nunca no chat}}

**Operação**
- Horário de saída por bairro: {{tabela}} — hoje a Alana está proibida de informar horário
- Tolerância de espera no embarque: {{minutos}}
- Como o responsável avisa falta do aluno e até que horário: {{}}
- Protocolo de entrega (quem pode receber o aluno): {{}}
- Adaptação nos primeiros dias: {{como funciona}}
- Férias, recesso e dia sem aula: {{cobra? como funciona?}}
- Passeio da escola e contraturno (natação, inglês, balé): {{incluso ou à parte? valor?}}
- App do responsável: {{nome, onde baixar, o que mostra}}
- Situação de vaga por rota: {{qual rota está perto de lotar — só assim a Alana pode usar escassez}}

## 4. PERGUNTAS FREQUENTES (respostas aprovadas)

**E se o aluno faltar?** {{}}

**E se a van atrasar?** {{}}

**Pode deixar na casa da avó um dia?** {{}}

**Tem cinto e cadeirinha para os menores?** {{}}

**Posso conhecer a van antes de fechar?** {{}}

**Como funciona a troca de endereço no meio do ano?** {{}}

## 5. O QUE A ALANA NUNCA RESPONDE SOZINHA

Desconto fora da tabela · parcelamento · exceção de rota · horário de embarque · nome de motorista ou monitora · vaga · rescisão e cobrança · ocorrência do dia · qualquer pergunta sobre um aluno feita por quem não é o responsável cadastrado.
