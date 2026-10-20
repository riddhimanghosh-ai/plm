# Builds the MTM-edition PRD as HTML (localhost docs) and DOCX from one content tree.
import html as H, sys, datetime
from docx import Document
from docx.shared import Pt, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH

DATE = '20 Oct 2026'
TITLE = 'BSC PLM — Product Requirements · MTM edition'
SUB = 'Made-to-measure end to end: the design loop, sourcing, the fabric master as Enigma holds it, purchase orders, the store, daily production and the factory floor. Workflows, user flows step by step, data sources, rules, build order.'

# content: list of ('h2', text) | ('p', text) | ('b', 'Bold lead.', 'rest') | ('table', headers, rows) | ('ul', items)
C = []
def h2(t): C.append(('h2', t))
def p(t): C.append(('p', t))
def b(lead, rest): C.append(('b', lead, rest))
def table(headers, rows): C.append(('table', headers, rows))
def ul(items): C.append(('ul', items))
def steps(rows):
    table(['#', 'Step · who', 'User flow', 'Data in (source)', 'System checks', 'Then'], rows)

# ------------------------------------------------------------------ 1
h2('1. Purpose and scope')
p('This is the requirements document for the MTM edition of BSC PLM: the version of the tool that covers Bombay Shirt Company\'s made-to-measure business end to end and nothing else. It is what the MTM prototype (VITE_EDITION=mtm, http://localhost:5176) shows, written down screen by screen so the delivery team can build from it. The workflows run in the order a shirt happens: the customer\'s order at the store, the day\'s production and the factory floor, then the cloth behind it — the fabric master, purchase orders, sourcing, the design loop and the swatch desk. The full prototype remains the reference for the ready-to-wear work; everything that is RTW-only is out of this document and comes in a later phase.')
p('BSC PLM is built beside Enigma, not inside it. Enigma stays the system of record for fabrics, vendors, customer orders, purchase orders and stock. BSC PLM reads what it needs over Enigma\'s API and keeps its own records for everything Enigma does not hold: the design loop on a new fabric, the vendor\'s terms and hold, the swatch desk, production plans, scans, changed sheets, cases and conversation. Where BSC PLM shows a field Enigma owns, it shows it under Enigma\'s own name, so what is typed here is what goes there.')
b('In scope.', 'The customer\'s order first: the store\'s MTM work (bills, fit profiles, trial and express, sheet corrections, returns, credit, refunds); MTM daily production (queue, plan, floor, changed sheets, extra fabric, ship-by moves), the factory merchandiser\'s MTM floor and the Factories screen. Then the cloth: the MTM fabric master as Enigma\'s fabric DB (fabric info, attributes, inventory, transactions, reservations); purchase orders, raised by Enigma or by hand, and the receiving line; the core weekly stock review; the sourcing desk and the vendor master; the MTM fabric requirement from ask to live online (five states); the swatch desk up to the handover to Yusuf; and the conversation and files on every record; and the cross-cutting bell and names rule.')
b('Out of this edition.', 'Everything RTW: style requests, planning review, launches, the production tracker and TNA, stock health, OTIF. "Several options at once" requests are retired: design raises each option as its own MTM fabric ask. FOB is retired: BSC buys the cloth. The warehouse portal (vehicle round, RTW lots, STOs, books, hemming round trip, GRN register) is held for a later phase; in this edition fabric receiving happens on the purchase order\'s receiving line and the swatch desk stops at the handover. Bespoke\'s daily mill list and parcel inward return with the warehouse portal; the store-side gate on sold-out bespoke cloth stays.')
b('Conventions.', 'Dates are the record\'s own. Quantities are pieces unless the unit says metres. A state is where a record IS, never the next step. Every rule marked later is specified but not built in the prototype. Field names in italics are Enigma\'s.')

# ------------------------------------------------------------------ 2
h2('2. Users and roles')
p('Six roles in this edition, one login per team; colleagues in a team appear by name on what they wrote. Each role lands on the first screen it works in. The sidebar lists teams as pills; a team opens to its screens.')
table(['Role', 'People today', 'Owns in BSC PLM', 'Lands on', 'Reads but does not edit'], [
 ['Design', 'Kunal, Janak', 'Every MTM fabric requirement; Push PO, More time or Reject on the vendor; the designs on a fabric and their push to Enigma; working, final and changed names; price per variant; go live online; pause and resume a fabric; promote to core; the fabric\'s Enigma fields', 'Requirements', 'Sourcing\'s desk, the swatch desk, purchase orders'],
 ['Sourcing', 'Sreekanth, Srikanth', 'One vendor against every ask; extension asks; the mills (Enigma\'s vendor master, Add Vendor, Edit Vendor); purchase orders raised by hand; mill confirmation and remarks; the receiving line; the weekly core stock review; trims and packaging', 'Fabric sourcing', 'Requirements'],
 ['Production (MTM)', 'Vishnu, Swati', 'Allocate pieces to factories, plans, the factory floor, changed sheets, extra fabric, ship-by moves; the Factories screen inputs', 'MTM daily production', 'Store orders'],
 ['Factory merchandiser', 'Abhin M, Bhupendra, the floor at each unit', 'MTM floor: receive, out, request cloth, log the day, read changed sheets', 'My factory', 'The order sheet and job card'],
 ['Store', 'Store managers (34 stores)', 'Bills, customer profiles, order-sheet corrections, returns and credit notes, refund requests', 'Store', 'Fabrics live today'],
 ['Owner', 'Akshay, Parag', 'Everything, read and write', 'Any', '—'],
])
b('Warehouse people in this edition.', 'Shravani and Yusuf do not have a portal here. Their work appears where it happens: Shravani books rolls on the purchase order\'s receiving line; Yusuf is the handover on the swatch desk. Both return as a role when the warehouse portal is added.')
b('Rules that follow from roles.', 'A button appears only for the role that owns the step; everyone else sees whose move it is. The factory merchandiser is scoped to one factory, the store manager to one store; a demo switch lifts both scopes for walkthroughs.')

