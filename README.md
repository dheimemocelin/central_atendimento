# 💬 Central de Atendimento

CRM de demonstração para organizar leads, acompanhar conversas e visualizar resultados em um único lugar.

Construído com **React, TypeScript, Fastify e PostgreSQL**, com autenticação, permissões por carteira, Kanban com arraste e histórico persistente. A interface usa identidade neutra, navegação recolhível e cores para distinguir as etapas.

> **Dados exclusivamente fictícios.** O gerador cria 48 contatos demonstrativos, sem telefones acionáveis, com e-mails `example.invalid`. As senhas são definidas localmente. Não há credenciais padrão ou serviço público incluído neste repositório.

**Navegação:** [Funcionalidades](#funcionalidades) · [Fluxograma](#fluxograma-de-atendimento) · [Instalação](#instalação) · [Contas de demonstração](#contas-de-demonstração) · [Testes](#testes-e-validação) · [Licença](#licença)

## Funcionalidades

| Módulo | O que permite fazer |
|---|---|
| **Dashboard e BI** | Filtrar por período, atendente, etapa e resultado; acompanhar cobertura, contato, conversão e produtividade; abrir a carteira a partir dos indicadores. |
| **Kanban** | Arrastar cards, pesquisar leads e filtrar a operação. Etapas com cores, emojis e contagem de registros. |
| **Detalhes do lead** | Consultar responsável, prioridade, dados de contato, interações, tarefas e eventos em um painel lateral. |
| **Histórico** | Registrar tentativas, contatos efetivos, observações e mudanças importantes sem sobrescrever o passado. |
| **Agenda** | Acompanhar retornos atrasados, de hoje, futuros e concluídos. |
| **Equipe** | Criar acessos, ativar ou desativar usuários e distribuir carteiras com justificativa e auditoria. |
| **Importação** | Revisar CSV/XLSX, mapear campos, identificar alertas e confirmar a distribuição. |
| **Configurações** | Administrar etapas, resultados, prioridades, canais e motivos de perda preservando os vínculos históricos. |

### Perfis de acesso

- **Administrador:** acompanha toda a operação, gerencia usuários, importa e redistribui leads.
- **Atendente:** acessa somente a própria carteira, registra interações e acompanha seus retornos.

As permissões são verificadas na API, além dos controles apresentados na interface.

## Fluxograma de atendimento

```mermaid
flowchart TD
    A["Entrar com conta individual"] --> B{"Perfil de acesso"}
    B -->|Administrador| C["Cadastrar equipe e preparar a base"]
    C --> D["Revisar importação e distribuir carteiras"]
    B -->|Atendente| E["Abrir a própria carteira"]
    D --> E
    E --> F["Consultar lead e registrar interação"]
    F --> G{"Próxima ação"}
    G -->|Continuar conversa| H["Atualizar etapa do atendimento"]
    H --> F
    G -->|Retornar depois| I["Agendar tarefa e acompanhar a agenda"]
    I --> F
    G -->|Conversão| J["Informar os dados da conversão"]
    G -->|Perda| K["Informar o motivo da perda"]
    J --> L["Encerramento com histórico preservado"]
    K --> L
    L --> M["Resultados disponíveis no BI"]
```

### Etapas do Kanban

| Etapa | Cor | Uso |
|---|---|---|
| 🆕 Novo | Azul | Lead que entrou na carteira. |
| 📞 Tentativa de contato | Violeta | Iniciativa de contato em andamento. |
| 💬 Em atendimento | Ciano | Conversa comercial em andamento. |
| ⏰ Aguardando retorno | Âmbar | Acompanhamento com tarefa pendente obrigatória. |
| 🎉 Convertido | Verde | Encerramento com dados de conversão. |
| 📁 Perdido | Vermelho | Encerramento com motivo registrado. |

Arraste o corpo do card com o mouse para mudar de etapa. No celular, segure a alça de arraste. Um clique no nome abre os detalhes; o formulário também permite movimentar o lead.

O backend valida as transições. Converter, perder ou reabrir exige os respectivos dados e permissões. O fluxograma mostra o fluxo operacional principal; as transições adicionais são controladas pelas regras de cada etapa.

### Como os indicadores são calculados

| Indicador | Definição |
|---|---|
| Lead trabalhado | Possui pelo menos uma tentativa registrada. |
| Contato efetivo | Possui interação que indica contato real. |
| Taxa de contato | Leads com contato efetivo ÷ leads trabalhados. |
| Taxa de conversão | Leads convertidos ÷ leads trabalhados. |
| Cobertura da carteira | Leads trabalhados ÷ leads atribuídos. |
| Retorno atrasado | Tarefa pendente cuja data prevista já passou. |

Múltiplas interações não transformam um mesmo lead em vários clientes contatados. Mover um card ou abrir o WhatsApp não registra uma tentativa automaticamente. Os horários são armazenados em UTC e apresentados em `America/Porto_Velho`.

## Arquitetura e tecnologias

Monólito modular com separação entre interface, API, regras de negócio e persistência.

```mermaid
flowchart LR
    UI["React + TypeScript"] --> API["API Fastify"]
    API --> DOM["Domínio e permissões"]
    DOM --> ORM["Prisma ORM"]
    ORM --> DB[("PostgreSQL")]
```

| Camada | Tecnologias |
|---|---|
| Interface | React, TypeScript, Vite, Tailwind CSS, componentes com Radix/shadcn e Lucide |
| Kanban e gráficos | dnd-kit e Recharts |
| API e validação | Node.js, Fastify e Zod |
| Banco de dados | PostgreSQL, Prisma e migrations versionadas |
| Testes | Vitest e Playwright |

```text
central_atendimento/
├── src/                 # Interface, páginas e componentes
├── server/              # API, autenticação, domínio e consultas
├── prisma/              # Schema e migrations
├── scripts/             # Seed, amostra, build e verificações
├── e2e/                 # Fluxos de navegador com dados de teste
├── samples/             # CSV com contatos fictícios
├── docs/VALIDATION.md    # Evidências de validação e pendências
├── .env.example         # Configuração de exemplo, sem segredos reais
└── LICENSE              # Licença MIT
```

## Instalação

### 1. Preparar o ambiente

- Instalar **Node.js 22 ou superior**.
- Usar uma instância de **PostgreSQL** disponível. Não é necessário Docker nem uma segunda instalação do banco.
- No pgAdmin, criar um usuário dedicado sem privilégios de superadministrador e o banco **`crm_demo`**, definindo esse usuário como proprietário.

A aplicação e as migrations recusam bancos com outros nomes. O seed exige `crm_demo` e não substitui um banco ocupado.

### 2. Baixar o projeto

```powershell
git clone https://github.com/dheimemocelin/central_atendimento.git
cd central_atendimento
npm ci
Copy-Item .env.example .env
```

### 3. Configurar o `.env` local

Preencher `DATABASE_URL` com o usuário, a senha, a porta e o banco criados. A estrutura é:

```dotenv
DATABASE_URL=postgresql://USUARIO:SENHA_CODIFICADA@127.0.0.1:5432/crm_demo?schema=public
APP_ORIGIN=http://127.0.0.1:5173
PORT=3001
NODE_ENV=development
COOKIE_SAME_SITE=lax
SESSION_HOURS=12
```

Caracteres especiais na senha precisam de codificação na URL: `@` vira `%40`, por exemplo. Nunca versionar o `.env`.

Definir também **três senhas diferentes**, de 12 a 128 caracteres, nas variáveis abaixo. Elas ficam somente no ambiente local:

```dotenv
DEMO_ADMIN_PASSWORD=
DEMO_AGENT_A_PASSWORD=
DEMO_AGENT_B_PASSWORD=
```

### 4. Criar a estrutura e os dados demonstrativos

```powershell
npm run db:generate
npm run db:deploy
npm run demo:seed
```

Depois do seed, remover as três variáveis `DEMO_*_PASSWORD` do `.env`. As contas continuam funcionando com as senhas escolhidas, armazenadas no banco somente como hash.

### 5. Iniciar a aplicação

```powershell
npm run dev
```

- **Interface:** http://127.0.0.1:5173
- **API:** http://127.0.0.1:3001

Usar a mesma origem configurada em `APP_ORIGIN`. `localhost` e `127.0.0.1` são origens diferentes.

## Contas de demonstração

| Perfil | E-mail | Senha |
|---|---|---|
| Administrador | `admin@crm.example.invalid` | Definida em `DEMO_ADMIN_PASSWORD` |
| Atendente A | `atendente.a@crm.example.invalid` | Definida em `DEMO_AGENT_A_PASSWORD` |
| Atendente B | `atendente.b@crm.example.invalid` | Definida em `DEMO_AGENT_B_PASSWORD` |

O seed cria:

- **48 contatos fictícios**, com identificadores únicos e e-mails reservados.
- **24 contatos por atendente**, com oito registros em cada uma das seis etapas no total.
- Interações, conversões e retornos futuros e atrasados para explorar o BI e a agenda.

Não são gerados telefones acionáveis, nem enviadas mensagens. Repetir o seed depois de uma execução concluída não duplica registros e não redefine senhas. O comando recusa execução em `NODE_ENV=production` e recusa um banco ocupado por outros registros.

### Experimentar a importação

O arquivo [samples/leads-demo.csv](samples/leads-demo.csv) contém uma amostra gerada pelo projeto. Para regenerá-lo:

```powershell
npm run demo:csv
```

Como a amostra não tem telefone, a prévia pode sinalizar revisão. Para preservá-la, selecionar a opção de incluir registros com alertas e registrar uma justificativa de demonstração. Os contatos da amostra são os mesmos gerados pelo seed; considerar os alertas de duplicidade antes de confirmar outra importação.

## Comandos úteis

| Comando | Finalidade |
|---|---|
| `npm run dev` | Iniciar interface e API em desenvolvimento. |
| `npm run db:generate` | Gerar o Prisma Client. |
| `npm run db:deploy` | Aplicar migrations no banco demonstrativo. |
| `npm run demo:seed` | Criar contas e registros fictícios. |
| `npm run demo:csv` | Gerar a amostra CSV. |
| `npm run typecheck` | Verificar os tipos da interface e da API. |
| `npm test` | Executar os testes Vitest. |
| `npm run test:e2e` | Gerar o build e executar os fluxos Playwright. |
| `npm run build` | Gerar o build de produção. |
| `npm start` | Executar o build da aplicação. |
| `npm run backup:verify` | Ensaiar dump e restauração em schema isolado. |

## Testes e validação

```powershell
npm run db:generate
npm run build
npm test
```

Para os testes de navegador, instalar Chromium e configurar a conexão com o banco demonstrativo:

```powershell
npx playwright install chromium
npm run test:e2e
```

Integração e E2E usam schemas temporários, com dados próprios, removidos ao final. A integração exige `DATABASE_URL`; sem essa variável, os casos de banco são explicitamente ignorados.

O ambiente atual de testes com banco espera as ferramentas PostgreSQL no Windows. Se necessário, configurar `PSQL_PATH` com o caminho do `psql.exe` e `PG_BIN` com a pasta dos executáveis para o ensaio de backup.

**Validação desta versão:** build aprovado e 19 testes passando. Dez casos de integração ficaram pendentes de configuração do banco demonstrativo. O seed e os fluxos E2E ainda precisam ser executados contra esse banco. Consulte [docs/VALIDATION.md](docs/VALIDATION.md) para os limites da verificação.

## Segurança e limites

- Senhas com hash scrypt e salt individual.
- Sessões com cookies HttpOnly; cookies Secure em produção.
- Controle de acesso por perfil e carteira na API.
- Validação de entradas, limites de requisições e verificação de origem nas mutações.
- Auditoria de mudanças importantes e proteção do histórico.
- `.env`, dumps, arquivos privados e artefatos de execução excluídos do Git.
- Incorporação em iframe bloqueada por padrão; `FRAME_ANCESTOR` permite uma origem HTTPS específica.

A API escuta apenas em `127.0.0.1`. Para hospedar, usar proxy reverso e HTTPS, definir `NODE_ENV=production` e configurar `APP_ORIGIN` com o domínio correto. Publicar o código no GitHub não hospeda automaticamente a API ou o PostgreSQL.

Esta versão é demonstrativa. Antes de uso operacional, configurar backups automáticos, testar restauração, revisar as permissões do servidor e homologar o ambiente de publicação. Não há homologação de autenticação em iframe nesta versão.

## Licença

Distribuído sob a **licença MIT**. Consulte o arquivo [LICENSE](LICENSE).
