/* "Whose step is this, and how do I become them?" — the same line everywhere a
   record is sitting with a team you are not. In a real deployment the button
   would simply not be there; in a walkthrough that is a dead end, so the line
   names the team, offers the one-click switch, and — while walkthrough mode is
   on — leaves the button pressable so a flow can be followed end to end. */
import { useApp } from '../store';
import type { RoleId } from '../domain/types';
import { ROLE_LABEL } from '../domain/reference';
import { Pill } from '../ui';

const LABEL_TO_ROLE: Record<string, RoleId> = { 'Production': 'production', 'Production unit': 'production', 'Design': 'design', 'Planning & Design': 'design', 'Planning': 'planning', 'Store': 'store', 'Warehouse': 'warehouse', 'Sourcing': 'sourcing', 'Finance': 'finance', 'Owner': 'owner' };
export const roleOf = (label: string): RoleId => LABEL_TO_ROLE[label] ?? 'design';

/** One line: whose step this is, that you are not them, and a click to become
    them. Renders nothing when the step is already yours. */
export function ActsBy({ role, does, inline = false }: { role: RoleId | RoleId[]; does: string; inline?: boolean }) {
  const { myRole, demoAll } = useApp();
  const roles = Array.isArray(role) ? role : [role];
  if (myRole === 'owner' || demoAll || roles.includes(myRole)) return null;   // walkthrough is a super admin — nothing is "not on your screen"
  const who = roles.map(r => ROLE_LABEL[r]).join(' or ');
  /* the team, and what it does here — no "switch to" link; people are who they are */
  return <span className={`acts-by ${inline ? 'text-[11.5px]' : 'block pt-2 text-[11.5px]'}`} style={{ color:'var(--ink-faint)' }}>
    → <b style={{ color:'var(--ink-soft)' }}>{who}</b> {does}.
  </span>;
}

/** The section tag: the team whose step this is — named, never "yours".
    Clickable to become them when it is not your team. */
export function OwnerPill({ editable, owner }: { editable?: boolean; owner: string }) {
  const theirs = roleOf(owner);
  /* the team's own colour, whether it is you or them — "yours" in design's plum
     still says which team's step this is */
  const label = owner === 'yours' ? ROLE_LABEL[theirs] : owner;
  void editable;
  return <span className={`pill owner-pill role-${theirs}`} title={`${label}'s step`}>{label}</span>;
}