# ------------------------------------------------------------------ 3
h2('3. Where the data comes from')
p('Enigma holds the transactions. BSC PLM reads them, shows them under Enigma\'s field names, and keeps its own records for the decisions. Write-back to Enigma is the last phase and only where access is granted.')
table(['Source', 'What BSC PLM reads', 'What BSC PLM writes (last phase, if granted)', 'What stays recorded only', 'Used by'], [
 ['Enigma · Fabric master (Edit Fabric Info)', 'Fabric Name, Inventory Type, Category, Product Type, Fabric Code, On Hold; Vendor Information (Vendor Name, Vendor Code for fabric, Mill Country, Mill Description, Currency, Cost per Unit, TAT in hours, MOQ, Mills); the Dynamic Attributes for shirts (Panna, Big-Checked, Thread Count, Fabric Ply, Wrinkle Resistance, Stretch, Consumed_In, Construction, Composition family, Washed Fabric, Washcare Description, Weight Class, Weave Description, Pattern, Fabric Color, Contrast Fabric, Fabric Piping, Is_Cutroll, Is_uniform, Weave, Composition); fabric image', 'Field edits made on the fabric record; On-hold on pause, resume or supplier switch-off; the new fabric at Push PO', 'Datasheet creation until write-back', 'Fabric master, design loop, sourcing, store'],
 ['Enigma · Fabric inventory (Edit Inventory)', 'Warehouse, Threshold, Max Inventory, Is Auto Replenishment, bins; physical, reserved, saleable', 'Threshold and bin edits; stock adjustment with Adjustment Reason and Description', '—', 'Fabric master, purchase orders, store "fabrics live today"'],
 ['Enigma · Fabric transaction and reservation logs', 'Every movement: date, order, PO, type, created by, warehouse, bin, reason, quantity; every reservation on punch', '—', '—', 'Inventory & movements on the fabric record; rate of sale'],
 ['Enigma · Fabric PO', 'Number, status, vendor, metres, created, overseer (the auto batch run), receiving line (ordered, received, pending, closed)', 'Create the PO at Push PO or Raise PO; Update Receiving Status', 'The PO number comes back to the record', 'Design loop, sourcing, purchase orders'],
 ['Enigma · Designs (Product Info)', 'SKU, Product Type, Weight, Region, Stock Mode, Primary Fabric, Status, Sales Channel, Media; variant option and values with price, discounted price and SKU per variant', 'Push to Enigma per design; re-push on a price change', '—', 'Design loop, store bill form'],
 ['Enigma · Orders and order sheet', 'Order lines, states, status history, sheet fields, ship-by, QR', 'Order-sheet corrections', 'Punching the order', 'Daily production, store, factory floor'],
 ['Enigma · Vendors', 'Code, Name, Vendor Type, Address, Office Phone, Office Email, Active, Categories', 'Add Vendor, Edit Vendor', '—', 'Mills, sourcing'],
 ['Shopify', 'Sales by product code, customer profile', '—', 'Listing, price, stock push', 'Customer card, rate of sale'],
 ['Mill stock lists (email, WhatsApp)', 'Article, metres, price', '—', '—', 'Bespoke availability (store gate)'],
 ['Sheets, imported once', 'Fabric ordering, Merchandise Master, revised names, swatch tracker, Trims Working', '—', 'Kept read-only one month in parallel', 'Seed and open items at go-live'],
 ['Typed in BSC PLM', 'Requirements, vendor terms and holds, extension asks, designs, names, swatch dates, plans, scans, corrections, cases, comments, files', '—', '—', 'All workflows'],
])
b('Computed by BSC PLM, never typed:', 'saleable metres, weeks of cover, rate of sale, the reorder point and suggested PO, headroom per factory, store credit balance, the sheet version, every alert.')
b('Freshness.', 'Enigma\'s fabric read is one call of about 3.2 MB with no change filter, so it is polled nightly and on demand. Transaction reads need a code per call until a date range is confirmed. Shopify sales are read daily. Everything typed in BSC PLM is live.')

# ------------------------------------------------------------------ 4
h2('4. Workflow 1 — Store')
p('The MTM side of the store page: customers, orders, what I can sell, returns and alterations. Anyone not from that store can read it but not act.')
steps([
 ['1.1', 'Look up the customer · store', '1. Store → Customers: search by name or phone. The card shows home store, visits, spend, store credit with every note, measurements on file by fit profile, usual fabrics, past orders, open cases.\n2. Punch MTM order, measurements pre-filled starts a bill with the last profile loaded.', 'profile and spend from Shopify; orders, cases, credit from BSC PLM', 'none', 'nothing is written until a bill is punched'],
 ['1.2', 'Punch a bill · store', '1. + Punch a bill, pick the customer, + Piece per item.\n2. For each MTM piece: the fabric from "fabrics live today" (only fabrics open for selling, with the metres the store can still reserve), the design on it, the fit profile (a customer keeps several), who took the measurements, quantity. The order sheet opens pre-filled from the last order on that profile.\n3. Above the pieces: Trial shirt first for a new customer (about 25 days) or Urgent (7 to 8 days, ₹600); a comment for the factory; a comment for shipping.\n4. Apply store credit nets off up to the balance. Punch bill shows one bill number and one order number per piece with the promise date.', 'fabric list and metres from Enigma; credit from the ledger', 'only live fabrics can be picked; a sold-out bespoke fabric cannot be picked; credit capped at the balance', 'metres are reserved; the pieces join production\'s queue after the freeze window (workflow 2)'],
 ['1.3', 'Follow the orders · store', '1. Store → Orders lists every piece punched here with its stage. One button per row: Handed to customer.\n2. A ship-by moved by production reads "moved from 14 Oct, tell the customer" and lands in the bell.', 'workflow 2', 'none', 'handing over closes the piece'],
 ['1.4', 'Correct the order sheet · store', '1. The sheet is Enigma\'s layout: measurements, pattern details, options. Every field that can be corrected is a dashed tile with a pencil on hover and a chip "click any field to correct it".\n2. The associate clicks the field, types the correction and why, and saves. The sheet heading reads Order sheet · V1 · as punched, then V2 · changed once, V3 · changed 2 times; the change log shows the version each change produced.', 'typed', 'anything until the piece is allocated; remarks only after; nothing once made', 'production sees it on Changed sheets; the factory sees the amended version flagged for reprint, and the warning says which version the factory holds'],
 ['1.5', 'Return or alteration case · store manager', '1. Return or alter on a delivered piece: the form shows whether it is inside the 30-day window (free alteration, credit note on return) or chargeable; reason, what the customer wants (Exchange, Credit note, Remake, Refund), remarks. Raise case gives a number and a 10-day promise.\n2. The ladder: Alter in store, Swap from the shelf, Send out, Refit, Remake, Take it back; each rung records its outcome; the case closes on the first that works.', 'delivered pieces; typed', 'only pieces delivered from this store', 'credit note on take-back: CN-<case>, MRP, valid one year, offered on the next bill'],
 ['1.6', 'Refund approval · store, owner, finance', '1. Refund reads "requested, needs approval". The owner approves from the bell; finance clicks Moved with the reference.', 'amount from the MRP', 'approval before movement', 'the ledger carries it'],
])
b('Alerts.', 'Store: case past its promise; a fabric closed for selling; ship-by dates moved by production; a refund awaiting approval (owner).')

