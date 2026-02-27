import { t } from "../i18n";

export function weekdayFromDate(date) {
  if (!date || isNaN(date.getTime())) return "";
  const days = t("details.weekdays");
  return Array.isArray(days) ? days[date.getDay()] : "";
}
