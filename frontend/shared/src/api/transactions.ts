import { API_URL, CATEGORIES } from "../constants";
import type { Transaction, TransactionCategory } from "../types";
import { request } from "./client";

export interface TransactionInput {
  amount: number;
  category: TransactionCategory;
  note: string | null;
  spent_at: string;
}

interface ApiTransaction {
  id: string;
  amount: number | string;
  category: string;
  spent_at: string;
  note: string | null;
  created_at: string;
}

interface ApiTransactionList {
  items: ApiTransaction[];
  total: number;
}

const PAGE_SIZE = 1000;

function toTransaction(e: ApiTransaction): Transaction {
  const category = (CATEGORIES as string[]).includes(e.category) ? (e.category as TransactionCategory) : "інше";
  return { ...e, amount: Number(e.amount), category };
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
    async create(input: TransactionInput): Promise<Transaction> {
      return toTransaction(await request<ApiTransaction>(`${root}/`, { method: "POST", body: JSON.stringify(input) }));
    },
    async update(id: string, input: TransactionInput): Promise<Transaction> {
      return toTransaction(await request<ApiTransaction>(`${root}/${id}`, { method: "PUT", body: JSON.stringify(input) }));
    },
    async remove(id: string): Promise<void> {
      await request<void>(`${root}/${id}`, { method: "DELETE" });
    },
  };
}
