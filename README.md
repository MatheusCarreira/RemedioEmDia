# Remédio em Dia

Aplicativo Android que lembra a hora de tomar os remédios.

Feito para uma pessoa só usar: ela abre o aplicativo para responder uma pergunta
— **já tomei?** — e mais nada. O cadastro dos remédios fica escondido atrás de um
botão discreto, porque quem cadastra faz isso uma vez por mês e quem toma faz
isso todo dia.

![A tela do dia](preview-web.png)

## O que ele faz

- **Alarme na hora certa**, como notificação do Android, com o aplicativo
  fechado e **sem internet**. O horário é agendado no relógio do próprio
  aparelho.
- **Botões dentro da notificação**: *JÁ TOMEI* e *LEMBRAR EM 15 MIN*, os dois
  sem abrir o aplicativo. Marcar pela tela bloqueada desconta o estoque e
  desmarca o lembrete, igualzinho a marcar pela tela.
- **Um lembrete a mais, meia hora depois**, se ela não marcou. Uma vez só —
  ver *Decisões* abaixo.
- **Um cartão por dose**, com o nome do remédio, quantos comprimidos e a hora.
  Só a dose que está na hora ganha botão grande — as outras ficam quietas.
- **Controle de estoque**: quantos comprimidos restam, quantos vêm na caixa, e
  um aviso quando está perto de acabar, com a conta de quantos dias ainda dá.
- **Foto da caixa**, para reconhecer o remédio pela embalagem e não pelo nome
  em letra miúda.

## Decisões que valem explicar

**Não existe servidor, conta nem senha.** Tudo mora no aparelho: os remédios em
um banco SQLite local, os alarmes agendados pelo Android. Isso é o que faz o
alarme tocar sem internet — e também significa que a lista de remédios dela não
vive em lugar nenhum além do celular dela.

**Nada de estatística de adesão.** Um aplicativo que dá nota para quem esquece
um comprimido não está ajudando.

**O lembrete de repetição acontece uma vez só.** Insistir até ela marcar
transformaria o aplicativo num cobrador. E "não marcou" não é o mesmo que "não
tomou" — o caso mais comum é ter tomado e esquecido de marcar. Insistir nesse
caso ensina a ignorar a notificação, que é o único jeito de este aplicativo
falhar de verdade. Se ela pedir *LEMBRAR EM 15 MIN*, o lembrete automático é
cancelado: ela acabou de dizer quando quer ser avisada.

**A repetição é preparada com uma semana de antecedência.** Diferente do alarme
principal, que é um gatilho diário do Android e toca sozinho para sempre, a
repetição precisa ser criada por alguém — ela só deve existir enquanto a dose
não foi marcada. Quem cria é o aplicativo, ao abrir, e a tarefa de fundo, a cada
botão de notificação atendido. Uma semana de antecedência cobre justamente a
situação em que ela mais precisa e menos vai abrir o aplicativo: a semana em que
adoece, viaja ou se desorganiza. Passada uma semana inteira sem abrir o
aplicativo e sem tocar em nenhum botão, o alarme principal continua tocando e só
a repetição para — e ela volta no primeiro toque.

O número de notificações agendadas tem teto (120, as mais próximas primeiro).
Com muitos remédios de muitos horários a fila cresceria rápido, e o Android não
promete atender uma fila desse tamanho.

**Nada de checagem de interação medicamentosa.** Isso é ato médico, depende de
base licenciada.

**Toque de 72px, texto grande, tema claro fixo.** O mínimo da WCAG (44px) não
basta para mão que treme. Nenhum estado é comunicado só por cor.

## Como rodar

Precisa de Node 20+ e o aplicativo **Expo Go** no celular Android.

```bash
npm install
npm start          # abre o Metro; leia o QR code com o Expo Go
```

As notificações locais funcionam no Expo Go — só o push remoto exigiria um
build próprio, e este aplicativo não usa push remoto.

Para ver as telas no navegador (útil para mexer no layout, mas **o alarme não
existe fora do Android**):

```bash
npm run web        # http://localhost:8081
```

O `metro.config.js` existe só por causa dessa visualização no navegador: ele
registra o `.wasm` do SQLite e serve os cabeçalhos COOP/COEP que o
`SharedArrayBuffer` exige.

## No celular dela, depois de instalar

Duas coisas que o Android faz por conta própria e atrapalham o alarme:

1. **Otimização de bateria** — é preciso liberar o aplicativo em
   *Configurações → Aplicativos → Remédio em Dia → Bateria → Sem restrição*.
   Samsung e Xiaomi são especialmente agressivos e matam alarmes de aplicativos
   restritos.
2. **Alarmes exatos** — no Android 12+ o aplicativo pede a permissão
   `SCHEDULE_EXACT_ALARM`. Sem ela o Android agrupa o alarme e pode atrasá-lo.

O aplicativo pede a permissão de notificação na primeira abertura. Se ela
recusar, ele continua funcionando como lista, mas avisa na tela que não vai
tocar.

