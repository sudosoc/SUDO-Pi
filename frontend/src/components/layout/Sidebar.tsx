import { useCallback, useEffect, useMemo } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { Home, LogOut, Zap, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { canAccessPage } from "@/lib/pages";
import { useAuthStore } from "@/stores/authStore";
import { authApi } from "@/api/auth";
import { NAV_GROUPS, getActiveGroup, type NavGroup } from "@/lib/navGroups";

// ─── Props ─────────────────────────────────────────────────────────────────────

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

// ─── Smart last-visited helper ──────────────────────────────────────────────────

const STORAGE_KEY = "nav-last-visited";

function readLastVisited(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, string>; }
  catch { return {}; }
}

function saveLastVisited(groupId: string, pathname: string) {
  const current = readLastVisited();
  current[groupId] = pathname;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
}

// ─── Sidebar ───────────────────────────────────────────────────────────────────

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try { await authApi.logout(); } finally {
      logout();
      window.location.href = "/login";
    }
  };

  const visibleGroups = useMemo(() =>
    NAV_GROUPS
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (item) =>
            (!item.roles || (user?.role && item.roles.includes(user.role))) &&
            canAccessPage(item.to, user?.allowed_pages ?? null),
        ),
      }))
      .filter((g) => g.items.length > 0),
    [user],
  );

  // Track last visited page per group
  useEffect(() => {
    const activeGroup = getActiveGroup(location.pathname, visibleGroups);
    if (activeGroup) saveLastVisited(activeGroup.id, location.pathname);
  }, [location.pathname, visibleGroups]);

  const navigateToGroup = useCallback((group: NavGroup) => {
    const last = readLastVisited()[group.id];
    const isValid = last && group.items.some((i) => i.to === last);
    navigate(isValid ? last : group.items[0].to);
  }, [navigate]);

  const activeGroup = getActiveGroup(location.pathname, visibleGroups);
  const dashActive = location.pathname === "/";

  return (
    <aside
      className={cn(
        "flex flex-col h-full shrink-0 border-r border-border/40 transition-all duration-300 ease-in-out relative",
        "bg-background/60 backdrop-blur-2xl",
        collapsed ? "w-[58px]" : "w-[164px]",
      )}
      style={collapsed ? { zIndex: 50, overflowY: "visible" } : undefined}
    >
      {/* Right edge glow */}
      <div
        className="pointer-events-none absolute right-0 top-[10%] bottom-[10%] w-px opacity-30"
        style={{ background: "linear-gradient(to bottom, transparent, hsl(var(--primary)/0.5), transparent)" }}
      />

      {/* ── Logo ── */}
      <div className={cn(
        "h-[52px] flex items-center border-b border-border/40 shrink-0",
        collapsed ? "justify-center px-0" : "px-4 gap-2.5",
      )}>
        {collapsed ? (
          <button
            onClick={onToggle}
            className="w-8 h-8 rounded-xl bg-primary/12 border border-primary/20 flex items-center justify-center hover:bg-primary/22 hover:border-primary/35 transition-all group"
          >
            <Zap className="w-3.5 h-3.5 text-primary group-hover:scale-110 transition-transform" />
          </button>
        ) : (
          <>
            <Link to="/" className="flex items-center gap-2.5 flex-1 min-w-0 group">
              <div className="w-7 h-7 shrink-0 rounded-xl bg-primary/12 border border-primary/20 flex items-center justify-center group-hover:bg-primary/20 transition-all">
                <Zap className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="font-bold text-[13px] tracking-wider text-gradient select-none truncate">
                SUDO-Pi
              </span>
            </Link>
            <button
              onClick={onToggle}
              className="w-5 h-5 flex items-center justify-center text-muted-foreground/30 hover:text-muted-foreground/70 transition-colors shrink-0"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>

      {/* ── Category Nav ── */}
      <nav className={cn(
        "flex-1 overflow-y-auto overflow-x-visible py-3",
        collapsed ? "flex flex-col items-center gap-0.5 px-0" : "px-2 space-y-0.5",
      )}>

        {/* Dashboard */}
        {collapsed ? (
          <div className="relative group/tip">
            <button
              onClick={() => navigate("/")}
              className={cn(
                "w-9 h-9 rounded-xl flex items-center justify-center transition-all",
                dashActive
                  ? "bg-primary/12 text-primary ring-1 ring-primary/20"
                  : "text-muted-foreground/50 hover:bg-secondary/50 hover:text-foreground",
              )}
            >
              {dashActive && <div className="absolute left-0 inset-y-2 w-[2px] rounded-full bg-primary" />}
              <Home className="w-[15px] h-[15px]" />
            </button>
            <div className="pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 bg-popover border border-border/50 rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium whitespace-nowrap shadow-xl opacity-0 group-hover/tip:opacity-100 transition-opacity z-[200]">
              Dashboard
            </div>
          </div>
        ) : (
          <button
            onClick={() => navigate("/")}
            className={cn(
              "group/item relative w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all",
              dashActive
                ? "bg-primary/8 text-foreground"
                : "text-muted-foreground/60 hover:text-foreground hover:bg-secondary/40",
            )}
          >
            {dashActive && (
              <div className="absolute left-0 inset-y-2 w-[2px] rounded-full bg-primary" />
            )}
            <Home className={cn("w-[14px] h-[14px] shrink-0", dashActive ? "text-primary" : "text-muted-foreground/40")} />
            <span>Dashboard</span>
          </button>
        )}

        {/* Separator */}
        {collapsed
          ? <div className="w-5 border-t border-border/35 my-1" />
          : <div className="border-t border-border/30 mx-1 my-1.5" />
        }

        {/* Category groups */}
        {visibleGroups.map((group) => {
          const GroupIcon = group.icon;
          const isActive = activeGroup?.id === group.id;

          return collapsed ? (
            <div key={group.id} className="relative group/tip">
              <button
                onClick={() => navigateToGroup(group)}
                className={cn(
                  "relative w-9 h-9 rounded-xl flex items-center justify-center transition-all",
                  isActive
                    ? cn(group.bg, "ring-1 ring-inset ring-white/10")
                    : "text-muted-foreground/45 hover:bg-secondary/50 hover:text-foreground",
                )}
              >
                {isActive && (
                  <div className="absolute left-0 inset-y-2 w-[2px] rounded-full bg-primary" />
                )}
                <GroupIcon className={cn("w-[15px] h-[15px]", isActive ? group.color : "")} />
              </button>
              <div className="pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 bg-popover border border-border/50 rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium whitespace-nowrap shadow-xl opacity-0 group-hover/tip:opacity-100 transition-opacity z-[200]">
                {group.label}
                <span className="text-muted-foreground/40 text-[10px] ml-2">{group.items.length}</span>
              </div>
            </div>
          ) : (
            <button
              key={group.id}
              onClick={() => navigateToGroup(group)}
              className={cn(
                "group/item relative w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all text-left",
                isActive
                  ? "bg-secondary/50 text-foreground"
                  : "text-muted-foreground/60 hover:text-foreground hover:bg-secondary/30",
              )}
            >
              {isActive && (
                <div className={cn("absolute left-0 inset-y-2 w-[2px] rounded-full", group.color.replace("text-", "bg-"))} />
              )}
              <div className={cn(
                "w-[18px] h-[18px] rounded-md flex items-center justify-center shrink-0 transition-all",
                isActive ? group.bg : "bg-transparent",
              )}>
                <GroupIcon className={cn("w-[11px] h-[11px] transition-colors", isActive ? group.color : "text-muted-foreground/45")} />
              </div>
              <span className="truncate">{group.label}</span>
              <span className={cn("ml-auto text-[10px] tabular-nums transition-colors", isActive ? "text-muted-foreground/50" : "text-muted-foreground/25")}>
                {group.items.length}
              </span>
            </button>
          );
        })}
      </nav>

      {/* ── User + Logout ── */}
      <div className={cn(
        "border-t border-border/40 shrink-0",
        collapsed ? "py-2 flex flex-col items-center gap-1" : "p-2 space-y-0.5",
      )}>
        {user && !collapsed && (
          <Link
            to="/account"
            className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-secondary/50 transition-all group"
          >
            <div className="relative w-6 h-6 rounded-full bg-primary/12 border border-primary/22 flex items-center justify-center text-[10px] font-bold text-primary uppercase shrink-0">
              {user.username.slice(0, 2)}
              <span
                className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-success border-[1.5px] border-background"
                style={{ boxShadow: "0 0 5px hsl(var(--success)/0.6)" }}
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11.5px] font-semibold text-foreground/80 truncate leading-tight">{user.username}</p>
              <p className="text-[10px] text-muted-foreground/45 capitalize leading-tight">{user.role}</p>
            </div>
          </Link>
        )}

        {user && collapsed && (
          <Link
            to="/account"
            className="relative w-8 h-8 rounded-full bg-primary/12 border border-primary/22 flex items-center justify-center text-[10px] font-bold text-primary uppercase hover:border-primary/40 transition-colors"
          >
            {user.username.slice(0, 2)}
            <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-success border border-background" />
          </Link>
        )}

        <button
          onClick={handleLogout}
          className={cn(
            "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-[12px] font-medium",
            "text-muted-foreground/40 hover:text-destructive hover:bg-destructive/8 transition-all",
            collapsed && "justify-center",
          )}
        >
          <LogOut className="w-[12px] h-[12px] shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}
