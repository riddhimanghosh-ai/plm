# Builds the RTW-edition PRD as HTML (localhost docs) and DOCX from one content tree.
import html as H, sys, datetime
from docx import Document
from docx.shared import Pt, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH

DATE = '15 Nov 2026'
TITLE = 'BSC PLM: Product Requirements, RTW edition'
SUB = 'Ready-to-wear bulk production end to end, as BSC set it in the discovery of 14 Nov 2026: the requirement, factory counter sourcing, the PO and its mails, the TNA with QC, the cloth at the factory and the cut ratio, dispatch and receipt, COGS, Enigma, and the invoices for reconciliation. Users, user flows step by step, data, rules, build order, and the outcomes it delivers.'

C = []
def h2(t): C.append(('h2', t))
def p(t): C.append(('p', t))
def b(lead, rest): C.append(('b', lead, rest))
def table(headers, rows): C.append(('table', headers, rows))
def ul(items): C.append(('ul', items))
def steps(rows): table(['#', 'Step · who', 'User flow', 'Data in (source)', 'System checks', 'Then'], rows)

# ------------------------------------------------------------------ 1
h2("1. Purpose and scope")
p("Requirements for the RTW edition of BSC PLM: Bombay Shirt Company's ready-to-wear bulk production, from the day category raises a style to the day it is in Enigma and the invoices are reconciled. Every role works on one record per style: a rail of steps down the left, one step open at a time, the next move and whose it is pinned in the header. The prototype at bsc-plm-rtw.vercel.app shows every screen named here.")
p("BSC PLM sits beside Enigma, not inside it. Enigma stays the system of record for products, stock, warehouse receipts (GRN) and vendor POs for cloth. PLM holds what Enigma does not: the requirement and its files, the factory database, counter sourcing and its replies, the factory PO and its mails, the TNA with planned, revised and actual dates, QC, the cloth at the factory and the cut ratio, the invoice trail, COGS, and the conversation. AWB, courier and logistics stay outside PLM.")
b("In scope.", "Category's requirement with its files; sourcing's vendor details and sending; the factory and cloth vendor databases; counter sourcing with replies over target flagged and target revisions logged; the factory PO with delivery location and the TNA form, mailed from PLM with the mail editable; the merchandiser's follow-ups across their factories; the TNA and QC; the cloth at the factory, colour by colour, with hold or drop on a failed colour and a new cut ratio on short or extra cloth or trims; dispatch with the invoice and packing list mailed to the warehouse; receipt against the packing list from Enigma; COGS; Add to Enigma with every size; invoices, debit and credit notes; the production dashboard.")
b("Where it starts.", "PLM starts at the design requirement: once the concept is finalised, the prototype and sampling are done, and category knows the style is to be built. From that point, everything to the style being in Enigma and its invoices reconciled is in PLM.")
b("Conventions.", "A state is where a record is, never the next step. Quantities are pieces unless the unit says metres. Rules marked later are specified but not built. A ✦ marks an AI feature.")

# ------------------------------------------------------------------ 2
h2("2. Users and roles")
p("These roles work in PLM; factories and the warehouse are reached by mail. One login per person. A button shows only for the role that owns the step; everyone else reads whose move it is.")
table(["Role", "People", "Owns in PLM", "Lands on", "Reads"], [
 ["Category (design)", "Kunal and the category team", "The requirement and its files; who supplies the cloth; the delivery location; revising target date or cost when every factory reply is over; a new cut ratio when cloth or trims are short or extra, or a colour is dropped; Add to Enigma", "Requirements", "Counter sourcing, QC remarks, COGS"],
 ["Sourcing", "Sreekanth", "Vendor details on the requirement (cloth vendor, vendor fabric code, blocked quantity, readiness, trim vendor, yarn vendor for knits) when BSC is in the cloth; sending cloth and trims to the factory when BSC sends; the cloth vendor database", "Sourcing · RTW", "Requirements, POs"],
 ["Production RTW", "Nitin, Parag", "Counter sourcing (factories, deadline, the mail); the cloth decision before the PO; the PO and its mail; PO costs; hold or drop a failed colour; COGS; invoices, debit and credit notes; the factory database; the dashboard", "RTW production tracker", "Everything"],
 ["Merchandiser", "Nitin Singh, Abhin M, Bhupendra (a few factories each)", "Chasing what factories owe; returning the TNA form; the TNA dates; the factory's own fabric PO and receipt; counting cloth and trims in; asking for a new cut ratio; the invoice and packing list after dispatch and the mail to the warehouse", "My factories", "QC results, remarks"],
 ["QC", "Rohit", "PP sample, size set, initial, mid-line and final inspection: pass or not, with technical and aesthetic remarks", "QC · samples and inspections", "The tech pack and sizes"],
 ["Warehouse", "Prince", "No screen. Receives the invoice and packing list by mail; receives the goods on Enigma", "None", "The mail"],
 ["Owner", "Akshay, Parag", "Everything", "Any", "None"],
])
b("Factories.", "No login. They get the counter-sourcing query and its cost form, the PO with the TNA form, and reply by mail or form; the merchandiser keys what they send.")

