# OmniBiz — Identificação de Builds

## Formato visível

Cada atualização publicada usa um identificador de nove dígitos:

`DDMMAANNN`

- `DDMMAA`: data da atualização no fuso `America/Cuiaba`.
- `NNN`: sequência diária, iniciando em `001`.

Exemplo: a primeira atualização de 30/08/2026 é `300826001`; a segunda é
`300826002`.

## Fluxo de commit

1. Execute `npm run version:stamp`.
2. O comando calcula a próxima sequência e grava o identificador em
   `src/generated/build-metadata.ts`.
3. Inicie a mensagem do commit com o mesmo número retornado.
4. O build injeta `VITE_BUILD_ID`, preferindo o commit quando Git está disponível
   e usando o identificador rastreado quando o publisher não possui `.git`.
5. `src/lib/app-version.ts` fornece a versão para toda a aplicação.

O SHA real continua disponível separadamente em `VITE_COMMIT_SHA` para
diagnóstico técnico. Nenhum número de versão é salvo em empresas ou escrito
manualmente em componentes React.

Ambientes de CI podem definir `VITE_BUILD_ID` ou `APP_BUILD_ID` explicitamente.
O valor `local` só é usado quando não há Git, variável nem metadata rastreada;
publicações do Lovable recebem o número gravado no código-fonte.
