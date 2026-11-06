/* The end of every record: files, the conversation and the activity log in one
   block with three tabs. Always open and stuck to the bottom of the drawer
   (6 Nov 2026), so the thread is in reach on every step without scrolling. */
import { useState } from 'react';
import type { ThreadKind, AttachmentKind } from '../domain/types';
import { Section, KV, Pill } from '../ui';
import { Files, filesOf } from './Files';
import { ThreadPanel } from './Thread';
import { useApp } from '../store';
import { fmtDate } from '../domain/engines';

export function RecordTail({ kind, fileKind, subjectId, labels, editable, steps, activity }: { kind: ThreadKind; fileKind?: AttachmentKind; subjectId: string; labels: readonly string[]; editable: boolean; steps?: string[]; activity?: { at: string; who: string; what: string }[] }) {
  const fk = (fileKind ?? kind) as AttachmentKind;   // an order's files are filed as customerOrder, its thread as order
  const { db } = useApp();
  const files = filesOf(db.attachments, fk, subjectId).length;
  const talk = (db.threads ?? []).find(t => t.kind === kind && t.subjectId === subjectId)?.comments.length ?? 0;
  const [tab, setTab] = useState<'files' | 'talk' | 'log'>(talk ? 'talk' : 'files');
  return <div className="record-tail"><Section title="Files · conversation · activity" collapsible={false} pending={false} ownerRole={null}
    right={<span className="flex gap-1"><Pill tone="neutral">{files} file{files === 1 ? '' : 's'}</Pill><Pill tone={talk ? 'info' : 'neutral'}>{talk} comment{talk === 1 ? '' : 's'}</Pill>{activity && <Pill tone="neutral">{activity.length} on the log</Pill>}</span>}>
    <div className="seg mb-2" style={{ width:'fit-content' }}>
      <button type="button" className={tab === 'files' ? 'on' : ''} onClick={() => setTab('files')}>Files · {files}</button>
      <button type="button" className={tab === 'talk' ? 'on' : ''} onClick={() => setTab('talk')}>Conversation · {talk}</button>
      {activity && <button type="button" className={tab === 'log' ? 'on' : ''} onClick={() => setTab('log')}>Activity · {activity.length}</button>}
    </div>
    {tab === 'files' && <Files kind={fk} subjectId={subjectId} labels={labels} editable={editable} compact />}
    {tab === 'talk' && <ThreadPanel kind={kind} subjectId={subjectId} steps={steps} />}
    {tab === 'log' && activity && (activity.length ? activity.map((a, i) => <KV key={i} k={fmtDate(a.at)} v={a.what} note={a.who} />) : <div className="py-2 text-[12.5px]" style={{ color:'var(--ink-faint)' }}>Nothing yet.</div>)}
  </Section></div>;
}
