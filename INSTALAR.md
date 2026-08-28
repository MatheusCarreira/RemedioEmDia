# Do código ao celular dela

Passo a passo para transformar este repositório num aplicativo instalado e
testado, para quem nunca fez aplicativo Android antes.

O aplicativo está pronto e testado até onde dá para testar num computador. O que
falta é virar um arquivo instalável e provar, no aparelho, as três coisas que só
o aparelho responde. **Você não precisa instalar Android Studio nem Java.**

| | |
|---|---|
| Tempo total | 1 hora, sendo 20 min de espera |
| Custo | nenhum |
| Onde compila | na nuvem, não na sua máquina |
| Celular dela | precisa por uns 15 minutos |

---

## 1. Instalar a ferramenta de build — 2 minutos

Um único programa, o `eas-cli`. Ele não compila nada na sua máquina: só conversa
com o serviço que compila.

```bash
npm i -g eas-cli
eas --version
```

A segunda linha existe para confirmar que deu certo — ela imprime um número de
versão. Se der erro de permissão, abra o terminal como administrador e repita.

## 2. Criar a conta e ligar o projeto a ela — 5 minutos

A conta é gratuita e fica em <https://expo.dev>. Crie por lá, no navegador, e
volte ao terminal.

```bash
eas login
eas init
```

O `eas init` cria um projeto na sua conta e escreve o identificador dele dentro
do `app.json`. É uma alteração de verdade no repositório — vale um commit
depois.

## 3. Gerar o APK — 1 minuto de comando, 10 a 30 de fila

```bash
eas build -p android --profile aparelho
```

Ele vai perguntar se pode gerar uma chave de assinatura para o Android.
**Responda que sim.** A chave fica guardada na sua conta e você não precisa fazer
nada com ela.

> **Isto é para sempre.** Essa chave é a identidade do aplicativo. Um APK
> assinado com chave diferente o Android **se recusa a instalar por cima** do
> antigo — a única saída seria desinstalar, e desinstalar apaga o banco dela:
> cadastro, histórico e estoque. Na prática isso quer dizer uma coisa só: não
> perca o acesso a essa conta do Expo.

O `--profile aparelho` é o que faz sair um **`.apk`**. O padrão do serviço é
`.aab`, que serve para publicar na Play Store e *não instala* direto no celular.

Depois de enviar, o terminal imprime um link e você pode fechar tudo. No fim da
fila, esse link vira uma página com um QR code e um botão de baixar.

## 4. Levar para o celular dela — 10 minutos

O caminho mais curto é não passar pelo computador: abra a página do build **no
navegador do celular dela**, ou aponte a câmera para o QR code, e baixe direto
por ali. Se preferir baixar no PC, o `.apk` vai por cabo, WhatsApp ou Drive —
tanto faz, é um arquivo comum.

Na hora de instalar:

1. Ela toca no arquivo baixado.
2. O Android avisa que não instala de fonte desconhecida e oferece um atalho
   para as configurações. Autorize o aplicativo que está fazendo a instalação —
   normalmente o navegador ou o gerenciador de arquivos.
3. Voltar e tocar em instalar.

Esse aviso é o Android dizendo que o aplicativo não veio da Play Store. É
esperado: este aplicativo é para uma pessoa só e não faz sentido publicar numa
loja.

## 5. Ligar o que o Android desliga sozinho — 5 minutos

Esta é a etapa que decide se o alarme toca. Pular ela é o jeito mais comum de o
aplicativo parecer quebrado sem estar.

**Na primeira abertura** ele pede permissão para enviar notificação. Aceitar. Se
recusar, o aplicativo continua funcionando como lista e avisa na tela que não vai
tocar.

**Depois, nas configurações do celular:**

- `Configurações → Aplicativos → Remédio em Dia → Bateria → Sem restrição`
- `Configurações → Aplicativos → Remédio em Dia → Alarmes e lembretes` —
  confirmar que está permitido

> Samsung e Xiaomi são especialmente agressivos: matam alarmes de aplicativos que
> estão sob restrição de bateria, e fazem isso em silêncio. Se o celular dela for
> de uma dessas marcas, a primeira linha não é opcional.

## 6. Cadastrar os remédios — 10 minutos, com a receita na mão

A tela vai abrir **vazia**. Isso está certo: os remédios de exemplo só existem em
modo de desenvolvimento e não entram na versão instalada.

Em *Meus remédios → Adicionar remédio*, cada um precisa de nome, quantidade por
vez e pelo menos um horário. A foto da caixa e o estoque são opcionais, mas os
dois valem o esforço: a foto porque ela compara imagem com imagem em vez de ler
nome químico, e o estoque porque é o que avisa antes de acabar.

## 7. Provar que funciona — 15 minutos

Três testes. São exatamente as três coisas que não dá para verificar fora do
aparelho. Faça na ordem, cadastrando um remédio de teste com horário três minutos
à frente.

**1. O alarme toca com o aplicativo fechado.** Feche o aplicativo de verdade —
arraste para fora da lista de recentes, não só volte para a tela inicial. Espere
o horário.
→ *esperado: a notificação aparece, com som e vibração.*

**2. O botão marca sem abrir o aplicativo.** Na notificação, toque em **JÁ
TOMEI**. A notificação sai da barra e o aplicativo não abre. Só então abra o
aplicativo.
→ *esperado: a dose já está marcada e o estoque desceu.*

**3. Os alarmes voltam depois de reiniciar.** Reinicie o celular e **não abra o
aplicativo**. Espere o próximo horário de teste.
→ *esperado: toca do mesmo jeito.*

Passando os três, apague o remédio de teste.

## 8. Quando precisar mandar uma versão nova

```bash
eas build -p android --profile aparelho
```

Ela instala por cima e **os dados dela ficam**. O número de versão sobe sozinho —
não há nada para lembrar de alterar antes. Isso só vale enquanto for a mesma
conta do Expo, porque é o que garante a mesma chave de assinatura.

---

## Se der errado

**O comando `eas` não é reconhecido.** O terminal foi aberto antes da instalação.
Feche e abra de novo — o caminho dos programas globais só é lido na abertura.

**O arquivo baixa mas não instala.** Falta autorizar a instalação de fonte
desconhecida para o aplicativo que está abrindo o arquivo. A permissão é por
aplicativo: autorizar o navegador não autoriza o gerenciador de arquivos.

**Tocou uma vez e depois parou de tocar.** É a restrição de bateria, quase
sempre. Volte na etapa 5 e confirme que está em "Sem restrição" — o Android pode
ter religado a restrição sozinho depois de alguns dias sem uso.

**O `eas` reclama de alguma chave no `eas.json`.** O arquivo foi escrito sem a
ferramenta instalada na máquina, então não deu para validar contra ela. Rodar
`eas build:configure` conserta.

---

## O que continua sem solução

Não existe backup. Celular quebrado, perdido ou trocado apaga o cadastro, o
histórico e o estoque. É consequência direta de não haver servidor — a mesma
decisão que faz o alarme tocar sem internet.

Dá para resolver sem servidor: exportar o banco num arquivo que ela compartilhe
por WhatsApp ou Drive, e importar de volta num celular novo.
