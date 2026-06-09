import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  Database, Edit2, KeyRound, Loader2, Plus,
  RefreshCw, Search, Table2, Trash2, X, AlertTriangle,
  ChevronsUpDown,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { apiDelete, apiGet, apiPost, apiPut, isApiError } from "@/api/client";

/* ── types ──────────────────────────────────────────────────────────────── */
interface ColDef {
  name: string;
  type: string;
  full_type: string;
  nullable: "YES" | "NO";
  default_val: string | null;
  key_type: "PRI" | "UNI" | "MUL" | "";
  extra: string;
  max_len: number | null;
}

interface TableInfo {
  name: string;
  approx_rows: number;
  size_kb: number;
  comment: string | null;
}

interface RowData { [col: string]: unknown }

interface RowsResponse {
  rows: RowData[];
  total: number;
  limit: number;
  offset: number;
  schema: ColDef[];
}

type SortDir = "ASC" | "DESC";

/* ── helpers ─────────────────────────────────────────────────────────────── */
function pkOf(schema: ColDef[]): ColDef[] {
  const pks = schema.filter(c => c.key_type === "PRI");
  return pks.length ? pks : schema.slice(0, 1); // fallback: first col
}

function pkKey(row: RowData, schema: ColDef[]): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const c of pkOf(schema)) obj[c.name] = row[c.name];
  return obj;
}

