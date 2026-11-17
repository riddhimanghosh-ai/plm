/* The end of every record: files, the conversation and the activity log in one
   block with three tabs, stuck to the bottom of the drawer so the thread is in reach on every step.
   Folded to its tab strip until a tab is clicked (17 Nov 2026), so the record keeps the height; clicking the open tab folds it again. */
import { useState, type ReactNode } from 'react';
import type { ThreadKind, AttachmentKind } from '../domain/types';
import { KV } from '../ui';
import { Files, filesOf } from './Files';
import { ThreadPanel } from './Thread';
import { useApp } from '../store';
import { fmtDate } from '../domain/engines';

export function RecordTail({ kind, fileKind, subjectId, labels, editable, steps, activity, extraTabs }: { extraTabs?: { id: string; label: string; count?: number; body: ReactNode }[]; kind: ThreadKind; fileKind?: AttachmentKind; subjectId: string; labels: readonly string[]; editable: boolean; steps?: string[]; activity?: { at: string; who: string; what: string }[] }) {
  const fk = (fileKind ?? kind) as AttachmentKind;   // an order's files are filed as customerOrder, its thread as order
  const { db } = useApp();
  const files = filesOf(db.attachments, fk, subjectId).length;
  const talk = (db.threads ?? []).find(t => t.kind === kind && t.subjectId === subjectId)?.comments.length ?? 0;
  /* the conversation first: this is where people talk about the record */
  const [open, setOpen] = useState<string | null>(null); const tab = open ?? ''; const setTab = (t: string) => setOpen(c => c === t ? null : t);
  return <div className="record-tail"><div className="tail-card">
    <div className="tail-bar">
      <button type="button" className={tab === 'talk' ? 'on' : ''} onClick={() => setTab('talk')}>💬 Conversation{talk ? <span className="tail-n">{talk}</span> : null}</button>
      <button type="button" className={tab === 'files' ? 'on' : ''} onClick={() => setTab('files')}>📎 Files{files ? <span className="tail-n">{files}</span> : null}</button>
      {extraTabs?.map(t => <button key={t.id} type="button" className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}{t.count ? <span className="tail-n">{t.count}</span> : null}</button>)}
      {activity && <button type="button" className={tab === 'log' ? 'on' : ''} onClick={() => setTab('log')}>What happened{activity.length ? <span className="tail-n">{activity.length}</span> : null}</button>}
      <span className="tail-hint">{open ? <button type="button" className="vlink" onClick={() => setOpen(null)}>hide ▾</button> : 'click a tab to open'}</span>
    </div>
    {open && <div className="tail-body">
      {tab === 'talk' && <ThreadPanel kind={kind} subjectId={subjectId} steps={steps} bare />}
      {tab === 'files' && <Files kind={fk} subjectId={subjectId} labels={labels} editable={editable} compact emptyText="No files yet. Add one here so it stays with the record." />}
      {extraTabs?.find(t => t.id === tab)?.body}
      {tab === 'log' && activity && (activity.length ? activity.map((a, i) => <KV key={i} k={fmtDate(a.at)} v={a.what} note={a.who} />) : <div className="py-2 text-[12.5px]" style={{ color:'var(--ink-faint)' }}>Nothing yet.</div>)}
    </div>}
  </div></div>;
}