# ------------------------------------------------------------------ 5
h2('5. Workflow 2 — MTM daily production and the factory floor')
p('The production unit runs its day from one screen: Allocate, Plans, Factory floor, Changed sheets, Extra fabric. The system proposes the plan from each factory\'s spare capacity and a person confirms it. Every move of a piece is a scan. Daily output, aging and the capacity inputs sit on the Factories screen.')
b('Stages, in order.', 'Order (punched at the store) → PP (waiting for a factory; frozen 2 hours for store-side changes) → PP · planned (on a plan; job card printed; fabric cut) → In production (scanned out of the unit) → In factory (scanned in; aging after 5 days) → Out factory (QC passed) → RTS (back at the unit) → Fitting / shipping → Delivered. Cancelled can happen before cutting.')
steps([
 ['2.1', 'The queue fills · system', '1. Every MTM piece joins Allocate once its freeze window (2 hours, a setting) has passed; pieces inside the freeze sit in a grey strip with the time they join.\n2. Urgent first, then oldest; trial and express carry their shorter promise; bespoke shows "waiting for cloth" until its parcel is in.', 'orders punched in Enigma', 'not allocatable inside the freeze; bespoke not before its parcel', '—'],
 ['2.2', 'The system proposes · system', '1. One card per MTM factory: feed target, pieces on the floor and their age, in transit, headroom today, load in days, the number proposed.\n2. Corporate pieces to the corporate factory; urgent to the factory with an urgent reserve if room, else the nearest with room; the rest to the most headroom, oldest first.', 'Factories screen inputs; day logs', 'headroom = daily capacity − in transit − pieces beyond two days of work', '—'],
 ['2.3', 'The planner confirms · production', '1. Tick pieces (all, oldest 20/30/50, or the card\'s proposal), pick the factory; the card shows headroom after this plan and "over by N" in red.\n2. Submit N to <factory>; over headroom the button reads Send anyway and records the override.', 'typed', 'over headroom refused unless forced; urgent sets ship-by = punch + 2 days', 'a plan number; pieces read PP · planned; the cut list fills; the factory sees "on its way"'],
 ['2.4', 'Cut and bundle · unit', '1. Each plan shows a cut list by fabric and the order sheets, any changed sheet marked with its version. Print sheets, cut, Scan out all.', 'the plan; consumption from Enigma', 'the plan must be submitted', 'In production; metres off stock and reserved at the scan'],
 ['2.5', 'The factory scans · merchandiser', '1. My factory: on their way, on the floor, ready. Received per piece or selection; Out of the factory when done; Log the day at day end with pieces out and a note.', 'scans; typed counts', 'each piece must be at the previous stage', 'the Factories screen shows the factory\'s count beside the scanned count, amber when they differ'],
 ['2.6', 'A sheet changes after planning · store, production, factory', '1. The store\'s correction becomes Amend, re-issue to factory once planned. Changed sheets shows the amendment with the changed fields; Plan on this, Told factory, or Pull back to PP on a fabric change.\n2. The factory portal lists it under Changed after it reached us with the version; Read and reprint.', 'typed', 'store freely until allocation, remarks after, nothing once made; production freely until planning; amendments flagged for reprint in transit or in factory', 'a numbered version with who, from, to, reprint flag, when production and the factory read it'],
 ['2.7', 'Move a ship-by · production', '1. One piece: Factory delayed, move ship-by with a date and why. A whole floor: pick the factory, days and one reason.', 'typed', 'open pieces only', 'original date kept; the store reads "moved from…, tell the customer"; the portal marks "moved"'],
 ['2.8', 'Extra fabric · factory, production', '1. The merchandiser asks for extra cloth: cloth, panel (front 0.8 m, both fronts 0.9, sleeve 0.8, both sleeves 0.9, collar 0.3, cuff 0.3), metres, reason (factory error or PP error), note.\n2. Production sees the shelf before and after; Approve or Decline with a note.', 'typed', 'the order needs a fabric and a factory; later capped at the panel allowance', 'approval deducts the metres at once; factory errors count on the vendor, PP errors on the consumption rule'],
 ['2.9', 'Round, dispatch, delivery · unit, shipping, store', '1. Pieces scanned RTS at the unit, packed and shipped; the store hands over (1.3).', 'scans', 'none', 'delivered'],
])
b('Factories screen.', 'Capacity & planning inputs per factory (tailors, nominal and measured output, feed target, distance, corporate, urgent reserve, grade), Daily output (the WhatsApp table, live, keyed beside scanned), Aging (pieces past ship-by by factory, stage and days), On-time performance.')
b('Alerts.', 'Production: pieces past ship-by; changed sheets pending; extra-fabric asks to decide. Factory: unread changes; pieces to receive; a ship-by moved.')

# ------------------------------------------------------------------ 6
h2('6. Workflow 3 — The MTM fabric master, as Enigma holds it')
p('One list and one record. The list is Enigma\'s fabric inventory with its columns; the record is Enigma\'s fabric DB with its screens, shown as tabs so nothing is folded away.')
steps([
 ['3.1', 'Fabric inventory · design, sourcing', '1. MTM fabric master → What sells → Fabric inventory lists every MTM fabric with Enigma\'s columns: code, name, category, inventory type, saleable, physical, reserved, threshold, status chip.\n2. A strip of swatch books filters the list; Core / Non-core narrows it; On the shelf shows what is sellable now; warehouse select; export.\n3. The sell-status cell carries one action for the state it is in: Pause selling…, Resume, Switch back on, Switch off · supplier.', 'Enigma fabric master and inventory', 'only one action per state', 'pause and switch-off set Enigma\'s On Hold'],
 ['3.2', 'The fabric page · everyone', '1. A fabric opens as its own page (#/fabric/<id>) with a facts strip — on the shelf, reserved, on order, saleable, threshold, cost per metre, weekly sales, status — and five tabs.\n2. Overview: where it stands (bucket, promote or demote, supply block for core, family, vendor, book), sales over 12 weeks, in stores.\n3. Purchase orders: how this fabric is reordered (Enigma raises it, or a person) with the reorder point and whether it is under it; every PO on the fabric with its source pill and its receiving line.\n4. Fabric info · Enigma: Edit Fabric Info and Vendor Information, then the Dynamic attributes for shirts, each editable.\n5. Inventory & movements: Edit Inventory (Warehouse, Threshold, Max Inventory, Is Auto Replenishment, bins), Adjust stock with reason and description, the Fabric transactions log and the Fabric reservations log.\n6. Files & conversation.\n7. Rename this fabric keeps the old name in the history; the code never changes.', 'Enigma; GRNs; cuts; typed adjustments', 'rename needs a new name; adjustments are signed metres with a reason', 'every edit is what goes to Enigma; the same record opens as a drawer with the same tabs from the inventory list'],
])

