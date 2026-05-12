import { useState, useRef } from "react";
import {
  Type, Minus, LayoutGrid, Images, MousePointerClick,
  Plus, Trash2, GripVertical, Pencil, Check, X, Link as LinkIcon, Image as ImageIcon,
} from "lucide-react";
import type { DChannel } from "@/api/shard";
import { SectionCard, Field, TextInput, TextArea, Select, Toggle } from "@/components/shardguard/Field";
import { ColorPicker } from "@/components/forms/ColorPicker";
import { apiPost } from "@/api/client";

/* ──────────────────────────── types ──────────────────────────── */

type Spacing = "small" | "large";

export type Block =
  | { id: string; kind: "text"; content: string }
  | { id: string; kind: "separator"; spacing: Spacing; divider: boolean }
  | {
      id: string;
      kind: "section";
      content: string;
      accessory:
        | { kind: "thumb"; url: string; description?: string }
        | { kind: "button"; label: string; url: string };
    }
  | { id: string; kind: "gallery"; items: { url: string; description?: string }[] }
  | { id: string; kind: "buttons"; buttons: { label: string; url: string }[] };

type BlockKind = Block["kind"];

const channelOpts = (channels: DChannel[]) => [
  { value: "", label: "Choisir un salon…" },
  ...channels.map(c => ({ value: c.id, label: `# ${c.name}` })),
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function newBlock(kind: BlockKind): Block {
  const id = uid();
  switch (kind) {
    case "text": return { id, kind: "text", content: "Texte…" };
    case "separator": return { id, kind: "separator", spacing: "small", divider: true };
    case "section": return { id, kind: "section", content: "Texte de la section…", accessory: { kind: "thumb", url: "" } };
    case "gallery": return { id, kind: "gallery", items: [{ url: "" }] };
    case "buttons": return { id, kind: "buttons", buttons: [{ label: "Bouton", url: "https://" }] };
  }
}

/* ──────────────────────────── main component ──────────────────────────── */

interface Props {
  guildId: string;
  channels: DChannel[];
}

export function ComponentsBuilder({ guildId, channels }: Props) {
  const [channelId, setChannelId] = useState("");
  const [accent, setAccent] = useState("#5b6dff");
  const [blocks, setBlocks] = useState<Block[]>([
    { id: uid(), kind: "text", content: "**Bonjour !** Cliquez ici pour éditer ce bloc.\nVous pouvez utiliser du markdown : *italique*, **gras**, `code`, [liens](https://exemple.com)." },
  ]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  function patch(id: string, fn: (b: Block) => Block) {
    setBlocks(prev => prev.map(b => (b.id === id ? fn(b) : b)));
  }
  function remove(id: string) {
    setBlocks(prev => prev.filter(b => b.id !== id));
    if (editingId === id) setEditingId(null);
  }
  function insertAt(idx: number, kind: BlockKind) {
    const b = newBlock(kind);
    setBlocks(prev => {
      const copy = prev.slice();
      copy.splice(idx, 0, b);
      return copy;
    });
    setEditingId(b.id);
  }
  function move(fromIdx: number, toIdx: number) {
    if (fromIdx === toIdx) return;
    setBlocks(prev => {
      const copy = prev.slice();
      const [it] = copy.splice(fromIdx, 1);
      copy.splice(toIdx, 0, it);
      return copy;
    });
  }

  async function send() {
    if (!channelId) {
      setFeedback({ ok: false, msg: "Choisissez un salon." });
      return;
    }
    if (blocks.length === 0) {
      setFeedback({ ok: false, msg: "Ajoutez au moins un bloc." });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const r = await apiPost<{ success?: boolean; error?: string }>(
        `/shard/guild/${guildId}/send-components`,
        { channelId, accentColor: accent, blocks },
      );
      if (r.success) setFeedback({ ok: true, msg: "Message envoyé." });
      else setFeedback({ ok: false, msg: r.error || "Erreur d'envoi." });
    } catch (e) {
      setFeedback({ ok: false, msg: e instanceof Error ? e.message : "Erreur réseau." });
    }
    setBusy(false);
    setTimeout(() => setFeedback(null), 3500);
  }

  return (
    <div className="space-y-4">
      <SectionCard title="Éditeur visuel" description="Glissez-déposez, cliquez sur ＋ pour ajouter un bloc, cliquez sur un bloc pour l'éditer.">
        <div className="grid md:grid-cols-3 gap-3 mb-2">
          <Field label="Salon cible">
            <Select options={channelOpts(channels)} value={channelId} onChange={setChannelId} />
          </Field>
          <Field label="Couleur d'accent">
            <ColorPicker value={accent} onChange={setAccent} />
          </Field>
          <div className="flex items-end">
            <button
              type="button"
              onClick={send}
              disabled={busy || !channelId}
              className="w-full bg-white text-black px-5 py-2 rounded-full font-bold text-xs hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Envoi…" : "Envoyer"}
            </button>
          </div>
        </div>
        {feedback && (
          <p className={`text-[12px] ${feedback.ok ? "text-emerald-400" : "text-red-400"}`}>{feedback.msg}</p>
        )}
      </SectionCard>

      <SectionCard title="Aperçu" description="Reflet fidèle du rendu Discord — l'ordre, la couleur et le markdown sont identiques à l'envoi.">
        <Canvas
          blocks={blocks}
          accent={accent}
          editingId={editingId}
          onEdit={setEditingId}
          onPatch={patch}
          onRemove={remove}
          onInsert={insertAt}
          onMove={move}
        />
      </SectionCard>
    </div>
  );
}

/* ──────────────────────────── canvas (Discord-like) ──────────────────────────── */

function Canvas(props: {
  blocks: Block[];
  accent: string;
  editingId: string | null;
  onEdit: (id: string | null) => void;
  onPatch: (id: string, fn: (b: Block) => Block) => void;
  onRemove: (id: string) => void;
  onInsert: (idx: number, kind: BlockKind) => void;
  onMove: (from: number, to: number) => void;
}) {
  const { blocks, accent, editingId, onEdit, onPatch, onRemove, onInsert, onMove } = props;
  const dragFromRef = useRef<number | null>(null);

  return (
    <div className="rounded-[14px] p-4" style={{ background: "#2b2d31", border: "1px solid #1e1f22" }}>
      {/* Container = vertical pill on the left + content */}
      <div className="flex gap-3">
        <div className="w-1 rounded-full self-stretch flex-shrink-0" style={{ background: accent }} />
        <div className="flex-1 min-w-0">
          {/* + at the very top */}
          <InsertSlot onPick={k => onInsert(0, k)} />
          {blocks.map((b, idx) => (
            <div key={b.id}>
              <div
                draggable
                onDragStart={() => { dragFromRef.current = idx; }}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault();
                  const from = dragFromRef.current;
                  dragFromRef.current = null;
                  if (from == null) return;
                  onMove(from, idx);
                }}
                className="group relative"
              >
                <BlockShell
                  block={b}
                  editing={editingId === b.id}
                  onToggle={() => onEdit(editingId === b.id ? null : b.id)}
                  onRemove={() => onRemove(b.id)}
                  onPatch={fn => onPatch(b.id, fn)}
                />
              </div>
              <InsertSlot onPick={k => onInsert(idx + 1, k)} />
            </div>
          ))}
          {blocks.length === 0 && (
            <p className="text-[12px] italic text-white/40 py-4 text-center">Cliquez sur ＋ pour ajouter votre premier bloc.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────── insertion slot (+) ──────────────────────────── */

function InsertSlot({ onPick }: { onPick: (k: BlockKind) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative h-3 group">
      {/* hover line + button */}
      <div
        className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ pointerEvents: "none" }}
      >
        <div className="flex-1 h-px" style={{ background: "rgba(91, 109, 255, 0.3)" }} />
      </div>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center transition-opacity ${open ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
        style={{ background: "#5b6dff", color: "white" }}
        title="Ajouter un bloc"
      >
        <Plus className="w-3 h-3" strokeWidth={3} />
      </button>
      {open && (
        <div
          className="absolute left-1/2 top-full -translate-x-1/2 mt-1 z-20 rounded-xl p-1.5 flex gap-1"
          style={{ background: "#1e1f22", border: "1px solid #3b3d44", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}
        >
          <PickButton icon={<Type className="w-3.5 h-3.5" />} label="Texte" onClick={() => { onPick("text"); setOpen(false); }} />
          <PickButton icon={<LayoutGrid className="w-3.5 h-3.5" />} label="Section" onClick={() => { onPick("section"); setOpen(false); }} />
          <PickButton icon={<Minus className="w-3.5 h-3.5" />} label="Séparateur" onClick={() => { onPick("separator"); setOpen(false); }} />
          <PickButton icon={<Images className="w-3.5 h-3.5" />} label="Galerie" onClick={() => { onPick("gallery"); setOpen(false); }} />
          <PickButton icon={<MousePointerClick className="w-3.5 h-3.5" />} label="Boutons" onClick={() => { onPick("buttons"); setOpen(false); }} />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-7 h-7 rounded-lg text-white/40 hover:text-white hover:bg-white/5 flex items-center justify-center"
            title="Annuler"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

function PickButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className="flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/5 min-w-[60px]"
    >
      {icon}
      <span className="text-[9.5px] font-bold tracking-wide">{label}</span>
    </button>
  );
}

/* ──────────────────────────── block shell ──────────────────────────── */

function BlockShell({
  block, editing, onToggle, onRemove, onPatch,
}: {
  block: Block;
  editing: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onPatch: (fn: (b: Block) => Block) => void;
}) {
  return (
    <div
      className={`relative rounded-lg my-1 transition-all ${editing ? "" : "cursor-pointer hover:bg-white/[0.025]"}`}
      style={{
        outline: editing ? "1px solid #5b6dff" : "1px solid transparent",
        background: editing ? "rgba(91, 109, 255, 0.04)" : undefined,
      }}
      onClick={(e) => {
        if (editing) return;
        // ignore clicks inside the action chrome
        const t = e.target as HTMLElement;
        if (t.closest("[data-chrome]")) return;
        onToggle();
      }}
    >
      <div data-chrome className="absolute -left-7 top-1/2 -translate-y-1/2 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="text-white/30 cursor-grab" title="Glisser pour réorganiser">
          <GripVertical className="w-3.5 h-3.5" />
        </span>
      </div>
      <div data-chrome className="absolute -right-1 top-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className="w-6 h-6 rounded-md bg-white/5 border border-white/10 hover:bg-white/10 text-white/70 flex items-center justify-center"
          title={editing ? "Fermer" : "Éditer"}
        >
          {editing ? <Check className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="w-6 h-6 rounded-md bg-red-500/10 border border-red-500/20 hover:bg-red-500/15 text-red-400 flex items-center justify-center"
          title="Supprimer"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      <div className="px-2 py-1.5">
        <BlockPreview block={block} />
      </div>

      {editing && (
        <div className="border-t border-white/[0.06] px-3 py-3 space-y-2.5" data-chrome onClick={e => e.stopPropagation()}>
          <BlockEditor block={block} onPatch={onPatch} />
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────── preview (visual rendering) ──────────────────────────── */

function BlockPreview({ block }: { block: Block }) {
  if (block.kind === "text") return <Markdown text={block.content} />;
  if (block.kind === "separator") {
    return (
      <div style={{
        height: block.spacing === "large" ? 20 : 10,
        display: "flex",
        alignItems: "center",
      }}>
        {block.divider && (
          <div className="w-full h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
        )}
      </div>
    );
  }
  if (block.kind === "section") {
    return (
      <div className="flex gap-3 items-center">
        <div className="flex-1 min-w-0"><Markdown text={block.content} /></div>
        {block.accessory.kind === "thumb" && (
          block.accessory.url
            ? <img src={block.accessory.url} alt="" className="w-16 h-16 rounded object-cover flex-shrink-0" />
            : <div className="w-16 h-16 rounded bg-white/[0.06] flex-shrink-0 flex items-center justify-center"><ImageIcon className="w-5 h-5 text-white/30" /></div>
        )}
        {block.accessory.kind === "button" && (
          <a
            href={block.accessory.url || undefined}
            target="_blank"
            rel="noreferrer"
            onClick={e => e.preventDefault()}
            className="px-3 py-1.5 rounded-md text-[13px] font-medium inline-flex items-center gap-1.5 flex-shrink-0"
            style={{ background: "#4e5058", color: "white" }}
          >
            <LinkIcon className="w-3 h-3" />
            {block.accessory.label || "Bouton"}
          </a>
        )}
      </div>
    );
  }
  if (block.kind === "gallery") {
    const valid = block.items.filter(it => it.url);
    if (valid.length === 0) {
      return (
        <div className="rounded-md border border-dashed border-white/10 px-3 py-4 text-[12px] text-white/30 italic text-center">
          Galerie vide — cliquez pour ajouter des images
        </div>
      );
    }
    return (
      <div className={`grid gap-1 ${valid.length === 1 ? "grid-cols-1" : valid.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
        {valid.slice(0, 10).map((it, i) => (
          <img key={i} src={it.url} alt="" className="w-full h-32 object-cover rounded" />
        ))}
      </div>
    );
  }
  if (block.kind === "buttons") {
    return (
      <div className="flex flex-wrap gap-2">
        {block.buttons.map((b, i) => (
          <a
            key={i}
            href={b.url || undefined}
            target="_blank"
            rel="noreferrer"
            onClick={e => e.preventDefault()}
            className="px-3 py-1.5 rounded-md text-[13px] font-medium inline-flex items-center gap-1.5"
            style={{ background: "#4e5058", color: "white" }}
          >
            <LinkIcon className="w-3 h-3" />
            {b.label || "Bouton"}
          </a>
        ))}
      </div>
    );
  }
  return null;
}

/* ──────────────────────────── block editor (inline form) ──────────────────────────── */

function BlockEditor({ block, onPatch }: { block: Block; onPatch: (fn: (b: Block) => Block) => void }) {
  if (block.kind === "text") {
    return (
      <Field label="Texte (markdown)">
        <TextArea
          value={block.content}
          onChange={e => onPatch(b => ({ ...b, kind: "text", content: e.target.value } as Block))}
          rows={4}
          placeholder="**Gras**, *italique*, `code`, [lien](https://…)"
        />
      </Field>
    );
  }
  if (block.kind === "separator") {
    return (
      <div className="grid grid-cols-2 gap-3">
        <Field label="Espacement">
          <Select
            options={[{ value: "small", label: "Petit" }, { value: "large", label: "Grand" }]}
            value={block.spacing}
            onChange={v => onPatch(b => ({ ...b, kind: "separator", spacing: v as Spacing } as Block))}
          />
        </Field>
        <Field label="Ligne visible">
          <Toggle
            checked={block.divider}
            onChange={checked => onPatch(b => ({ ...b, kind: "separator", divider: checked } as Block))}
            label={block.divider ? "Oui" : "Non"}
          />
        </Field>
      </div>
    );
  }
  if (block.kind === "section") {
    return (
      <>
        <Field label="Texte (markdown)">
          <TextArea
            value={block.content}
            onChange={e => onPatch(b => ({ ...b, kind: "section", content: e.target.value } as Block))}
            rows={3}
          />
        </Field>
        <Field label="Type d'accessoire">
          <Select
            options={[
              { value: "thumb", label: "Miniature" },
              { value: "button", label: "Bouton lien" },
            ]}
            value={block.accessory.kind}
            onChange={v => onPatch(b => {
              if (b.kind !== "section") return b;
              return {
                ...b,
                accessory: v === "thumb"
                  ? { kind: "thumb", url: "" }
                  : { kind: "button", label: "Bouton", url: "https://" },
              };
            })}
          />
        </Field>
        {block.accessory.kind === "thumb" ? (
          <Field label="URL de l'image">
            <TextInput
              value={block.accessory.url}
              onChange={e => onPatch(b => {
                if (b.kind !== "section" || b.accessory.kind !== "thumb") return b;
                return { ...b, accessory: { ...b.accessory, url: e.target.value } };
              })}
              placeholder="https://…"
            />
          </Field>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Libellé">
              <TextInput
                value={block.accessory.label}
                onChange={e => onPatch(b => {
                  if (b.kind !== "section" || b.accessory.kind !== "button") return b;
                  return { ...b, accessory: { ...b.accessory, label: e.target.value } };
                })}
              />
            </Field>
            <Field label="URL">
              <TextInput
                value={block.accessory.url}
                onChange={e => onPatch(b => {
                  if (b.kind !== "section" || b.accessory.kind !== "button") return b;
                  return { ...b, accessory: { ...b.accessory, url: e.target.value } };
                })}
                placeholder="https://…"
              />
            </Field>
          </div>
        )}
      </>
    );
  }
  if (block.kind === "gallery") {
    return (
      <Field label="Images (jusqu'à 10)">
        <div className="space-y-2">
          {block.items.map((it, i) => (
            <div key={i} className="flex items-center gap-2">
              <TextInput
                value={it.url}
                onChange={e => onPatch(b => {
                  if (b.kind !== "gallery") return b;
                  const items = b.items.slice();
                  items[i] = { ...items[i], url: e.target.value };
                  return { ...b, items };
                })}
                placeholder="https://…"
              />
              <button
                type="button"
                onClick={() => onPatch(b => b.kind === "gallery" ? { ...b, items: b.items.filter((_, j) => j !== i) } : b)}
                className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/15 flex items-center justify-center shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {block.items.length < 10 && (
            <button
              type="button"
              onClick={() => onPatch(b => b.kind === "gallery" ? { ...b, items: [...b.items, { url: "" }] } : b)}
              className="text-xs font-bold text-white/50 hover:text-white inline-flex items-center gap-2"
            >
              <Plus className="w-3 h-3" /> Ajouter une image
            </button>
          )}
        </div>
      </Field>
    );
  }
  if (block.kind === "buttons") {
    return (
      <Field label="Boutons lien (jusqu'à 5)">
        <div className="space-y-2">
          {block.buttons.map((b, i) => (
            <div key={i} className="grid grid-cols-[1fr_2fr_auto] gap-2 items-center">
              <TextInput
                value={b.label}
                onChange={e => onPatch(blk => {
                  if (blk.kind !== "buttons") return blk;
                  const buttons = blk.buttons.slice();
                  buttons[i] = { ...buttons[i], label: e.target.value };
                  return { ...blk, buttons };
                })}
                placeholder="Libellé"
              />
              <TextInput
                value={b.url}
                onChange={e => onPatch(blk => {
                  if (blk.kind !== "buttons") return blk;
                  const buttons = blk.buttons.slice();
                  buttons[i] = { ...buttons[i], url: e.target.value };
                  return { ...blk, buttons };
                })}
                placeholder="https://…"
              />
              <button
                type="button"
                onClick={() => onPatch(blk => blk.kind === "buttons" ? { ...blk, buttons: blk.buttons.filter((_, j) => j !== i) } : blk)}
                className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/15 flex items-center justify-center"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {block.buttons.length < 5 && (
            <button
              type="button"
              onClick={() => onPatch(b => b.kind === "buttons" ? { ...b, buttons: [...b.buttons, { label: "Bouton", url: "https://" }] } : b)}
              className="text-xs font-bold text-white/50 hover:text-white inline-flex items-center gap-2"
            >
              <Plus className="w-3 h-3" /> Ajouter un bouton
            </button>
          )}
        </div>
      </Field>
    );
  }
  return null;
}

/* ──────────────────────────── tiny markdown renderer ──────────────────────────── */

function Markdown({ text }: { text: string }) {
  // Very small subset, just for preview fidelity. The bot sends the raw text
  // to Discord, which does the real rendering.
  if (!text) {
    return <p className="text-[13px] text-white/30 italic">Texte vide…</p>;
  }
  const lines = text.split("\n");
  return (
    <div className="text-[14px] leading-[1.4]" style={{ color: "#dbdee1", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
      {lines.map((ln, i) => (
        <span key={i} dangerouslySetInnerHTML={{ __html: inlineMd(ln) + (i < lines.length - 1 ? "<br/>" : "") }} />
      ))}
    </div>
  );
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function inlineMd(line: string) {
  let out = escapeHtml(line);
  out = out.replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.08);padding:1px 4px;border-radius:3px;font-size:12px;">$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  out = out.replace(/__([^_]+)__/g, "<u>$1</u>");
  out = out.replace(/~~([^~]+)~~/g, "<s>$1</s>");
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" style="color:#00a8fc;text-decoration:none;" target="_blank" rel="noreferrer">$1</a>');
  return out;
}
