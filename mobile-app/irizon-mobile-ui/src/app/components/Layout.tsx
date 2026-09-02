import { Outlet, useLocation, Link } from "react-router";
import { Home, Gift, History, Package } from "lucide-react";
import { usePortal } from "../context/PortalContext";
import { NameGate } from "./NameGate";

export function Layout() {
  const location = useLocation();
  const { i18n } = usePortal();
  const shouldShowNav = !location.pathname.includes("/support");

  const navItems = [
    { path: "/app", icon: Home, label: i18n.home },
    { path: "/app/rewards", icon: Gift, label: i18n.rewards },
    { path: "/app/products", icon: Package, label: i18n.products },
    { path: "/app/history", icon: History, label: i18n.history },
  ];

  return (
    <div
      className="min-h-screen bg-[#F5F7FA]"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "calc(6rem + env(safe-area-inset-bottom))",
      }}
    >
      <div className="max-w-md mx-auto">
        <Outlet />
      </div>

      <NameGate />

      {shouldShowNav ? (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-50"
          style={{ bottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
        >
          <nav className="bg-white rounded-[28px] shadow-2xl px-6 py-3 flex gap-6 border border-gray-100">
            {navItems.map((item) => {
              const isActive =
                item.path === "/app"
                  ? location.pathname === "/app"
                  : location.pathname.startsWith(item.path);
              const Icon = item.icon;

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className="flex flex-col items-center gap-1.5 group relative min-w-[44px]"
                >
                  <div
                    className={`p-3.5 rounded-2xl transition-all duration-300 ${
                      isActive
                        ? "bg-gradient-to-br from-[#0F4C81] via-[#1E6FD9] to-[#2F8DE4] shadow-lg scale-110"
                        : "bg-transparent group-hover:bg-gray-50"
                    }`}
                  >
                    <Icon
                      className={`w-6 h-6 transition-colors ${
                        isActive
                          ? "text-white"
                          : "text-gray-400 group-hover:text-gray-600"
                      }`}
                      strokeWidth={isActive ? 2.5 : 2}
                    />
                  </div>
                  {isActive ? (
                    <div className="w-1.5 h-1.5 bg-[#1E6FD9] rounded-full absolute -bottom-1" />
                  ) : null}
                </Link>
              );
            })}
          </nav>
        </div>
      ) : null}
    </div>
  );
}
