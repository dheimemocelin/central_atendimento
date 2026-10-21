import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, dayKey, fmt, localInputToISO, send } from "../lib/api";
import type { Catalogs, Task, User } from "../types";
import { Empty, ErrorBox, Loading } from "../App";
import { Button } from "../components/ui/button";
export function Agenda({ user }: { user: User }) {
  const client = useQueryClient();
  const [tab, setTab] = useState("today");
  const [owner, setOwner] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const cats = useQuery<Catalogs>({
    queryKey: ["catalogs"],
    queryFn: () => api("/catalogs"),
  });
  const query = useQuery<Task[]>({
    queryKey: ["tasks", owner],
    queryFn: () => api("/tasks" + (owner ? "?ownerId=" + owner : "")),
  });
  const now = new Date();
  const today = dayKey(now);
  const filtered =
    query.data?.filter((t) =>
      tab === "done"
        ? !!t.completedAt
        : !t.completedAt &&
          (tab === "overdue"
            ? new Date(t.dueAt) < now
            : tab === "today"
              ? dayKey(t.dueAt) === today
              : dayKey(t.dueAt) > today),
    ) || [];
  async function update(id: string, data: unknown) {
    setBusy(id);
    try {
      await send("/tasks/" + id, data, "PATCH");
      await client.invalidateQueries();
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Agenda de retornos</h1>
          <p>O próximo contato, na hora certa.</p>
        </div>
        {user.role === "ADMIN" && (
          <select
            aria-label="Filtrar freelancer"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
          >
            <option value="">Toda a equipe</option>
            {cats.data?.users
              .filter((u) => u.role === "FREELANCER")
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
          </select>
        )}
      </div>
      <div className="tabs">
        {[
          ["today", "Hoje"],
          ["overdue", "Atrasados"],
          ["future", "Futuros"],
          ["done", "Concluídos"],
        ].map(([key, label]) => (
          <button
            key={key}
            aria-pressed={tab === key}
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <ErrorBox error={error || query.error} />
      {query.isPending ? (
        <Loading />
      ) : !filtered.length ? (
        <Empty title="Agenda em dia">
          Nenhum retorno nesta seleção. Agende o próximo passo no painel de um
          lead.
        </Empty>
      ) : (
        <div className="panel table-scroll">
          <table>
            <thead>
              <tr>
                <th>Próxima ação</th>
                <th>Lead</th>
                <th>Responsável</th>
                <th>Retorno · Porto Velho</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id}>
                  <td>
                    <strong>{t.title}</strong>
                  </td>
                  <td>
                    <Link
                      className="text-link"
                      to={"/carteira?lead=" + t.lead.id}
                    >
                      {t.lead.name}
                    </Link>
                  </td>
                  <td>{t.user.name}</td>
                  <td>
                    <span
                      className={
                        !t.completedAt && new Date(t.dueAt) < now
                          ? "overdue-text"
                          : ""
                      }
                    >
                      {fmt(t.dueAt)}
                    </span>
                  </td>
                  <td>
                    {!t.completedAt && (
                      <div className="row-actions">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy === t.id}
                          onClick={() => update(t.id, { complete: true })}
                        >
                          Concluir
                        </Button>
                        <details>
                          <summary>Reagendar</summary>
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              const f = new FormData(e.currentTarget);
                              update(t.id, {
                                dueAt: localInputToISO(String(f.get("dueAt"))),
                              });
                            }}
                          >
                            <label>
                              Nova data e hora
                              <input
                                type="datetime-local"
                                name="dueAt"
                                required
                              />
                            </label>
                            <Button size="sm" disabled={busy === t.id}>
                              Salvar
                            </Button>
                          </form>
                        </details>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
