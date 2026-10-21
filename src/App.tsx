import { useEffect, useState, type FormEvent } from "react";
import {
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  ChevronRight,
  Columns3,
  Import,
  LogOut,
  Menu,
  Settings2,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { api, ApiError, send } from "./lib/api";
import type { User } from "./types";
import { Button } from "./components/ui/button";
import { Board } from "./pages/Board";
import { Dashboard } from "./pages/Dashboard";
import { Agenda } from "./pages/Agenda";
import { Team } from "./pages/Team";
import { Imports } from "./pages/Imports";
import { Settings } from "./pages/Settings";
export function ErrorBox({ error }: { error: unknown }) {
  return error ? (
    <p role="alert" className="error-box">
      {error instanceof Error ? error.message : String(error)}
    </p>
  ) : null;
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-line" />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Loading() {
  return (
    <div className="skeleton-group" role="status" aria-label="Carregando">
      <div className="skeleton" />
      <div className="skeleton" />
      <div className="skeleton" />
    </div>
  );
}
function Login() {
  const client = useQueryClient();
  const [reset, setReset] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      if (reset) {
        await send("/auth/reset", {
          token: form.get("token"),
          password: form.get("password"),
        });
        setReset(false);
        setNotice("Senha definida. Entre com seu e-mail e a nova senha.");
      } else {
        const user = await send("/auth/login", {
          email: form.get("email"),
          password: form.get("password"),
        });
        client.setQueryData(["me"], user);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-layout">
      <section className="login-story">
        <div className="wordmark">
          <span aria-hidden="true">💬</span> Central<span> / atendimento</span>
        </div>
        <div>
          <h1>
            Cada conversa,
            <br />
            um próximo passo.
          </h1>
          <p>Uma operação organizada, da primeira tentativa ao resultado.</p>
          <div className="login-flow">
            <span>Carteira</span>
            <ChevronRight size={16} />
            <span>Conversa</span>
            <ChevronRight size={16} />
            <span>Resultado</span>
          </div>
        </div>
        <small>Demonstração · Dados fictícios</small>
      </section>
      <section className="login-form">
        <div className="mobile-brand">💬 Central de atendimento</div>
        <form onSubmit={submit}>
          <h2>{reset ? "Definir nova senha" : "Acesse sua operação"}</h2>
          <p className="muted">
            {reset
              ? "Use o código temporário fornecido pelo administrador."
              : "Entre com o acesso fornecido pelo administrador."}
          </p>
          {reset ? (
            <label>
              Código temporário
              <input name="token" required autoComplete="one-time-code" />
            </label>
          ) : (
            <label>
              E-mail
              <input
                name="email"
                type="email"
                required
                autoComplete="username"
              />
            </label>
          )}
          <label>
            {reset ? "Nova senha · mínimo 12 caracteres" : "Senha"}
            <input
              name="password"
              type="password"
              minLength={reset ? 12 : 1}
              maxLength={128}
              autoComplete={reset ? "new-password" : "current-password"}
              required
            />
          </label>
          <ErrorBox error={error} />
          {notice && (
            <p role="status" className="success-box">
              {notice}
            </p>
          )}
          <Button disabled={busy} type="submit">
            {busy ? "Aguarde…" : reset ? "Salvar nova senha" : "Entrar"}
            <ArrowUpRight size={16} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setReset(!reset);
              setError("");
            }}
          >
            {reset ? "Voltar ao login" : "Primeiro acesso ou redefinir senha"}
          </Button>
          <p className="login-help">
            <ShieldCheck size={15} /> Acesso individual e carteira protegida
          </p>
        </form>
      </section>
    </main>
  );
}
const navigation = [
  { to: "/", label: "Visão geral", icon: BarChart3 },
  { to: "/carteira", label: "Carteira de leads", icon: Columns3 },
  { to: "/agenda", label: "Agenda de retornos", icon: CalendarDays },
  { to: "/equipe", label: "Equipe", icon: Users, admin: true },
  { to: "/importacao", label: "Importação", icon: Import, admin: true },
  {
    to: "/configuracoes",
    label: "Configurações",
    icon: Settings2,
    admin: true,
  },
];
export default function App() {
  const client = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const [menu, setMenu] = useState(false);
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("crm-sidebar-collapsed") === "1",
  );
  useEffect(() => {
    localStorage.setItem("crm-sidebar-collapsed", collapsed ? "1" : "0");
  }, [collapsed]);
  const [logoutError, setLogoutError] = useState("");
  const me = useQuery<User>({
    queryKey: ["me"],
    queryFn: () => api("/auth/me"),
  });
  if (me.isPending)
    return (
      <main className="boot">
        <Loading />
      </main>
    );
  if (!me.data)
    return (
      <>
        <Login />
        {me.error &&
          !(me.error instanceof ApiError && me.error.status === 401) && (
            <div className="connection-error">
              <ErrorBox error={me.error} />
            </div>
          )}
      </>
    );
  const user = me.data;
  const active = navigation.find((n) => n.to === location.pathname);
  async function logout() {
    try {
      await send("/auth/logout", {});
      client.clear();
      navigate("/");
    } catch (e) {
      setLogoutError((e as Error).message);
    }
  }
  return (
    <div className={`app-shell ${collapsed ? "is-collapsed" : ""}`}>
      <aside
        id="crm-navigation"
        className={menu ? "sidebar is-open" : "sidebar"}
      >
        <div className="brand">
          <b className="brand-word">
            <span aria-hidden="true">💬</span> central
          </b>
          <b className="brand-short" aria-hidden="true">
            💬
          </b>
          <span>demonstração</span>
          <button
            className="mobile-close"
            aria-label="Fechar navegação"
            onClick={() => setMenu(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="workspace">
          <span className="workspace-mark">O</span>
          <div>
            <strong>Operação demonstrativa</strong>
            <small>Gestão comercial</small>
          </div>
        </div>
        <nav aria-label="Principal">
          {navigation
            .filter((n) => !n.admin || user.role === "ADMIN")
            .map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                aria-label={label}
                title={collapsed ? label : undefined}
                onClick={() => setMenu(false)}
              >
                <Icon size={18} />
                <span className="nav-label">{label}</span>
              </NavLink>
            ))}
        </nav>
        <div className="sidebar-foot">
          <span className="status-dot" />
          <span className="sidebar-foot-label">Horários de Porto Velho</span>
        </div>
        <div className="account">
          <div className="avatar">{user.name.slice(0, 2).toUpperCase()}</div>
          <div>
            <strong>{user.name}</strong>
            <small>
              {user.role === "ADMIN" ? "Administrador" : "Freelancer"}
            </small>
          </div>
          <button aria-label="Sair" onClick={logout}>
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      {menu && (
        <button
          className="nav-scrim"
          aria-label="Fechar navegação"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <button
            className="desktop-collapse"
            aria-label={
              collapsed ? "Expandir barra lateral" : "Recolher barra lateral"
            }
            aria-expanded={!collapsed}
            aria-controls="crm-navigation"
            onClick={() => setCollapsed(!collapsed)}
          >
            <Menu size={18} />
          </button>
          <button
            className="menu-toggle"
            aria-label="Abrir navegação"
            onClick={() => setMenu(true)}
          >
            <Menu size={20} />
          </button>
          <span>Dados fictícios · Demonstração</span>
          <ChevronRight size={14} />
          <strong>{active?.label || "Atendimento"}</strong>
          <span className="topbar-right">
            {new Intl.DateTimeFormat("pt-BR", {
              timeZone: "America/Porto_Velho",
              day: "numeric",
              month: "long",
            }).format(new Date())}
          </span>
        </header>
        <ErrorBox error={logoutError} />
        <main className="content">
          <Routes>
            <Route path="/" element={<Dashboard user={user} />} />
            <Route path="/carteira" element={<Board user={user} />} />
            <Route path="/agenda" element={<Agenda user={user} />} />
            {user.role === "ADMIN" && (
              <>
                <Route path="/equipe" element={<Team />} />
                <Route path="/importacao" element={<Imports />} />
                <Route path="/configuracoes" element={<Settings />} />
              </>
            )}
            <Route
              path="*"
              element={
                <Empty title="Página não encontrada">
                  <NavLink to="/">Voltar à visão geral</NavLink>
                </Empty>
              }
            />
          </Routes>
        </main>
      </div>
    </div>
  );
}