# ------------------------------------------------------------------ 3
h2("3. The record and its steps")
p("Every role opens the same record. The rail shows the steps in four phases; a step ticks when it is done, turns red when it went wrong (short cloth, a failed colour) and amber once it is fixed. Lists everywhere show Where it is and Next from the same words.")
table(["#", "Step", "Who", "Done when"], [
 ["1", "Raised", "Category or a planning reorder", "the style is created"],
 ["2", "Requirement", "Category, sourcing", "every part is in and category sends it to Production RTW"],
 ["3", "Factory counter sourcing", "Nitin, factories, category", "replies are in and at least one fits the targets (or the targets are revised)"],
 ["4", "PO raised · mailed", "Nitin", "the PO is raised on a reply and its mail is sent"],
 ["5", "TNA · planned dates", "Merchandiser, factory", "the TNA form comes back with a planned date per step"],
 ["6", "Cloth at the factory · cut ratio", "Sourcing, merchandiser, category", "every colour is in and passed, or held or dropped, and any new cut ratio is given"],
 ["7", "Made · TNA with QC", "Factory, QC, merchandiser", "finishing done; QC passed at every point"],
 ["8", "Dispatched · invoice to the warehouse", "Merchandiser", "the invoice and packing list are mailed to Prince"],
 ["9", "Received · Enigma", "Prince", "Enigma holds the receipt against the packing list"],
 ["10", "COGS · profitability", "Nitin, category", "COGS is closed against net MRP"],
 ["11", "Added to Enigma", "Category", "the style is in Enigma with every size"],
 ["12", "Invoices · debit and credit notes", "Nitin, accounts", "a log, never a gate"],
])

# ------------------------------------------------------------------ 4
h2("4. Workflow 1 — The requirement")
steps([
 ["1.1", "Raise the style · category", "1. Requirements, + New RTW style. One tab per part (or Stacked, Blocks).\n2. Style and production ask: category, sub-category, semi-stitched, style, colour options, order qty, target in-house, target cost, size-wise quantity (the cut ratio), files (drop or browse), the design brief.\n3. Fabric information: who supplies the cloth (We send it, We add vendors, Factory-held); description, content, photo of the physical fabric, option and phase, CPM, rate, width.\n4. Tech pack: each item a file (pdf, doc, image) or a note.\n5. Trim card: the file, and colour-wise lines with the supplier's item code and reference image.\n6. BOM and consumption from the trims master.\n7. Delivery instruction: 3PL warehouse or Vasai, preselected from semi-stitched.", "typed; files uploaded; the trims master", "style and qty to create; files any of pdf, doc, sheet or image", "the record opens at step 2"],
 ["1.2", "✦ Draft from words · category", "1. Write what is in mind in the brief (look, collar, pocket, buttons, back, packing).\n2. ✦ Draft the requirement: the empty tech-pack items, fabric description and content, and trim lines are drafted from it.\n3. Category checks each part.", "the brief; attached files", "drafts only fill empty items; nothing is sent", "parts show as filled"],
 ["1.3", "Vendor details · sourcing", "1. Sourcing · RTW, Vendor details on requirements: every requirement where category chose We send it or We add vendors.\n2. The Cloth · vendors part: cloth vendor (vendors that supply this cloth first, from the database), vendor fabric code, blocked metres, readiness (available, or a supply date), trim vendor, yarn vendor for knits.", "cloth vendor database", "not needed when factory-held", "the part ticks"],
 ["1.4", "Send to Production RTW · category", "1. The gate lists what is missing, part by part.\n2. Send to Production RTW.", "every part", "every part complete, sourcing's included", "the style shows as Requested on the tracker"],
])
b("Fill with sample data.", "A prototype-only button fills the empty parts so a walkthrough can move on.")