## Como o código está organizado

```
src/
  dominio/    regras puras, sem React e sem banco
              doses.ts    -> os quatro estados de uma dose e os textos dela
              estoque.ts  -> a conta de quantos dias ainda dá
  dados/      esquema.ts  -> o SQL das tabelas e as migrações
              banco.ts    -> abre a conexão e migra
              remedios.ts -> cadastro, doses do dia, marcar tomada, estoque
              lembretes.ts-> repetição e adiamento (só banco)
              fotos.ts    -> câmera e galeria
  alarme/     alarme.ts      -> agenda no Android, e os botões da notificação
              lembretes.ts   -> agenda repetição e adiamento
              acoes.ts       -> o que um botão da notificação faz
              tarefaDeFundo.ts -> atende o botão com o aplicativo fechado
              reconciliar.ts -> derruba tudo e reconstrói a agenda
  telas/      Hoje.tsx, MeusRemedios.tsx, FormularioRemedio.tsx
  ui/         tokens.ts e os componentes
```

A navegação é uma variável de estado no `App.tsx`, não uma biblioteca: são três
telas e um caminho só entre elas.

O alarme é reconstruído por inteiro a cada dia, nunca corrigido em partes. A
agenda vive fora do banco de dados, dentro do Android, e pode ser descartada por
uma atualização do sistema ou uma restauração de backup — reconstruir do zero é
a única operação que chega no estado certo partindo de qualquer estado anterior.

**Um toque no botão da notificação pode ser processado duas vezes.** Com o
aplicativo fechado quem atende é a tarefa de fundo; com ele aberto, um ouvinte
na tela. E o `expo-notifications` guarda a resposta numa fila quando não há
ouvinte e a entrega quando o aplicativo abre — então o mesmo toque passa pelos
dois caminhos. Isso não é defeito a corrigir, é característica a absorver: os
dois chamam a mesma função, e tudo nela aguenta rodar duas vezes. Marcar uma
dose já marcada não faz nada, e o desconto de estoque tem um `UNIQUE` no banco
impedindo o segundo. O "lembrar em 15 min" compara o horário pedido com o que já
está guardado: menos de um minuto de diferença é o mesmo toque, não um pedido
novo.

## Como conferir

```bash
npm run conferir
```

Roda o TypeScript e dois scripts: a conta de estoque e as migrações mais a
regra dos lembretes. O segundo abre um SQLite na memória com o banco embutido
do **Node** — é o mesmo SQLite do aparelho, e o que ele confere (SQL, restrições
e contas de horário) não depende de qual dos dois está por baixo.

O que esses scripts **não** conferem é a metade que fala com o Android: se a
notificação toca, se o botão aparece, se a tarefa de fundo acorda com o
aplicativo morto. Isso só existe no aparelho e só se sabe testando lá.

## Como gerar o APK

O aplicativo pronto é offline por construção: o `expo-updates` não está
instalado, então o JavaScript vai dentro do APK e nada é buscado na rede ao
abrir. Internet só é preciso para **gerar** o arquivo.

O build sai na nuvem, pelo EAS — assim não é preciso ter JDK nem o SDK do
Android na máquina:

```bash
npm i -g eas-cli
eas login
eas build -p android --profile aparelho
```

O perfil `aparelho` no `eas.json` produz **`.apk`**. O padrão do EAS é `.aab`,
que serve para a Play Store e **não instala** direto no celular. O `versionCode`
é controlado e incrementado pelo próprio EAS a cada build, por isso ele não
aparece no `app.json`.

Não é preciso `google-services.json` nem nada do Firebase: isso só existiria
para push remoto, e este aplicativo não usa.

**Guarde a conta do EAS.** No primeiro build ele gera a chave de assinatura e a
mantém lá. Um APK assinado com chave diferente o Android se recusa a instalar
por cima — ela teria que desinstalar o antigo, e desinstalar apaga o banco:
cadastro, histórico e estoque.

Os ícones saem de `scripts/gerar-icones.py` (precisa de Pillow). Não fazem parte
do build; é um gerador de uma vez só, guardado para os desenhos poderem ser
refeitos se a cor mudar.

## O que ainda falta

- Gerar o APK e instalar no celular dela.
- Testar os botões da notificação **com o aplicativo fechado**. Isso não dá para
  fazer no Expo Go de forma confiável: com o aplicativo morto, o Android sobe o
  JavaScript sozinho para atender o botão, e no Expo Go esse pacote vem pela
  rede, do servidor de desenvolvimento. Precisa ser um build de verdade.

**Risco conhecido e ainda sem solução:** não existe backup. Celular quebrado ou
perdido apaga o cadastro, o histórico e o estoque.

## Nota sobre o SDK

Este projeto usa **Expo SDK 57**, que mudou bastante em relação às versões
anteriores — a API de `expo-file-system` e os gatilhos de `expo-notifications`
não são os que aparecem na maioria dos tutoriais. A referência correta é
<https://docs.expo.dev/versions/v57.0.0/>.
