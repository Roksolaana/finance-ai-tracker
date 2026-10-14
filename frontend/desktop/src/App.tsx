import { Route, Routes } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { AiChatPanel } from "./components/AiChatPanel";
import { TransactionFormDialog } from "./components/TransactionFormDialog";
import { TransactionDetailsSheet } from "./components/TransactionDetailsSheet";
import { BudgetsDialog } from "./components/BudgetsDialog";
import { Toasts } from "./components/Toasts";
import { DashboardPage } from "./pages/DashboardPage";
import { TransactionsPage } from "./pages/TransactionsPage";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { TransactionsProvider } from "./context/TransactionsContext";
import { UiProvider, useUi } from "./context/UiContext";

function Shell() {
  const { chatOpen } = useUi();

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="@container flex-1 overflow-y-auto px-7 py-6">
        <div className="mx-auto max-w-6xl">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
          </Routes>
        </div>
      </main>
      {chatOpen && <AiChatPanel />}

      <TransactionFormDialog />
      <TransactionDetailsSheet />
      <BudgetsDialog />
      <Toasts />
    </div>
  );
}

function App() {
  return (
    <TransactionsProvider>
      <UiProvider>
        <Shell />
      </UiProvider>
    </TransactionsProvider>
  );
}

export default App;
