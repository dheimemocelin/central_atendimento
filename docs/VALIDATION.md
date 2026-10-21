# Verificação da versão demonstrativa

Data: 21/10/2026.

- Exportação por lista explícita de arquivos de código e configuração de exemplo, para uma pasta separada e um repositório Git novo.
- Nenhum histórico Git, `.env`, arquivo de leads, dump, log, screenshot ou documento operacional foi transferido.
- Identidade neutra e ausência de domínio corporativo nos arquivos de aplicação revisados.
- Instalação de dependências concluída; npm reportou zero vulnerabilidades conhecidas nessa instalação.
- Prisma Client gerado a partir das migrations e schema da demonstração.
- Build de produção e TypeScript aprovados.
- Vitest: 19 testes passaram; 10 casos de integração foram explicitamente ignorados por falta de `DATABASE_URL` demonstrativa.
- Gerador CSV criou 48 contatos sintéticos; testes conferem ausência de telefones, e-mails reservados, identificadores únicos, 24 contatos por atendente e oito por etapa.
- Revisões independentes de especificação e código não encontraram problemas materiais nos guards de banco, seed e exclusão dos dados operacionais.

## Ainda não executado nesta cópia

- Aplicação das migrations e execução do seed no banco dedicado `crm_demo`.
- Integração e Playwright contra esse banco, incluindo confirmação de responsividade e arraste por toque.
- Restauração de backup, publicação HTTPS, serviço Windows e autenticação incorporada.

Os testes ou homologações de outra instalação não são apresentados como evidência desta cópia. O build não cria nem publica um banco; siga o README para configurar o ambiente demonstrativo.
