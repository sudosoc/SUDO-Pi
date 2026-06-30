import { Suspense, useState, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useSystemMetrics } from "@/hooks/useSystemMetrics";

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full min-h-[300px]">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

const ROUTE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/system": "System Monitor",
  "/terminal": "Terminal",
  "/files": "File Manager",
  "/network": "Network Manager",
  "/packages": "Package Manager",
  "/docker": "Docker Manager",
  "/bluetooth": "Bluetooth",
  "/gpio": "GPIO",
  "/devices": "Connected Devices",
  "/logs": "Logs",
  "/users": "Users",
  "/security": "Security",
  "/settings": "Settings",
};

function getTitle(pathname: string): string {
  for (const [path, title] of Object.entries(ROUTE_TITLES)) {
    if (path !== "/" && pathname.startsWith(path)) return title;
  }
  if (pathname === "/") return "Dashboard";
  return "SUDO-Pi";
}

export function MainLayout() {
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const title = getTitle(location.pathname);

  useSystemMetrics();

  useEffect(() => {
    const stored = localStorage.getItem("sidebar-collapsed");
    if (stored !== null) setSidebarCollapsed(stored === "true");
  }, []);

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      localStorage.setItem("sidebar-collapsed", String(!prev));
      return !prev;
    });
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header title={title} />
        <main className="flex-1 overflow-auto">
          <div className="h-full">
            <ErrorBoundary>
              <Suspense fallback={<PageLoader />}>
                <Outlet />
              </Suspense>
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );
}
