import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Users } from "lucide-react";
import { api, send } from "../lib/api";
import type { User } from "../types";
import { Empty, ErrorBox, Loading } from "../App";
import { Button } from "../components/ui/button";
export function Team() {
  const client = useQueryClient();
  const query = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: () => api("/users"),
  });
  const [create, setCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [token, setToken] = useState("");
  async function action(path: string, data: unknown, method = "POST") {
    setBusy(true);
    setError("");
    try {
      const res = await send(path, data, method);
      setToken(res.resetToken || "");
      await client.invalidateQueries();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (
      await action("/users", Object.fromEntries(new FormData(e.currentTarget)))
    )
      setCreate(false);
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Equipe</h1>
          <p>Acessos individuais. Responsabilidades claras.</p>
        </div>
        <Button onClick={() => setCreate(!create)}>
          <Plus size={16} />
          Adicionar pessoa
        </Button>
      </div>
      <ErrorBox error={error || query.error} />
      {token && (
        <div className="secret-panel" role="status">
          <h2>Código temporário de acesso</h2>
          <p>
            Entregue este código à pessoa por um canal privado autorizado. Ele
            expira em 30 minutos e só pode ser utilizado uma vez, em “Primeiro
            acesso ou redefinir senha”.
          </p>
          <code>{token}</code>
          <Button variant="outline" onClick={() => setToken("")}>
            Ocultar código
          </Button>
        </div>
      )}
      {create && (
        <form className="inline-panel form-grid" onSubmit={submit}>
          <label>
            Nome
            <input name="name" required minLength={2} maxLength={150} />
          </label>
          <label>
            E-mail
            <input name="email" type="email" required />
          </label>
          <label>
            Perfil
            <select name="role">
              <option value="FREELANCER">Freelancer</option>
              <option value="ADMIN">Administrador</option>
            </select>
          </label>
          <Button disabled={busy} type="submit">
            Criar acesso
          </Button>
        </form>
      )}
      {query.isPending ? (
        <Loading />
      ) : !query.data?.length ? (
        <Empty title="Monte sua equipe">
          Cadastre as pessoas que vão atender os leads.
        </Empty>
      ) : (
        <section className="panel table-scroll">
          <table>
            <thead>
              <tr>
                <th>Pessoa</th>
                <th>E-mail</th>
                <th>Perfil</th>
                <th>Situação</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((u) => (
                <tr key={u.id}>
                  <td>
                    <span className="person">
                      <span className="person-avatar">
                        <Users size={16} />
                      </span>
                      <strong>{u.name}</strong>
                    </span>
                  </td>
                  <td>{u.email}</td>
                  <td>{u.role === "ADMIN" ? "Administrador" : "Freelancer"}</td>
                  <td>
                    <span className={"badge " + (u.active ? "positive" : "")}>
                      {u.active ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          action(
                            "/users/" + u.id,
                            { active: !u.active },
                            "PATCH",
                          )
                        }
                      >
                        {u.active ? "Desativar" : "Ativar"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy || !u.active}
                        onClick={() => action("/users/" + u.id + "/reset", {})}
                      >
                        Redefinir acesso
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