# ------------------------------------------------------------------ 5
h2("5. Workflow 2 — Factory counter sourcing and the PO")
steps([
 ["2.1", "Pick factories · Nitin", "1. The factory database recommends by the category's specialisation and on-time rate; any other can be added.\n2. Set the reply deadline.\n3. The counter-sourcing mail composes itself (to the factories, cc the merchandiser, the requirement and a cost form attached); edit To, Cc, Subject, Body; Send.", "factory database; the requirement", "at least one factory and a deadline", "the merchandiser sees who was asked and by when"],
 ["2.2", "Replies · factories, merchandiser", "1. Replies land per factory: cost per piece, lead time, note.\n2. A reply over the target cost or landing past the target in-house date is red, with by how much.\n3. Past the deadline, an unreplied factory turns red and shows on the merchandiser's follow-ups.", "the cost form (keyed in the prototype)", "flags against target cost and target date", "none"],
 ["2.3", "Revise the target · category", "1. When every reply is over target, a red banner asks category to revise.\n2. Pick target in-house or target cost, the new value and why.\n3. Target revisions keep was, now, why, who, when.", "replies", "a reason is required", "the record logs it; replies are re-read against the new target"],
 ["2.4", "Decide the cloth, raise the PO · Nitin", "1. The cloth: We send it, We add vendors, Factory-held; defaults to category's choice.\n2. Raise PO on this on one reply.\n3. The PO mail composes: delivery location, the cloth vendor's details when BSC adds vendors, the TNA form attached. Edit and Send to the factory and the merchandiser.", "the reply; the requirement", "one PO per style; delivery from the requirement", "TNA generated from the category template; Fabric PO blocks skipped when BSC sends the cloth"],
 ["2.5", "PO costs · Nitin", "Logistics and other cost lines on the PO.", "typed", "none", "into COGS"],
])

# ------------------------------------------------------------------ 6
h2("6. Workflow 3 — The merchandiser")
p("Each merchandiser looks after a set of factories; their screen spans only those, with a factory filter.")
steps([
 ["3.1", "Follow-ups · merchandiser", "One list of what the factories owe: cost replies past deadline, TNA forms not returned, TNA steps late, QC fails to resubmit, invoices not yet sent. Multi-select filters by kind and factory.", "every PO and query on their factories", "none", "opens the record at that step"],
 ["3.2", "TNA form · merchandiser", "The factory's planned date for every step, submitted once.", "the TNA form", "one date per step", "planned dates on the TNA; the PO counts as acknowledged"],
 ["3.3", "Cloth and trims intake · merchandiser", "Per PO, colour by colour: in, short, failed, on hold, dropped. Rows short or failed read New cut ratio pending.", "counts from the factory", "none", "category's list filters New cut ratio pending"],
 ["3.4", "The TNA · merchandiser", "An accordion of every PO (first open), with its stage; filters by stage and deadline within a chosen number of days.", "the TNA", "a revised date needs a reason", "late steps on follow-ups and the dashboard"],
 ["3.5", "QC · merchandiser", "Every QC result across their factories: PP sample and size set passed or not, inspection remarks, technical and aesthetic.", "QC", "none", "none"],
])

# ------------------------------------------------------------------ 7
h2("7. Workflow 4 — Cloth at the factory and the cut ratio")
steps([
 ["4.1", "BSC sends · sourcing", "Sourcing · RTW, Send to the factory: every PO where BSC supplies cloth and trims; send with metres; the factory counts both in.", "the vendor PO on Enigma", "only when BSC sends", "Fabric ETA and Trims ETA on the TNA"],
 ["4.2", "Factory buys · merchandiser", "When BSC adds vendors or the cloth is factory-held: the factory's fabric PO (vendor, number, date, metres) and its receipt (date, metres, note).", "the factory", "none", "logs Fabric PO and Fabric ETA on the TNA"],
 ["4.3", "Colour by colour · factory, Nitin", "1. Each colour on the PO is counted in and checked by the factory.\n2. A colour that fails: Nitin holds it (replacement-by date, continues under the same PO) or drops it from the run (its pieces come off; an alternative is raised as a separate requirement).\n3. The other colours carry on.", "counts and check from the factory", "a decision on every failed colour", "a drop asks category for the cut ratio of the rest"],
 ["4.4", "New cut ratio · category", "Less or more cloth or trims than the PO needs, or a dropped colour: the factory asks; category gives new sizes or approves a cut-short; the factory sees it at once.", "the ask", "sizes add up", "the record's cloth step goes amber"],
])

