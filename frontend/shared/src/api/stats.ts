import { API_URL } from "../constants";
import type { MonthlyStats, MonthStats } from "../types";
import { request } from "./client";

export function createStatsApi(baseUrl: string = API_URL) {
  const root = `${baseUrl}/stats`;

  return {
    /** Статистика за один місяць у форматі YYYY-MM. */
    async month(month: string): Promise<MonthStats> {
      return request<MonthStats>(`${root}/month?month=${encodeURIComponent(month)}`);
    },
    /** Підсумки за `months` місяців, останній з яких — `until`. */
    async monthly(until: string, months = 6): Promise<MonthlyStats> {
      return request<MonthlyStats>(`${root}/monthly?until=${encodeURIComponent(until)}&months=${months}`);
    },
  };
}
