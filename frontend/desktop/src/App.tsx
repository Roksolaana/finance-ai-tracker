import { Route, Routes } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { AiChatPanel } from "./components/AiChatPanel";
import { DashboardPage } from "./pages/DashboardPage";
import { TransactionsPage } from "./pages/TransactionsPage";
import { TransactionsProvider } from "./context/TransactionsContext";

function App() {
  return (
    <TransactionsProvider>
      <div className="app-shell shell flex flex-col lg:flex-row lg:h-screen lg:overflow-hidden">
        <Sidebar />
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/transactions" element={<TransactionsPage />} />
        </Routes>
        <AiChatPanel />
      </div>
    </TransactionsProvider>
  );
}

export default App;