# ------------------------------------------------------------------ 8
h2("8. Workflow 5 — The TNA and QC")
steps([
 ["5.1", "The TNA · factory, merchandiser", "The blocks from the category template, planned · revised · actual on each; blocks not in the category greyed; any block marked not needed.", "TNA form; the factory", "a revised date needs a reason; a late actual pushes the open steps", "lateness on the dashboard"],
 ["5.2", "QC · QC", "QC points: PP sample, size set, initial inspection (after stitching starts), mid-line (after finishing starts), final (finishing done). QC's screen: inspections coming up by factory; PP samples received; size sets received; every result.", "the TNA", "a pass needs every checklist line ticked; a fail needs remarks", "a pass closes the TNA block; a fail goes to the factory and the merchandiser"],
 ["5.3", "Remarks · everyone", "QC blocks on the TNA show passed or failed; remarks open on click. The record's Remarks tab holds every remark; What happened holds the whole log.", "QC, cut ratios, revisions", "none", "none"],
])

# ------------------------------------------------------------------ 9
h2("9. Workflow 6 — Dispatch, receipt, COGS, Enigma, invoices")
steps([
 ["6.1", "Invoice and packing list · merchandiser", "After the dispatch actual: upload the factory's invoice (number, amount, file) and the packing list by size; then Send to Prince (the mail is editable).", "the factory's invoice", "dispatch logged", "Prince receives on Enigma"],
 ["6.2", "Received · Prince on Enigma", "PLM reads Enigma's receipt and shows it against the packing list, size by size: did everything reach.", "Enigma receipt", "none", "COGS opens"],
 ["6.3", "COGS · Nitin, category", "Per piece: fabric at the actual consumption, the factory's PO price, trims and packaging, transport, hemming, freight, overheads, PO logistics and other costs; against MRP net of discounts and GST.", "costing sheet; actuals", "none", "intake margin"],
 ["6.4", "Add to Enigma · category", "Design code, the name it sells as (editable), MRP, fit, colour, description, one SKU per size with pcs; add or remove a size; Add to Enigma; editable after.", "the record", "code, name, MRP and at least one size", "in Enigma with every size"],
 ["6.5", "✦ Product and marketing details · category", "Generate the product title, description, details, care, SEO title and pointers for marketing from what the record knows; edit; save to Enigma.", "the record", "none", "the product page copy"],
 ["6.6", "Invoices, debit and credit notes · Nitin", "Every document on the PO, both ways (factory to BSC; BSC to factory for material BSC supplied), with kind, number, amount, file and a note for accounts.", "typed", "none", "totals both ways for reconciliation"],
])

# ------------------------------------------------------------------ 10
h2("10. Databases")
table(["Database", "Fields", "Used by"], [
 ["Factory database", "factory, location, region, categories it specialises in, merchandiser, contact, lead time, MOQ, on-time rate", "counter sourcing recommends by category; each merchandiser's factories"],
 ["Cloth vendor database", "vendor, location, region, type (domestic, international, trims), what it supplies, contact, lead time, MOQ", "the vendor picker on the requirement puts vendors that supply that cloth first; the trim vendor"],
])

# ------------------------------------------------------------------ 11
h2("11. AI features")
p("AI features are specified. They are built in phase 1 if feasible; if not, they move to the next phase and the flows work without them, by hand.")
table(["Feature", "What it does", "Inputs", "Output"], [
 ["✦ Draft the requirement", "From category's own words (and any files attached), drafts the tech-pack items, fabric description and content, and trim card lines", "the brief, the style, attached files", "drafted items in the empty parts, for category to check"],
 ["✦ Product and marketing details", "After Add to Enigma, drafts the product title, description, details, care, SEO title and marketing pointers", "name, cloth, fit, colour, sizes, MRP, the brief", "copy saved to Enigma after edits"],
])
b("In the prototype.", "Both are simulated locally from keywords so the walkthrough shows the shape; the build calls the model.")

# ------------------------------------------------------------------ 12
h2("12. Dashboard")
p("For Parag and Nitin: OTIF over 90 days, open POs and pieces, running late, QC first-pass rate, PO to dispatch days; what is waiting on whom (counter-sourcing replies past deadline, every reply over target, TNA forms owed, QC points waiting, new cut ratios pending, critical POs); where every style is; by factory. The KPIs and their counting are settled with BSC during development.")

