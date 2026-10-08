/**
 * Semanas do planejamento semanal.
 *
 * Regras:
 *  - Sempre 5 semanas por mês;
 *  - cada semana vai da segunda-feira à sexta-feira;
 *  - restrita ao mês selecionado (nunca mostra dias do mês anterior
 *    nem do mês seguinte);
 *  - feriados não são considerados nesta versão.
 */

export type MonthWeek = {
  /** 1..5 */
  index: number;
  start: Date;
  end: Date;
  /** "01/10 a 02/10" — null quando a semana não tem dias dentro do mês */
  rangeLabel: string | null;
};

const pad2 = (n: number) => String(n).padStart(2, "0");
const fmtDay = (d: Date) => `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;

/**
 * Calcula as 5 semanas (segunda→sexta) de um mês, recortadas no mês.
 * `monthIndex` é 0-based (Date#getMonth).
 */
export function computeMonthWeeks(year: number, monthIndex: number): MonthWeek[] {
  const monthStart = new Date(year, monthIndex, 1);
  const monthEnd = new Date(year, monthIndex + 1, 0);
  // Primeira segunda-feira da semana que contém o primeiro dia útil do mês.
  // Se o mês começa em sábado/domingo, a semana do dia 1 não tem dias úteis
  // dentro do mês, então ancoramos na segunda-feira seguinte — assim todos os
  // dias úteis do mês caem em alguma das 5 semanas.
  const dow = monthStart.getDay(); // 0=Dom..6=Sáb
  const firstMonday =
    dow === 0
      ? new Date(year, monthIndex, 2) // domingo → segunda dia 2
      : dow === 6
        ? new Date(year, monthIndex, 3) // sábado → segunda dia 3
        : new Date(year, monthIndex, 1 - (dow - 1));

  const weeks: MonthWeek[] = [];
  for (let i = 0; i < 5; i++) {
    const start = new Date(firstMonday);
    start.setDate(firstMonday.getDate() + i * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 4); // sexta-feira

    const clampedStart = start < monthStart ? monthStart : start;
    const clampedEnd = end > monthEnd ? monthEnd : end;
    const inside = clampedStart <= clampedEnd;

    weeks.push({
      index: i + 1,
      start: clampedStart,
      end: clampedEnd,
      rangeLabel: inside ? `${fmtDay(clampedStart)} a ${fmtDay(clampedEnd)}` : null,
    });
  }
  return weeks;
}
