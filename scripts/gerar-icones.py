"""
Gera os icones do aplicativo:  python scripts/gerar-icones.py

Nao faz parte do build. E um gerador de uma vez so, guardado no repositorio
para os icones poderem ser refeitos se a cor mudar, em vez de virarem cinco
PNGs que ninguem sabe de onde vieram.

Precisa de Pillow:  pip install Pillow

O desenho: uma capsula inclinada, branca sobre ambar. Capsula e nao circulo
porque circulo pequeno na tela vira mancha; a capsula tem silhueta propria e
se reconhece de longe, que e o ponto — ela acha aplicativo pela figura. E e a
mesma figura que ja aparece dentro do aplicativo, no icone "pill" da lista de
remedios.
"""

from PIL import Image, ImageDraw

AMBAR = (180, 83, 9, 255)  # #b45309, a mesma cor de "esta na hora"
BRANCO = (255, 255, 255, 255)
TRANSPARENTE = (0, 0, 0, 0)

# Desenha grande e reduz no fim: e o que deixa a borda inclinada lisa.
ESCALA = 8


def capsula(lado, cor, fundo, ocupacao):
    """Uma capsula inclinada a 45 graus, centralizada num quadrado."""
    L = lado * ESCALA
    tela = Image.new("RGBA", (L, L), fundo)

    # A capsula e desenhada deitada e depois girada. `ocupacao` e o quanto da
    # largura final a figura inclinada ocupa; a constante sai de medir, porque
    # as pontas arredondadas fazem a figura girada ocupar menos do que a conta
    # da diagonal preveria.
    comprimento = int(L * ocupacao * 1.184)
    largura = int(comprimento / 2.45)

    deitada = Image.new("RGBA", (comprimento, largura), TRANSPARENTE)
    caneta = ImageDraw.Draw(deitada)
    caneta.rounded_rectangle(
        [0, 0, comprimento - 1, largura - 1],
        radius=largura // 2,
        fill=cor,
    )

    # A faixa vazada no meio e o que faz a figura ler como comprimido em vez
    # de losango. Vazada mesmo, e nao pintada do fundo: o icone monocromatico
    # da notificacao usa so o canal alfa, entao pintar nao apareceria.
    faixa = max(2, int(comprimento * 0.07))
    meio = comprimento // 2
    caneta.rectangle([meio - faixa // 2, 0, meio + faixa // 2, largura - 1],
                     fill=TRANSPARENTE)

    girada = deitada.rotate(45, expand=True, resample=Image.BICUBIC)
    tela.paste(
        girada,
        ((L - girada.width) // 2, (L - girada.height) // 2),
        girada,
    )
    return tela.resize((lado, lado), Image.LANCZOS)


def gravar(nome, imagem):
    caminho = f"assets/{nome}"
    imagem.save(caminho)
    print(f"{caminho}  {imagem.width}x{imagem.height}")


# O icone cheio, com fundo. Usado como icone geral e na loja.
gravar("icon.png", capsula(1024, BRANCO, AMBAR, 0.66))

# Adaptativo do Android: so a frente e imagem; o fundo e a cor solida
# declarada no app.json. O sistema aplica a mascara dele por cima (circulo,
# quadrado arredondado, gota — varia por fabricante), entao a frente ocupa
# menos: o que passar do centro pode ser cortado.
gravar("android-icon-foreground.png", capsula(432, BRANCO, TRANSPARENTE, 0.60))

# Monocromatico. Vira o icone tematico do Android 13+ e, aqui, tambem o icone
# da notificacao — e notificacao usa SO a silhueta, tingida pelo sistema.
# Por isso ele e menor ainda: o Android aperta esse desenho num espaco pequeno
# e corta o que encostar na borda.
gravar("android-icon-monochrome.png", capsula(432, BRANCO, TRANSPARENTE, 0.52))

# Abertura: o fundo da tela de abertura e claro (#f5f5f4), entao aqui a
# capsula e ambar, e nao branca.
gravar("splash-icon.png", capsula(1024, AMBAR, TRANSPARENTE, 0.45))

# Aba do navegador, so para a previsualizacao das telas.
gravar("favicon.png", capsula(48, BRANCO, AMBAR, 0.66))
