import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  Clock3,
  GripVertical,
  Phone,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import type { Catalogs, Lead, Stage, User } from "../types";
import { api, fmt, send } from "../lib/api";
import { Empty, ErrorBox, Loading } from "../App";
import { Button } from "../components/ui/button";
import { LeadDrawer } from "../components/LeadDrawer";
import { stageAppearance } from "../lib/stages";
function CardContent({
  lead,
  onOpen,
  handle,
}: {
  lead: Lead;
  onOpen: () => void;
  handle?: ReactNode;
}) {
  const task = lead.tasks.find((t) => !t.completedAt);
  const overdue = task && new Date(task.dueAt) < new Date();
  return (
    <>
      <div className="card-top">
        <span
          className={`priority ${lead.priority?.name === "Alta" ? "high" : ""}`}
        >
          {lead.priority?.name || "Normal"}
        </span>
        {handle || <GripVertical size={16} aria-hidden="true" />}
      </div>
      <button className="card-main" onClick={onOpen}>
        <strong>{lead.name}</strong>
        <span>
          <Phone size={13} />
          {lead.phone
            ? "+" + lead.phone
            : lead.rawPhone || "Telefone não informado"}
        </span>
      </button>
      {!!lead.reviewIssues?.length && (
        <p className="review-flag" title={lead.reviewIssues.join("; ")}>
          Revisar cadastro
        </p>
      )}
      <div className="card-owner">
        <span className="mini-avatar">
          {lead.owner?.name.slice(0, 1) || "—"}
        </span>
        <span>{lead.owner?.name || "Sem responsável"}</span>
        <span className="attempt-count" title="Tentativas registradas">
          {lead._count.interactions} tent.
        </span>
      </div>
      {task && (
        <div className={`card-return ${overdue ? "overdue" : ""}`}>
          <Clock3 size={13} />
          {overdue ? "Atrasado · " : ""}
          {fmt(task.dueAt)}
        </div>
      )}
    </>
  );
}
function Card({
  lead,
  onOpen,
  disabled,
}: {
  lead: Lead;
  onOpen: () => void;
  disabled: boolean;
}) {
  const drag = useDraggable({ id: lead.id, disabled });
  return (
    <article
      ref={drag.setNodeRef}
      data-lead-id={lead.id}
      className={`lead-card ${drag.isDragging ? "dragging" : ""}`}
      onMouseDown={(event) => drag.listeners?.onMouseDown?.(event)}
    >
      <CardContent
        lead={lead}
        onOpen={onOpen}
        handle={
          <button
            ref={drag.setActivatorNodeRef}
            type="button"
            className="drag-handle"
            aria-label={`Arrastar ${lead.name}`}
            title="Arraste o card para outra etapa"
            {...drag.attributes}
            onTouchStart={(event) => drag.listeners?.onTouchStart?.(event)}
          >
            <GripVertical size={16} />
          </button>
        }
      />
    </article>
  );
}
function Column({
  stage,
  leads,
  open,
  disabled,
}: {
  stage: Stage;
  leads: Lead[];
  open: (id: string) => void;
  disabled: boolean;
}) {
  const drop = useDroppable({ id: stage.id });
  const appearance = stageAppearance(stage);
  return (
    <section
      ref={drop.setNodeRef}
      className={`kanban-column ${drop.isOver ? "drop-over" : ""}`}
      data-stage-id={stage.id}
      aria-label={`Etapa ${stage.name}`}
      style={
        {
          "--stage-color": appearance.color,
          "--stage-tint": appearance.tint,
        } as CSSProperties
      }
    >
      <header>
        <span className="stage-emoji" aria-hidden="true">
          {appearance.emoji}
        </span>
        <h2>{stage.name}</h2>
        <span className="column-count">{leads.length}</span>
      </header>
      <div className="column-cards">
        {leads.map((l) => (
          <Card
            key={l.id}
            lead={l}
            onOpen={() => open(l.id)}
            disabled={disabled}
          />
        ))}
        {!leads.length && (
          <p className="column-empty">Nenhum lead nesta etapa</p>
        )}
      </div>
    </section>
  );
}
export function Board({ user }: { user: User }) {
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const search = params.get("search") || "";
  const owner = params.get("owner") || "";
  const priority = params.get("priority") || "";
  const situation = params.get("situation") || "all";
  const stageFilter = params.get("stage") || "";
  function setFilter(key: string, value: string) {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (value && value !== "all") next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  }
  const setSearch = (value: string) => setFilter("search", value);
  const setOwner = (value: string) => setFilter("owner", value);
  const setPriority = (value: string) => setFilter("priority", value);
  const setSituation = (value: string) => setFilter("situation", value);
  const setStageFilter = (value: string) => setFilter("stage", value);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const moveLock = useRef(false);
  const [dropIntent, setDropIntent] = useState<{
    leadId: string;
    stageId: string;
  } | null>(null);
  const dropStage =
    dropIntent?.leadId === params.get("lead") ? dropIntent.stageId : "";
  const [assign, setAssign] = useState(false);
  const [targets, setTargets] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const cats = useQuery<Catalogs>({
    queryKey: ["catalogs"],
    queryFn: () => api("/catalogs"),
  });
  const query = new URLSearchParams({
    search,
    ownerId: owner,
    priorityId: priority,
    situation,
    stageId: stageFilter,
  });
  for (const key of ["from", "to", "asOf", "resultId", "metric"]) {
    const value = params.get(key);
    if (value) query.set(key, value);
  }
  for (const [key, value] of [...query.entries()])
    if (!value) query.delete(key);
  const leads = useQuery<Lead[]>({
    queryKey: ["leads", query.toString()],
    queryFn: () => api("/leads?" + query),
  });
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
  );
  const open = (id: string, stageId = "") => {
    setDropIntent(stageId ? { leadId: id, stageId } : null);
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set("lead", id);
      return next;
    });
  };
  async function move(event: DragEndEvent) {
    setActiveId(null);
    if (moveLock.current) return;
    const lead = leads.data?.find((l) => l.id === event.active.id);
    const stage = cats.data?.stages.find((s) => s.id === event.over?.id);
    if (!lead || !stage || lead.stageId === stage.id) return;
    if (stage.kind !== "OPEN" || lead.stage.kind !== "OPEN") {
      open(lead.id, stage.id);
      setError(
        "Para encerrar ou reabrir, informe os detalhes no painel do lead.",
      );
      return;
    }
    moveLock.current = true;
    setMoving(true);
    try {
      await send(`/leads/${lead.id}/stage`, {
        stageId: stage.id,
        version: lead.version,
      });
      await Promise.all([
        client.invalidateQueries({ queryKey: ["leads"] }),
        client.invalidateQueries({ queryKey: ["lead", lead.id] }),
        client.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
      setError("");
      setNotice(`${lead.name} movido para ${stage.name}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      moveLock.current = false;
      setMoving(false);
    }
  }
  async function redistribute() {
    if (!leads.data?.length) return;
    setBusy(true);
    try {
      await send("/assignments", {
        leadIds: leads.data.map((l) => l.id),
        owners: targets,
        reason,
      });
      await client.invalidateQueries();
      setAssign(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Carteira de leads</h1>
          <p>A conversa avança. O próximo passo fica registrado.</p>
        </div>
        {user.role === "ADMIN" && (
          <Button variant="outline" onClick={() => setAssign(!assign)}>
            <SlidersHorizontal size={16} />
            Redistribuir
          </Button>
        )}
      </div>
      <div className="filters">
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label="Pesquisar leads"
            placeholder="Buscar nome, telefone ou e-mail"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {user.role === "ADMIN" && (
          <select
            aria-label="Responsável"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
          >
            <option value="">Todos os responsáveis</option>
            {cats.data?.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        )}
        <select
          aria-label="Prioridade"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
        >
          <option value="">Todas as prioridades</option>
          {cats.data?.catalogs
            .filter((c) => c.type === "PRIORITY")
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
        <select
          aria-label="Situação"
          value={situation}
          onChange={(e) => setSituation(e.target.value)}
        >
          <option value="all">Todas as situações</option>
          <option value="overdue">Retornos atrasados</option>
          <option value="pending">Ainda não trabalhados</option>
          <option value="worked">Trabalhados</option>
          <option value="contacted">Com contato efetivo</option>
        </select>
        <select
          aria-label="Filtrar etapa da carteira"
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
        >
          <option value="">Todas as etapas</option>
          {cats.data?.stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      {params.has("metric") && (
        <div className="operation-notice">
          <p>
            Esta carteira corresponde ao indicador e aos filtros selecionados no
            BI.
          </p>
          <Button variant="outline" size="sm" onClick={() => setParams({})}>
            Ver carteira completa
          </Button>
        </div>
      )}
      {assign && (
        <div className="inline-panel">
          <h2>Redistribuir os {leads.data?.length || 0} leads filtrados</h2>
          <p>
            O histórico de responsáveis será preservado. Confira os filtros
            antes de continuar.
          </p>
          <fieldset>
            <legend>Distribuir igualmente entre</legend>
            <div className="checkbox-list">
              {cats.data?.users
                .filter((u) => u.active && u.role === "FREELANCER")
                .map((u) => (
                  <label key={u.id}>
                    <input
                      type="checkbox"
                      checked={targets.includes(u.id)}
                      onChange={(e) =>
                        setTargets(
                          e.target.checked
                            ? [...targets, u.id]
                            : targets.filter((id) => id !== u.id),
                        )
                      }
                    />
                    {u.name}
                  </label>
                ))}
            </div>
            {!cats.data?.users.some(
              (u) => u.active && u.role === "FREELANCER",
            ) && (
              <p>
                Cadastre as duas freelancers em{" "}
                <a className="text-link" href="/equipe">
                  Equipe → Adicionar pessoa
                </a>
                . O administrador continua vendo todos os leads.
              </p>
            )}
            {targets.length > 0 && (
              <p>
                {leads.data?.length || 0} leads para {targets.length}{" "}
                responsáveis:{" "}
                {Math.floor((leads.data?.length || 0) / targets.length)} para
                cada, com o restante distribuído na ordem de seleção.
              </p>
            )}
          </fieldset>
          <label>
            Justificativa
            <input value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <Button
            disabled={!targets.length || reason.trim().length < 3 || busy}
            onClick={redistribute}
          >
            Confirmar redistribuição
          </Button>
        </div>
      )}
      <ErrorBox error={error || leads.error || cats.error} />
      <p className="board-instruction">
        <GripVertical size={15} /> Arraste um card com o mouse para mudar de
        etapa. No celular, segure a alça. Clique no nome para abrir.
      </p>
      {(notice || moving) && (
        <p className="board-notice" role="status">
          {moving ? "Salvando mudança de etapa…" : notice}
        </p>
      )}
      {leads.isPending ? (
        <Loading />
      ) : !leads.data?.length &&
        !search &&
        !owner &&
        !priority &&
        !stageFilter &&
        !params.has("metric") &&
        situation === "all" ? (
        <Empty title="Sua carteira começa aqui">
          {user.role === "ADMIN"
            ? "Cadastre a equipe e importe a base para distribuir os primeiros leads."
            : "Os leads atribuídos pelo administrador aparecerão nesta carteira."}
        </Empty>
      ) : (
        <DndContext
          sensors={sensors}
          onDragEnd={move}
          onDragStart={(event) => {
            setActiveId(String(event.active.id));
            setNotice("");
            setError("");
          }}
          onDragCancel={() => setActiveId(null)}
        >
          <div className="board" aria-label="Quadro de atendimento">
            {cats.data?.stages
              .filter(
                (s) => s.active || leads.data?.some((l) => l.stageId === s.id),
              )
              .map((stage) => (
                <Column
                  key={stage.id}
                  stage={stage}
                  leads={
                    leads.data?.filter((l) => l.stageId === stage.id) || []
                  }
                  open={open}
                  disabled={moving}
                />
              ))}
          </div>
          {createPortal(
            <DragOverlay dropAnimation={null}>
              {activeId && leads.data?.find((lead) => lead.id === activeId) && (
                <article className="lead-card drag-preview" aria-hidden="true">
                  <CardContent
                    lead={leads.data.find((lead) => lead.id === activeId)!}
                    onOpen={() => {}}
                  />
                </article>
              )}
            </DragOverlay>,
            document.body,
          )}
        </DndContext>
      )}
      {params.get("lead") && cats.data && (
        <LeadDrawer
          key={`${params.get("lead")}-${dropStage}`}
          id={params.get("lead")!}
          initialStage={dropStage}
          catalogs={cats.data}
          user={user}
          onClose={() => {
            setDropIntent(null);
            setParams((previous) => {
              const next = new URLSearchParams(previous);
              next.delete("lead");
              return next;
            });
          }}
        />
      )}
    </>
  );
}
