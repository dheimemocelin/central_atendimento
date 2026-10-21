import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Brush,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowRight, ArrowUpRight, Clock3 } from "lucide-react";
import { api, dayKey, percent } from "../lib/api";
import type { Catalogs, User } from "../types";
import { Empty, ErrorBox, Loading } from "../App";
import { Button } from "../components/ui/button";
type Report = {
  asOf: string;
  metrics: Record<string, number>;
  daily: {
    day: string;
    attempts: number;
    contacts: number;
    conversions: number;
  }[];
  funnel: { id: string; name: string; count: number }[];
  byOwner: {
    id: string;
    name: string;
    assigned: number;
    worked: number;
    coverage: number;
    attempts: number;
    converted: number;
  }[];
  lossReasons: { name: string; count: number }[];
  basis: string;
};
const labels: [string, string][] = [
  ["total", "Total de leads"],
  ["assigned", "Atribuídos"],
  ["worked", "Trabalhados"],
  ["pending", "Pendentes"],
  ["attempts", "Tentativas no período"],
  ["contacted", "Contatos efetivos"],
  ["noResponse", "Sem resposta"],
  ["converted", "Convertidos"],
  ["lost", "Perdidos"],
  ["scheduled", "Retornos agendados"],
  ["overdue", "Retornos atrasados"],
];
function Plot({
  data,
  value,
  name,
  bar = false,
  onPick,
}: {
  data: Record<string, any>[];
  value: string;
  name: string;
  bar?: boolean;
  onPick?: (row: Record<string, any>) => void;
}) {
  if (!data.length)
    return (
      <div className="chart-empty">
        Os registros do período formarão este gráfico.
      </div>
    );
  const children = (
    <>
      <CartesianGrid vertical={false} stroke="var(--line)" />
      <XAxis
        dataKey={bar ? "name" : "day"}
        tick={{ fontSize: 11 }}
        tickLine={false}
        axisLine={false}
      />
      <YAxis
        allowDecimals={false}
        tick={{ fontSize: 11 }}
        tickLine={false}
        axisLine={false}
        width={30}
      />
      <Tooltip />
      {!bar && data.length > 1 && (
        <Brush
          dataKey="day"
          height={20}
          stroke="var(--accent)"
          travellerWidth={8}
        />
      )}
      {bar ? (
        <Bar
          dataKey={value}
          name={name}
          fill="var(--accent)"
          radius={[3, 3, 0, 0]}
          onClick={(entry) => onPick?.((entry as any).payload)}
          cursor={onPick ? "pointer" : "default"}
        />
      ) : (
        <Area
          dataKey={value}
          name={name}
          stroke="var(--accent)"
          fill="var(--accent-soft)"
          strokeWidth={2}
        />
      )}
    </>
  );
  return (
    <>
      <div className="chart">
        <ResponsiveContainer width="100%" height="100%">
          {bar ? (
            <BarChart data={data}>{children}</BarChart>
          ) : (
            <AreaChart data={data}>{children}</AreaChart>
          )}
        </ResponsiveContainer>
      </div>
      <details className="chart-data">
        <summary>Ver dados do gráfico</summary>
        <table>
          <thead>
            <tr>
              <th>Referência</th>
              <th>{name}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d, i) => (
              <tr key={i}>
                <td>
                  {onPick ? (
                    <button className="text-link" onClick={() => onPick(d)}>
                      {d.day || d.name}
                    </button>
                  ) : (
                    d.day || d.name
                  )}
                </td>
                <td>{d[value]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}
export function Dashboard({ user }: { user: User }) {
  const navigate = useNavigate();
  const [period, setPeriod] = useState("all");
  const [series, setSeries] = useState("attempts");
  const seriesLabels: Record<string, string> = {
    attempts: "Tentativas",
    contacts: "Contatos efetivos",
    conversions: "Conversões",
  };
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [owner, setOwner] = useState("");
  const [stage, setStage] = useState("");
  const [result, setResult] = useState("");
  const cats = useQuery<Catalogs>({
    queryKey: ["catalogs"],
    queryFn: () => api("/catalogs"),
  });
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({
    from,
    to,
    ownerId: owner,
    stageId: stage,
    resultId: result,
  }))
    if (v) q.set(k, v);
  const report = useQuery<Report>({
    queryKey: ["dashboard", q.toString()],
    queryFn: () => api("/dashboard?" + q),
  });
  const r = report.data;
  function choosePeriod(days: number) {
    setPeriod(days ? String(days) : "all");
    setFrom(days ? dayKey(new Date(Date.now() - (days - 1) * 86400000)) : "");
    setTo(days ? dayKey(new Date()) : "");
  }
  function openPortfolio(filters: Record<string, string> = {}) {
    const search = new URLSearchParams({
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(result ? { resultId: result } : {}),
      ...(r?.asOf ? { asOf: r.asOf } : {}),
      ...(owner ? { owner } : {}),
      ...(stage ? { stage } : {}),
      ...filters,
    });
    navigate("/carteira?" + search);
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Visão geral</h1>
          <p>O ritmo da operação, com cada atendimento no lugar.</p>
        </div>
        <Button asChild variant="outline">
          <Link to="/carteira">
            Abrir carteira
            <ArrowUpRight size={16} />
          </Link>
        </Button>
      </div>
      <div className="bi-toolbar">
        <div className="period-shortcuts" aria-label="Atalhos de período">
          {[
            ["all", "Todo o período"],
            ["7", "7 dias"],
            ["30", "30 dias"],
            ["90", "90 dias"],
          ].map(([key, name]) => (
            <button
              key={key}
              aria-pressed={period === key}
              className={period === key ? "active" : ""}
              onClick={() => choosePeriod(key === "all" ? 0 : Number(key))}
            >
              {name}
            </button>
          ))}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            choosePeriod(0);
            setOwner("");
            setStage("");
            setResult("");
          }}
        >
          Limpar filtros
        </Button>
      </div>
      <div className="filters report-filters">
        <label>
          De
          <input
            aria-label="Data inicial"
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPeriod("custom");
            }}
          />
        </label>
        <label>
          Até
          <input
            aria-label="Data final"
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPeriod("custom");
            }}
          />
        </label>
        {user.role === "ADMIN" && (
          <select
            aria-label="Freelancer"
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
        <select
          aria-label="Etapa"
          value={stage}
          onChange={(e) => setStage(e.target.value)}
        >
          <option value="">Todas as etapas</option>
          {cats.data?.stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Resultado"
          value={result}
          onChange={(e) => setResult(e.target.value)}
        >
          <option value="">Todos os resultados</option>
          {cats.data?.catalogs
            .filter((c) => c.type === "RESULT")
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
      </div>
      <ErrorBox error={report.error} />
      {report.isPending && <Loading />}
      {r && (
        <>
          {!r.metrics.total && (
            <Empty title="A operação ainda não começou">
              {user.role === "ADMIN" ? (
                <Link to="/importacao">
                  Importe a base para começar a acompanhar os atendimentos.
                </Link>
              ) : (
                "Sua carteira aparecerá aqui após a distribuição dos leads."
              )}
            </Empty>
          )}
          {user.role === "ADMIN" && r.metrics.total > r.metrics.assigned && (
            <div className="operation-notice">
              <p>
                <strong>
                  {r.metrics.total - r.metrics.assigned} leads aguardam
                  distribuição.
                </strong>{" "}
                Você tem acesso a toda a base. Cadastre a equipe e selecione as
                responsáveis na carteira.
              </p>
              <Button variant="outline" size="sm" asChild>
                <Link to="/equipe">Cadastrar freelancers</Link>
              </Button>
            </div>
          )}
          <section className="metric-strip" aria-label="Indicadores principais">
            {[
              ["total", "Leads na operação"],
              ["worked", "Leads trabalhados"],
              ["contacted", "Contatos efetivos"],
              ["converted", "Convertidos"],
            ].map(([key, label]) => (
              <div key={key}>
                <span>{label}</span>
                <strong>{r.metrics[key].toLocaleString("pt-BR")}</strong>
                <small>
                  {key === "total"
                    ? `${r.metrics.assigned} atribuídos`
                    : key === "worked"
                      ? `${r.metrics.pending} aguardando primeira tentativa`
                      : key === "contacted"
                        ? `${percent(r.metrics.contactRate)} de contato`
                        : `${percent(r.metrics.conversionRate)} de conversão`}
                </small>
                <button
                  className="metric-drill"
                  onClick={() => openPortfolio({ metric: key })}
                  aria-label={`Ver leads: ${label}`}
                >
                  Ver leads
                  <ArrowRight size={12} />
                </button>
              </div>
            ))}
          </section>
          <div className="dashboard-grid">
            <section className="panel activity-panel">
              <header>
                <div>
                  <h2>Evolução dos atendimentos</h2>
                  <p>
                    Selecione o indicador; arraste a faixa para explorar o
                    período
                  </p>
                </div>
                <select
                  aria-label="Indicador do gráfico de evolução"
                  value={series}
                  onChange={(e) => setSeries(e.target.value)}
                >
                  {Object.entries(seriesLabels).map(([key, name]) => (
                    <option key={key} value={key}>
                      {name}
                    </option>
                  ))}
                </select>
              </header>
              <Plot data={r.daily} value={series} name={seriesLabels[series]} />
            </section>
            <section className="panel">
              <header>
                <div>
                  <h2>Funil comercial</h2>
                  <p>Distribuição atual por etapa</p>
                </div>
              </header>
              <div className="funnel">
                {r.funnel.map((s, i) => (
                  <button
                    type="button"
                    key={s.id}
                    className={
                      stage === s.id ? "funnel-step active" : "funnel-step"
                    }
                    aria-label={`Filtrar etapa ${s.name}`}
                    aria-pressed={stage === s.id}
                    onClick={() => setStage(stage === s.id ? "" : s.id)}
                  >
                    <span>{s.name}</span>
                    <strong>{s.count}</strong>
                    <span className="funnel-track">
                      <i
                        style={{
                          width: `${r.metrics.total ? (s.count / r.metrics.total) * 100 : 0}%`,
                          opacity: 1 - i * 0.09,
                        }}
                      />
                    </span>
                  </button>
                ))}
              </div>
            </section>
            <section className="panel wide">
              <header>
                <div>
                  <h2>Carteiras e produtividade</h2>
                  <p>Cobertura da carteira atual e atividade no período</p>
                </div>
                <Link to="/agenda" className="text-link">
                  <Clock3 size={15} />
                  {r.metrics.overdue} retornos atrasados
                  <ArrowRight size={14} />
                </Link>
              </header>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Freelancer</th>
                      <th>Atribuídos</th>
                      <th>Trabalhados</th>
                      <th>Tentativas</th>
                      <th>Convertidos</th>
                      <th>Cobertura</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.byOwner.map((u) => (
                      <tr key={u.name}>
                        <td>
                          <button
                            className="text-link"
                            aria-pressed={owner === u.id}
                            onClick={() => setOwner(owner === u.id ? "" : u.id)}
                          >
                            {u.name}
                          </button>
                        </td>
                        <td>{u.assigned}</td>
                        <td>{u.worked}</td>
                        <td>{u.attempts}</td>
                        <td>{u.converted}</td>
                        <td>
                          <span className="coverage">
                            <i style={{ width: `${u.coverage * 100}%` }} />
                          </span>
                          {percent(u.coverage)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!r.byOwner.length && (
                  <p className="muted table-empty">
                    Cadastre a equipe para acompanhar as carteiras.
                  </p>
                )}
              </div>
            </section>
            <section className="panel">
              <header>
                <div>
                  <h2>Conversões ao longo do tempo</h2>
                  <p>Eventos de conversão no período</p>
                </div>
              </header>
              <Plot data={r.daily} value="conversions" name="Conversões" />
            </section>
            <section className="panel">
              <header>
                <div>
                  <h2>Motivos de perda</h2>
                  <p>Leads atualmente encerrados</p>
                </div>
              </header>
              <Plot data={r.lossReasons} value="count" name="Perdas" bar />
            </section>
            <section className="panel">
              <header>
                <div>
                  <h2>Comparativo entre freelancers</h2>
                  <p>Tentativas registradas por autor</p>
                </div>
              </header>
              <Plot
                data={r.byOwner}
                value="attempts"
                name="Tentativas"
                bar
                onPick={(row) => setOwner(owner === row.id ? "" : row.id)}
              />
            </section>
            <section className="panel">
              <header>
                <div>
                  <h2>Produtividade por período</h2>
                  <p>Interações com contato real</p>
                </div>
              </header>
              <Plot
                data={r.daily}
                value="contacts"
                name="Contatos no período"
              />
            </section>
          </div>
          <section className="metrics-detail">
            <h2>Indicadores da operação</h2>
            <dl>
              {labels.map(([key, label]) => (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd>{r.metrics[key]}</dd>
                </div>
              ))}
              {[
                ["contactRate", "Taxa de contato"],
                ["conversionRate", "Taxa de conversão"],
                ["coverage", "Cobertura"],
              ].map(([key, label]) => (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd>{percent(r.metrics[key])}</dd>
                </div>
              ))}
            </dl>
          </section>
          <p className="report-basis">{r.basis}</p>
        </>
      )}
    </>
  );
}
