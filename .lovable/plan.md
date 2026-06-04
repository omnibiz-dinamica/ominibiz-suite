Pelo print, essa tela não mostra botão direto de verificar no menu dos três pontos. O caminho correto agora é:

1. Clique em **Manage domains**.
2. Na lista de domínios, abra `dinamicasolucao.com` ou `notify.dinamicasolucao.com`.
3. Procure uma ação como **Verify**, **Retry**, **Complete setup**, **Check DNS** ou **Rerun setup**.
4. Se aparecerem registros DNS pedidos, compare com o que está na Hostnet.
5. Se não aparecer nenhuma ação e continuar apenas como `Setting up`, aguarde a propagação do DNS; os NS públicos de `notify.dinamicasolucao.com` já estão corretos.
6. Se passar de 24h sem mudar, remova esse domínio em **Manage domains** e adicione novamente pelo botão **Add domain**, usando o domínio `dinamicasolucao.com`. O sistema volta a delegar o subdomínio `notify.dinamicasolucao.com` automaticamente.

Mensagem para enviar à Hostnet se precisar confirmar:

"Por favor confirmem no DNS de `dinamicasolucao.com` que existem somente estes dois registros NS para o host `notify`: `ns3.lovable.cloud` e `ns4.lovable.cloud`. Confirmem também que não há registros A, CNAME, MX ou TXT com o mesmo host `notify`."

Pelo que consigo verificar daqui, a parte do app e da infraestrutura de envio já foi refeita; o bloqueio restante está no provisionamento/verificação do domínio no painel.