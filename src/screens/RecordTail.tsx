/* The end of every record: files, the conversation and the activity log in one
   block with three tabs. Always open and stuck to the bottom of the drawer
   (6 Nov 2026), so the thread is in reach on every step without scrolling. */
import { useState } from 'react';
import type { ThreadKind, AttachmentKind } from '../domain/types';
import { KV } from '../ui';
import { Files, filesOf } from './Files';
import { ThreadPanel } from './Thread';
import { useApp } from '../store';
import { fmtDate } from '../domain/engines';

export function RecordTail({ kind, fileKind, subjectId, labels, editable, steps, activity }: { kind: ThreadKind; fileKind?: AttachmentKind; subjectId: string; labels: readonly string[]; editable: boolean; steps?: string[]; activity?: { at: string; who: string; what: string }[] }) {
  const fk = (fileKind ?? kind) as AttachmentKind;   // an order's files are filed as customerOrder, its thread as order
  const { db } = useApp();
  const files = filesOf(db.attachments, fk, subjectId).length;
  const talk = (db.threads ?? []).find(t => t.kind === kind && t.subjectId === subjectId)?.comments.length ?? 0;
  /* the conversation first: this is where people talk about the record */
  const [tab, setTab] = useState<'files' | 'talk' | 'log'>('talk');
  return <div className="record-tail"><div className="tail-card">
    <div className="tail-bar">
      <button type="button" className={tab === 'talk' ? 'on' : ''} onClick={() => setTab('talk')}>💬 Conversation{talk ? <span className="tail-n">{talk}</span> : null}</button>
      <button type="button" className={tab === 'files' ? 'on' : ''} onClick={() => setTab('files')}>📎 Files{files ? <span className="tail-n">{files}</span> : null}</button>
      {activity && <button type="button" className={tab === 'log' ? 'on' : ''} onClick={() => setTab('log')}>Activity{activity.length ? <span className="tail-n">{activity.length}</span> : null}</button>}
      <span className="tail-hint">everyone who can open this record sees it</span>
    </div>
    <div className="tail-body">
      {tab === 'talk' && <ThreadPanel kind={kind} subjectId={subjectId} steps={steps} bare />}
      {tab === 'files' && <Files kind={fk} subjectId={subjectId} labels={labels} editable={editable} compact emptyText="No files yet. Add one here so it stays with the record." />}
      {tab === 'log' && activity && (activity.length ? activity.map((a, i) => <KV key={i} k={fmtDate(a.at)} v={a.what} note={a.who} />) : <div className="py-2 text-[12.5px]" style={{ color:'var(--ink-faint)' }}>Nothing yet.</div>)}
    </div>
  </div></div>;
}
