import { Route, Routes } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { AiChatPanel } from "./components/AiChatPanel";
import { TransactionFormDialog } from "./components/TransactionFormDialog";
import { TransactionDetailsSheet } from "./components/TransactionDetailsSheet";
import { BudgetsDialog } from "./components/BudgetsDialog";
import { ProfileDialog } from "./components/ProfileDialog";
import { Toasts } from "./components/Toasts";
import { DashboardPage } from "./pages/DashboardPage";
import { TransactionsPage } from "./pages/TransactionsPage";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { TransactionsProvider, useTransactions } from "./context/TransactionsContext";
import { UiProvider, useUi } from "./context/UiContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { AuthPage } from "./pages/AuthPage";

function Shell() {
  const { chatOpen, toggleChat } = useUi();
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
      {/* Панель лишається змонтованою, лише ховається: інакше згортання
          стирало всю розмову, а відповідь на запит у польоті губилася. */}
      <AiChatPanel hidden={!chatOpen} />
      {/* На вузькому вікні панель накладається поверх контенту, тож потрібен
          фон, клік по якому її закриває. На широкому вона стоїть колонкою. */}
      {chatOpen && <div onClick={toggleChat} className="fixed inset-0 z-20 bg-ink/20 xl:hidden" aria-hidden />}

      <TransactionFormDialog />
      <TransactionDetailsSheet />
      <BudgetsDialog />
      <ProfileDialog />
      <Toasts />
    </div>
  );
}

function Gate() {
  const { user, checking, offline, retry, logout } = useAuth();

  if (checking) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted">Завантаження…</div>
    );
  }
  // Токен збережений, але перевірити його не вдалося. Сторінка входу тут
  // лише заплутувала б: акаунт нікуди не дівся, просто сервер не відповідає.
  if (!user && offline) {
    return (
      <div className="flex h-screen flex-col items-center justify-center px-6 text-center">
        <p className="font-display text-lg font-semibold">Немає зʼєднання із сервером</p>
        <p className="mt-1 max-w-sm text-sm text-muted">
          Перевірте, чи запущений сервер, і спробуйте ще раз.
        </p>
        <div className="mt-5 flex gap-2">
          <button onClick={logout} className="btn-ghost">
            Увійти в інший акаунт
          </button>
          <button onClick={retry} className="btn-primary">
            Спробувати знову
          </button>
        </div>
      </div>
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
