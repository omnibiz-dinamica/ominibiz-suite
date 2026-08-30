# OmniBiz — Identificação de Builds

## Formato visível

Cada atualização publicada usa um identificador de nove dígitos:

`DDMMAANNN`

- `DDMMAA`: data da atualização no fuso `America/Cuiaba`.
- `NNN`: sequência diária, iniciando em `001`.

Exemplo: a primeira atualização de 30/08/2026 é `300826001`; a segunda é
`300826002`.

## Fluxo de commit

1. Execute `npm run version:next`.
2. Inicie a mensagem do commit com o número retornado.
3. O build lê o número da mensagem do commit e injeta `VITE_BUILD_ID`.
4. `src/lib/app-version.ts` fornece a versão para toda a aplicação.

O SHA real continua disponível separadamente em `VITE_COMMIT_SHA` para
diagnóstico técnico. Nenhum número de versão é salvo em empresas ou escrito
manualmente em componentes React.

Ambientes de CI podem definir `VITE_BUILD_ID` ou `APP_BUILD_ID` explicitamente.
Sem Git e sem variável de ambiente, o fallback exibido é `local`.