# ------------------------------------------------------------------ 7
h2('7. Workflow 4 — Purchase orders and supply')
p('Two ways a PO gets raised, said plainly on the screen. Enigma · auto: its batch run orders a domestic core fabric the moment saleable stock falls under the threshold. By hand: a person pushes it — sourcing for international core, which Enigma never orders; design for a new fabric (workflow 6).')
steps([
 ['4.1', 'Purchase orders · sourcing', '1. MTM fabric master → Purchase orders & supply → Purchase orders lists every open PO with a pill on each: Enigma · auto, by hand · design, by hand · sourcing.\n2. Filters: All open, Enigma raised · auto, Raised by hand, Needs a PO by hand, Mill not confirmed, Confirmed.\n3. "Needs a PO by hand" lists international core under its reorder point with nothing on order, each with Raise PO · N m; a click raises it.\n4. When the mill replies the sourcer clicks Mill confirmed… and types the date and remark; later Update date / remark.', 'Enigma fabric POs; computed reorder points', 'Raise PO only under the point with no open PO', 'an auto-PO the mill has not confirmed is a chase after 2 days; the receiving line (6.5) books the rolls'],
 ['4.2', 'Core · weekly stock review · sourcing', '1. One plain table: fabric, mill, saleable, reorder state (above / under, PO if any, Raise PO for international), what the mill last said and when, a Review button that opens an inline status (In stock, Delayed, Run out), a back-on date and a note, and the selling cell.\n2. Filters: All, Review due, Under the reorder point, PO by hand, Switched off.', 'typed', '"review due" when never asked or 7 or more days ago', 'delayed or run out goes to design, who switch the fabric off; back in stock, they switch it on'],
 ['4.3', 'Trims & packaging · sourcing', '1. The trims master with stock, threshold, incoming and cost; a BOM line on a requirement reads from it.', 'Trims Working sheet; receipts', 'none', '—'],
])
b('The rule.', 'Saleable = physical − reserved − floor. Rate = shirts a week over 8 weeks. Metres a week = rate × 2.15. Lead-time demand = metres a week × lead days ÷ 7. Reorder point = the larger of lead-time demand and the vendor\'s MOQ. Under it when saleable + on order ≤ the point. PO = the MOQ. Never for bespoke. Promotion to core lifts the floor to 40 m if under 20.')

# ------------------------------------------------------------------ 8
h2('8. Workflow 5 — Sourcing desk and the mills')
p('Sourcing sees only what is theirs to do: add a vendor to a new ask, or answer an extension ask. Two tabs, never overlapping: Your move (state 1 and extension asks) and Waiting on design (state 2). Records from state 3 onwards are not on the desk; they are on Purchase orders.')
steps([
 ['5.1', 'Your move · sourcing', '1. Each row is one ask: what design asked for (name, why, book, month, attachments), then The vendor (empty, or the extension asked).\n2. Add vendor as 6.2, or Extend / Drop vendor as 6.4.', 'requirements', 'none', 'the row moves to Waiting on design'],
 ['5.2', 'Waiting on design · sourcing', '1. Rows in state 2 with the vendor card as design sees it. Nothing to do; the desk shows how long design has had it.', 'requirements', 'none', '—'],
 ['5.3', 'Find a fabric · sourcing', '1. On Fabric vendors → Find a fabric the sourcer types a cloth, code, article, composition, book or mill. Filters: mill, where from, bucket, swatch book; sort by name, cheapest, fastest, least cover.\n2. Each row: fabric and code, composition with panna, vendor, TAT · MOQ, cost per unit in the mill\'s currency, a yes/no on whether it can be bought today (hover for why not), and how many other mills do this cloth, with a compare panel.\n3. Clicking a row opens the fabric\'s page (workflow 3).', 'fabric master; mills', 'none', '—'],
 ['5.4', 'The mills · sourcing', '1. Fabric vendors → The mills is Enigma\'s vendor list: Code, Name, Vendor Type, Address, Office Phone, Office Email, Categories, Active, with TAT · MOQ and the fabric count.\n2. + Add Vendor opens the same form as Enigma\'s Add Vendor, plus the Vendor Information block (Mill Country, Mill Description, Currency, TAT in hours, MOQ). Saving opens the new mill.\n3. A mill\'s record opens on "Vendor · as in Enigma" with Edit Vendor; then its fabrics, performance, blocks, files and conversation.', 'Enigma vendors; typed', 'name required', 'what is saved here goes to Enigma at write-back'],
])

