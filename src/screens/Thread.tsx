/* Conversation on the record. One thread per subject; @name or @role puts the
   comment addressed to that person until someone from their side replies. Steps
   ("PPS sample", "Escalation") say which part of the record a line is about —
   sampling rounds live here, not in a separate approval object. */
import { useRef, useState } from 'react';
import { FileChips } from './Files';
import { useApp } from '../store';
import type { ThreadKind } from '../domain/types';
import { threadOf, fmtRel } from '../domain/engines';
import { ROLE_LABEL, PEOPLE } from '../domain/reference';
import { Section, Pill, Button, Select } from '../ui';

export function ThreadPanel({ kind, subjectId, steps, defaultStep }: { kind: ThreadKind; subjectId: string; steps?: string[]; defaultStep?: string }) {
  const { db, personId, postComment } = useApp();
  const t = threadOf(db, kind, subjectId);
  const [text, setText] = useState('');
  const [step, setStep] = useState(defaultStep ?? steps?.[0] ?? 'General');
  const [filter, setFilter] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const me = PEOPLE.find(p => p.id === personId)!;
  const all = t?.comments ?? [];
  const shown = filter ? all.filter(c => c.step === filter) : all;
  const counts = new Map<string, number>(); all.forEach(c => counts.set(c.step ?? 'General', (counts.get(c.step ?? 'General') ?? 0) + 1));

  const post = () => { const v = text.trim(); if (!v && !files.length) return; postComment(kind, subjectId, v || `Attached ${files.map(f => f.name).join(', ')}`, steps ? step : null, files); setText(''); setFiles([]); };

  return (
    <Section title={`Conversation · ${all.length}`} right={<Pill tone="neutral">everyone who can open this</Pill>}>
      {steps && counts.size > 1 && <div className="flex gap-1 flex-wrap py-2">
        <button className={`btn sm ${filter === null ? 'primary' : ''}`} onClick={() => setFilter(null)}>All {all.length}</button>
        {[...counts.entries()].map(([k, n]) => <button key={k} className={`btn sm ${filter === k ? 'primary' : ''}`} onClick={() => setFilter(k)}>{k} {n}</button>)}
      </div>}
      {shown.length === 0 ? <div className="py-2 text-[12.5px]" style={{ color:'var(--ink-faint)' }}>Nothing said here yet. This is where the WhatsApp about this record goes — so it stays with the record.</div>
        : <div className="flex flex-col gap-2 py-2">{shown.map(c => (
          <div key={c.id} className="rounded-[4px] px-3 py-2" style={{ background: c.who === me.name ? 'var(--accent-soft)' : 'var(--surface-2)' }}>
            <div className="flex items-baseline gap-2 flex-wrap text-[11.5px]" style={{ color:'var(--ink-faint)' }}>
              <span className="font-semibold text-[12.5px]" style={{ color:'var(--ink)' }}>{c.who}</span>
              <span>{ROLE_LABEL[c.role]}</span>
              <span>· {fmtRel(c.at)}</span>
              {c.step && c.step !== 'General' && <Pill tone="info">{c.step}</Pill>}
            </div>
            <div className="text-[13px] mt-1 leading-relaxed">{c.text.split(/(@[a-z][a-z .&]*)/i).map((part, i) => part.startsWith('@') ? <span key={i} className="font-medium" style={{ color:'var(--accent)' }}>{part}</span> : part)}</div>
            <FileChips kind="comment" subjectId={c.id} />
          </div>))}</div>}
      <div className="pt-2 flex flex-col gap-2" style={{ borderTop:'1px solid var(--line-soft)' }}>
        <textarea className="input" rows={2} value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) post(); }}
          placeholder={`Write as ${me.name}… @neha or @sourcing so it is addressed to them`} />
        <div className="flex items-center gap-2 flex-wrap">
          {steps && <div style={{ width: 170 }}><Select value={step} onChange={setStep} options={steps.map(s => ({ value:s, label:s }))} /></div>}
          <input ref={fileInput} type="file" multiple hidden onChange={e => { setFiles(Array.from(e.target.files ?? [])); }} />
          <Button size="sm" onClick={() => fileInput.current?.click()}>{files.length ? `${files.length} file${files.length === 1 ? '' : 's'} attached` : '📎 Attach'}</Button>
          <Button variant="primary" size="sm" onClick={post} disabled={!text.trim() && !files.length}>Post</Button>
          <span className="text-[11px]" style={{ color:'var(--ink-faint)' }}>⌘↵ to post · stays on this record, visible to every role that can open it</span>
        </div>
      </div>
    </Section>
  );
}
