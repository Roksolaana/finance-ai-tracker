import { API_URL, CATEGORIES, MOOD_TAGS } from "../constants";
import type { BudgetWarning, MoodTag, Transaction, TransactionCategory } from "../types";
import { request } from "./client";

export interface TransactionInput {
  amount: number;
  category: TransactionCategory;
  note: string | null;
  spent_at: string;
  tags?: MoodTag[];
}

interface ApiTransaction {
  id: string;
  amount: number | string;
  category: string;
  spent_at: string;
  note: string | null;
  tags?: string[];
  created_at: string;
}

/** Чернетка з опису своїми словами: ще не збережена, заповнює форму. */
export interface TransactionDraft {
  /** null — суми в тексті не знайшлося. Знак уже поставлено за категорією. */
  amount: number | null;
  category: TransactionCategory;
  spent_at: string;
  note: string | null;
  tags: MoodTag[];
  source: "llm" | "rules";
}

/** Підказка категорії за схожими власними записами. */
export interface CategorySuggestion {
  category: TransactionCategory | null;
  /** Частка 5 найближчих записів за цю категорію: 1 — усі згодні. */
  confidence: number;
}

/**
 * З якої впевненості форма підставляє категорію сама. Нижче — лише
 * пропонує: на нових фразах слабша підказка частіше помиляється, ніж влучає
 * (див. backend/eval/run_categories.py).
 */
export const AUTO_CATEGORY_CONFIDENCE = 1;

interface ApiTransactionList {
  items: ApiTransaction[];
  total: number;
}

const PAGE_SIZE = 1000;

function toTransaction(e: ApiTransaction): Transaction {
  const category = (CATEGORIES as string[]).includes(e.category) ? (e.category as TransactionCategory) : "інше";
  // Старий сервер тегів не віддає, а невідомий тег інтерфейсу нема як показати.
  const tags = (e.tags ?? []).filter((t): t is MoodTag => (MOOD_TAGS as string[]).includes(t));
  return { ...e, amount: Number(e.amount), category, tags };
}

export function createTransactionsApi(baseUrl: string = API_URL) {
  const root = `${baseUrl}/transactions`;

  return {
    async list(): Promise<Transaction[]> {
      const all: Transaction[] = [];
      for (let page = 1; ; page++) {
        const data = await request<ApiTransactionList>(`${root}/?page=${page}&per_page=${PAGE_SIZE}`);
        all.push(...data.items.map(toTransaction));
        if (all.length >= data.total || data.items.length === 0) return all;
      }
    },
    /** Кілька найновіших — для головної не треба тягнути весь список. */
    async recent(count: number): Promise<Transaction[]> {
      const data = await request<ApiTransactionList>(`${root}/?page=1&per_page=${count}`);
      return data.items.map(toTransaction);
    },
    /** Операції одного місяця (межі — київська доба, як у статистиці). */
    async inMonth(month: string): Promise<Transaction[]> {
      const [y, m] = month.split("-").map(Number);
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const data = await request<ApiTransactionList>(
        `${root}/?page=1&per_page=${PAGE_SIZE}&date_from=${month}-01&date_to=${month}-${String(lastDay).padStart(2, "0")}`,
      );
      return data.items.map(toTransaction);
    },
    /** Створена транзакція й, якщо треба, попередження про ліміт її категорії. */
    async create(input: TransactionInput): Promise<Transaction & { budget_warning: BudgetWarning | null }> {
      const created = await request<ApiTransaction & { budget_warning?: BudgetWarning | null }>(`${root}/`, {
        method: "POST",
        body: JSON.stringify(input),
      });
      return { ...toTransaction(created), budget_warning: created.budget_warning ?? null };
    },
    async update(id: string, input: TransactionInput): Promise<Transaction> {
      return toTransaction(await request<ApiTransaction>(`${root}/${id}`, { method: "PUT", body: JSON.stringify(input) }));
    },
    async remove(id: string): Promise<void> {
      await request<void>(`${root}/${id}`, { method: "DELETE" });
    },
    async suggestCategory(note: string): Promise<CategorySuggestion> {
      const result = await request<{ category: string | null; confidence: number }>(
        `${root}/suggest-category?note=${encodeURIComponent(note)}`,
      );
      const known = result.category !== null && (CATEGORIES as string[]).includes(result.category);
      return { category: known ? (result.category as TransactionCategory) : null, confidence: result.confidence };
    },
    /** Розбирає «вчора таксі 230» у поля форми. Нічого не зберігає. */
    async parse(text: string): Promise<TransactionDraft> {
      const draft = await request<TransactionDraft & { category: string; tags: string[] }>(`${root}/parse`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      const category = (CATEGORIES as string[]).includes(draft.category) ? (draft.category as TransactionCategory) : "інше";
      const tags = draft.tags.filter((t): t is MoodTag => (MOOD_TAGS as string[]).includes(t));
      return { ...draft, category, tags };
    },
  };
}