# ------------------------------------------------------------------ 9
h2('9. Workflow 6 — Design: an MTM fabric, requirement to live online')
p('One new made-to-measure fabric, shade or construction variant runs on one record. The record is always in exactly one of five states, and the list shows that state in one column: 1 Requirement requested (sourcing has to add a vendor) · 2 Vendor added (design has to punch the PO) · 3 PO punched (the cloth is on its way) · 4 Fabric in (design adds the designs and configures Enigma) · 5 Live online. The record opens on four sections in that order; there is no section for "PO punched" because it is a state, not work.')
b('Trigger.', 'Design sees a gap in a swatch book, a customer ask, or a variant worth making. Done when the fabric is live online with its designs in Enigma. Stores follow the swatch desk and are not a gate for going live online.')
steps([
 ['6.1', 'Raise the requirement · design', '1. On Requirements the designer clicks + New requirement. They choose a new fabric or shade, or a variant of an existing fabric (picked from the master).\n2. They type a working name, why BSC needs it, the swatch book it belongs in, the month wanted, and attach a sketch, swatch photo or pattern file. Samples are optional and sit in a fold.\n3. They click Raise. The record is in state 1 · Requirement requested.', 'typed; base fabric from Enigma\'s fabric master', 'name and why required; a variant\'s base must be an inventory fabric over 20 m, not bespoke, not paused or on hold', 'the ask appears on sourcing\'s desk under Your move'],
 ['6.2', 'Sourcing adds the vendor · sourcing', '1. On Fabric sourcing → Your move the sourcer opens the ask and clicks Add vendor.\n2. They pick the mill, type the mill\'s article, cloth name, price per metre, MOQ, lead days, hold-until (defaults to today plus the mill\'s usual hold), composition, panna, book and a note.\n3. They click Save vendor. The record moves to state 2 · Vendor added and leaves sourcing\'s list for Waiting on design.', 'typed; mill from the vendor master', 'mill, price and cloth name required; one live vendor per ask, a second replaces the first and the first is kept as replaced', 'design is reminded; urgent at 5 days of hold left'],
 ['6.3', 'Design answers on the vendor card · design', '1. The vendor card shows the terms (price, MOQ, lead, hold-until, article, composition, panna) and the first buy.\n2. The designer types the metres (defaulted to the MOQ); the amount follows the metres as they type.\n3. They click Push PO, More time, or Reject with a reason. There is no sample gate on this card.', 'metres typed; price from the vendor card', 'Push PO is refused on a lapsed hold until sourcing extends it; Reject needs a reason', 'Push PO: the fabric PO is punched (Enigma\'s number, or a stand-in FPO number until write-back), the fabric is added to the master in the non-core bucket, on hold, and the record moves to state 3 · PO punched. More time: an extension ask goes to sourcing and the record shows "extension asked". Reject: back to state 1'],
 ['6.4', 'Extend, send back or drop · sourcing', '1. An extension ask appears under Your move. The sourcer types the new hold date and clicks Extend, or Drop vendor if the mill will not hold.', 'typed', 'extend must be later than the old date (later)', 'back to 1.3'],
 ['6.5', 'The purchase order and its receiving line · sourcing, warehouse', '1. The PO shows inside section 2 of the record under "The purchase order": number, metres, amount, raised on, mill confirmation.\n2. Enigma\'s receiving line sits under it: Receiving Status, Ordered Quantity, Total Received Quantity, Pending Quantity, a Received Qty box, Close, and Update Receiving Status.\n3. Rolls land in parts. Each update books the metres and raises a GRN; ticking Close with metres pending cancels the balance.\n4. The same line is on Purchase orders (workflow 4).', 'PO from 6.3; metres counted', 'metres received never above pending', 'the shelf goes up and incoming down on every update; when the line is received or closed the record moves to state 4 · Fabric in'],
 ['6.6', 'Designs on the fabric · design', '1. In section 3 · Fabric in the designer clicks + Add a design and fills Enigma\'s Product Info: SKU, Product Type, Weight, Region, Stock Mode, Primary Fabric (this cloth), Status, Sales Channel, Media.\n2. They type a variant option name (Size, Fit, anything) and its values as free text; the table beneath takes a price, a discounted price and a SKU per value (defaulted to code-value).\n3. They write what the customer reads: description and buzzwords.\n4. Save mints a product code (BOM-SHI-FM/CS-nnnn). Push to Enigma on the row sends it; the row then reads "in Enigma · synced <date>".', 'typed', 'a design needs a name and at least one variant with a price; price lives on the variant only, there is no separate money block', 'the store\'s bill form offers the design; a price change on a design already in Enigma re-pushes it and stamps the sync date'],
 ['6.7', 'Configured in Enigma · design', '1. The designer sets the fabric up in Enigma (template, base and buffer consumption) and clicks Configured in Enigma on the record with those values. Big-Checked and composition family are fabric attributes and are edited on the fabric record (workflow 3), not here.', 'typed; later read back', 'template and base metres required', 'consumption on the order sheet reads base + buffer; a Big-Checked fabric adds matching'],
 ['6.8', 'Name and price · design', '1. The name block shows the working name, the final name and the history of every earlier name with who, when and why. The final name can be set or changed at any time.\n2. Price is per variant on each design (6.6).', 'typed', 'none', 'website, sticker and Enigma read the final name; a change after a sticker was printed flags "out of date · reprint" on the swatch desk'],
 ['6.9', 'Live online · design', '1. Section 4 · Live online lists the online gates: photos, video, post-production, product page, and Go live online.\n2. The designer works them in any order and clicks Go live online. Stores are not a gate here.\n3. Story and live in stores are hidden in this edition; stores follow the swatch desk.', 'typed', 'go live blocked until composition and a description are on the record; every other gate is advisory and the skips are kept', 'state 5 · Live online; the fabric comes off hold for the website'],
])
b('Cases.', 'New shade of a known fabric: no sampling. Re-source from another mill: a new ask. Paused before live: hidden from the website and the order form; the record stays until design closes it. Core replenishment and bespoke are never requirements (workflow 4).')
b('Alerts.', 'Design: a vendor added and waiting for Push PO (urgent at 5 days of hold left); fabric in with no design yet; a design not pushed to Enigma. Sourcing: a requirement with no vendor; an extension asked. Every line in the bell names the workflow and the state (see section 12).')

# ------------------------------------------------------------------ 10
h2('10. Workflow 7 — Swatch desk, phase one')
p('In this edition the desk runs from cloth in to the handover to Yusuf. Cut, sticker, dispatch, photos and stores told are the next phase, with the warehouse portal.')
steps([
 ['7.1', 'Cloth in → to Yusuf · warehouse', '1. Swatch desk lists every new fabric whose PO has received metres. Each row has one button: Handed to Yusuf (tick Priority-1 if urgent).\n2. The row keeps the dates and who did it; files and conversation sit on the row.', 'the receiving line (6.5)', 'steps in order', 'design sees "with Yusuf" on the record; Priority-1 reminds until done'],
])
b('Phase two on this desk.', 'Yusuf cuts the swatches for every store, prints the sticker (fabric code, design name with article, book, price from the record), dispatches one parcel per store, takes the photos; design marks stores told; a name or price change after the sticker flags a reprint.')

# ------------------------------------------------------------------ 11
h2('11. Workflow 8 — Conversation and files on every record')
p('Nothing is emailed and nothing lives in a WhatsApp group: the record is the thread. Every record in this edition — a customer order, a customer, a fabric, a requirement, a mill, a return case — carries a conversation and a set of files at the bottom of its page or drawer. Anyone who can open the record can read and write there. A mention puts a line on the mentioned person\'s bell, and it stays until that person marks it dealt with.')
steps([
 ['8.1', 'Post on a record · anyone who can open it', '1. At the foot of the record, Conversation · N shows every comment in order with who, role, when and the step it is about.\n2. The writer picks the step (per record: a requirement has General, Fabric, PP sample, Shipment sample, Approval, Enigma; a customer order has General, Change from store, Fabric, Alteration; a customer has General, Fit, Preferences, Complaint; the swatch desk has Cut & packed, Dispatch, Marketing · go live, General), types the comment, optionally attaches files, and clicks Post.\n3. Comments can be filtered by step.', 'typed; files', 'a comment needs text', 'the comment is on the record for everyone; the toast says who will see it'],
 ['8.2', 'Mention a person or a team · writer', '1. Typing @ and a name or a team (@kunal, @sourcing, @design) mentions them. The mention is resolved against the people and roles list.\n2. A store writing on a customer order mentions whoever holds the piece by default: production for an MTM piece in PP or at a factory.', 'typed', 'unknown names are plain text', 'each person mentioned, and everyone in a mentioned team, gets a line under Messages on their bell'],
 ['8.3', 'Read and deal with a mention · the person mentioned', '1. Waiting on you → Messages lists every mention, newest first, grouped by day, with the record it is on (name and code), the step, the text, and who wrote it. Filters: all, this week, earlier.\n2. Clicking the text opens the record at the conversation.\n3. Mark resolved says it was dealt with; the comment stays on the record with who resolved it and when. Resolve all clears the list. A resolved mention can be put back.', 'threads', 'a mention is done when it is dealt with, not when it is read', 'the bell count drops; the writer sees who resolved it on the record'],
 ['8.4', 'Files on a record · anyone who can open it', '1. Files · N lists every attachment with a label per record kind. A requirement takes PAT file, CAD / pattern, tech pack, sketch or reference image, sample photo, green slip, approval note, fabric swatch image. A fabric takes swatch image, test report, mill stock sheet, vendor quote, block confirmation, datasheet. A customer order takes order sheet, alteration note, photo, measurement sheet. A customer takes a photo in the fit sample, reference image, measurement sheet, old bill. A mill takes agreement, rate card, capacity sheet, audit report. A return takes photo, invoice, alteration note. The swatch desk takes photos of the cut swatches, dispatch photo, sticker page, marketing lines, reference.\n2. Upload, pick the label, optionally the step; images preview inline. A file attached to a comment carries the label Attachment.', 'files', '25 MB per file', 'the file stays with the record; the sticker and the website read the swatch image and the marketing lines from here'],
 ['8.5', 'Posts the system writes · system', '1. Some actions write a comment themselves so the record tells its own story: posting an approval writes it once under Approval for every role to read; a rename, a pause, a ship-by move and a refund approval each leave a line with who and why.', 'actions', 'none', 'the audit and the conversation are the same thread'],
])
b('Rules.', 'One thread per record, in order, never deleted. Everyone who can open the record can read all of it; there is no private comment. A mention goes to a person or to a team; a team mention lands on every member\'s bell. Resolving is per person and is kept on the comment. Nothing is sent by email or WhatsApp; the record is the only copy.')
b('Alerts.', 'Messages on the bell: every unresolved mention of me or my team. The count on the bell is things to do plus unresolved mentions.')

