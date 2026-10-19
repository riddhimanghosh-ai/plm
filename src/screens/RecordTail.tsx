/* The quiet end of every drawer. Files, the conversation and the activity log
   used to be three more accordions under the steps — the record's tail took as
   much room as the record. One folded block, three tabs inside it. */
import { useState } from 'react';
import type { ThreadKind } from '../domain/types';
import { Section, KV, Pill } from '../ui';
import { Files, filesOf } from './Files';
import { ThreadPanel } from './Thread';
import { useApp } from '../store';
import { fmtDate } from '../domain/engines';

export function RecordTail({ kind, subjectId, labels, editable, steps, activity }: { kind: ThreadKind; subjectId: string; labels: readonly string[]; editable: boolean; steps?: string[]; activity?: { at: string; who: string; what: string }[] }) {
  const { db } = useApp();
  const files = filesOf(db.attachments, kind, subjectId).length;
  const talk = (db.threads ?? []).find(t => t.kind === kind && t.subjectId === subjectId)?.comments.length ?? 0;
  const [tab, setTab] = useState<'files' | 'talk' | 'log'>(talk ? 'talk' : 'files');
  const [wanted, setWanted] = useState(false);
  /* nothing in it yet: one quiet line, not a folded card */
  if (!wanted && files === 0 && talk === 0 && !(activity && activity.length)) return <div className="text-[12px] px-1" style={{ color:'var(--ink-faint)' }}><button type="button" className="vlink" onClick={() => setWanted(true)}>Add a note or a file</button></div>;
  return <Section title="Files · conversation · activity" look="tail" pending={false} ownerRole={null}
    right={<span className="flex gap-1"><Pill tone="neutral">{files} file{files === 1 ? '' : 's'}</Pill><Pill tone={talk ? 'info' : 'neutral'}>{talk} comment{talk === 1 ? '' : 's'}</Pill>{activity && <Pill tone="neutral">{activity.length} on the log</Pill>}</span>}>
    <div className="seg mb-2" style={{ width:'fit-content' }}>
      <button type="button" className={tab === 'files' ? 'on' : ''} onClick={() => setTab('files')}>Files · {files}</button>
      <button type="button" className={tab === 'talk' ? 'on' : ''} onClick={() => setTab('talk')}>Conversation · {talk}</button>
      {activity && <button type="button" className={tab === 'log' ? 'on' : ''} onClick={() => setTab('log')}>Activity · {activity.length}</button>}
    </div>
    {tab === 'files' && <Files kind={kind} subjectId={subjectId} labels={labels} editable={editable} compact />}
    {tab === 'talk' && <ThreadPanel kind={kind} subjectId={subjectId} steps={steps} />}
    {tab === 'log' && activity && (activity.length ? activity.map((a, i) => <KV key={i} k={fmtDate(a.at)} v={a.what} note={a.who} />) : <div className="py-2 text-[12.5px]" style={{ color:'var(--ink-faint)' }}>Nothing yet.</div>)}
  </Section>;
}
