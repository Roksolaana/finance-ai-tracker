import { NavLink } from "react-router-dom";

const navItems = [
  { to: "/", label: "Дашборд", icon: "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10" },
  { to: "/transactions", label: "Транзакції", icon: "M17 3v4M7 3v4M3 11h18M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z" },
];

export function Sidebar() {
  return (
    <aside className="panel-sidebar w-full lg:w-60 flex flex-col shrink-0">
      <div className="h-16 flex items-center px-5 border-b" style={{ borderColor: "var(--sidebar-border)" }}>
        <div className="flex items-center gap-2.5 text-ink">
          <svg className="w-5 h-5 brand-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
            <path d="M12 21V11" className="icon" strokeLinecap="round" />
            <path d="M12 11C12 6.5 8.5 4.5 5 4.5C5 9 7.5 11.5 12 11.5" className="icon" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M12 8C12 4.7 14.6 3 17.5 3C17.5 6.5 15.5 8.5 12 8.5" className="icon" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="font-display font-semibold tracking-tight text-[15px]">Крона</span>
        </div>
      </div>

      <nav className="flex-1 px-3 py-5 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `nav-link flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium ${isActive ? "active" : ""}`
            }
          >
            <svg className="icon w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
              <path d={item.icon} />
            </svg>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="p-3 border-t" style={{ borderColor: "var(--sidebar-border)" }}>
        <div className="flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer nav-link">
          <div
            className="w-7 h-7 rounded-md flex items-center justify-center text-white text-xs font-semibold shrink-0"
            style={{ background: "var(--accent)" }}
          >
            РС
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium text-ink leading-none mb-1 truncate">Роксолана</span>
            <span className="text-xs leading-none truncate text-muted">roksolana@example.com</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