# ------------------------------------------------------------------ 12
h2('12. Cross-cutting behaviour')
b('The bell · Waiting on you.', 'One bell per person showing their team\'s items, grouped by the job in plain words ("Give a new cut ratio", "Raise the purchase order", "Add a vendor") with a count and how many are urgent. Each line names the record, the workflow it belongs to (MTM fabric ask, Swatch desk, Store floor, MTM production, Fabric master…), where the record stands now ("2 of 5 · Vendor added"), why it is on the list, and an Open button to where the job is done. Lines are recomputed from the records on every change and disappear the moment the record moves. Messages (mentions) are the second tab.')
b('Sidebar.', 'Teams are pills with a role-coloured dot and a count; a pill opens to its screens on a rail. The team you are in is marked. Saved views keep a screen with its filters by name.')
b('Records.', 'A fabric is a page with a facts strip and tabs; a mill, a requirement and an order open as drawers whose sections open scrolled to their heading. Every record carries files and a conversation with mentions (workflow 8); nothing is emailed, the record is the thread.')
b('Names.', 'A fabric, a design and a launch each carry a working name, a final name and a history of every earlier name with who, when and why. The code is the identity; analytics key on the code and show the current name.')
b('Who acts next.', 'Every record header carries one state. A button appears only for the role that owns the step; others see whose move it is. Fields that can be edited look editable: dashed tiles, a pencil on hover, a chip that says so.')
b('Lists.', 'Paged at 20 to 25; filters and the open record in the URL so a view is shareable and Back works; every list exports to .xlsx; search across requirements, fabrics, mills, orders, customers.')
b('Undo and audit.', 'The last ten writes can be undone for seven seconds by the person who made them. Every write appends who, when and what; order sheets keep versions V1, V2, V3 with from and to; ship-by moves keep the original date and the reason.')

# ------------------------------------------------------------------ 13
h2('13. Data model summary')
table(['Record', 'Key fields', 'Source of the fields', 'Owned by'], [
 ['Fabric', 'code, name (with nameHistory), bucket (core, non-core, bespoke), vendor, vendorCode, composition, widthIn (Panna), cpm, mrp, swatchBook, stockMetres, reservedMetres, incomingMetres, thresholdMetres, onHold, paused, supply review, coreBlock, millAvailable; category, productType; mill {country, description, currency, costPerUnit, tatHours, moq, mills}; attrs {the twenty dynamic attributes}; inventory {warehouse, thresholdMetres, maxMetres, autoReplenish, bins}; transactions', 'Enigma fabric master, inventory and logs; typed (pause, review, block, adjustments)', 'Design, sourcing'],
 ['Vendor (mill)', 'id, name, kind, location, region, leadDays, moq, blockWindowDays, onTimeRate; enigma {vendorCode, vendorType, address, officePhone, officeEmail, active, categories, country, description, currency, tatHours}', 'Enigma vendors; typed', 'Sourcing'],
 ['Concept (MTM fabric ask)', 'kind, name, finalName, nameHistory, brief, book, targetMonth, baseFabricId, fabricOptions (one live vendor with hold, chosenBy, rejected, extensionAsked), fabricId, fabricPo, enigma {template, consumptionBase, consumptionBuffer, configuredOn}, designs, swatch {inwardOn, handoverOn, priority, …}, online {photosOn, videoOn, postOn, liveOn}; derived mtmStage 1–5', 'Typed; PO number and fabric code from Enigma', 'Design, sourcing'],
 ['ConceptDesign', 'code, name, finalName, nameHistory, productType, weightGrams, region, stockMode, status, salesChannel, media, sizeOptionName, sizes, variants {value, price, discountedPrice, sku}, description, buzzwords, enigmaOn, enigmaSyncedOn', 'Typed; pushed to Enigma', 'Design'],
 ['Fabric PO', 'poNo, fabricId, vendorId, metres, raisedOn, source (auto | manual), expectedOn, vendorConfirmedOn, remark, receivedMetres, receipts, closedOn, closedShort', 'Enigma PO or minted; typed confirmation; receiving updates', 'Sourcing'],
 ['Customer order (MTM piece)', 'orderNo, billNo, customer, fabricId, designId, fit, fitProfile, measuredBy, trial, express, factoryComment, logisticComment, qty, punchedOn, promisedOn with revisions, tag, planId, factoryId, consumptionM, scans, spec, measurements, pattern, revisions (each a version)', 'Enigma order sheet; typed at the store; scans', 'Store, production, factory'],
 ['Production plan', 'planNo, factory, orders, forcedOver', 'Computed proposal, confirmed', 'Production'],
 ['Extra fabric request', 'order, cloth, panel, metres, reason, status', 'Typed', 'Factory, production'],
 ['Return case · credit entry', 'caseNo, piece, reason, wants, ladder attempts, refund or credit note; credit amount, note number, valid one year', 'Typed', 'Store, finance'],
 ['GRN', 'number, kind, against PO, quantity, rejected, who counted', 'Receiving line', 'Warehouse (recorded)'],
 ['Trims item', 'item, stock, threshold, incoming, cost', 'Trims Working sheet; receipts', 'Sourcing'],
 ['Thread and comment', 'kind (order, fabric, concept, customer, vendor, return), subjectId; comment {at, who, role, text, step, mentions (person or role ids), resolved [{by, at}]}', 'Typed; system posts', 'Everyone who can open the record'],
 ['Attachment', 'record kind and id, label (per record kind), step, file, who, when', 'Uploaded', 'Everyone who can open the record'],
])
p('Identifiers minted by BSC PLM until Enigma supplies them: fabric codes for new cloth, product codes for designs, fabric PO numbers, bill and order numbers, plan numbers, GRN numbers, case numbers, credit note numbers. Each is replaced by Enigma\'s own where write-back is granted.')

