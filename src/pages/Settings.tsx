import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Catalogs, CatalogEntry, Stage } from "../types";
import { api, send } from "../lib/api";
import { ErrorBox, Loading } from "../App";
import { Button } from "../components/ui/button";
export function Settings() {
  const client = useQueryClient();
  const query = useQuery<Catalogs>({
    queryKey: ["catalogs"],
    queryFn: () => api("/catalogs"),
  });
  const [tab, setTab] = useState("CHANNEL");
  const [editing, setEditing] = useState<Partial<CatalogEntry & Stage> | null>(
    null,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const common = {
      id: editing?.id,
      name: f.get("name"),
      active: f.get("active") === "on",
    };
    const data =
      tab === "STAGE"
        ? {
            ...common,
            entity: "stage",
            allowedFrom: f.getAll("allowedFrom"),
            requiresTask: f.get("requiresTask") === "on",
          }
        : tab === "LOSS"
          ? { ...common, entity: "lossReason" }
          : {
              ...common,
              entity: "catalog",
              type: tab,
              attempt: f.get("attempt") === "on",
              effectiveContact: f.get("effectiveContact") === "on",
              noResponse: f.get("noResponse") === "on",
            };
    try {
      await send("/settings", data);
      await client.invalidateQueries();
      setEditing(null);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const rows =
    tab === "STAGE"
      ? query.data?.stages
      : tab === "LOSS"
        ? query.data?.lossReasons
        : query.data?.catalogs.filter((c) => c.type === tab);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Configurações</h1>
          <p>Regras claras, com integridade do histórico.</p>
        </div>
        {tab !== "STAGE" && (
          <Button onClick={() => setEditing({ active: true })}>
            Adicionar opção
          </Button>
        )}
      </div>
      <div className="tabs">
        {[
          ["STAGE", "Etapas"],
          ["RESULT", "Resultados"],
          ["LOSS", "Motivos de perda"],
          ["PRIORITY", "Prioridades"],
          ["CHANNEL", "Canais"],
        ].map(([key, title]) => (
          <button
            key={key}
            className={tab === key ? "active" : ""}
            aria-pressed={tab === key}
            onClick={() => {
              setTab(key);
              setEditing(null);
            }}
          >
            {title}
          </button>
        ))}
      </div>
      <ErrorBox error={error || query.error} />
      {query.isPending && <Loading />}
      {editing && (
        <form
          key={editing.id || tab}
          className="inline-panel stack-form"
          onSubmit={submit}
        >
          <h2>{editing.id ? "Editar opção" : "Nova opção"}</h2>
          <label>
            Nome
            <input
              name="name"
              defaultValue={editing.name}
              required
              minLength={2}
              maxLength={100}
            />
          </label>
          <label className="check-label">
            <input
              name="active"
              type="checkbox"
              defaultChecked={editing.active}
            />
            Ativa
          </label>
          {tab === "RESULT" && (
            <>
              <label className="check-label">
                <input
                  name="attempt"
                  type="checkbox"
                  defaultChecked={editing.attempt}
                />
                Conta como tentativa
              </label>
              <label className="check-label">
                <input
                  name="effectiveContact"
                  type="checkbox"
                  defaultChecked={editing.effectiveContact}
                />
                Indica contato efetivo
              </label>
              <label className="check-label">
                <input
                  name="noResponse"
                  type="checkbox"
                  defaultChecked={editing.noResponse}
                />
                Indica ausência de resposta
              </label>
            </>
          )}
          {tab === "STAGE" && (
            <>
              <label className="check-label">
                <input
                  name="requiresTask"
                  type="checkbox"
                  defaultChecked={editing.requiresTask}
                />
                Exige retorno pendente
              </label>
              <fieldset>
                <legend>Permitir entrada a partir de</legend>
                {query.data?.stages
                  .filter((s) => s.id !== editing.id && s.kind === "OPEN")
                  .map((s) => (
                    <label className="check-label" key={s.id}>
                      <input
                        type="checkbox"
                        name="allowedFrom"
                        value={s.id}
                        defaultChecked={editing.allowedFrom?.includes(s.id)}
                      />
                      {s.name}
                    </label>
                  ))}
              </fieldset>
            </>
          )}
          <p className="muted">
            Desativar impede novos usos. Registros existentes e seus
            significados históricos são preservados.
          </p>
          <div className="row-actions">
            <Button disabled={busy} type="submit">
              Salvar configuração
            </Button>
            <Button
              variant="ghost"
              type="button"
              onClick={() => setEditing(null)}
            >
              Cancelar
            </Button>
          </div>
        </form>
      )}
      <section className="panel table-scroll">
        <table>
          <thead>
            <tr>
              <th>Opção</th>
              <th>Situação</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            {rows?.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>
                  <span className={"badge " + (r.active ? "positive" : "")}>
                    {r.active ? "Ativa" : "Inativa"}
                  </span>
                </td>
                <td>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditing(r)}
                  >
                    Editar
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
