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
import { TransactionsProvider, useTransactions } from "./context/TransactionsContext";
import { UiProvider, useUi } from "./context/UiContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { AuthPage } from "./pages/AuthPage";

function Shell() {
  const { chatOpen } = useUi();
  const { loadError, reload } = useTransactions();

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="@container flex-1 overflow-y-auto px-7 py-6">
        <div className="mx-auto max-w-6xl">
          {loadError && (
            <div className="mb-4 flex items-center justify-between rounded-xl bg-gold-tint px-4 py-3 text-sm text-gold">
              <span>{loadError}. Дані можуть бути неактуальними.</span>
              <button onClick={reload} className="font-medium underline">
                Спробувати знову
              </button>
            </div>
          )}
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

function Gate() {
  const { user, checking } = useAuth();

  if (checking) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted">Завантаження…</div>
    );
  }
  if (!user) return <AuthPage />;

  // key — щоб при зміні акаунта стан транзакцій не переносився між користувачами.
  return (
    <TransactionsProvider key={user.id}>
      <UiProvider>
        <Shell />
      </UiProvider>
    </TransactionsProvider>
  );
}

function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}

export default App;
