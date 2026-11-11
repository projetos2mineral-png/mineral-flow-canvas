/** O agendamento diário do banco roda às 10:00 UTC (06:00 America/Cuiaba). */
export const DAILY_START_UTC_HOUR = 10;

export function utcStartOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function isDailyWindowOpen(now: Date): boolean {
  return now.getUTCHours() >= DAILY_START_UTC_HOUR;
}

/**
 * O watchdog pode iniciar o diário mais tarde quando o cron das 10:00 encontrou
 * a trava ocupada. Só inicia uma vez por dia UTC e nunca antes da janela.
 */
export function shouldStartMissedDaily(now: Date, hasAutomaticRunToday: boolean): boolean {
  return isDailyWindowOpen(now) && !hasAutomaticRunToday;
}
