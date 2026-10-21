import * as Dialog from "@radix-ui/react-dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { ExternalLink, X } from "lucide-react";
import type { Catalogs, Lead, User } from "../types";
import { api, fmt, localInputToISO, send } from "../lib/api";
import { ErrorBox, Loading } from "../App";
import { Button } from "./ui/button";
const eventNames: Record<string, string> = {
  LEAD_IMPORTED: "Lead importado",
  STAGE_CHANGED: "Etapa alterada",
  LEAD_REASSIGNED: "Responsável alterado",
  INTERACTION_RECORDED: "Interação registrada",
  TASK_SCHEDULED: "Retorno agendado",
  TASK_UPDATED: "Retorno atualizado",
  PRIORITY_CHANGED: "Prioridade alterada",
};
export function LeadDrawer({
  id,
  catalogs,
  user,
  onClose,
  initialStage = "",
}: {
  id: string;
  catalogs: Catalogs;
  user: User;
  onClose: () => void;
  initialStage?: string;
}) {
  const client = useQueryClient();
  const query = useQuery<Lead>({
    queryKey: ["lead", id],
    queryFn: () => api("/leads/" + id),
  });
  const [tab, setTab] = useState("history");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [stage, setStage] = useState(initialStage);
  const lead = query.data;
  const target = catalogs.stages.find((s) => s.id === stage);
  async function mutate(path: string, data: unknown, method = "POST") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await send(path, data, method);
      await client.invalidateQueries();
      setNotice("Alteração salva.");
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function interaction(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    if (await mutate(`/leads/${id}/interactions`, Object.fromEntries(data))) {
      form.reset();
      setTab("history");
    }
  }
  async function task(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    if (
      await mutate(`/leads/${id}/tasks`, {
        title: data.get("title"),
        dueAt: localInputToISO(String(data.get("dueAt"))),
      })
    ) {
      form.reset();
      setTab("tasks");
    }
  }
  async function transition(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    if (
      await mutate(`/leads/${id}/stage`, {
        stageId: stage,
        version: lead!.version,
        reason: data.get("reason") || undefined,
        lossReasonId: data.get("lossReasonId") || undefined,
        conversion: data.get("conversion") || undefined,
        amount: data.get("amount") ? Number(data.get("amount")) : undefined,
      })
    )
      setStage("");
  }
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="drawer-overlay" />
        <Dialog.Content className="drawer" aria-describedby="lead-description">
          <header className="drawer-heading">
            <div>
              <Dialog.Title>{lead?.name || "Detalhes do lead"}</Dialog.Title>
              <Dialog.Description id="lead-description">
                Histórico e próximo passo do atendimento
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Fechar lead">
                <X size={20} />
              </Button>
            </Dialog.Close>
          </header>
          <ErrorBox error={query.error} />
          {query.isPending && <Loading />}
          {lead && (
            <div className="drawer-body">
              <div className="lead-contact">
                <div>
                  <span>
                    {lead.phone
                      ? "+" + lead.phone
                      : lead.rawPhone || "Telefone não disponível"}
                  </span>
                  <small>{lead.email || "E-mail não informado"}</small>
                </div>
                {lead.phone && (
                  <Button asChild variant="outline" size="sm">
                    <a
                      href={`https://wa.me/${lead.phone}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      WhatsApp
                      <ExternalLink size={14} />
                    </a>
                  </Button>
                )}
              </div>
              {!!lead.reviewIssues?.length && (
                <p className="error-box" role="status">
                  Cadastro para revisão: {lead.reviewIssues.join("; ")}. O valor
                  original foi preservado. Telefones não validados não abrem o
                  WhatsApp automaticamente.
                </p>
              )}
              <dl className="lead-facts">
                <div>
                  <dt>Etapa</dt>
                  <dd>{lead.stage.name}</dd>
                </div>
                <div>
                  <dt>Responsável</dt>
                  <dd>{lead.owner?.name || "Sem responsável"}</dd>
                </div>
                <div>
                  <dt>Origem</dt>
                  <dd>{lead.source || "Não informada"}</dd>
                </div>
                <div>
                  <dt>Tentativas</dt>
                  <dd>{lead._count.interactions}</dd>
                </div>
              </dl>
              <label>
                Prioridade
                <select
                  value={lead.priorityId || ""}
                  disabled={busy}
                  onChange={(e) =>
                    mutate(
                      "/leads/" + id,
                      { priorityId: e.target.value || null },
                      "PATCH",
                    )
                  }
                >
                  <option value="">Sem prioridade</option>
                  {catalogs.catalogs
                    .filter(
                      (c) =>
                        c.type === "PRIORITY" &&
                        (c.active || c.id === lead.priorityId),
                    )
                    .map((c) => (
                      <option key={c.id} value={c.id} disabled={!c.active}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </label>
              {lead.lossReason && (
                <p className="info-line">
                  Motivo da perda: {lead.lossReason.name}
                </p>
              )}
              {lead.conversions?.map((c, i) => (
                <p className="info-line" key={i}>
                  Conversão: {c.description}
                  {c.amount ? ` · R$ ${c.amount}` : ""}
                </p>
              ))}
              <details
                className="stage-editor"
                open={initialStage ? true : undefined}
              >
                <summary>Mover etapa ou registrar encerramento</summary>
                <form onSubmit={transition}>
                  <label>
                    Próxima etapa
                    <select
                      required
                      value={stage}
                      onChange={(e) => setStage(e.target.value)}
                    >
                      <option value="">Selecione</option>
                      {catalogs.stages
                        .filter(
                          (s) =>
                            s.active &&
                            s.id !== lead.stageId &&
                            (lead.stage.kind === "OPEN"
                              ? s.allowedFrom.includes(lead.stageId)
                              : user.role === "ADMIN" && s.kind === "OPEN"),
                        )
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  {target?.kind === "LOST" && (
                    <label>
                      Motivo de perda
                      <select required name="lossReasonId">
                        <option value="">Selecione</option>
                        {catalogs.lossReasons
                          .filter((r) => r.active)
                          .map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                  {target?.kind === "WON" && (
                    <>
                      <label>
                        Informações da conversão
                        <textarea name="conversion" required maxLength={4000} />
                      </label>
                      <label>
                        Valor do negócio (opcional)
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          name="amount"
                        />
                      </label>
                    </>
                  )}
                  {lead.stage.kind !== "OPEN" && (
                    <label>
                      Justificativa de reabertura
                      <textarea name="reason" required />
                    </label>
                  )}
                  <Button type="submit" disabled={!stage || busy}>
                    Salvar etapa
                  </Button>
                </form>
              </details>
              <div className="tabs" aria-label="Detalhes do atendimento">
                {[
                  ["history", "Histórico"],
                  ["interaction", "Registrar"],
                  ["tasks", "Retornos"],
                ].map(([key, name]) => (
                  <button
                    key={key}
                    className={tab === key ? "active" : ""}
                    aria-pressed={tab === key}
                    onClick={() => setTab(key)}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <ErrorBox error={error} />
              {notice && (
                <p role="status" className="success-box">
                  {notice}
                </p>
              )}
              {tab === "history" && (
                <div className="timeline">
                  {!lead.interactions?.length && (
                    <p className="muted">
                      Nenhuma interação registrada. Use Registrar após realizar
                      o atendimento.
                    </p>
                  )}
                  {[
                    ...(lead.interactions || []).map((i) => ({
                      id: i.id,
                      createdAt: i.createdAt,
                      title: i.result.name,
                      author: i.user.name + " · " + i.channel.name,
                      note: i.note,
                    })),
                    ...(lead.events || [])
                      .filter((e) => e.type !== "INTERACTION_RECORDED")
                      .map((e) => ({
                        id: e.id,
                        createdAt: e.createdAt,
                        title: eventNames[e.type] || e.type,
                        author: e.user.name,
                        note: [
                          e.type === "STAGE_CHANGED"
                            ? `${catalogs.stages.find((s) => s.id === e.data.from)?.name || e.data.from} → ${catalogs.stages.find((s) => s.id === e.data.to)?.name || e.data.to}`
                            : "",
                          e.data.lossReasonId
                            ? `Motivo da perda: ${catalogs.lossReasons.find((r) => r.id === e.data.lossReasonId)?.name || "Motivo histórico indisponível"}`
                            : "",
                          typeof e.data.reason === "string"
                            ? e.data.reason
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" · "),
                      })),
                  ]
                    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                    .map((item) => (
                      <article key={item.id}>
                        <div className="timeline-top">
                          <strong>{item.title}</strong>
                          <time>{fmt(item.createdAt)}</time>
                        </div>
                        {item.note && <p>{item.note}</p>}
                        <small>{item.author}</small>
                      </article>
                    ))}
                </div>
              )}
              {tab === "interaction" && (
                <form className="stack-form" onSubmit={interaction}>
                  <label>
                    Tipo
                    <select name="type">
                      <option value="CONTACT">Tentativa / contato</option>
                      <option value="NOTE">Observação interna</option>
                    </select>
                  </label>
                  <label>
                    Canal
                    <select name="channelId" required>
                      {catalogs.catalogs
                        .filter((c) => c.type === "CHANNEL" && c.active)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Resultado
                    <select name="resultId" required>
                      {catalogs.catalogs
                        .filter((c) => c.type === "RESULT" && c.active)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Observação
                    <textarea name="note" required maxLength={4000} rows={4} />
                  </label>
                  <p className="muted">
                    Abrir o WhatsApp não registra uma tentativa. Salve a
                    interação depois de realizá-la.
                  </p>
                  <Button type="submit" disabled={busy}>
                    {busy ? "Salvando…" : "Registrar interação"}
                  </Button>
                </form>
              )}
              {tab === "tasks" && (
                <>
                  <div className="task-list">
                    {lead.tasks.map((t) => (
                      <article key={t.id}>
                        <div>
                          <strong>{t.title}</strong>
                          <small>
                            {fmt(t.dueAt)} ·{" "}
                            {t.completedAt
                              ? "Concluído"
                              : new Date(t.dueAt) < new Date()
                                ? "Atrasado"
                                : "Pendente"}
                          </small>
                        </div>
                        {!t.completedAt && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              mutate(
                                `/tasks/${t.id}`,
                                { complete: true },
                                "PATCH",
                              )
                            }
                          >
                            Concluir
                          </Button>
                        )}
                      </article>
                    ))}
                  </div>
                  {lead.stage.kind === "OPEN" && (
                    <form className="stack-form" onSubmit={task}>
                      <h3>Agendar retorno</h3>
                      <label>
                        Próxima ação
                        <input
                          name="title"
                          required
                          minLength={2}
                          maxLength={250}
                        />
                      </label>
                      <label>
                        Data e hora · Porto Velho
                        <input name="dueAt" type="datetime-local" required />
                      </label>
                      <Button disabled={busy} type="submit">
                        Agendar retorno
                      </Button>
                    </form>
                  )}
                </>
              )}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