# ------------------------------------------------------------------ 14
h2('14. Business rules and validations')
table(['Area', 'Rule'], [
 ['Requirements', 'Name and why required. A variant\'s base fabric must be inventory, over 20 m, not bespoke, not paused or on hold. A requirement is in exactly one of five states; the state is derived, never typed.'],
 ['Vendors and holds', 'One live vendor per ask; a second replaces the first and is kept as replaced. Push PO refused on a lapsed hold until sourcing extends it. Reject needs a reason. Extend must be later than the old date (later). The PO amount follows the typed metres at the vendor\'s price.'],
 ['Purchase orders', 'A PO raised by Enigma carries source auto; by a person, manual with who. Received metres never exceed pending; Close with metres pending cancels the balance and is marked closed short. Every receiving update raises a GRN. "Needs a PO by hand" is only international core under its reorder point with nothing on order.'],
 ['Designs', 'A design needs a name and one variant with a price. Price is per variant; no design-level price. A price change on a design in Enigma re-pushes it. The product code is minted once.'],
 ['Names', 'A rename appends the old name to the history with who, when and why; the code never changes.'],
 ['Fabric master', 'Edits to Enigma\'s fields are saved under Enigma\'s names. A stock adjustment is signed metres with a reason and a description. Threshold on the inventory block is the reorder floor. One sell action per state.'],
 ['Go live online', 'Blocked until composition and a description are on the record; every other gate is advisory and the skips are kept. Stores are not a gate.'],
 ['Swatch desk', 'Steps in order; phase one ends at the handover to Yusuf.'],
 ['MTM production', 'A piece joins the queue after the freeze window. A plan over headroom is refused unless forced, and forcing is recorded with the name. Urgent sets ship-by to punch + 2 days. Scan-out deducts metres from stock and reserved. A bespoke piece is never planned before its parcel is in. A ship-by move needs a reason.'],
 ['Sheet changes', 'Store: freely until allocation, remarks only after, nothing once made. Production: freely until planning; amendments flagged for reprint in transit or in factory. Each change makes the next version (V2, V3); the factory\'s held version is shown until re-issued.'],
 ['Store', 'Only live fabrics can be punched; a sold-out bespoke fabric cannot. Credit never above the balance; credits expire after a year. A case is raised only on a piece delivered from this store; within 30 days free alteration and credit note, after that chargeable. A full refund needs approval before finance moves it.'],
 ['Replenishment', 'Reorder point = the larger of lead-time demand and MOQ; PO = the MOQ. Never for bespoke. Promotion to core lifts the floor to 40 m if under 20. A fabric the mill reports out goes on hold at once.'],
 ['Roles', 'A button appears only for the owning role. Store and factory roles are scoped to one store or factory. Owner sees and may do everything.'],
 ['Conversation and files', 'One thread per record, never deleted, readable by everyone who can open the record. A mention goes to a person or a team and stays on the bell until that person resolves it; resolving is kept on the comment. Files carry a label from the record kind\'s list; 25 MB per file. Nothing is emailed.'],
])

# ------------------------------------------------------------------ 15
h2('15. Non-functional requirements and the Enigma contract')
table(['Area', 'Requirement'], [
 ['Architecture', 'A separate application beside Enigma. Reads over Enigma\'s API; its own database for every record in section 13; write-back behind per-module flags in the last phase. No build inside Enigma\'s codebase. One codebase builds both editions; the MTM edition is a build flag that hides the RTW screens and the warehouse portal.'],
 ['Enigma reads', 'Fabric master (one 3.2 MB call, no change filter): nightly plus on demand. Inventory per warehouse. Transaction and reservation logs per code until a date range is confirmed. Fabric POs with their receiving lines. Orders and order sheets. Vendors. Designs and variants.'],
 ['Enigma writes (last phase, if granted)', 'Fabric info, attribute and inventory edits; On-hold on pause, resume or supplier switch-off; fabric PO at Push PO and Raise PO; Update Receiving Status; Add and Edit Vendor; design push with variants; order-sheet corrections. Until then each is keyed in Enigma and the number recorded in BSC PLM.'],
 ['Other reads', 'Shopify sales by product code daily and the customer profile. Mill lists pasted. Sheets imported once at go-live, idempotent, every skipped row logged.'],
 ['Identity', 'One login per person, one role, store or factory scope where it applies; an administrator sees everything.'],
 ['Concurrency', 'Server-side records with optimistic versioning; a stale write is refused with the current state shown; Enigma\'s reservation is the arbiter when two stores punch the last metres.'],
 ['Audit', 'Every write appends who, when and what. Order sheets keep versions. Nothing is hard-deleted. A record\'s history is exportable.'],
 ['Performance', 'Lists filtered server-side for the fabric master (about 8,600 rows) and orders (about 40 a day). The bell recomputed under a second on every write.'],
 ['Availability', 'Stores work 10:00 to 22:00 IST seven days; maintenance outside those hours.'],
 ['Devices', 'Desktop first. A narrow layout with large buttons for the store\'s returns bench and the swatch desk.'],
 ['Files', 'Object storage, 25 MB per file, images previewed inline, label per record kind.'],
 ['Environments', 'Development, staging reading Enigma read-only against production data, production. Enigma has no sandbox, so writes are flagged per module per environment.'],
 ['Backups · localisation', 'Daily, retained 90 days. English; dates as 12 Sep 26; rupees with Indian grouping; inches for measurements; metres for cloth.'],
 ['Parallel run', 'For every phase the sheet it replaces stays available read-only for one month; a weekly comparison with the owning team before it is switched off.'],
])

# ------------------------------------------------------------------ 16
h2('16. Build order and acceptance')
p('Five phases, one team at a time, each closed before the next opens. The order below follows the one BSC set for the full tool; it is BSC\'s to confirm for this edition. Before phase 1: Enigma read access confirmed for the fabric master, inventory, logs, POs, orders, vendors and designs; the one-time import of open items from the sheets.')
table(['Phase', 'Scope (workflows)', 'Done when'], [
 ['1. MTM production and the floor', 'Workflow 2: queue, proposal, plans, scans, changed sheets with versions, extra fabric, ship-by moves, the Factories screen; workflow 8 on the customer order (the conversation that replaces the WhatsApp thread).', 'A planner and every MTM factory\'s merchandiser work from these screens for real orders; the WhatsApp thread for allocation and extra cloth is no longer the record.'],
 ['2. The store floor', 'Workflow 1: bills with fit profiles, trial and express, comments, sheet corrections as versions, cases, the ladder, credit notes, refund approval. Bespoke fabrics gated on the mill\'s last report.', 'A handful of pilot stores run returns and alterations here instead of Slack; store credit has one ledger.'],
 ['3. The fabric, from requirement to live online', 'Workflows 3 to 7: the five-state record, the sourcing desk, the vendor card and Push PO, the receiving line, designs with variants pushed to Enigma, names, go live online; the fabric master as Enigma\'s fabric DB; the mills as Enigma\'s vendor master; purchase orders auto and by hand; the weekly core review; the swatch desk to the handover (workflow 7).', 'Ten fabrics run from raised to live online without the swatch tracker sheet or a hand-typed Enigma datasheet; the international-fabric spreadsheet is retired.'],
 ['4. The warehouse portal', 'Vehicle round, fabric rolls on the portal, bespoke mill list and parcels, GRN register, bundles out, extra fabric out, the rest of the swatch desk (cut, sticker, dispatch, photos, stores told), books and fit samples.', 'A fabric receipt updates saleable stock everywhere within the day; every receipt has a GRN.'],
 ['5. Writing into Enigma, and the edges', 'Write-back where agreed (fabric and inventory edits, POs and receiving, vendors, designs, on-hold, order sheets); narrow layouts; every rule marked later; stickers and barcodes; the daily closing report.', 'Each write-back verified against Enigma for a week; the later list empty or re-planned.'],
])

