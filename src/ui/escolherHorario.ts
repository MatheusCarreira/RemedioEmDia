import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { Platform } from "react-native";

/**
 * Abre o relógio nativo do Android para escolher um horário.
 *
 * Usar o seletor do sistema, e não um campo próprio, é deliberado: é o mesmo
 * relógio que ela já viu ao ajustar o despertador. Interface conhecida vale
 * mais que interface bonita para quem usa celular com esforço.
 *
 * Devolve minutos desde a meia-noite pelo callback. Não faz nada se ela
 * cancelar.
 */
export function escolherHorario(
  minutosIniciais: number,
  aoEscolher: (minutos: number) => void,
): void {
  const inicial = new Date();
  inicial.setHours(
    Math.floor(minutosIniciais / 60),
    minutosIniciais % 60,
    0,
    0,
  );

  if (Platform.OS === "android") {
    DateTimePickerAndroid.open({
      value: inicial,
      mode: "time",
      is24Hour: true,
      onChange: (evento, data) => {
        if (evento.type === "set" && data) {
          aoEscolher(data.getHours() * 60 + data.getMinutes());
        }
      },
    });
    return;
  }

  // Caminho só do navegador, onde eu confiro a aparência das telas. O relógio
  // nativo não existe aqui, e não vale construir um segundo seletor completo
  // para um ambiente que ela nunca vai usar.
  const resposta =
    typeof globalThis.prompt === "function"
      ? globalThis.prompt(
          "Horário (HH:MM)",
          `${String(Math.floor(minutosIniciais / 60)).padStart(2, "0")}:${String(
            minutosIniciais % 60,
          ).padStart(2, "0")}`,
        )
      : null;
  if (!resposta) return;

  const m = /^(\d{1,2}):(\d{2})$/.exec(resposta.trim());
  if (!m) return;
  const hora = Number(m[1]);
  const minuto = Number(m[2]);
  if (hora > 23 || minuto > 59) return;
  aoEscolher(hora * 60 + minuto);
}

/** Minutos desde a meia-noite -> "HH:MM". */
export function horarioPorExtenso(minutos: number): string {
  return `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(
    minutos % 60,
  ).padStart(2, "0")}`;
}
