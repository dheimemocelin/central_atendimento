# Central de atendimento

Interface de operação compacta, com navegação grafite, superfícies claras, ações azuis e dados demonstrativos identificados. O nome visível é Central; não usar marcas ou logotipos corporativos.

As seis etapas combinam texto, cor e emoji: Novo azul, Tentativa violeta, Em atendimento ciano, Aguardando retorno âmbar, Convertido verde e Perdido vermelho. Cores e emojis ficam em `src/lib/stages.ts`; os demais ícones usam Lucide.

O Kanban tem rolagem local, cards compactos, arraste pelo corpo com mouse, alça para toque e uma prévia fora das regiões recortadas. O formulário de detalhes mantém a alternativa de movimentação e recolhe os campos obrigatórios de encerramento.

Sidebar recolhível com preferência local, navegação móvel, foco visível e feedback de gravação. Preservar nomes e contagens das etapas; cor nunca é a única indicação de estado. Não preencher indicadores com valores fixos: o BI calcula os números a partir do PostgreSQL demonstrativo.