function fmtValue(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function truncate(s: string, n = 80) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function isIntType(t: string) {
  return ["int","tinyint","smallint","mediumint","bigint"].includes(t.toLowerCase());
}
function isDateType(t: string) {
  return ["date","datetime","timestamp","time","year"].includes(t.toLowerCase());
}

function inputType(col: ColDef): string {
  if (isIntType(col.type)) return "number";
  if (isDateType(col.type)) return "text";
  return "text";
}

/* ── cell ────────────────────────────────────────────────────────────────── */
function Cell({ value }: { value: unknown }) {
  const [expanded, setExpanded] = useState(false);
  if (value === null || value === undefined) {
    return <span className="text-white/20 italic text-xs">NULL</span>;
  }
  const str = fmtValue(value);
  if (str.length <= 80) return <span className="text-white/80 text-xs font-mono">{str}</span>;
  return (
    <span className="text-white/80 text-xs font-mono">
      {expanded ? str : truncate(str)}
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="ml-1 text-blue-400/70 hover:text-blue-400 text-[10px] underline"
      >
        {expanded ? "moins" : "plus"}
      </button>
    </span>
  );
}

/* ── row form (edit + add) ───────────────────────────────────────────────── */
function RowModal({
  schema,
  initial,
  title,
  onClose,
  onSave,
}: {
  schema: ColDef[];
  initial: RowData | null;
  title: string;
  onClose: () => void;
  onSave: (data: RowData) => Promise<string | null>;
}) {
  const [form, setForm] = useState<RowData>(() => {
    const base: RowData = {};
    for (const c of schema) {
      base[c.name] = initial ? (initial[c.name] ?? "") : (c.default_val ?? "");
    }
    return base;
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setErr(null);
    const error = await onSave(form);
    setSaving(false);
    if (error) setErr(error);
    else onClose();
  }

  const isEdit = initial !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[#0f1117] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.07]">
          <h2 className="font-bold text-sm tracking-wide">{title}</h2>
          <button type="button" onClick={onClose} className="text-white/40 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* fields */}
        <div className="overflow-y-auto p-6 space-y-3 flex-1">
          {schema.map(col => {
            const isAutoInc = col.extra === "auto_increment";
            const isPK = col.key_type === "PRI";
            const isLong = ["text","mediumtext","longtext"].includes(col.type.toLowerCase());
            const val = String(form[col.name] ?? "");
            return (
              <div key={col.name} className="flex gap-3 items-start">
                <div className="w-44 flex-shrink-0 pt-2">
                  <div className="flex items-center gap-1.5">
                    {isPK && <KeyRound size={11} className="text-amber-400/70" />}
                    <span className="text-xs font-semibold text-white/60 font-mono truncate">{col.name}</span>
                  </div>
                  <span className="text-[10px] text-white/30">{col.full_type}</span>
                </div>
                <div className="flex-1">
                  {isLong ? (
                    <textarea
                      rows={3}
                      disabled={isAutoInc}
                      value={val}
                      onChange={e => setForm(f => ({ ...f, [col.name]: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white/85 text-xs font-mono resize-y focus:outline-none focus:border-blue-500/50 disabled:opacity-30 disabled:cursor-not-allowed"
                    />
                  ) : (
                    <input
                      type={inputType(col)}
                      disabled={isAutoInc || (isEdit && isPK)}
                      value={val}
                      onChange={e => setForm(f => ({ ...f, [col.name]: e.target.value }))}
                      placeholder={col.nullable === "YES" ? "NULL" : ""}
                      className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white/85 text-xs font-mono focus:outline-none focus:border-blue-500/50 disabled:opacity-30 disabled:cursor-not-allowed"
                    />
                  )}
                  {isAutoInc && <p className="text-[10px] text-white/25 mt-0.5">auto increment</p>}
                  {isEdit && isPK && !isAutoInc && <p className="text-[10px] text-white/25 mt-0.5">clé primaire — non modifiable</p>}
                </div>
              </div>
            );
          })}
        </div>

        {/* footer */}
        <div className="px-6 py-4 border-t border-white/[0.07] flex items-center justify-between gap-3">
          {err ? (
            <span className="text-xs text-red-400 flex items-center gap-1.5">
              <AlertTriangle size={13} />{err}
            </span>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-full text-sm font-semibold text-white/50 hover:text-white hover:bg-white/[0.06] transition-all">
              Annuler
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 rounded-full bg-blue-600/80 hover:bg-blue-600 border border-blue-500/40 text-white text-sm font-semibold transition-all disabled:opacity-50"
            >
              {saving && <Loader2 size={13} className="animate-spin" />}
              {isEdit ? "Enregistrer" : "Insérer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── delete confirm ──────────────────────────────────────────────────────── */
function DeleteModal({
  row,
  schema,
  onClose,
  onConfirm,
}: {
  row: RowData;
  schema: ColDef[];
  onClose: () => void;
  onConfirm: () => Promise<string | null>;
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function confirm() {
    setLoading(true);
    const e = await onConfirm();
    setLoading(false);
    if (e) setErr(e);
    else onClose();
  }

  const pks = pkOf(schema);
  const preview = pks.map(c => `${c.name}=${fmtValue(row[c.name])}`).join(", ");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[#0f1117] border border-red-500/20 rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center flex-shrink-0">
            <Trash2 size={18} className="text-red-400" />
          </div>
          <div>
            <p className="font-bold text-sm">Supprimer cette ligne ?</p>
            <p className="text-white/40 text-xs mt-0.5 font-mono">{preview}</p>
          </div>
        </div>
        <p className="text-white/50 text-xs">Cette action est irréversible.</p>
        {err && <p className="text-xs text-red-400 flex items-center gap-1"><AlertTriangle size={12}/>{err}</p>}
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-full text-sm font-semibold text-white/50 hover:text-white hover:bg-white/[0.06] transition-all">
            Annuler
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2 rounded-full bg-red-600/70 hover:bg-red-600 border border-red-500/40 text-white text-sm font-semibold transition-all disabled:opacity-50"
          >
            {loading && <Loader2 size={13} className="animate-spin" />}
            Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── main component ──────────────────────────────────────────────────────── */
export function DatabaseAdmin() {
  const nav = useNavigate();

  const [tables, setTables] = useState<TableInfo[]>([]);
  const [tablesLoading, setTablesLoading] = useState(true);
  const [tableSearch, setTableSearch] = useState("");

  const [selected, setSelected] = useState<string | null>(null);
  const [schema, setSchema] = useState<ColDef[]>([]);
  const [rows, setRows] = useState<RowData[]>([]);
  const [total, setTotal] = useState(0);
  const [rowsLoading, setRowsLoading] = useState(false);

  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [draftSearch, setDraftSearch] = useState("");
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("ASC");

  const [editRow, setEditRow] = useState<RowData | null>(null);
  const [addRow, setAddRow] = useState(false);
  const [deleteRow, setDeleteRow] = useState<RowData | null>(null);

  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(text: string, ok = true) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ text, ok });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }

  // ── load tables ────────────────────────────────────────────────────────────
  const loadTables = useCallback(async () => {
    setTablesLoading(true);
    try {
      const data = await apiGet<TableInfo[]>("/api/admin/db/tables");
      setTables(data);
    } catch (e) {
      if (isApiError(e) && (e.status === 401 || e.status === 403)) {
        nav("/admin/login", { replace: true });
      }
    } finally {
      setTablesLoading(false);
    }
  }, [nav]);

  useEffect(() => { loadTables(); }, [loadTables]);

  // ── load rows ──────────────────────────────────────────────────────────────
  const loadRows = useCallback(async (table: string, off = 0, q = "", sc: string | null = null, sd: SortDir = "ASC") => {
    if (!table) return;
    setRowsLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(off),
        ...(q   ? { search: q   } : {}),
        ...(sc  ? { sort: sc, dir: sd } : {}),
      });
      const data = await apiGet<RowsResponse>(`/api/admin/db/${encodeURIComponent(table)}/rows?${params}`);
      setRows(data.rows);
      setTotal(data.total);
      setSchema(data.schema);
    } catch {
      setRows([]);
    } finally {
      setRowsLoading(false);
    }
  }, [limit]);

  function selectTable(name: string) {
    setSelected(name);
    setOffset(0);
    setSearch("");
    setDraftSearch("");
    setSortCol(null);
    setSortDir("ASC");
    loadRows(name, 0, "", null, "ASC");
  }

  function applySearch() {
    setSearch(draftSearch);
    setOffset(0);
    if (selected) loadRows(selected, 0, draftSearch, sortCol, sortDir);
  }

  function toggleSort(col: string) {
    const next: SortDir = sortCol === col && sortDir === "ASC" ? "DESC" : "ASC";
    setSortCol(col);
    setSortDir(next);
    if (selected) loadRows(selected, offset, search, col, next);
  }

  function goPage(dir: 1 | -1) {
    const next = Math.max(0, offset + dir * limit);
    setOffset(next);
    if (selected) loadRows(selected, next, search, sortCol, sortDir);
  }

  // ── mutations ──────────────────────────────────────────────────────────────
  async function doInsert(data: RowData): Promise<string | null> {
    if (!selected) return "Aucune table sélectionnée";
    try {
      await apiPost(`/api/admin/db/${encodeURIComponent(selected)}/row`, { data });
      showToast("Ligne insérée");
      loadRows(selected, offset, search, sortCol, sortDir);
      loadTables();
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Erreur";
    }
  }

  async function doUpdate(data: RowData, originalRow: RowData): Promise<string | null> {
    if (!selected) return "Aucune table sélectionnée";
    try {
      const pk  = pkKey(originalRow, schema);
      const set = Object.fromEntries(Object.entries(data).filter(([k]) => !Object.prototype.hasOwnProperty.call(pk, k)));
      await apiPut(`/api/admin/db/${encodeURIComponent(selected)}/row`, { pk, set });
      showToast("Ligne modifiée");
      loadRows(selected, offset, search, sortCol, sortDir);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Erreur";
    }
  }

  async function doDelete(row: RowData): Promise<string | null> {
    if (!selected) return "Aucune table sélectionnée";
    try {
      const pk = pkKey(row, schema);
      await apiDelete(`/api/admin/db/${encodeURIComponent(selected)}/row`, { pk });
      showToast("Ligne supprimée");
      loadRows(selected, offset, search, sortCol, sortDir);
      loadTables();
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Erreur";
    }
  }

  const filteredTables = tables.filter(t =>
    t.name.toLowerCase().includes(tableSearch.toLowerCase())
  );
  const pages = Math.ceil(total / limit);
  const page  = Math.floor(offset / limit) + 1;

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-4rem)] overflow-hidden">

        {/* ── sidebar ─────────────────────────────────────────────────────── */}
        <aside className="w-60 flex-shrink-0 border-r border-white/[0.06] flex flex-col bg-white/[0.01]">
          <div className="p-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-2 mb-2">
              <Database size={14} className="text-blue-400" />
              <span className="text-xs font-bold tracking-wider uppercase text-white/60">Tables</span>
              <button type="button" onClick={loadTables} className="ml-auto text-white/30 hover:text-white transition-colors">
                <RefreshCw size={12} />
              </button>
            </div>
            <input
              type="text"
              value={tableSearch}
              onChange={e => setTableSearch(e.target.value)}
              placeholder="Filtrer…"
              className="w-full px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.07] text-xs text-white/80 placeholder-white/25 focus:outline-none focus:border-blue-500/40"
            />
          </div>
          <div className="overflow-y-auto flex-1 py-1">
            {tablesLoading ? (
              <div className="flex justify-center py-8"><Loader2 size={16} className="animate-spin text-white/30" /></div>
            ) : filteredTables.map(t => (
              <button
                key={t.name}
                type="button"
                onClick={() => selectTable(t.name)}
                className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors hover:bg-white/[0.04] ${selected === t.name ? 'bg-blue-600/15 text-blue-300' : 'text-white/60'}`}
              >
                <Table2 size={12} className="flex-shrink-0 opacity-60" />
                <span className="text-xs font-mono truncate flex-1">{t.name}</span>
                <span className="text-[10px] text-white/25 flex-shrink-0">{t.approx_rows?.toLocaleString() ?? '?'}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* ── main ────────────────────────────────────────────────────────── */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-white/30">
                <Database size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">Sélectionne une table</p>
              </div>
            </div>
          ) : (
            <>
              {/* toolbar */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06] flex-shrink-0">
                <span className="font-bold text-sm font-mono text-white/90">{selected}</span>
                {!rowsLoading && <span className="text-xs text-white/35">{total.toLocaleString()} lignes</span>}
                {rowsLoading && <Loader2 size={13} className="animate-spin text-white/30" />}
                <div className="flex-1" />
                {/* search */}
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30" />
                    <input
                      type="text"
                      value={draftSearch}
                      onChange={e => setDraftSearch(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && applySearch()}
                      placeholder="Rechercher…"
                      className="pl-8 pr-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-xs text-white/80 placeholder-white/25 focus:outline-none focus:border-blue-500/40 w-48"
                    />
                  </div>
                  <button type="button" onClick={applySearch} className="px-3 py-1.5 rounded-full bg-white/[0.05] border border-white/[0.08] text-xs text-white/60 hover:text-white hover:bg-white/[0.08] transition-all">
                    OK
                  </button>
                  {search && (
                    <button type="button" onClick={() => { setDraftSearch(""); setSearch(""); setOffset(0); loadRows(selected, 0, "", sortCol, sortDir); }} className="text-white/30 hover:text-white transition-colors">
                      <X size={13} />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => { if (selected) loadRows(selected, offset, search, sortCol, sortDir); }}
                  className="w-7 h-7 flex items-center justify-center rounded-full text-white/35 hover:text-white hover:bg-white/[0.07] transition-all"
                >
                  <RefreshCw size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => setAddRow(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-600/70 hover:bg-blue-600 border border-blue-500/40 text-white text-xs font-semibold transition-all"
                >
                  <Plus size={13} />
                  Nouvelle ligne
                </button>
              </div>

              {/* table */}
              <div className="flex-1 overflow-auto">
                {rowsLoading && rows.length === 0 ? (
                  <div className="flex justify-center py-16"><Loader2 size={20} className="animate-spin text-white/30" /></div>
                ) : rows.length === 0 ? (
                  <div className="flex items-center justify-center py-16 text-white/30 text-sm">Aucune ligne trouvée.</div>
                ) : (
                  <table className="w-full text-xs border-collapse min-w-max">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-[#0d1020] border-b border-white/[0.07]">
                        {schema.map(col => (
                          <th
                            key={col.name}
                            className="px-3 py-2.5 text-left font-semibold text-white/40 whitespace-nowrap cursor-pointer hover:text-white/70 select-none group"
                            onClick={() => toggleSort(col.name)}
                          >
                            <div className="flex items-center gap-1">
                              {col.key_type === "PRI" && <KeyRound size={10} className="text-amber-400/60 flex-shrink-0" />}
                              <span className="font-mono">{col.name}</span>
                              <span className="text-[10px] text-white/20 group-hover:text-white/35">{col.type}</span>
                              {sortCol === col.name ? (
                                sortDir === "ASC" ? <ChevronUp size={11} className="text-blue-400" /> : <ChevronDown size={11} className="text-blue-400" />
                              ) : (
                                <ChevronsUpDown size={11} className="opacity-0 group-hover:opacity-40" />
                              )}
                            </div>
                          </th>
                        ))}
                        <th className="px-3 py-2.5 sticky right-0 bg-[#0d1020]" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, i) => (
                        <tr
                          key={i}
                          className={`border-b border-white/[0.03] hover:bg-white/[0.025] transition-colors ${rowsLoading ? "opacity-40" : ""}`}
                        >
                          {schema.map(col => (
                            <td key={col.name} className="px-3 py-2 align-top max-w-[220px]">
                              <Cell value={row[col.name]} />
                            </td>
                          ))}
                          <td className="px-3 py-2 sticky right-0 bg-[#080b14] group-hover:bg-white/[0.015]">
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setEditRow(row)}
                                className="w-6 h-6 flex items-center justify-center rounded text-white/25 hover:text-blue-400 hover:bg-blue-400/10 transition-all"
                                title="Modifier"
                              >
                                <Edit2 size={11} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteRow(row)}
                                className="w-6 h-6 flex items-center justify-center rounded text-white/25 hover:text-red-400 hover:bg-red-400/10 transition-all"
                                title="Supprimer"
                              >
                                <Trash2 size={11} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* pagination */}
              {pages > 1 && (
                <div className="flex items-center justify-between px-4 py-2.5 border-t border-white/[0.06] flex-shrink-0">
                  <button
                    type="button"
                    disabled={offset === 0}
                    onClick={() => goPage(-1)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full border border-white/[0.08] text-white/50 hover:text-white hover:bg-white/[0.05] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  >
                    <ChevronLeft size={13} /> Précédent
                  </button>
                  <span className="text-xs text-white/40">Page {page} / {pages} · {total.toLocaleString()} lignes</span>
                  <button
                    type="button"
                    disabled={offset + limit >= total}
                    onClick={() => goPage(1)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full border border-white/[0.08] text-white/50 hover:text-white hover:bg-white/[0.05] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  >
                    Suivant <ChevronRight size={13} />
                  </button>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* ── modals ───────────────────────────────────────────────────────── */}
      {addRow && schema.length > 0 && (
        <RowModal
          schema={schema}
          initial={null}
          title={`Insérer dans ${selected}`}
          onClose={() => setAddRow(false)}
          onSave={doInsert}
        />
      )}

      {editRow && schema.length > 0 && (
        <RowModal
          schema={schema}
          initial={editRow}
          title="Modifier la ligne"
          onClose={() => setEditRow(null)}
          onSave={data => doUpdate(data, editRow)}
        />
      )}

      {deleteRow && schema.length > 0 && (
        <DeleteModal
          row={deleteRow}
          schema={schema}
          onClose={() => setDeleteRow(null)}
          onConfirm={() => doDelete(deleteRow)}
        />
      )}

      {/* ── toast ────────────────────────────────────────────────────────── */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[60] px-4 py-3 rounded-xl border text-sm font-semibold shadow-xl transition-all ${
          toast.ok
            ? "bg-emerald-500/15 border-emerald-500/25 text-emerald-300"
            : "bg-red-500/15 border-red-500/25 text-red-300"
        }`}>
          {toast.text}
        </div>
      )}
    </AppLayout>
  );
}