# ------------------------------------------------------------------ 13
h2("13. Business rules and validations")
ul([
 "Nothing goes to Production RTW until every part is complete; sourcing's part only when BSC is in the cloth.",
 "A reply over target cost or landing past the target in-house date is flagged; when none fits, category revises the target with a reason, and the earlier value is kept.",
 "Who supplies the cloth is chosen by category on the requirement and confirmed by Nitin before the PO.",
 "Delivery location: semi-stitched products to Vasai, everything else to the 3PL warehouse; category can choose either.",
 "When BSC sends the cloth, the TNA's Fabric PO and Yarn PO blocks are not needed.",
 "A failed colour is held (same PO) or dropped (separate requirement for the alternative); the other colours continue.",
 "Short or extra cloth or trims, or a dropped colour, asks category for a new cut ratio.",
 "A QC pass needs every checklist line; a fail needs remarks; a pass closes the TNA block.",
 "Every mail PLM composes can be edited before sending; PLM keeps what was sent.",
 "Each merchandiser sees only their own factories.",
 "No Enigma auto-PO on RTW; no AWB, courier or logistics in PLM.",
])

# ------------------------------------------------------------------ 14
h2("14. Enigma, mail and build order")
table(["Phase", "What", "Enigma"], [
 ["1", "Requirement with files, databases, counter sourcing, PO and mails, merchandiser, TNA and QC, cloth and cut ratio, dispatch and invoice, Remarks and What happened; AI features if feasible", "read: products, stock, vendors, stores, receipts"],
 ["2", "COGS against actuals, Add to Enigma (write), invoices and reconciliation, dashboard KPIs as agreed", "write: design and variants; read receipts by size"],
 ["3", "Real cost-reply and TNA forms for factories; mails sent from BSC's domain; AI features if not in phase 1", "events: receipt posted"],
])

# ------------------------------------------------------------------ 15
h2("15. Outcomes: what is solved, the benefits, the pain points gone")
p("What changes for each team once the RTW edition is live.")
table(["Pain point today", "What PLM does", "Benefit"], [
 ["Requirements arrive incomplete: tech pack, fabric or trim card missing, discovered at the factory", "The requirement with a gate; nothing moves until every part, sourcing's included, is in", "Factories start with everything; fewer stoppages and re-sends"],
 ["Tech pack and trim card spread across mail, WhatsApp and drives", "Every file on the record under the part it belongs to", "One place to find the latest; nothing lost between teams"],
 ["Factory quotes chased by phone; no record of who was asked or what they quoted", "Counter sourcing from the factory database, a mail with a deadline, replies in one table", "Faster factory choice; quotes comparable; history kept"],
 ["Quotes over budget or late found out after the PO", "Replies over target cost or past the target date flagged red; category revises with a reason", "Decisions made before the PO; every target change traceable"],
 ["Who buys the cloth unclear between BSC, vendor and factory", "Category chooses, Nitin confirms before the PO; the PO mail carries the vendor details", "No cloth falls between teams"],
 ["Delivery to the wrong warehouse", "Delivery location set on the requirement and printed on the PO", "Goods land where they are finished"],
 ["TNA kept in sheets; planned dates never agreed with the factory", "TNA form returned by the factory; planned · revised · actual on every block", "One agreed plan; slippage visible the day it happens"],
 ["Merchandisers chase across many chats", "Follow-ups across their factories: replies, forms, late steps, QC fails, invoices", "Nothing slips; less chasing"],
 ["QC remarks on WhatsApp; PP and size-set results lost", "QC screen with checklist, technical and aesthetic remarks; results on the TNA and to the merchandiser", "Quality issues caught before bulk; a record for every style"],
 ["Short or failed cloth stops the whole PO", "Colour by colour: hold for replacement or drop; new cut ratio for the rest", "The rest of the order keeps moving; fewer missed launches"],
 ["Printed factory invoices; the warehouse not told what is coming", "Invoice and packing list uploaded and mailed to Prince", "Receipt checked against the packing list; shortages found at once"],
 ["Debit and credit notes not tied to the PO", "Invoices, debit and credit notes logged on the PO both ways", "Reconciliation for accounts in one place"],
 ["COGS known late, if at all", "COGS per piece from the costing sheet and actuals against net MRP", "Margin per style the day goods land"],
 ["Product setup and copy typed by hand after launch", "Add to Enigma with every size in one step; ✦ AI drafts product and marketing copy", "Faster go-live; consistent product pages"],
 ["No one view of production", "Dashboard: OTIF, late, QC first-pass, waiting on whom, by factory", "Parag and Nitin see the whole book in one screen"],
])
b("For each team.", "Category: one form, files in place, AI drafts, clear asks for new ratios and target revisions. Sourcing: two jobs, a vendor database to pick from. Production RTW: factories recommended, quotes compared, PO and mails in a click, one dashboard. Merchandiser: one list of what is owed across their factories. QC: a worklist and a checklist. Warehouse: invoice and packing list before the goods. Accounts: every invoice and note on the PO.")
# ===================================================================== HTML · devx Doctrine
import re
def nd(t):
    """The doctrine allows no em dashes: a dash between clauses becomes a comma, an empty cell says None."""
    t=t.strip()
    if t in ('—', '-'): return 'None'
    t=re.sub(r'\s+—\s+', ', ', t)
    t=t.replace('—', ', ')
    return t