# ------------------------------------------------------------------ 17
h2('17. Open questions and assumptions')
ul([
 'Enigma write access per module: fabric info and attributes, inventory and adjustments, fabric PO and Update Receiving Status, vendors, designs and variants, on-hold, order sheet. Decides how much stays "recorded".',
 'A change filter or feed on the fabric read; a date or code range on the transaction log.',
 'Whether Enigma\'s auto-PO threshold and Is Auto Replenishment are one flag or two, and whether BSC PLM may edit the threshold.',
 'Whether the warehouse books rolls on the PO line in BSC PLM in phase 3, or in Enigma with the number copied, until the portal arrives in phase 4.',
 'The variant option set Enigma accepts (free text, or a fixed Size list) and whether a discounted price per variant is a field or a rule.',
 'Who owns Big-Checked and composition family in Enigma today (fabric attribute or product flag) — this document puts them on the fabric.',
 'Whether a required reason on Reject and a later-than-before check on Extend should block.',
 'Bespoke: the promised date against the MTM default, and where the daily mill list lives until the warehouse portal (phase 4).',
 'Store: where store credit lives today (Shopify gift card, Enigma, nowhere); store-only fabrics that never go online.',
 'Production: cap extra-fabric metres at the panel allowance; the freeze window length (2 hours placed).',
])
p('Assumed until confirmed: metres per shirt 2.15; the reorder point and MOQ rule as section 7; the fit-sample set; the trim master costs; the vendor hold windows per mill.')
b('Deliberately out of scope.', 'Everything ready-to-wear; several-options requests; FOB; costing, margin, working capital; customer marketing; store checklists; the MTM visualiser; escalations as a workflow.')

# ===================================================================== HTML
def esc(t): return H.escape(t)
def para_html(t):
    return '<br>'.join(esc(x) for x in t.split('\n'))
css = """body{max-width:1180px;margin:32px auto;padding:0 24px;font-family:Helvetica,Arial,sans-serif;line-height:1.5;color:#1a1a13;background:#fff}
h1{font-size:30px;margin:0 0 6px}h2{font-size:20px;margin:36px 0 10px;padding-top:12px;border-top:1px solid #dad2c0}
p{margin:8px 0}.by{color:#6b6759;font-size:13px}.sub{color:#4a4740;font-size:15px;margin-bottom:18px}
table{border-collapse:collapse;width:100%;margin:12px 0;font-size:13px}th,td{border:1px solid #dad2c0;padding:7px 9px;vertical-align:top;text-align:left}th{background:#f6f2ea;font-weight:600}
td:nth-child(1){white-space:nowrap}ul{margin:8px 0 8px 22px}
nav{font-size:13px;columns:2;margin:14px 0 24px}nav a{display:block;color:#3c4a30;text-decoration:none;padding:2px 0}"""
out=[f'<!doctype html><html><head><meta charset="utf-8"><title>{esc(TITLE)}</title><style>{css}</style></head><body>']
out.append(f'<h1>{esc(TITLE)}</h1><p class="by">{DATE} · Riddhiman Ghosh · DevX Labs · for Bombay Shirt Company · v1.0</p><p class="sub">{esc(SUB)}</p>')
heads=[c[1] for c in C if c[0]=='h2']
out.append('<nav>'+''.join(f'<a href="#s{i}">{esc(h)}</a>' for i,h in enumerate(heads))+'</nav>')
hi=-1
for c in C:
    if c[0]=='h2': hi+=1; out.append(f'<h2 id="s{hi}">{esc(c[1])}</h2>')
    elif c[0]=='p': out.append(f'<p>{para_html(c[1])}</p>')
    elif c[0]=='b': out.append(f'<p><strong>{esc(c[1])}</strong> {para_html(c[2])}</p>')
    elif c[0]=='ul': out.append('<ul>'+''.join(f'<li>{esc(x)}</li>' for x in c[1])+'</ul>')
    elif c[0]=='table':
        out.append('<table><thead><tr>'+''.join(f'<th>{esc(h)}</th>' for h in c[1])+'</tr></thead><tbody>')
        for r in c[2]: out.append('<tr>'+''.join(f'<td>{para_html(x)}</td>' for x in r)+'</tr>')
        out.append('</tbody></table>')
out.append('</body></html>')
open(sys.argv[1],'w').write('\n'.join(out))

# ===================================================================== DOCX
d=Document()
st=d.styles['Normal']; st.font.name='Helvetica'; st.font.size=Pt(10)
for s in d.sections: s.left_margin=s.right_margin=Cm(2); s.top_margin=s.bottom_margin=Cm(2)
d.add_heading(TITLE, 0)
d.add_paragraph(f'{DATE} · Riddhiman Ghosh · DevX Labs · for Bombay Shirt Company · v1.0')
d.add_paragraph(SUB)
def add_cell(cell, text):
    cell.text=''
    lines=text.split('\n')
    cell.paragraphs[0].text=lines[0]
    for l in lines[1:]: cell.add_paragraph(l)
    for pp in cell.paragraphs:
        for r in pp.runs: r.font.size=Pt(8.5)
for c in C:
    if c[0]=='h2': d.add_heading(c[1], 2)
    elif c[0]=='p':
        for l in c[1].split('\n'): d.add_paragraph(l)
    elif c[0]=='b':
        pp=d.add_paragraph(); r=pp.add_run(c[1]+' '); r.bold=True; pp.add_run(c[2])
    elif c[0]=='ul':
        for x in c[1]: d.add_paragraph(x, style='List Bullet')
    elif c[0]=='table':
        t=d.add_table(rows=1, cols=len(c[1])); t.style='Table Grid'
        for i,h in enumerate(c[1]):
            add_cell(t.rows[0].cells[i], h)
            for r in t.rows[0].cells[i].paragraphs[0].runs: r.bold=True
        for row in c[2]:
            cells=t.add_row().cells
            for i,x in enumerate(row): add_cell(cells[i], x)
        d.add_paragraph()
d.save(sys.argv[2])
print('ok', len(C), 'blocks')
