/* What the mail looks like in the receiver's inbox (18 Nov 2026): a sample mail-client view of any mail
   PLM sends, so a user sees exactly what the factory, the vendor or Prince gets. A demo, not a live inbox. */
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Mail } from '../domain/rtwPack';
import { fmtDate } from '../domain/engines';

const FROM = { name: 'Bombay Shirt Company · PLM', email: 'plm@bombayshirts.com' };
const fileOf = (a: string) => {
  const base = a.replace(/\s*·.*$/, '').trim();
  const ext = /size break|bom|ledger|packing/i.test(base) ? 'xlsx' : 'pdf';
  return { name: `${base.replace(/[^\w#-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')}.${ext}`, ext };
};
const nameOf = (email: string) => email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

export function MailPreviewModal({ mail: mail0, sentOn, onClose, onSave }: { mail: Mail; sentOn: string | null; onClose: () => void; onSave?: (m: Mail) => void }) {
  const [mail, setMail] = useState<Mail>(mail0); const [edit, setEdit] = useState(false); const [d, setD] = useState<Mail>(mail0);
  const list = (v: string) => v.split(/[,;]\s*/).map(x => x.trim()).filter(Boolean);
  const canEdit = !!onSave && !sentOn;
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const to = mail.to[0] ?? '';
  return createPortal(<div className="gm-back" onClick={onClose}>
    <div className="gm" onClick={e => e.stopPropagation()} role="dialog" aria-label="The mail as the receiver sees it">
      <div className="gm-demo"><span>{edit ? 'Editing the mail · PLM sends what you save here' : `Sample · how this mail lands in ${to ? `${nameOf(to)}'s` : 'the'} inbox${sentOn ? '' : ' once sent'}`}</span>
        <span className="flex items-center gap-3">{canEdit && !edit && <button type="button" className="gm-edit" onClick={() => { setD(mail); setEdit(true); }}>✎ Edit the mail</button>}
          {sentOn && <span style={{ opacity: .7 }}>sent · read-only</span>}<button type="button" onClick={onClose} aria-label="close">✕</button></span></div>
      <div className="gm-top">
        <span className="gm-burger" aria-hidden>☰</span>
        <span className="gm-logo"><span className="gm-env" aria-hidden>✉</span>Mail</span>
        <div className="gm-search"><span aria-hidden>⌕</span> Search mail</div>
        <span className="gm-me" aria-hidden>{(to[0] ?? 'F').toUpperCase()}</span>
      </div>
      <div className="gm-main">
        <aside className="gm-side">
          <div className="gm-compose">✎ Compose</div>
          <div className="gm-nav on"><span>Inbox</span><b>3</b></div>
          <div className="gm-nav"><span>Starred</span></div>
          <div className="gm-nav"><span>Snoozed</span></div>
          <div className="gm-nav"><span>Sent</span></div>
          <div className="gm-nav"><span>Drafts</span></div>
          <div className="gm-nav"><span>More</span></div>
        </aside>
        {edit ? <section className="gm-read gm-compose-box">
          <div className="gm-c-h">Edit message</div>
          <label className="gm-c-row"><span>To</span><input value={d.to.join(', ')} onChange={e => setD(x => ({ ...x, to: list(e.target.value) }))} /></label>
          <label className="gm-c-row"><span>Cc</span><input value={d.cc.join(', ')} onChange={e => setD(x => ({ ...x, cc: list(e.target.value) }))} /></label>
          <label className="gm-c-row"><span>Subject</span><input value={d.subject} onChange={e => setD(x => ({ ...x, subject: e.target.value }))} /></label>
          <textarea className="gm-c-body" value={d.body} onChange={e => setD(x => ({ ...x, body: e.target.value }))} rows={18} />
          <div className="gm-c-att">{mail.attachments.map(a => <span key={a}>📎 {fileOf(a).name}</span>)}</div>
          <div className="gm-c-acts"><button type="button" className="gm-save" disabled={!d.to.length} onClick={() => { const m = { ...d, attachments: mail.attachments }; setMail(m); onSave?.(m); setEdit(false); }}>Save changes</button>
            <button type="button" className="gm-cancel" onClick={() => { setD(mail0); setMail(mail0); onSave?.(mail0); setEdit(false); }}>Back to PLM's text</button>
            <button type="button" className="gm-cancel" onClick={() => setEdit(false)}>Cancel</button></div>
        </section> :
        <section className="gm-read">
          <div className="gm-tools" aria-hidden><span>←</span><span>⤓</span><span>⚠</span><span>🗑</span><span className="gm-sep" /><span>✉</span><span>⏱</span><span>⋮</span><span className="gm-count">1 of 3</span></div>
          <h2 className="gm-subj">{mail.subject}<span className="gm-label">Inbox ×</span></h2>
          <div className="gm-msg">
            <span className="gm-av" aria-hidden>B</span>
            <div className="gm-head">
              <div className="gm-from"><b>{FROM.name}</b> <span>&lt;{FROM.email}&gt;</span></div>
              <div className="gm-to">to {mail.to.join(', ') || '—'}{mail.cc.length ? <>, cc {mail.cc.join(', ')}</> : null} ▾</div>
            </div>
            <div className="gm-when">{sentOn ? `${fmtDate(sentOn)}, 10:12` : 'not sent yet'}<span aria-hidden> ☆ ↩ ⋮</span></div>
          </div>
          <div className="gm-body">{mail.body.split('\n').map((ln, k) => /^[A-Z][A-Z &]+$/.test(ln.trim()) ? <div key={k} className="gm-h">{ln.charAt(0) + ln.slice(1).toLowerCase()}</div>
            : /^https?:\/\//.test(ln.trim()) ? <div key={k}><span className="gm-link">{ln}</span></div>
            : <div key={k} className={ln.startsWith('    ') ? 'gm-sub' : undefined}>{ln || '\u00a0'}</div>)}</div>
          {mail.attachments.length > 0 && <div className="gm-att">
            <div className="gm-att-h">{mail.attachments.length} attachment{mail.attachments.length === 1 ? '' : 's'} · Scanned by the mail service</div>
            <div className="gm-att-grid">{mail.attachments.map(a => { const f = fileOf(a); return <div key={a} className="gm-file" title={a}>
              <div className="gm-thumb"><span className={`gm-ext ${f.ext}`}>{f.ext.toUpperCase()}</span></div>
              <div className="gm-fname"><span className={`gm-ico ${f.ext}`}>{f.ext === 'pdf' ? 'PDF' : 'XLS'}</span>{f.name}</div>
            </div>; })}</div>
          </div>}
          <div className="gm-reply"><span>↩ Reply</span><span>↪ Forward</span></div>
        </section>}
      </div>
    </div>
  </div>, document.body);
}

/** a small link that opens the mail in the sample inbox view */
export function MailPreviewButton({ mail, sentOn, label, onSave, button }: { mail: Mail; sentOn: string | null; label?: string; onSave?: (m: Mail) => void; button?: boolean }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className={button ? 'btn sm' : 'vlink text-[11.5px]'} onClick={() => setOpen(true)}>{label ?? (sentOn ? 'see it in the inbox ✉' : onSave ? 'preview and edit in the inbox ✉' : 'preview in the inbox ✉')}</button>
    {open && <MailPreviewModal mail={mail} sentOn={sentOn} onSave={onSave} onClose={() => setOpen(false)} />}
  </>;
}