def split_head(t):
    """'4. Workflow 1 — Store' -> ('04', 'Workflow 1', 'Store'); '12. Business rules' -> ('12', None, 'Business rules')"""
    m=re.match(r'(\d+)\.\s+(.*)$', t); num, rest = (m.group(1).zfill(2), m.group(2)) if m else ('', t)
    m2=re.match(r'(Workflow \d+)\s+—\s+(.*)$', rest)
    return (num, m2.group(1), m2.group(2)) if m2 else (num, None, rest)
def esc(t): return H.escape(t)
def para_html(t): return '<br>'.join(esc(nd(x)) for x in t.split('\n'))

FONTS='<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@300;400;500;600;700&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,500;1,8..60,400&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />'
css = """
:root{--ink:#0A0A0A;--ink-2:#1A1A1A;--muted:#5C6066;--muted-2:#8A8F96;--rule:#E5E5E5;--rule-2:#F0F0F0;--paper:#FFFFFF;--paper-2:#FAFAF8;--paper-3:#F4F4F1;--accent:#1E6FFF;--accent-soft:#E8F0FF;--warn:#C0392B;--ok:#0A7C53;
--f-display:'Inter Tight',-apple-system,BlinkMacSystemFont,sans-serif;--f-serif:'Source Serif 4',Georgia,serif;--f-mono:'JetBrains Mono','SFMono-Regular',monospace}
*{box-sizing:border-box}
html{background:var(--paper)}
body{margin:0;font-family:var(--f-display);color:var(--ink);background:var(--paper);font-feature-settings:"ss01","cv11","tnum";-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;font-size:15px;line-height:1.5}
.page{max-width:960px;margin:0 auto;background:var(--paper);padding:64px 32px 96px}
.eyebrow{font-family:var(--f-mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin:0 0 12px}
.eyebrow b{color:var(--accent);font-weight:500}
h1{font-family:var(--f-display);font-weight:500;font-size:48px;line-height:1.05;letter-spacing:-.025em;margin:0 0 24px;color:var(--ink)}
h1 em,h2 em{font-family:var(--f-serif);font-style:italic;font-weight:400;color:var(--accent);letter-spacing:-.01em}
.lede{font-size:17px;color:var(--ink-2);max-width:720px;margin:0 0 32px}
.pill{display:inline-block;font-family:var(--f-mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;border:1px solid var(--ink);border-radius:999px;padding:4px 12px;margin-left:12px;vertical-align:middle;color:var(--ink)}
.meta{font-family:var(--f-mono);font-size:11px;letter-spacing:.08em;color:var(--muted);text-transform:uppercase;margin:0 0 48px}
.meta a{color:var(--muted);text-decoration:none;border-bottom:1px solid var(--rule)}
.meta a:hover{color:var(--accent);border-color:var(--accent)}
.stats{display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid var(--ink);margin:0 0 64px}
.stats > div{padding:16px 24px 8px;border-right:1px solid var(--rule)}
.stats > div:first-child{padding-left:0}.stats > div:last-child{border-right:0}
.stats .n{font-size:48px;font-weight:400;letter-spacing:-.035em;line-height:1}
.stats .l{font-family:var(--f-mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-top:8px}
nav.toc{border-top:1px solid var(--rule);border-bottom:1px solid var(--rule);padding:16px 0;margin:0 0 64px;columns:2;column-gap:48px}
nav.toc a{display:flex;gap:12px;padding:4px 0;color:var(--ink-2);text-decoration:none;font-size:14px;break-inside:avoid}
nav.toc a span{font-family:var(--f-mono);font-size:11px;color:var(--muted-2);min-width:24px;padding-top:2px}
nav.toc a:hover{color:var(--accent)}
section{margin:0 0 64px}
section > .eyebrow{margin-bottom:8px}
h2{font-weight:500;font-size:30px;letter-spacing:-.02em;line-height:1.15;margin:0 0 8px}
.rule-accent{width:64px;height:0;border-top:2px solid var(--accent);margin:0 0 24px}
p{margin:0 0 16px;color:var(--ink-2);max-width:720px}
p strong{font-weight:600;color:var(--ink)}
ul{margin:0 0 16px;padding-left:16px;max-width:720px;color:var(--ink-2)}
li{margin:0 0 8px}
table{border-collapse:collapse;width:100%;margin:8px 0 24px;font-size:13px}
th{font-family:var(--f-mono);font-weight:500;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);text-align:left;padding:8px 12px 8px 0;border-bottom:1px solid var(--ink);vertical-align:bottom}
td{padding:12px 12px 12px 0;border-bottom:1px solid var(--rule);vertical-align:top;color:var(--ink-2);line-height:1.5}
td:first-child{font-family:var(--f-mono);font-size:12px;color:var(--muted);white-space:nowrap}
table.steps td:nth-child(2){font-weight:500;color:var(--ink);min-width:130px}
table.steps td:nth-child(3){min-width:260px}
a{color:var(--accent)}
.foot{font-family:var(--f-mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted-2);border-top:1px solid var(--rule);padding-top:16px;margin-top:96px;display:flex;justify-content:space-between}
@media (max-width:760px){.page{padding:32px 16px 64px;margin:0}.stats{grid-template-columns:repeat(2,1fr)}nav.toc{columns:1}h1{font-size:34px}table{display:block;overflow-x:auto}}
@media print{html,body{background:#fff}.page{box-shadow:none;margin:0;padding:0}}
"""
heads=[split_head(c[1]) for c in C if c[0]=='h2']
nwf=sum(1 for h in heads if h[1])
out=[f'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>BSC PLM · RTW PRD</title>{FONTS}<style>{css}</style></head><body><div class="page">']
out.append('<p class="eyebrow"><b>Product requirements</b> · Bombay Shirt Company · v1.0<span class="pill">Confidential</span></p>')
out.append('<h1>BSC PLM, the <em>ready-to-wear</em> edition</h1>')
out.append(f'<p class="lede">{esc(nd(SUB))}</p>')
out.append(f'<p class="meta">{DATE} · devx Labs · <a href="bsc-plm-rtw-overview.html">View the overview</a> · <a href="bsc-plm-prd-rtw-v1.0.docx">Download the Word file</a> · <a href="../">Open the prototype</a></p>')
out.append('<nav class="toc">'+''.join(f'<a href="#s{i}"><span>{h[0]}</span>{esc((h[1]+": " if h[1] else "")+h[2])}</a>' for i,h in enumerate(heads))+'</nav>')
hi=-1; open_sec=False
for c in C:
    if c[0]=='h2':
        if open_sec: out.append('</section>')
        hi+=1; num,wf,title=heads[hi]; open_sec=True
        out.append(f'<section id="s{hi}"><p class="eyebrow"><b>Section {num}</b>{" / "+esc(wf) if wf else ""}</p><h2>{esc(title)}</h2><div class="rule-accent"></div>')
    elif c[0]=='p': out.append(f'<p>{para_html(c[1])}</p>')
    elif c[0]=='b': out.append(f'<p><strong>{esc(nd(c[1]))}</strong> {para_html(c[2])}</p>')
    elif c[0]=='ul': out.append('<ul>'+''.join(f'<li>{esc(nd(x))}</li>' for x in c[1])+'</ul>')
    elif c[0]=='table':
        cls=' class="steps"' if c[1][0]=='#' else ''
        out.append(f'<table{cls}><thead><tr>'+''.join(f'<th>{esc(nd(h))}</th>' for h in c[1])+'</tr></thead><tbody>')
        for r in c[2]: out.append('<tr>'+''.join(f'<td>{para_html(x)}</td>' for x in r)+'</tr>')
        out.append('</tbody></table>')
