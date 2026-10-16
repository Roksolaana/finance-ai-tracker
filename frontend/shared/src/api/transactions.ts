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
    async create(input: TransactionInput): Promise<Transaction> {
      return toTransaction(await request<ApiTransaction>(`${root}/`, { method: "POST", body: JSON.stringify(input) }));
    },
    async update(id: string, input: TransactionInput): Promise<Transaction> {
      return toTransaction(await request<ApiTransaction>(`${root}/${id}`, { method: "PUT", body: JSON.stringify(input) }));
    },
    async remove(id: string): Promise<void> {
      await request<void>(`${root}/${id}`, { method: "DELETE" });
    },
    async removeAll(): Promise<void> {
      await request<void>(`${root}/`, { method: "DELETE" });
    },
    async createMany(inputs: TransactionInput[]): Promise<void> {
      for (let i = 0; i < inputs.length; i += 500) {
        await request<ApiTransaction[]>(`${root}/bulk`, { method: "POST", body: JSON.stringify(inputs.slice(i, i + 500)) });
      }
    },
  };
}
