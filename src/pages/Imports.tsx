import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, Upload } from "lucide-react";
import { api, fmt, send } from "../lib/api";
import type { Catalogs } from "../types";
import { Empty, ErrorBox } from "../App";
import { Button } from "../components/ui/button";
type Preview = {
  id: string;
  report: { total: number; blank: number; valid: number; review: number };
  rows: {
    row: number;
    name: string;
    phone: string | null;
    email: string | null;
    issues: string[];
  }[];
};
type Source = {
  fileName: string;
  base64: string;
  headers: string[];
  sample: { row: number; original: Record<string, string> }[];
  total: number;
};
export function Imports() {
  const client = useQueryClient();
  const cats = useQuery<Catalogs>({
    queryKey: ["catalogs"],
    queryFn: () => api("/catalogs"),
  });
  const batches = useQuery<any[]>({
    queryKey: ["imports"],
    queryFn: () => api("/imports"),
  });
  const [source, setSource] = useState<Source>();
  const [preview, setPreview] = useState<Preview>();
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [phones, setPhones] = useState<string[]>([]);
  const [owners, setOwners] = useState<string[]>([]);
  const [unassigned, setUnassigned] = useState(false);
  const [includeReview, setIncludeReview] = useState(false);
  const [reviewReason, setReviewReason] = useState("");
  const [exclusions, setExclusions] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function load(file?: File) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError("O arquivo deve ter até 10 MB.");
      return;
    }
    setBusy(true);
    setError("");
    setPreview(undefined);
    setNotice("");
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const data = await send("/imports/preview", {
        fileName: file.name,
        base64,
      });
      setSource({ ...data, fileName: file.name, base64 });
      const choose = (names: string[]) =>
        names.find((n) => data.headers.includes(n)) || "";
      setMapping({
        name: choose(["Nome", "name"]),
        email: choose(["Email", "E-mail", "email"]),
        source: choose(["Origem", "source"]),
        originalId: data.headers[0] || "",
      });
      setPhones(
        ["WhatsApp", "Celular", "Telefone"].filter((n) =>
          data.headers.includes(n),
        ),
      );
      setExclusions({});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function analyze() {
    if (!source) return;
    setBusy(true);
    setError("");
    try {
      const data = await send("/imports/preview", {
        fileName: source.fileName,
        base64: source.base64,
        mapping: {
          ...Object.fromEntries(Object.entries(mapping).filter(([, v]) => v)),
          phone: phones,
        },
      });
      setPreview(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      const result = await send(`/imports/${preview.id}/confirm`, {
        owners,
        unassigned,
        includeReview,
        reviewReason: includeReview ? reviewReason : undefined,
        excluded: Object.entries(exclusions).map(([row, reason]) => ({
          row: Number(row),
          reason,
        })),
      });
      setNotice(
        `${result.report.imported} leads importados. Distribuição e justificativas registradas no lote.`,
      );
      setSource(undefined);
      setPreview(undefined);
      await client.invalidateQueries();
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
          <h1>Importação de leads</h1>
          <p>
            Confira a fonte, revise os dados e distribua com rastreabilidade.
          </p>
        </div>
      </div>
      <ErrorBox error={error || batches.error} />
      {notice && (
        <p className="success-box" role="status">
          {notice}
        </p>
      )}
      <section className="upload-zone">
        <FileSpreadsheet size={30} />
        <h2>Comece pela base original</h2>
        <p>CSV UTF-8 ou XLSX · até 10 MB e 10 mil registros</p>
        <label className="upload-label">
          <Upload size={16} />
          {busy ? "Processando…" : "Selecionar arquivo"}
          <input
            aria-label="Arquivo de leads"
            disabled={busy}
            type="file"
            accept=".csv,.xlsx"
            onChange={(e) => load(e.target.files?.[0])}
          />
        </label>
      </section>
      {source && !preview && (
        <section className="panel mapping-panel">
          <h2>Mapear campos</h2>
          <p>
            {source.fileName} · {source.total} linhas após o cabeçalho
          </p>
          <div className="form-grid">
            {[
              ["name", "Nome *"],
              ["email", "E-mail"],
              ["source", "Origem"],
              ["originalId", "Identificador original"],
            ].map(([key, label]) => (
              <label key={key}>
                {label}
                <select
                  value={mapping[key] || ""}
                  onChange={(e) =>
                    setMapping({ ...mapping, [key]: e.target.value })
                  }
                >
                  <option value="">Não mapear</option>
                  {source.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <fieldset>
            <legend>Telefones · ordem de preferência</legend>
            <p className="muted">
              {phones.length
                ? phones.join(" → ")
                : "Selecione ao menos uma coluna."}
            </p>
            <div className="checkbox-list">
              {source.headers.map((h) => (
                <label key={h}>
                  <input
                    type="checkbox"
                    checked={phones.includes(h)}
                    onChange={(e) =>
                      setPhones(
                        e.target.checked
                          ? [...phones, h]
                          : phones.filter((p) => p !== h),
                      )
                    }
                  />
                  {h}
                </label>
              ))}
            </div>
          </fieldset>
          <details>
            <summary>Pré-visualizar primeiras linhas</summary>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {source.headers.map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {source.sample.map((s) => (
                    <tr key={s.row}>
                      {source.headers.map((h) => (
                        <td key={h}>{s.original[h]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <Button
            disabled={busy || !mapping.name || !phones.length}
            onClick={analyze}
          >
            Validar e revisar base
          </Button>
        </section>
      )}
      {preview && (
        <section className="panel mapping-panel">
          <h2>Revisão do lote</h2>
          <div className="import-summary">
            <span>
              <strong>{preview.report.total}</strong> linhas
            </span>
            <span>
              <strong>{preview.report.valid}</strong> válidas
            </span>
            <span>
              <strong>{preview.report.review}</strong> para revisão
            </span>
            <span>
              <strong>{preview.report.blank}</strong> vazias
            </span>
          </div>
          <p>
            Corrija inconsistências no arquivo e envie novamente, ou justifique
            cada exclusão. Nenhuma linha com alerta será descartada
            automaticamente.
          </p>
          <label className="check-label">
            <input
              type="checkbox"
              checked={includeReview}
              onChange={(e) => setIncludeReview(e.target.checked)}
            />
            Preservar telefones ou e-mails com alerta e importar para revisão
          </label>
          {includeReview && (
            <label>
              Justificativa para preservar os alertas
              <input
                value={reviewReason}
                onChange={(e) => setReviewReason(e.target.value)}
                minLength={3}
              />
            </label>
          )}
          <label className="check-label">
            <input
              type="checkbox"
              checked={unassigned}
              onChange={(e) => {
                setUnassigned(e.target.checked);
                if (e.target.checked) setOwners([]);
              }}
            />
            Importar sem responsável e distribuir depois
          </label>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Linha</th>
                  <th>Nome</th>
                  <th>Telefone</th>
                  <th>Diagnóstico</th>
                  <th>Justificar exclusão</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows
                  .filter((r) => r.issues.length)
                  .map((r) => (
                    <tr key={r.row}>
                      <td>{r.row}</td>
                      <td>{r.name}</td>
                      <td>{r.phone || "Inválido"}</td>
                      <td>{r.issues.join("; ")}</td>
                      <td>
                        <input
                          aria-label={`Justificativa para excluir linha ${r.row}`}
                          value={exclusions[r.row] || ""}
                          onChange={(e) => {
                            const next = { ...exclusions };
                            if (e.target.value) next[r.row] = e.target.value;
                            else delete next[r.row];
                            setExclusions(next);
                          }}
                        />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <details>
            <summary>
              Conferir todos os registros ({preview.rows.length})
            </summary>
            <div className="table-scroll import-rows">
              <table>
                <thead>
                  <tr>
                    <th>Linha</th>
                    <th>Nome</th>
                    <th>Telefone</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.row}>
                      <td>{r.row}</td>
                      <td>{r.name}</td>
                      <td>{r.phone}</td>
                      <td>{r.issues.length ? "Revisar" : "Válido"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <fieldset>
            <legend>
              Distribuir entre freelancers · seleção define a ordem
            </legend>
            <div className="checkbox-list">
              {cats.data?.users
                .filter((u) => u.active && u.role === "FREELANCER")
                .map((u) => (
                  <label key={u.id}>
                    <input
                      type="checkbox"
                      checked={owners.includes(u.id)}
                      disabled={unassigned}
                      onChange={(e) =>
                        setOwners(
                          e.target.checked
                            ? [...owners, u.id]
                            : owners.filter((id) => id !== u.id),
                        )
                      }
                    />
                    {u.name}
                    {owners.includes(u.id)
                      ? ` (${owners.indexOf(u.id) + 1}º)`
                      : ""}
                  </label>
                ))}
            </div>
            {!cats.data?.users.some(
              (u) => u.active && u.role === "FREELANCER",
            ) && <p>Cadastre as freelancers na área Equipe.</p>}
          </fieldset>
          <p>
            <strong>
              {preview.rows.length - Object.keys(exclusions).length} registros
              selecionados.
            </strong>{" "}
            A distribuição alterna os responsáveis na ordem escolhida e preserva
            a sequência da fonte.
          </p>
          <div className="row-actions">
            <Button
              disabled={
                busy ||
                (!owners.length && !unassigned) ||
                (includeReview && reviewReason.trim().length < 3) ||
                (!includeReview &&
                  preview.rows.some(
                    (r) =>
                      r.issues.length &&
                      (exclusions[r.row]?.trim().length || 0) < 3,
                  ))
              }
              onClick={confirm}
            >
              {busy ? "Confirmando…" : "Confirmar importação e distribuição"}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setPreview(undefined)}
            >
              Voltar ao mapeamento
            </Button>
          </div>
        </section>
      )}
      <section className="panel">
        <header>
          <h2>Lotes de importação</h2>
        </header>
        {!batches.data?.length ? (
          <Empty title="Nenhum lote registrado">
            As prévias e confirmações ficarão disponíveis aqui.
          </Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Arquivo</th>
                  <th>Criado em</th>
                  <th>Situação</th>
                  <th>Relatório</th>
                </tr>
              </thead>
              <tbody>
                {batches.data.map((b) => (
                  <tr key={b.id}>
                    <td>{b.fileName}</td>
                    <td>{fmt(b.createdAt)}</td>
                    <td>
                      {b.status === "CONFIRMED" ? "Confirmado" : "Prévia"}
                    </td>
                    <td>
                      <details>
                        <summary>Ver relatório</summary>
                        <pre>{JSON.stringify(b.report, null, 2)}</pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
