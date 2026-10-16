import { API_URL } from "../constants";
import type { BudgetLimits } from "../lib/stats";
import type { TransactionCategory } from "../types";
import { request } from "./client";

interface ApiBudget {
  category: string;
  monthly_limit: number;
}

function toLimits(items: ApiBudget[]): BudgetLimits {
  const limits: BudgetLimits = {};
  for (const item of items) limits[item.category as TransactionCategory] = Number(item.monthly_limit);
  return limits;
}

function toPayload(limits: BudgetLimits): ApiBudget[] {
  return Object.entries(limits)
    .filter(([, limit]) => typeof limit === "number" && limit > 0)
    .map(([category, limit]) => ({ category, monthly_limit: limit as number }));
}

export function createBudgetsApi(baseUrl: string = API_URL) {
  const root = `${baseUrl}/budgets`;

  return {
    async get(): Promise<BudgetLimits> {
      return toLimits(await request<ApiBudget[]>(`${root}/`));
    },
    /** Повна заміна набору: категорії без ліміту просто не потрапляють у запит. */
    async replace(limits: BudgetLimits): Promise<BudgetLimits> {
      return toLimits(
        await request<ApiBudget[]>(`${root}/`, { method: "PUT", body: JSON.stringify(toPayload(limits)) }),
      );
    },
  };
}
