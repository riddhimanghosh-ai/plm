/* Files on the record. One component, mounted on every drawer next to the
   conversation, with the labels that record actually needs — PAT file and CAD on
   a concept, tech pack and job card on a PO, a photo on a sample round. */
import { useRef, useState } from 'react';
import { useApp } from '../store';
import type { Attachment, AttachmentKind } from '../domain/types';
import { fmtDate, fmtRel } from '../domain/engines';
import { useFileUrl, fmtSize, isImage, fileIcon } from '../domain/files';
import { Section, Pill, Button, Select } from '../ui';

export function filesOf(list: Attachment[] | undefined, kind: AttachmentKind, subjectId: string, step?: string, onlyLabels?: readonly string[]) {
  return (list ?? []).filter(a => a.kind === kind && a.subjectId === subjectId && (step === undefined || a.step === step) && (!onlyLabels || onlyLabels.includes(a.label))).sort((a, b) => b.at.localeCompare(a.at));
}

export function Files({ kind, subjectId, labels, step, editable, title = 'Files', compact = false, hint, onlyLabels = false, emptyText }: { kind: AttachmentKind; subjectId: string; labels: readonly string[]; step?: string; editable: boolean; title?: string; compact?: boolean; hint?: string; onlyLabels?: boolean; emptyText?: string }) {
  const { db, attachFiles, removeAttachment, personId } = useApp();
  const rows = filesOf(db.attachments, kind, subjectId, step, onlyLabels ? labels : undefined);
  const [label, setLabel] = useState(labels[0]);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const me = db.people.find(p => p.id === personId)?.name;

  const pick = async (fl: FileList | null) => { if (!fl?.length) return; setBusy(true); await attachFiles(kind, subjectId, label, step ?? null, Array.from(fl)); setBusy(false); if (input.current) input.current.value = ''; };
  const onDrop = (e: React.DragEvent) => { e.preventDefault(); if (editable) void pick(e.dataTransfer.files); };

  const list = rows.length === 0
    ? <div className={`text-[12px] ${compact ? 'py-1' : 'py-2'}`} style={{ color:'var(--ink-faint)' }}>{emptyText ?? (compact ? 'No file yet.' : 'No file on this record yet. Drop it here — the PAT, the tech pack, the photo — instead of sending it on Slack and hoping it is found later.')}</div>
    : <div className={`grid gap-2 ${compact ? 'py-1' : 'py-2'}`} style={{ gridTemplateColumns: compact ? '1fr' : 'repeat(auto-fill, minmax(230px, 1fr))' }}>
        {rows.map(a => <FileCard key={a.id} a={a} canRemove={editable && (a.by === me || !a.stored)} onRemove={() => removeAttachment(a.id)} />)}
      </div>;

  const uploader = editable && <div className="flex items-center gap-2 flex-wrap" onDragOver={e => e.preventDefault()} onDrop={onDrop}>
    <div style={{ width: compact ? 150 : 190 }}><Select value={label} onChange={setLabel} options={labels.map(l => ({ value:l, label:l }))} /></div>
    <input ref={input} type="file" multiple hidden onChange={e => void pick(e.target.files)} />
    <Button size="sm" variant={rows.length ? undefined : 'primary'} disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Saving…' : `+ Add ${label.toLowerCase()}`}</Button>
    {!compact && <span className="text-[11px]" style={{ color:'var(--ink-faint)' }}>or drop files here · {hint ?? 'any type — PDF, Excel, DXF, images'}</span>}
  </div>;

  if (compact) return <div className="pt-1">{list}{uploader}</div>;
  return <Section title={`${title} · ${rows.length}`} right={<Pill tone="neutral">stays with the record</Pill>}>{list}<div className="pt-2" style={{ borderTop:'1px solid var(--line-soft)' }}>{uploader}</div></Section>;
}

function FileCard({ a, canRemove, onRemove }: { a: Attachment; canRemove: boolean; onRemove: () => void }) {
  const url = useFileUrl(a.id, a.stored);
  const img = isImage(a.mime);
  return <div className="flex gap-2 items-start rounded-[4px] px-2 py-2" style={{ background:'var(--surface-2)' }}>
    {img && url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={a.name} style={{ width: 52, height: 52, objectFit:'cover', borderRadius: 3 }} /></a>
      : <div className="mono text-[10px] flex items-center justify-center" style={{ width: 52, height: 52, borderRadius: 3, background:'var(--surface)', border:'1px solid var(--line)', color:'var(--ink-soft)' }}>{fileIcon(a.name, a.mime)}</div>}
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1 flex-wrap"><Pill tone="info">{a.label}</Pill>{a.step && <span className="text-[10.5px]" style={{ color:'var(--ink-faint)' }}>{a.step}</span>}</div>
      <div className="text-[12.5px] font-medium truncate" title={a.name}>{url ? <a href={url} download={a.name} target="_blank" rel="noreferrer" className="vlink">{a.name}</a> : a.name}</div>
      <div className="text-[10.5px]" style={{ color:'var(--ink-faint)' }}>{fmtSize(a.size)} · {a.by} · {fmtRel(a.at)} · {fmtDate(a.at)}{!a.stored && <span title="Seeded record — the file itself is not in this browser"> · sample</span>}</div>
      {canRemove && <button type="button" className="vlink text-[10.5px]" onClick={onRemove}>remove</button>}
    </div>
  </div>;
}

/** Small inline list, for a comment or a table cell. */
export function FileChips({ kind, subjectId }: { kind: AttachmentKind; subjectId: string }) {
  const { db } = useApp();
  const rows = filesOf(db.attachments, kind, subjectId);
  if (!rows.length) return null;
  return <div className="flex gap-1 flex-wrap mt-1">{rows.map(a => <Chip key={a.id} a={a} />)}</div>;
}
function Chip({ a }: { a: Attachment }) {
  const url = useFileUrl(a.id, a.stored);
  const inner = <><span className="mono text-[9.5px]" style={{ color:'var(--ink-faint)' }}>{fileIcon(a.name, a.mime)}</span> {a.name}</>;
  return url ? <a href={url} download={a.name} target="_blank" rel="noreferrer" className="pill" style={{ textTransform:'none', letterSpacing:0 }}>{inner}</a> : <span className="pill" style={{ textTransform:'none', letterSpacing:0 }}>{inner}</span>;
}