if open_sec: out.append('</section>')
out.append(f'<div class="foot"><span>BSC PLM · RTW PRD</span><span>devx Labs · Confidential</span></div></div></body></html>')
html_out='\n'.join(out)
assert '—' not in re.sub(r'<style>.*?</style>','',html_out,flags=re.S), 'em dash left in output'
open(sys.argv[1],'w').write(html_out)

# ===================================================================== DOCX · devx Doctrine
from docx.shared import RGBColor
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
INK=RGBColor(0x0A,0x0A,0x0A); INK2=RGBColor(0x1A,0x1A,0x1A); MUTED=RGBColor(0x5C,0x60,0x66); ACCENT=RGBColor(0x1E,0x6F,0xFF)
def font(run, name, size=None, color=None, bold=None, italic=None):
    run.font.name=name; rpr=run._element.get_or_add_rPr(); rf=rpr.find(qn('w:rFonts'))
    if rf is None: rf=OxmlElement('w:rFonts'); rpr.append(rf)
    for a in ('w:ascii','w:hAnsi','w:cs','w:eastAsia'): rf.set(qn(a), name)
    if size: run.font.size=Pt(size)
    if color is not None: run.font.color.rgb=color
    if bold is not None: run.bold=bold
    if italic is not None: run.italic=italic
def borders(el, **sides):
    pr=el._element.get_or_add_tcPr() if hasattr(el._element,'get_or_add_tcPr') else None
    b=OxmlElement('w:tcBorders')
    for side,(sz,col) in sides.items():
        e=OxmlElement(f'w:{side}'); e.set(qn('w:val'),'single'); e.set(qn('w:sz'),str(sz)); e.set(qn('w:color'),col); b.append(e)
    for side in ('top','left','bottom','right'):
        if side not in sides:
            e=OxmlElement(f'w:{side}'); e.set(qn('w:val'),'nil'); b.append(e)
    pr.append(b)
def spacing(par, before=0, after=8):
    par.paragraph_format.space_before=Pt(before); par.paragraph_format.space_after=Pt(after)
d=Document()
st=d.styles['Normal']; st.font.name='Inter Tight'; st.font.size=Pt(10); st.font.color.rgb=INK2
st.element.rPr.rFonts.set(qn('w:eastAsia'),'Inter Tight')
for s in d.sections: s.left_margin=s.right_margin=Cm(2.2); s.top_margin=s.bottom_margin=Cm(2.2)
pp=d.add_paragraph(); font(pp.add_run('PRODUCT REQUIREMENTS · BOMBAY SHIRT COMPANY · V1.0 · CONFIDENTIAL'),'JetBrains Mono',7.5,MUTED); spacing(pp,0,12)
pp=d.add_paragraph(); font(pp.add_run('BSC PLM, the '),'Inter Tight',28,INK,False); font(pp.add_run('ready-to-wear'),'Source Serif 4',28,ACCENT,False,True); font(pp.add_run(' edition'),'Inter Tight',28,INK,False); spacing(pp,0,12)
pp=d.add_paragraph(); font(pp.add_run(nd(SUB)),'Inter Tight',11,INK2); spacing(pp,0,12)
pp=d.add_paragraph(); font(pp.add_run(f'{DATE.upper()} · DEVX LABS'),'JetBrains Mono',7.5,MUTED); spacing(pp,0,24)
def add_cell(cell, text, head=False, first=False):
    cell.text=''
    lines=nd(text).split('\n') if text else ['']
    for k,l in enumerate(lines):
        par=cell.paragraphs[0] if k==0 else cell.add_paragraph()
        spacing(par,0,2)
        if head: font(par.add_run(l.upper()),'JetBrains Mono',6.5,MUTED)
        elif first: font(par.add_run(l),'JetBrains Mono',7.5,MUTED)
        else: font(par.add_run(l),'Inter Tight',8.5,INK2)
    borders(cell, bottom=(8,'0A0A0A') if head else (4,'E5E5E5'))
hi=-1
for c in C:
    if c[0]=='h2':
        hi+=1; num,wf,title=heads[hi]
        pp=d.add_paragraph(); font(pp.add_run(f'SECTION {num}'),'JetBrains Mono',7.5,ACCENT)
        if wf: font(pp.add_run(f' / {wf.upper()}'),'JetBrains Mono',7.5,MUTED)
        spacing(pp,24,4)
        pp=d.add_paragraph(); font(pp.add_run(title),'Inter Tight',18,INK,False); spacing(pp,0,10)
    elif c[0]=='p':
        for l in c[1].split('\n'): pp=d.add_paragraph(); font(pp.add_run(nd(l)),'Inter Tight',10,INK2)
    elif c[0]=='b':
        pp=d.add_paragraph(); font(pp.add_run(nd(c[1])+' '),'Inter Tight',10,INK,True); font(pp.add_run(nd(c[2])),'Inter Tight',10,INK2)
    elif c[0]=='ul':
        for x in c[1]: pp=d.add_paragraph(style='List Bullet'); font(pp.add_run(nd(x)),'Inter Tight',10,INK2)
    elif c[0]=='table':
        t=d.add_table(rows=1, cols=len(c[1]))
        for i,h in enumerate(c[1]): add_cell(t.rows[0].cells[i], h, head=True)
        for row in c[2]:
            cells=t.add_row().cells
            for i,x in enumerate(row): add_cell(cells[i], x, first=(i==0))
        d.add_paragraph()
pp=d.add_paragraph(); font(pp.add_run('BSC PLM · RTW PRD · DEVX LABS · CONFIDENTIAL'),'JetBrains Mono',7,MUTED); spacing(pp,36,0)
d.save(sys.argv[2])
print('ok', len(C), 'blocks')
