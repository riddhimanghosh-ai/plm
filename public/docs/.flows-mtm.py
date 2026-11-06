# Builds the MTM-edition user flows (for developers and QA) as HTML and DOCX from one content tree.
# Same look as .prd-mtm.py. Source of truth: the MTM prototype's code as it stands; where it differs from the PRD, see Open points.
import html as H, sys, re
from docx import Document
from docx.shared import Pt, Cm

DATE = '4 Nov 2026'
SUB = "Every user flow in the MTM edition, one job at a time, from the person's side: who, where, what must be true first, each click and what the system shows and writes, the rules, the edge paths, what changes elsewhere, and the QA cases to accept it."

# content: ('h2', text) | ('h3', text) | ('p', text) | ('b', lead, rest) | ('table', headers, rows) | ('ul', items)
C = []
FLOWS = []   # (id, title, prd, src, module)
QA_N = [0]
def h2(t): C.append(('h2', t))
def h3(t): C.append(('h3', t))
def p(t): C.append(('p', t))
def b(lead, rest): C.append(('b', lead, rest))
def table(headers, rows): C.append(('table', headers, rows))
def ul(items): C.append(('ul', items))
MODULE = ['']
def module(name): MODULE[0] = name

def F(fid, title, who, where, pre, steps, val, alt, post, qa, prd, src):
    """One user flow, in the fixed structure developers and QA work from."""
    FLOWS.append((fid, title, prd, src, MODULE[0]))
    h3(f"{fid} · {title}")
    b("Who.", who)
    b("Where.", where)
    b("Preconditions.", "")
    ul(pre)
    table(['#', 'User does', 'System shows / does', 'Data written'], [[str(i + 1)] + list(s) for i, s in enumerate(steps)])
    b("Validations and errors.", "")
    ul(val)
    b("Alternate and edge paths.", "")
    ul(alt)
    b("Postconditions.", "")
    ul(post)
    QA_N[0] += len(qa)
    table(['QA', 'Given', 'When', 'Then'], [[f"{fid}.{i + 1}"] + list(q) for i, q in enumerate(qa)])

# ------------------------------------------------------------------ front matter
h2("1. Purpose and how to read")
p("This is the build and test companion to the MTM PRD. The PRD says what the product is and why; this document says, for every job a person does in the MTM edition, exactly what they click, what they see, what is saved, and how QA proves it works. It is written from the person's side, one flow per job.")
p("Scope is the MTM edition only (VITE_EDITION=mtm). Screens that exist only for ready-to-wear (RTW planning, analysis, sheet, stock health, what is selling, launches, the RTW tracker and analytics, RTW requirements, the warehouse portal, GRN list, RTW materials to factories) are hidden in this edition and out of scope here.")
b("How a flow is laid out.", "Every flow has the same nine parts, in this order: an ID and title; who does it (role and the people named in the PRD) and where (sidebar entry, tab and URL hash); preconditions (the data that must exist); the steps, one row per user action with the exact control label, what the system shows or does (including the toast text), and the data it writes; validations and errors (each rule and what the user sees when it fails); alternate and edge paths; postconditions (what other screens now show); and QA acceptance cases written as Given, When, Then, at least one of them negative.")
b("Labels.", "Control labels, filter names, columns, pills and toasts are quoted as the prototype shows them today. Where a prototype label uses a long dash, this document shows a comma in its place, because the document style allows no long dashes; the control itself is unchanged.")
b("IDs.", "UF-PROD production, UF-UNIT the four unit desks, UF-FAC the factory merchandiser, UF-FAB the fabric master, UF-PO purchase orders and supply, UF-SRC sourcing, UF-DES design, UF-SW the swatch desk, UF-COM conversation, files and the bell, UF-RET RetailOS interfaces. QA cases are the flow ID plus a number, for example UF-PROD-05.2.")
b("Source of truth.", "The prototype's code as it stands on the date above, read screen by screen. Where the code and the PRD say different things, this document follows the code and lists the difference under Open points at the end, so the team can decide which one is right before the build.")

h2("2. Roles and permissions")
p("One login per person, one role. A button shows only to the role that owns the step; everyone else sees who acts (a line such as “Production allocates orders to factories”). The owner sees and may do everything. The factory merchandiser is scoped to one factory. Store managers and owners have no screen in BSC PLM: their side is built in RetailOS (section 15).")
table(["Screen (sidebar · hash)", "Design", "Sourcing", "Production", "Unit teams (CAD, cutting, fusing, compiling)", "Factory merchandiser", "Owner"], [
 ["Requirements · #/design", "act (raise, Push PO, More time, Reject, configure, design, name, go live)", "act on the vendor; reads the rest", "read", "none", "none", "act"],
 ["Swatch desk · #/swatches", "read", "none", "act (bulk received, to Yusuf, priority) on behalf of the warehouse", "none", "none", "act"],
 ["MTM fabric master · #/fabrics", "act (rename, promote or demote, Make inactive or active, Enigma fields, inventory)", "act (core review, Raise PO, block, Enigma fields, inventory)", "not in the sidebar; opens by link, read", "none", "none", "act"],
 ["Fabric sourcing · #/sourcing", "none", "act (Your move, Waiting on design)", "none", "none", "none", "act"],
 ["Fabric vendors · mills · #/mills", "none", "act (Find a fabric, The mills, Add and Edit Vendor)", "none", "none", "none", "act"],
 ["Factories & capacity · #/vendors", "none", "none", "act (capacity and planning inputs)", "none", "none", "act"],
 ["MTM daily production · #/mtm", "none", "none", "act (Allocate, Plans, Factory floor, Pre-production, Changed sheets, Extra fabric)", "none", "none", "act"],
 ["CAD desk · #/cad, Cutting desk · #/cutting, Fusing desk · #/fusing, Compiling desk · #/compiling", "none", "none", "act (production can work any desk)", "act on their own desk", "none", "act"],
 ["My factory · merchandiser · #/factory", "none", "none", "not in the sidebar", "none", "act (own factory only)", "act"],
 ["Waiting on you (the bell, every screen)", "own items", "own items", "own items", "own items", "own items", "all"],
])
b("Prototype note.", "The prototype has no separate CAD, cutting, fusing or compiling logins: the four desks open to production and to the warehouse role. The build adds one role per team, each landing on its own desk. Shravani's approval on extra fabric is a button production can also press in the prototype; in the build it is hers alone.")

h2("3. The order lifecycle")
p("An MTM order is always at exactly one stage. Each move is a scan or a desk action with who and when. The four desks sit between PP · planned and In production.")
ul([
 "Order (punched). Taken at the store in RetailOS, with the order sheet. Pre-confirmed orders (measurement not done, on hold, payment pending) wait here until confirmed.",
 "PP. Waiting for a factory. Inside the freeze window (2 hours, a setting) the order is held back so the store can still change it.",
 "PP · planned. On a plan submitted to one factory. From here measurements and styling lock; only a logistics remark can change.",
 "CAD, then Cutting, then Fusing, then Compiling. Each desk takes the order up and marks it done (or blocked with a reason). An order cannot skip a desk.",
 "In production. Scanned out of the production unit to the factory. Allowed only once compiling is done. The main fabric's metres leave physical and reserved stock here.",
 "In factory. Scanned in by the merchandiser. Aging after 5 days.",
 "Out factory. Marked ready by the merchandiser (QC done at the factory).",
 "RTS. Back at the production unit.",
 "Fitting / shipping. Dispatched by shipping.",
 "Delivered. Handed over at the store or by courier.",
 "Cancelled. Possible before cutting; the reservation is released.",
])

h2("4. Global conventions")
table(["Area", "Convention"], [
 ["Dates", "Shown as 12 Sept 26 (day, short month, two-digit year). Relative dates read today, 3d ago, in 2d."],
 ["Times", "Desk actions and punch times show date and time, 24-hour: 11 Sept, 11:50. Durations read 35 min or 1 h 20 min."],
 ["Units", "Cloth in metres (m), one decimal on screen; measurements in inches; quantities in pieces unless the unit says metres; money in rupees with Indian grouping, or the mill's currency where Enigma holds one."],
 ["Saleable", "Physical minus reserved minus the threshold. Computed, never typed."],
 ["Toasts", "Every save shows a short message at the bottom of the screen for about 4 seconds; warnings show in amber. The text is quoted in each flow."],
 ["Append-only logs", "The desk log, scans, sheet versions, ship-by moves, name history, stock transactions and the conversation are only ever added to. Nothing is edited or deleted. A wrong action is corrected by a new action (for example, Unblock after Mark blocked)."],
 ["Drawers", "A record opens in a drawer from the right at 82% of the window by default; the left edge can be dragged and the width is remembered. Esc or the close control closes the top drawer or pop-up. The URL carries the open record (?open=<id>), so a link opens it."],
 ["Pop-ups", "The stages pop-up (ⓘ on the Factory floor) closes on a click outside it or on Esc."],
 ["Empty states", "Every list says why it is empty and what fills it."],
 ["Whose move", "A person without the right sees who acts instead of the button."],
 ["Exports", "Export downloads an .xlsx of the rows on screen."],
])

h2("5. Glossary")
table(["Term", "Meaning"], [
 ["Physical stock", "Metres on the shelf in the warehouse, reserved included (Enigma's Physical Stock)."],
 ["Reserved", "Metres held for orders already punched; released when the order is scanned out (spent) or cancelled."],
 ["Threshold", "The floor kept back from sale and the reorder trigger for domestic core (Enigma's Threshold)."],
 ["Saleable", "Physical − reserved − threshold. What a store can still sell against."],
 ["Can sell", "Active and saleable above zero."],
 ["Out of stock", "Set by the system when saleable falls to zero or below (physical − reserved ≤ threshold). Clears itself when stock comes in."],
 ["Inactive", "Set by a person with Make inactive; cleared with Make active. Enigma's On Hold. Off Shopify and the stores."],
 ["Core / non-core", "Core is replenished on a reorder point and must not run out; non-core is bought once and the slot is refilled with a new fabric."],
 ["Bespoke", "Cloth held at the mill, bought per order. Never BSC inventory: nothing booked in, nothing deducted."],
 ["Pre-confirmed", "An order taken at the store but not yet confirmed (measurement not done, on hold, payment pending). Never planned until confirmed."],
 ["Freeze window", "Hours after punching during which an order is held back from planning so the store can still change it. 2 hours by default."],
 ["Plan (bundle)", "The set of orders submitted to one factory in one go, with a plan number (#41300 onward)."],
 ["Headroom", "Feed per day less what is in transit less any backlog beyond two days of work."],
 ["Desk", "One of the four pre-production steps at the unit: CAD, Cutting, Fusing, Compiling."],
 ["Desk log", "The order's append-only list of desk actions, each with time, desk, action, who and note."],
 ["Order sheet XML", "The order sheet as XML, generated by the order software BSC connects to; the CAD desk reads it."],
 ["Contrast fabric", "A small amount of another inventory fabric on a piece (pocket, collar band, cuff lining). Deducted when compiling approves."],
 ["Extra fabric", "Cloth asked for after cutting (a damaged panel, a short roll), by the factory or the alteration and hemming unit."],
 ["Product code", "One per fabric (BOM-SHI-FM-nnnn or BOM-SHI-CS-nnnn). Sleeve, collar and the rest are chosen on the order sheet."],
 ["Requirement states", "Requirement requested, Vendor added, PO punched, Fabric in, Live online."],
])

# ------------------------------------------------------------------ 6 production
h2("6. Production")
module("Production")
p("Production (Vishnu, Swati, Parag) runs the day from MTM daily production (#/mtm): Allocate, Plans, Factory floor, Pre-production, Changed sheets, Extra fabric. The tabs show only to production and the owner; the Extra fabric tab also shows to the warehouse role.")

F("UF-PROD-01", "Read the planning queue on Allocate",
 "Production (Swati, Vishnu).", "MTM daily production · Allocate (#/mtm?tab=allocate). The tab count is the number of orders ready to plan.",
 ["Orders punched in RetailOS, past the freeze window, confirmed, not yet on a plan.", "MTM factories set up on Factories & capacity (feed target, urgent reserve, corporate)."],
 [["Opens Allocate.", "One card per MTM factory: name (opens the factory), load in days pill (amber over 2), feed / day (and avg if different), in factory (with N aging in red), in transit, headroom today, N proposed, and Submit plan when N > 0. Note under the cards: “Headroom = feed per day, less what is already on its way, less any backlog beyond two days.”", "None (read)."],
  ["Reads the table.", "Columns: checkbox, Order, Customer · store, Fabric (with a changed pill if the sheet was corrected, metres and bespoke code), Tag (a select for production), Punched · FIFO (date and time, and how long ago), Ship by (red within 2 days), Proposed factory (none in red), Why.", "None."],
  ["Narrows with Proposed for, Tag, Store, Fabric (All, Core, Non-core, Bespoke) and Search (order, customer, fabric, code).", "The list and the N showing count follow; Clear appears once any filter is set.", "None."],
  ["Clicks the link under the cards: “N orders punched in the last 2 h held back, stores still change them · show”.", "A table of held orders with Enters the plan at.", "None."],
  ["Clicks a row.", "The order drawer opens (?open=<id>).", "None."]],
 ["Orders inside the freeze window never appear in the ready list.", "Pre-confirmed orders never appear in the ready list (they sit under Pre-confirmed, UF-PROD-02).", "A bespoke order without its parcel does not enter the queue."],
 ["Queue empty: “Nothing to plan.” with how many orders are still inside the window.", "No factory has headroom: Proposed factory reads none and Why reads “no factory has headroom today”.", "A role other than production does not see the tab; it sees who acts."],
 ["Nothing changes until a plan is submitted."],
 [["40 ready orders and 6 factories", "production opens Allocate", "6 cards and 40 rows show, the tab count is 40"],
  ["an order punched 30 minutes ago with a 2 h window", "production opens Allocate", "the order is not in the table; it is in the held-back list with its entry time"],
  ["a design login", "it opens #/mtm", "the Allocate tab is not shown (negative)"]],
 "2.1, 2.2", "src/screens/Mtm.tsx · AllocateTab; engines.ts · ppQueue, proposeAllocation, factoryLoadOf")

F("UF-PROD-02", "Find and confirm pre-confirmed orders",
 "Production (Swati).", "Allocate · Confirmation · Pre-confirmed · N.",
 ["At least one order flagged pre-confirmed with a reason (Measurement not done, On hold, Payment pending) and a note."],
 [["Clicks Pre-confirmed · N in the Confirmation toggle.", "A table replaces the queue: Order, Customer · store, Fabric, Why it is not confirmed (reason pill and note), Days pre-confirmed (red past 7, with since date), Confirm. Oldest first. Under it: “Pre-confirmed orders were taken at the store but are not confirmed yet: measurement not done, on hold, or payment pending. They are not planned to a factory until confirmed.”", "None."],
  ["Clicks Confirm on a row.", "Toast “Confirmed: the order joins the planning queue.” The row leaves the list; the order appears in the queue once past the freeze.", "Order: preConfirmed cleared; confirmedOn, confirmedBy; remark appended “Confirmed (<reason> cleared)”."],
  ["Clicks Exclude pre-confirmed · N.", "Back to the planning queue.", "None."]],
 ["Confirm shows only to production.", "A pre-confirmed order can never be selected for a plan."],
 ["No pre-confirmed orders: “No pre-confirmed orders.” and “Every order taken at the store is confirmed.”", "Confirm with a remark is done from the order drawer (UF-PROD-03)."],
 ["The store's RetailOS pre-confirmed list loses the row (UF-RET-01).", "The order's remarks carry the confirmation line."],
 [["an order pre-confirmed 9 days ago", "production opens Pre-confirmed", "its days cell reads 9d in red"],
  ["a pre-confirmed order", "production clicks Confirm", "the toast shows and the order leaves the list"],
  ["a pre-confirmed order", "production looks for it in the Exclude pre-confirmed queue", "it is not there (negative)"]],
 "2.1a", "src/screens/Mtm.tsx · AllocateTab; store.ts · confirmOrder")

F("UF-PROD-03", "Confirm an order from its drawer, with a remark",
 "Production.", "Any order drawer on #/mtm (?open=<id>).",
 ["The order is pre-confirmed."],
 [["Opens the order.", "A Pre-confirmed section on top with the reason pill: “<note> · since <date>. It is not planned to a factory until it is confirmed.”", "None."],
  ["Types in remark (optional).", "None.", "None."],
  ["Clicks Confirm order.", "Toast “Confirmed: the order joins the planning queue.” The section disappears.", "Order: preConfirmed null, confirmedOn, confirmedBy, remarks appended with “: <remark>” when given."]],
 ["The remark is optional."],
 ["An order that is not pre-confirmed shows no such section."],
 ["The order joins the queue (UF-PROD-01)."],
 [["a pre-confirmed order", "production confirms with remark “measured on Saturday”", "remarks end with “Confirmed (measurement not done cleared): measured on Saturday”"],
  ["a confirmed order", "production opens it", "no Pre-confirmed section shows (negative)"]],
 "2.1a", "src/screens/Mtm.tsx · PreConfirmBox")

F("UF-PROD-04", "Change the freeze window",
 "Production.", "Allocate · Freeze window · h (in the pick bar).",
 ["At least one ready order (the pick bar shows only when the queue is not empty)."],
 [["Types a new number of hours (0 to 24, steps of 0.5).", "The ready list and the held-back list recompute at once.", "Settings: ppFreezeHours."]],
 ["Range 0 to 24 hours.", "Hint: “orders punched since are held back”."],
 ["0 hours: nothing is held back."],
 ["Every planner sees the same window (a shared setting)."],
 [["window 2 h and an order punched 90 minutes ago", "production sets 1 h", "the order moves into the ready list"],
  ["window set to 30", "production leaves the field", "the value is held at 24 at most (negative)"]],
 "2.1", "src/screens/Mtm.tsx · AllocateTab; store.ts · setFreezeHours")

F("UF-PROD-05", "Submit the proposed plan for one factory",
 "Production.", "Allocate · a factory card.",
 ["The system has proposed N orders for the factory (N proposed > 0)."],
 [["Clicks N proposed on a card.", "Filters the table to that factory, selects exactly the proposal and sets the target factory.", "None."],
  ["Clicks Submit plan on the card.", "Toast “Plan submitted to <factory>, N order sheets to print and cut.” The orders leave the queue.", "Plan: planNo (#41300 onward), factoryId, createdOn, orderIds. Each order: stage planned, planId, factoryId, a planned scan with who and when."]],
 ["If N is more than the factory's headroom the card's N reads red and the submit is refused with the over-capacity message (UF-PROD-07)."],
 ["Corporate orders go to the corporate factory; urgent to the factory with an urgent reserve if it has room, else the nearest with room; the rest to the most headroom, oldest first."],
 ["The orders appear on the CAD desk under Waiting for us (UF-UNIT-01).", "The plan appears on Plans (UF-PROD-09).", "The factory sees them as on their way once scanned out."],
 [["a card proposing 12 for Mahendra with headroom 20", "production clicks Submit plan", "a plan with 12 orders is created and the CAD desk count rises by 12"],
  ["a card proposing 0", "production looks at the card", "no Submit plan button shows (negative)"]],
 "2.2, 2.3", "src/screens/Mtm.tsx · AllocateTab; store.ts · submitPlan")

F("UF-PROD-06", "Build a plan by hand",
 "Production.", "Allocate · pick bar and table.",
 ["Ready orders exist."],
 [["Narrows the list with the filters.", "N showing (of total).", "None."],
  ["Picks: All shown, or the oldest 20, 30 or 50, or types a number and clicks Take N; or ticks rows.", "Rows highlight; the action bar appears: “N orders selected → send to [factory · room R]”.", "None (selection only)."],
  ["Chooses the factory in the select.", "Next to the button: “fits, R pieces of room today” or “X past today's capacity of R” in red.", "None."],
  ["Clicks Submit N → <factory>.", "Same toast and effect as UF-PROD-05. The selection clears.", "Plan and orders as in UF-PROD-05."],
  ["Or clicks Clear selection.", "Selection empties.", "None."]],
 ["Submit is disabled while no factory is chosen, or while the selection is over the room and send anyway is not ticked.", "Oldest means punch time, within what is on screen."],
 ["Unselect all shown undoes All shown."],
 ["As UF-PROD-05."],
 [["30 orders showing", "production clicks 20", "the 20 oldest by punch time are ticked"],
  ["25 selected and room 20", "production looks at Submit", "it is disabled until send anyway is ticked (negative)"]],
 "2.3", "src/screens/Mtm.tsx · AllocateTab")

F("UF-PROD-07", "Send a plan over capacity",
 "Production.", "Allocate · action bar.",
 ["The selection is larger than the factory's headroom."],
 [["Ticks send anyway (shown in red next to the warning).", "Submit becomes active.", "None."],
  ["Clicks Submit.", "Amber toast “Forced: N sent to <factory>, X past today's capacity, and it is on the plan with your name.”", "Plan: forcedOver = X, forcedBy = the person."]],
 ["Without send anyway, a submit over room is refused with “N pieces is past <factory>'s capacity, room for R today. Send R, or force the rest through on the record.”"],
 ["The card's Submit plan does not offer send anyway; use the action bar."],
 ["The plan drawer subtitle reads “sent X over capacity by <name>”."],
 [["room 10 and 14 selected", "production ticks send anyway and submits", "the plan records forcedOver 4 and the person"],
  ["room 10 and 14 selected", "production submits from the card without forcing", "the amber refusal toast shows and no plan is made (negative)"]],
 "2.3", "src/store.ts · submitPlan")

F("UF-PROD-08", "Set an order's tag",
 "Production.", "Allocate table · Tag select; or the order drawer · Job card · Tag (while Order or PP).",
 ["The order is Order or PP."],
 [["Chooses normal, urgent or corporate.", "Toast “Tag set.”", "Order: tag. If urgent, ship-by becomes punch date + 2 days."]],
 ["After planning the tag is read-only (a pill)."],
 ["Corporate steers the proposal to the corporate factory."],
 ["Urgent orders sort to the top of every desk and the Factory floor."],
 [["a normal order punched on 10 Sept", "production sets urgent", "ship-by becomes 12 Sept"],
  ["a planned order", "production opens its drawer", "Tag shows as a pill with no select (negative)"]],
 "2.3", "src/store.ts · setOrderTag")

F("UF-PROD-09", "Open a plan and read where its pieces are",
 "Production.", "MTM daily production · Plans (#/mtm?tab=plans); a plan opens as ?plan=<id>.",
 ["At least one plan exists."],
 [["Opens Plans.", "Columns: Plan, Factory, Created, Orders, Where the pieces are (a pill per stage with a count), Status (open or closed <date>). Hide closed / Show closed toggles closed plans.", "None."],
  ["Clicks a plan.", "Drawer “Plan #N”: facts (Factory, Pieces, Cloth m, Fabrics, First ship-by, Urgent); a strip Planned · to cut → In production · on its way → In factory → Out factory · ready → RTS · back at unit → Dispatched; Cut list by fabric (pieces, metres); Pieces with order, customer, fabric, ship by, stage and the scan dates.", "None."],
  ["Clicks a piece.", "The order drawer opens.", "None."]],
 ["Dates are the scans; nothing on a plan is typed."],
 ["No plans: “No plans.” and “Submit one from the Allocate tab.”"],
 ["None."],
 [["a plan of 20 with 5 in factory", "production opens it", "the In factory box reads 5"],
  ["a closed plan and Hide closed", "production views the list", "the closed plan is not listed (negative)"]],
 "2.3a", "src/screens/Mtm.tsx · PlansTab")

F("UF-PROD-10", "Cut and scan out a plan",
 "Production (unit).", "Plan drawer · Move the whole plan · one scan each.",
 ["The plan has pieces at PP · planned."],
 [["Clicks Cut & scan out · N to <factory>.", "If all N are compiled: toast “Scanned out. N pieces in transit, fabric deducted from inventory.”", "Each order: stage in-transit, scan with who and when; main fabric: physical and reserved both reduced by the order's metres."],
  ["If some are not compiled yet.", "Only the compiled ones move. If none are compiled: amber toast “Not yet: N pieces are still in pre-production (CAD, cutting, fusing or compiling).”", "Nothing for the held pieces."]],
 ["An order leaves for the factory only once all four desks are done."],
 ["A plan with nothing to scan reads “Nothing to scan here, the pieces are on the factory floor; the factory marks them ready.”"],
 ["The pieces appear on My factory under On its way here and on the Factory floor."],
 [["a plan of 10, all compiled", "production clicks Cut & scan out", "10 move to In production and each fabric's physical stock falls by its metres"],
  ["a plan of 10, 4 compiled", "production clicks Cut & scan out", "4 move and 6 stay planned"],
  ["a plan with none compiled", "production clicks Cut & scan out", "the amber Not yet toast shows and nothing moves (negative)"]],
 "2.4b", "src/screens/Mtm.tsx · PlansTab; store.ts · scanOrders")

F("UF-PROD-11", "Scan the rest of a plan and close it",
 "Production (unit).", "Plan drawer · Move the whole plan.",
 ["Pieces at In production, Out factory or RTS."],
 [["Clicks Received at factory · N (when the factory has not scanned them).", "Toast “Scanned in at the factory.”", "Orders: stage in-factory, scan."],
  ["Clicks Back at unit (RTS) · N.", "Toast “Back at the production unit.”", "Orders: stage rts, scan; a GRN for the finished round per factory."],
  ["Clicks Dispatch to stores · N.", "Toast “Dispatched, the shipping table just moved.”", "Orders: stage dispatched, scan."],
  ["When every piece is RTS, dispatched or delivered, clicks Close plan.", "Toast “Plan closed.” Status pill reads closed <date>.", "Plan: closedOn."]],
 ["Close plan shows only when every piece is back."],
 ["The factory's own scans (in, ready) normally come from My factory (UF-FAC-02, UF-FAC-03)."],
 ["Delivered pieces count under the strip."],
 [["a plan with all pieces at RTS", "production clicks Close plan", "the plan shows closed with today's date"],
  ["a plan with one piece still in factory", "production looks for Close plan", "it is not shown (negative)"]],
 "2.3a, 2.9", "src/screens/Mtm.tsx · PlansTab; store.ts · scanOrders, closePlan")

F("UF-PROD-12", "Pull an order back to PP",
 "Production.", "Order drawer · Job card, on a planned order.",
 ["The order is PP · planned (nothing cut yet)."],
 [["Clicks Pull back to PP.", "Toast “Pulled back to PP. The factory's headroom is free again and the store can edit the sheet.”", "Plan: order removed. Order: planId and factoryId cleared, stage pp, the planned scan removed, a sheet revision “Pulled back from the plan” (Plan: planned → back in PP)."]],
 ["Only on PP · planned."],
 ["Desk entries already made stay on the order and in its desk log."],
 ["The order is back on Allocate; it shows on Changed sheets as a change pending with production."],
 [["a planned order", "production pulls it back", "it shows on Allocate again"],
  ["an order In production", "production opens it", "no Pull back to PP button (negative)"]],
 "2.3", "src/screens/OrderSheet.tsx · PullBackButton; store.ts · unplanOrders")

F("UF-PROD-13", "Watch the four desks on Pre-production",
 "Production (Swati).", "MTM daily production · Pre-production (#/mtm?tab=prep).",
 ["Planned orders exist."],
 [["Opens Pre-production.", "A team table: Team (links to its desk), Ready for it, Blocked, Work in progress, Hand-offs · 7 days, Avg time (taken up to done); and a Ready to send row (all four desks done).", "None."],
  ["Clicks a number.", "Below, the list narrows to those orders: Order, Customer, Plan · factory, CAD, Cutting, Fusing, Compiling (a pill per desk; blocked shows the reason), Ship by. The heading says which.", "None."],
  ["Clicks the same number again.", "Back to every planned order.", "None."],
  ["Clicks an order.", "The order drawer, with its Pre-production section.", "None."]],
 ["Counts are live; nothing typed here."],
 ["No planned orders: “Nothing here.”"],
 ["None."],
 [["2 orders blocked at CAD", "Swati clicks the CAD Blocked number", "the 2 orders show with the reason"],
  ["no CAD order finished yet", "Swati reads Avg time for CAD", "it shows a dash (negative)"]],
 "2.4", "src/screens/Preprod.tsx · PrepOverview")

F("UF-PROD-14", "Export the desk log for data",
 "Production, owner.", "Pre-production · Export (top right).",
 ["Desk actions exist."],
 [["Clicks Export.", "An .xlsx named desk-log downloads.", "None."]],
 ["One row per desk action across all orders, newest first, with Time, Order, Desk, Action, By, Note, Plan, Factory."],
 ["No actions yet: the file has headers only."],
 ["None."],
 [["a CAD take up at 11:15 and done at 11:50", "production exports", "both rows are in the file with their times"],
  ["an action edited by hand in the file", "the file is re-exported", "the app's log is unchanged (negative: the log is never edited)"]],
 "2.4", "src/screens/Preprod.tsx · PrepOverview")

F("UF-PROD-15", "Read the Factory floor",
 "Production.", "MTM daily production · Factory floor (#/mtm?tab=floor; &factory=<id>).",
 ["Orders at the factories."],
 [["Opens the tab.", "A read-only list: Order (with ⓘ), Customer, Fabric · m, Factory, Tag, Ship by (red with Nd late; a moved pill), Stage, Reached factory (or sent date), Days in factory (red past 5). Urgent on top.", "None."],
  ["Picks All factories or one factory.", "The list follows.", "None."],
  ["Picks Everything, Urgent, On its way, On the floor, Ready to come back or Past ship-by; types in Search (order, customer, fabric).", "The list follows; each option shows its count.", "None."],
  ["Clicks a row.", "The order drawer.", "None."]],
 ["No scan, ready or extra-cloth button here: those are the merchandiser's (UF-FAC)."],
 ["Nothing matches: “Nothing matches that filter.”"],
 ["None."],
 [["All factories", "production opens the tab", "every order at every MTM factory shows with its factory"],
  ["the Factory floor", "production looks for a Ready button", "there is none (negative)"]],
 "2.5", "src/screens/Mtm.tsx · FloorTab")

F("UF-PROD-16", "See an order's stages from the Factory floor",
 "Production.", "Factory floor · the ⓘ beside an order number.",
 ["Any order on the list."],
 [["Clicks ⓘ.", "A wide pop-up beside the row: “<order> · stages”, the stage pill, then every stage on one line with its scan (date · who) or the expected scan; under PP · planned, CAD, Cutting, Fusing, Compiling with a dot (green done, amber taken up, red blocked, grey pending) and start → finish times and who.", "None."],
  ["Clicks outside or presses Esc.", "The pop-up closes; the row does not open.", "None."]],
 ["The ⓘ is on the Factory floor only."],
 ["Blocked desk reads “blocked · <reason>”."],
 ["None."],
 [["an order with CAD done 11:15 to 11:50 by Rupali", "production clicks its ⓘ", "the CAD line reads 11 Sept, 11:15 → 11 Sept, 11:50 · Rupali"],
  ["Allocate", "production looks for an ⓘ", "none is shown (negative)"]],
 "2.5", "src/screens/OrderStages.tsx · StagesInfo; Mtm.tsx · FloorTab")

F("UF-PROD-17", "Move one order's ship-by",
 "Production.", "Order drawer · Job card · Factory delayed · move ship-by →.",
 ["The order is open (not delivered or cancelled)."],
 [["Clicks Factory delayed · move ship-by →.", "New ship-by (prefilled +2 days) and Why (“the store reads this to the customer”).", "None."],
  ["Picks a date, types why, clicks Move ship-by.", "Toast “Ship-by moved on 1 piece · the store can see the new date and why.” A moved pill shows.", "Order: promisedOn; promiseRevisions + {at, by, from, to, reason}."],
  ["Or clicks Cancel.", "Closes the form.", "None."]],
 ["Move ship-by is disabled until a date and a reason are given.", "The same date as now changes nothing."],
 ["Every earlier date stays in the revisions."],
 ["The store reads “moved from <date>, tell the customer” (UF-RET-03); the merchandiser sees moved."],
 [["ship-by 12 Sept", "production moves it to 15 Sept with a reason", "the pill reads moved and the note reads was 12 Sept"],
  ["no reason typed", "production looks at Move ship-by", "it is disabled (negative)"]],
 "2.7", "src/screens/Mtm.tsx · OrderSheet; store.ts · reviseShipBy")

F("UF-PROD-18", "Move every ship-by at one factory",
 "Production.", "Factory floor · Factory delayed · move every ship-by → (only with one factory picked).",
 ["One factory picked; open pieces there."],
 [["Clicks the link.", "Push every open piece here by · days (default 2) and Why.", "None."],
  ["Types days and why, clicks Move N ship-by dates.", "Toast “Ship-by moved on N pieces · the stores can see the new date and why.”", "Each open order: promisedOn + days; a revision each with the one reason."]],
 ["Disabled until days > 0 and a reason."],
 ["With All factories the link is hidden."],
 ["As UF-PROD-17, for each piece."],
 [["8 open pieces at Ayaan", "production pushes by 2 days", "all 8 ship-by dates move by 2 days"],
  ["All factories", "production looks for the link", "it is not shown (negative)"]],
 "2.7", "src/screens/Mtm.tsx · FloorTab")

F("UF-PROD-19", "Acknowledge a sheet changed before planning",
 "Production.", "MTM daily production · Changed sheets (#/mtm?tab=changes).",
 ["A store or production corrected an order sheet while the order was Order or PP."],
 [["Opens Changed sheets · pending with me · N.", "Columns: Order, Customer · store, What changed (field: from → to; remark), Why · who, When, Where it is (stage · not allocated).", "None."],
  ["Clicks Acknowledged, plan on this.", "Toast “Acknowledged, 1 change taken into the plan.” The row leaves.", "Order: changeSeenOn."],
  ["Or clicks Mark all N read.", "Same, for every row.", "Same."]],
 ["Only changes on orders not yet on a plan appear: once planned, nothing reaches the factory."],
 ["Nothing pending: “Nothing changed since you last looked.”"],
 ["The store sees the change landed."],
 [["a collar corrected on a PP order", "production acknowledges", "the row leaves and the count drops"],
  ["a planned order with a logistics remark", "production opens Changed sheets", "it is not listed (negative)"]],
 "2.6", "src/screens/Mtm.tsx · ChangesTab; engines.ts · changePendingOf")

F("UF-PROD-20", "Correct an order sheet before planning",
 "Production (on behalf of the unit); the store does the same in RetailOS (UF-RET-02).", "Order drawer · Order sheet · V1 · as punched (click any field).",
 ["The order is Order or PP."],
 [["Clicks a dashed field (a measurement, a pattern flag, an option).", "A form: Correct <field> (currently <value>) and Why (“goes on the record with your name”).", "None."],
  ["Picks or types the new value, types why, clicks Save correction.", "Toast “Order sheet updated, the change is on the record with your name and the time.” The heading becomes V2 · changed once (the version in amber).", "Order: the field; revisions + {rev, at, by, role, note, changes [{field, from, to}]}."],
  ["Or clicks Change fabric, fit block, tag or remarks.", "Fit block, Fabric (may change the factory), Tag, Remarks, Why the change; Save the change.", "Same."]],
 ["Editing is allowed only while Order or PP (“Production has not started, so the sheet can be corrected.”).", "Saving an unchanged value does nothing."],
 ["V1 is shown in green, V2 and later in amber.", "Fabric change moves the reservation to the new fabric."],
 ["The change shows on Changed sheets (UF-PROD-19)."],
 [["a PP order with collar Cutaway", "production corrects it to Button-down with a reason", "the heading reads V2 · changed once and the change log has the line"],
  ["an In factory order", "production clicks a field", "nothing opens; the note says measurements and styling are locked (negative)"]],
 "1.4, 2.6", "src/screens/OrderSheet.tsx; store.ts · editOrderSheet; engines.ts · sheetEditMode")

F("UF-PROD-21", "Add a logistics remark after planning",
 "Production; the store in RetailOS.", "Order drawer · Order sheet, on a planned, in-production or in-factory order.",
 ["The order is PP · planned, In production or In factory."],
 [["Reads the note “Production has started. Measurements and styling are locked and no change remarks go to the factory. Only a logistics remark can change.”", "None.", "None."],
  ["Types in Logistics remark (“where it ships, not what is made”).", "None.", "None."],
  ["Clicks Save logistics remark.", "Toast as UF-PROD-20.", "Order: logisticComment; a revision with the change."]],
 ["Save is disabled until the text differs from what is there."],
 ["Out factory or later: “The piece is made. A change now is an alteration or a remake, not a sheet edit.” Nothing can be saved."],
 ["Shipping reads it; nothing is re-issued to the factory and the factory never sees a changed sheet."],
 [["a planned order", "production saves “ship to the customer's home”", "the remark is on the order"],
  ["a planned order", "production tries to change a measurement", "no field opens (negative)"]],
 "2.6", "src/screens/OrderSheet.tsx")

F("UF-PROD-22", "Approve a normal extra-fabric ask",
 "Production (Swati).", "MTM daily production · Extra fabric (#/mtm?tab=fabric) · Normal orders.",
 ["An ask with status to approve on a non-bespoke fabric whose shelf covers the metres."],
 [["Opens Extra fabric.", "Filters All, Normal orders, Bespoke orders, Alteration / hemming (each with a count). Columns: Raised (ago, by), Order (plan), Fabric (code; shelf X m → Y m if approved), Factory, Panel, Metres, Reason (factory errors in red, PP errors in amber; note), Status.", "None."],
  ["Clicks Approve.", "Toast “Approved, inventory deducted, fabric team gets the cut list.” Status approved.", "Ask: status approved, decidedOn. Fabric: physical stock reduced by the metres."]],
 ["Approve shows only to production.", "Approve only when the shelf covers the metres (UF-PROD-24)."],
 ["The warehouse role later clicks Picked & sent (toast “Marked sent to the factory.”)."],
 ["The merchandiser's ask reads approved (UF-FAC-06)."],
 [["a 0.9 m ask with 306 m on the shelf", "Swati approves", "physical falls by 0.9 m and the status is approved"],
  ["an approved ask", "Swati looks at the row", "no Approve or Decline shows (negative)"]],
 "2.8", "src/screens/Mtm.tsx · FabricTab; store.ts · decideExtraFabric")

F("UF-PROD-23", "Decline an extra-fabric ask with a reason",
 "Production (Swati).", "Extra fabric · Decline.",
 ["An ask at to approve."],
 [["Clicks Decline.", "A box “why it is declined”, a Decline button and cancel.", "None."],
  ["Types the reason and clicks Decline.", "Toast “Declined, the reason goes to the factory.” Status declined with “why: <reason>”.", "Ask: status declined, decidedOn, declineReason."]],
 ["The second Decline stays disabled until a reason is typed."],
 ["cancel closes the box without change."],
 ["The merchandiser reads the reason on its ask (UF-FAC-06)."],
 [["an ask", "Swati declines with “recut from the offcut”", "the row shows declined and why: recut from the offcut"],
  ["an empty reason", "Swati looks at Decline", "it is disabled (negative)"]],
 "2.8", "src/screens/Mtm.tsx · DeclineWithReason")

F("UF-PROD-24", "Handle low inventory on an extra-fabric ask",
 "Production (Swati).", "Extra fabric row where the shelf does not cover the metres.",
 ["A normal (or alteration normal) ask whose fabric's physical − reserved is less than the metres, including none."],
 [["Reads the row.", "The shelf line is red; Approve is greyed out with the hover “Low inventory: not enough of this fabric on the shelf to approve”; a red low inventory pill; a Send to Shravani for a PO link; Decline.", "None."],
  ["Clicks Send to Shravani for a PO.", "Toast “With Shravani to approve.” Status with Shravani · to approve the PO.", "Ask: status po-needed; po {handedOn, by}."],
  ["Or declines with a reason (UF-PROD-23).", "As there.", "As there."]],
 ["Approve cannot be clicked, and the system refuses an approval that the shelf does not cover."],
 ["Stock arrives before the ask is handled: the next view shows Approve active."],
 ["Shravani's row action appears (UF-PROD-26)."],
 [["an ask for 0.9 m and 0 m saleable", "Swati opens the row", "Approve is greyed and low inventory shows"],
  ["the same ask", "Swati clicks the greyed Approve", "nothing happens and no stock moves (negative)"]],
 "2.8", "src/screens/Mtm.tsx · FabricTab; store.ts · decideExtraFabric")

F("UF-PROD-25", "Send a bespoke extra-fabric ask to Shravani",
 "Production (Swati).", "Extra fabric · Bespoke orders (or Alteration / hemming · Bespoke · to Shravani).",
 ["An ask at to approve on a bespoke fabric."],
 [["Reads the row.", "Fabric line “bespoke · no inventory kept, nothing deducted”; a bespoke pill; Send to Shravani for a PO in place of Approve.", "None."],
  ["Clicks Send to Shravani for a PO.", "Toast “With Shravani to approve.”", "Ask: status po-needed, po.handedOn, po.by."]],
 ["Bespoke is never inventory: nothing booked in, nothing deducted."],
 ["Decline is still possible."],
 ["Shravani's row action appears (UF-PROD-26)."],
 [["a bespoke ask", "Swati sends it", "status reads with Shravani · to approve the PO"],
  ["a bespoke ask", "Swati looks for Approve", "it is not offered (negative)"]],
 "2.8", "src/screens/Mtm.tsx · FabricTab")

F("UF-PROD-26", "Shravani approves an ask sent to her",
 "Shravani (warehouse). In the prototype production can press it too.", "Extra fabric row at with Shravani.",
 ["An ask at po-needed, PO not raised."],
 [["If the shelf now covers a non-bespoke fabric, clicks Shravani: approve · issue from stock.", "Toast “Approved by Shravani: N m deducted from physical stock.”", "Ask: approved, decidedOn, po.raisedOn. Fabric: physical reduced; an ISSUE transaction (reason Extra fabric or Alteration fabric)."],
  ["Otherwise clicks Shravani: approve & raise PO.", "Toast “Approved by Shravani: the PO is generated.” Status PO raised · cloth awaited with the PO number.", "Ask: po.poNo, po.raisedOn."]],
 ["The label tells which of the two it will do."],
 ["None."],
 ["Cloth in follows (UF-PROD-27)."],
 [["a bespoke ask with Shravani", "she approves", "a PO number shows on the row"],
  ["a normal ask the shelf now covers", "she approves", "stock falls and no PO is raised"]],
 "2.8", "src/store.ts · routeExtraFabricPo")

F("UF-PROD-27", "Bring the cloth in and approve",
 "Shravani, then production.", "Extra fabric row at PO raised · cloth awaited.",
 ["The mill PO is raised."],
 [["Clicks Cloth in · back to approval.", "Toast “Cloth in: the request is back with production to approve.” or, for bespoke, “Cloth in: bespoke, not booked to inventory; back with production to approve.”", "Ask: po.clothInOn, status requested. Non-bespoke: physical stock + metres."],
  ["Production approves (UF-PROD-22).", "As there.", "As there; bespoke deducts nothing."]],
 ["Bespoke cloth is never booked to inventory."],
 ["None."],
 ["The ask returns to to approve."],
 [["a raised PO for a normal fabric", "cloth in is clicked", "physical stock rises by the metres and the ask is back to approve"],
  ["a bespoke ask", "cloth in is clicked", "physical stock does not change (negative)"]],
 "2.8", "src/store.ts · routeExtraFabricPo")

F("UF-PROD-28", "Work alteration and hemming asks",
 "Production (Swati).", "Extra fabric · Alteration / hemming, then All alteration, Normal · approve here, Bespoke · to Shravani.",
 ["Asks raised by the alteration and hemming unit (part replacement, collars and cuffs for stores)."],
 [["Picks Alteration / hemming.", "A second toggle appears with counts; rows carry an alteration pill.", "None."],
  ["Normal: Approve (or low inventory, UF-PROD-24).", "As UF-PROD-22.", "As there."],
  ["Bespoke: Send to Shravani for a PO.", "As UF-PROD-25.", "As there."]],
 ["Same rules as factory asks."],
 ["None."],
 ["None."],
 [["an alteration ask on a normal fabric with cover", "Swati approves", "physical stock falls"],
  ["an alteration ask on a bespoke fabric", "Swati looks for Approve", "only Send to Shravani for a PO shows (negative)"]],
 "2.8", "src/screens/Mtm.tsx · FabricTab")

F("UF-PROD-29", "Scan one order to its next stage",
 "Production.", "Order drawer, under the order sheet.",
 ["The order is at a stage with a next scan."],
 [["Clicks the next-step button: Scan out of production unit →, Scan in at factory →, Mark ready →, RTS received →, Dispatch → or Delivered →.", "The matching toast (as in UF-PROD-10 and UF-PROD-11).", "Order: stage, scan."]],
 ["Scan out is refused until compiled (amber Not yet toast)."],
 ["None."],
 ["As the plan scans."],
 [["a compiled planned order", "production clicks Scan out of production unit", "it moves to In production"],
  ["a planned order at fusing", "production clicks Scan out", "the Not yet toast shows (negative)"]],
 "2.4b, 2.9", "src/screens/Mtm.tsx · OrderSheet")

F("UF-PROD-30", "Set a factory's capacity and planning inputs",
 "Production.", "Factories & capacity (#/vendors) · Capacity & planning inputs; Daily output.",
 ["MTM factories exist."],
 [["Edits Feed target / day (or Capacity / day on Daily output) and the inputs (tailors, nominal per day, distance, corporate, urgent reserve, grade).", "Toast “Factory master saved, the allocation rules use it from the next draft.”", "Vendor: dailyTarget and the edited inputs. Only one factory can be corporate and one urgent reserve."]],
 ["Numbers are 0 or more."],
 ["Daily output shows the factory's keyed count beside the scans, amber when they differ."],
 ["Headroom and proposals on Allocate change at once."],
 [["Mahendra feed 40", "production sets 60", "Mahendra's headroom on Allocate rises"],
  ["Ayaan is corporate", "production ticks corporate on Richman", "Ayaan is no longer corporate (only one)"]],
 "2 (Factories screen)", "src/screens/Vendors.tsx; Mtm.tsx · OutputTab; store.ts · updateVendor")

# ------------------------------------------------------------------ 7 unit teams
h2("7. Unit teams: CAD, Cutting, Fusing, Compiling")
module("Unit teams")
p("Each team has its own desk screen (#/cad, #/cutting, #/fusing, #/compiling), titled “<Desk> desk”, with the team's job in the lede. The four desks run in order; an order reaches a desk only once the one before has marked it done. Every desk action is written to the order's desk log with its time.")

F("UF-UNIT-01", "Find the orders waiting for my desk",
 "Any unit team (CAD team, Cutting team, Fusing team, Compiling team).", "<Desk> desk · tabs Waiting for us, Taken up, Blocked, Done (?view=waiting|mine|blocked|done).",
 ["Planned orders whose previous desk is done (for CAD: a submitted plan)."],
 [["Opens the desk.", "Waiting for us · N, Taken up · N, Blocked · N, Done. Columns: checkbox, Order (urgent pill; View XML on CAD), Customer · store, Fabric (code · metres), Plan · factory, Ship by, Desks (four marks), CAD file (CAD only), Contrast fabric (Compiling only), and a last column (who finished the previous desk and when; or who took it up; or the block reason).", "None."],
  ["Picks All or Urgent; types in “search order, customer, fabric”; picks Every factory or one; Every plan or one; Clear.", "The rows follow; urgent sort to the top under All.", "None."],
  ["Clicks a row.", "The desk drawer “<order> · <Desk> desk” (UF-UNIT-03).", "None."]],
 ["Done shows the last 60 finished here, newest first."],
 ["Empty: “Nothing waiting for this desk.” with “Orders arrive here once production submits a plan.” (CAD) or “… once the <previous> desk marks them done.”"],
 ["None."],
 [["CAD done on an order", "the cutting team opens its desk", "the order is under Waiting for us with “CAD done · <time> · <name>”"],
  ["CAD not done on an order", "the cutting team opens its desk", "the order is not listed (negative)"]],
 "2.4", "src/screens/Preprod.tsx · PrepDesk")

F("UF-UNIT-02", "Take orders up",
 "Any unit team.", "<Desk> desk · Waiting for us.",
 ["Orders waiting."],
 [["Ticks one or more rows (or the header box for all shown).", "A bar: N selected, Take up, a “why it is blocked” box with Mark blocked.", "None."],
  ["Clicks Take up.", "Toast “N orders taken up: your name is on them.” They move to Taken up.", "Order: prep[desk] = {takenBy, takenOn, doneBy null, doneOn null}. Desk log + {desk, taken up, by, at}."]],
 ["Taking up an order already taken up changes nothing and logs nothing."],
 ["Taking up from the order drawer works the same (UF-UNIT-04)."],
 ["Production's Pre-production Work in progress count rises; the stages pop-up shows taken up with the time."],
 [["3 orders waiting", "Rupali ticks them and clicks Take up", "they show under Taken up with Rupali and the time, and 3 log lines exist"],
  ["an order already taken up by Ganesh", "Rupali takes it up again", "it stays with Ganesh and no new log line is written (negative)"]],
 "2.4", "src/screens/Preprod.tsx; store.ts · prepTake")

F("UF-UNIT-03", "Open an order on my desk",
 "Any unit team.", "Desk drawer (click a row).",
 ["Any order on the desk."],
 [["Opens the order.", "Desks: four boxes left to right (CAD, Cutting, Fusing, Compiling), numbered, green when done, red when blocked, each with taken up / done times, who and how long it took; CAD file line; contrast line; Desk log (collapsed).", "None."],
  ["Reads Fabric.", "Fabric name, To cut (metres from the order sheet), Composition. At cutting and compiling only: the fabric image from the backend (largest on cutting), Bin (code · warehouse, metres in the bin), Where the roll is (rack map with the bin lit), Bin photo (or “Bin <code> photo comes from the backend”); contrast lines with image and bin.", "None."],
  ["Reads CAD.", "View order sheet XML; CAD file name, by, date, or “no CAD file yet”; Upload / Replace CAD file on the CAD desk.", "None."],
  ["Reads Order sheet.", "Plan · factory, Ship by, Styling, Measurements, Remarks.", "None."]],
 ["CAD and fusing see no fabric image, bin, rack map or bin photo."],
 ["Bespoke: Bin reads “bespoke parcel for this order”.", "No fabric: “No fabric on the order.”"],
 ["None."],
 [["an order on the cutting desk", "the cutting team opens it", "the large fabric image and the bin on the rack map show"],
  ["the same order on the CAD desk", "the CAD team opens it", "no image, bin or rack map shows (negative)"]],
 "2.4", "src/screens/Preprod.tsx · PrepOrderPanel; FabricImage.tsx")

F("UF-UNIT-04", "Take up and mark done from the order",
 "Any unit team.", "Desk drawer · Desks section.",
 ["The order is at this desk."],
 [["If not taken up, clicks Take up.", "Toast as UF-UNIT-02; the box reads taken up <time> · <name>.", "As UF-UNIT-02."],
  ["Types remark (optional), clicks Mark done (Compiling: Approve & mark compiled).", "Toast “Done: the next team sees it.” (compiling: UF-UNIT-13). The box turns green: done <time> · <name> · took <duration>.", "prep[desk].doneBy, doneOn, remark. Desk log + done (note = remark)."]],
 ["CAD: Mark done disabled without a CAD file (UF-UNIT-10)."],
 ["Mark done on an order never taken up first writes a taken up line and a done line, both now."],
 ["The order appears on the next desk under Waiting for us."],
 [["an order taken up at 09:00", "the fusing team marks it done at 09:25", "the box reads took 25 min and the compiling desk lists it"],
  ["an order at CAD with no file", "the CAD team looks at Mark done", "it is disabled with “upload the CAD file to mark done” (negative)"]],
 "2.4", "src/screens/Preprod.tsx · PrepOrderPanel; store.ts · prepDone")

F("UF-UNIT-05", "Mark several orders done at once",
 "Any unit team.", "<Desk> desk · Taken up.",
 ["Orders taken up."],
 [["Ticks rows.", "Bar: remark (optional), Mark done (or Approve & mark compiled), Mark blocked.", "None."],
  ["Clicks Mark done.", "Toast “Done: the next team sees it.”", "Each order as UF-UNIT-04."]],
 ["CAD: disabled while any ticked order has no CAD file, with “N without a CAD file: upload it first”."],
 ["None."],
 ["As UF-UNIT-04."],
 [["5 taken up", "the cutting team marks all done with remark “print attached”", "5 done lines with the remark are logged"],
  ["2 of 3 CAD orders with files", "the CAD team ticks all 3", "Mark done is disabled and the warning reads 1 without a CAD file (negative)"]],
 "2.4", "src/screens/Preprod.tsx")

F("UF-UNIT-06", "Mark an order blocked",
 "Any unit team.", "Desk list bar (Waiting for us or Taken up) or the drawer.",
 ["The order is at this desk and not blocked."],
 [["Types why it is blocked (for example, XML missing the sleeve length; roll short; interlining out).", "None.", "None."],
  ["Clicks Mark blocked.", "Amber toast “N blocked: production sees why.” The order moves to Blocked; its box turns red “blocked · <reason>”.", "Order: prepBlocked[desk] = {reason, by, on}. Desk log + blocked (note = reason)."]],
 ["Mark blocked is disabled until a reason is typed."],
 ["None."],
 ["Production's Blocked count for the team rises and shows the reason (UF-PROD-13); the stages pop-up shows the block."],
 [["an order waiting at fusing", "Meena blocks it “collar interlining out of stock”", "it is under Blocked with the reason and a log line"],
  ["no reason typed", "Meena looks at Mark blocked", "it is disabled (negative)"]],
 "2.4", "src/screens/Preprod.tsx; store.ts · prepBlock")

F("UF-UNIT-07", "Unblock an order",
 "Any unit team.", "<Desk> desk · Blocked (bulk) or the drawer (Unblock).",
 ["The order is blocked at this desk."],
 [["Ticks rows and clicks Unblock (or Unblock in the drawer).", "Toast “N unblocked: back in the queue.” It returns to Waiting for us (or Taken up if it was).", "prepBlocked[desk] removed. Desk log + unblocked."]],
 ["Unblocking an order that is not blocked writes nothing."],
 ["None."],
 ["Production's Blocked count falls."],
 [["a blocked order", "the team unblocks it", "it is back under Waiting for us and the log has blocked then unblocked"],
  ["the log", "anyone looks for an edit or delete control", "there is none (negative)"]],
 "2.4", "src/screens/Preprod.tsx")

F("UF-UNIT-08", "Read the order sheet XML",
 "CAD team.", "CAD desk · View XML on a row, or the drawer · CAD · View order sheet XML.",
 ["Any order on the CAD desk."],
 [["Clicks View XML.", "A drawer “Order sheet XML · <order>” with the XML (order number, punched, ship by, tag, customer, store, fabric code, name, consumption, styling options, measurements in inches).", "None."],
  ["Clicks Copy.", "The XML is on the clipboard.", "None."],
  ["Clicks Download .xml.", "<order>.xml downloads.", "None."]],
 ["In the build the XML comes from the connected order software and is shown as is."],
 ["No styling or measurements: the XML says so in a comment."],
 ["None."],
 [["an order with 12 measurements", "the CAD team views its XML", "12 measure lines with unit in show"],
  ["any order", "the CAD team tries to edit the XML", "it is read-only (negative)"]],
 "2.4", "src/screens/Preprod.tsx · orderSheetXml")

F("UF-UNIT-09", "Upload or replace the CAD file",
 "CAD team.", "CAD desk · CAD file column (Upload CAD file / replace), or the drawer beside Mark done (Upload CAD file / Replace CAD file).",
 ["The order is on the CAD desk (not done)."],
 [["Clicks Upload CAD file and picks a file (.dxf, .plt, .cut, .pdf, .xml, .zip).", "Toast “CAD file <name> uploaded on the order.” The name, who and time show; the button reads Replace CAD file.", "Order: cadFile {name, by, on}. Desk log + CAD file uploaded (note = file name)."]],
 ["Only those file types are offered."],
 ["Replacing keeps the earlier upload in the desk log."],
 ["Mark done becomes active (UF-UNIT-10); cutting can open the file from the order."],
 [["an order without a file", "Ganesh uploads BSC-74829.dxf", "the file shows and the log has CAD file uploaded with the name"],
  ["a done order on the Done tab", "the CAD team looks for upload", "no upload control is shown (negative)"]],
 "2.4", "src/screens/Preprod.tsx; store.ts · uploadCad")

F("UF-UNIT-10", "Mark CAD done only with its file",
 "CAD team.", "CAD desk drawer or bulk bar.",
 ["An order taken up at CAD."],
 [["Without a file, looks at Mark done.", "Disabled, with “upload the CAD file to mark done”.", "None."],
  ["Uploads the file, clicks Mark done.", "As UF-UNIT-04.", "As there."]],
 ["The rule holds in bulk too (UF-UNIT-05)."],
 ["None."],
 ["The cutting desk receives the order."],
 [["a file uploaded", "the CAD team marks done", "the order leaves CAD"],
  ["no file", "the CAD team tries Mark done", "it cannot (negative)"]],
 "2.4", "src/screens/Preprod.tsx")

F("UF-UNIT-11", "Find the roll and cut",
 "Cutting team (Sanjay, Imran in the sample data).", "Cutting desk drawer · Fabric.",
 ["The order is at cutting."],
 [["Reads the large fabric image and the metres to cut.", "None.", "None."],
  ["Reads Bin and Where the roll is.", "The rack map R1 to R9 by shelves A to F with the bin lit, “<warehouse> · racks across, shelves down · entrance at R1”; the bin photo.", "None."],
  ["Cuts, attaches the print, marks done (UF-UNIT-04).", "As there.", "As there."]],
 ["None."],
 ["No bin on the fabric: Bin reads “no bin”."],
 ["Fusing receives the order."],
 [["a fabric in bin R3-B", "the cutting team opens the order", "R3-B is lit on the rack map"],
  ["a bespoke order", "the cutting team opens it", "Bin reads bespoke parcel for this order and no rack map shows"]],
 "2.4", "src/screens/Preprod.tsx; FabricImage.tsx · BinMap")

F("UF-UNIT-12", "Add contrast fabric",
 "Compiling team.", "Compiling desk · Contrast fabric column · + contrast fabric.",
 ["The order is at compiling and not done."],
 [["Clicks + contrast fabric.", "A fabric select (inventory fabric with stock), a part box (pocket) and metres.", "None."],
  ["Picks fabric, types part and metres, clicks Add.", "Toast “Contrast fabric added: deducted when compiling approves.” The line shows.", "Order: contrast + {fabricId, part, metres, approvedOn null}."]],
 ["Metres must be more than 0 or nothing is added.", "Only inventory fabric (not bespoke) is offered."],
 ["An empty part saves as Contrast."],
 ["The line is deducted at approval (UF-UNIT-13)."],
 [["an order at compiling", "the team adds Pocket 0.15 m of a poplin", "the line shows and nothing is deducted yet"],
  ["metres 0", "the team clicks Add", "no line is added (negative)"]],
 "2.4a", "src/screens/Preprod.tsx; store.ts · addContrast")

F("UF-UNIT-13", "Approve and mark compiled",
 "Compiling team (Vishnu in the sample data).", "Compiling desk · Approve & mark compiled.",
 ["The order is taken up at compiling."],
 [["Clicks Approve & mark compiled.", "Toast “Compiled and approved: contrast fabric deducted from physical stock; the bundle can leave for the factory.” Contrast lines show deducted.", "prep.compiling done; desk log + done. Each contrast line: approvedOn, approvedBy. Each contrast fabric: physical stock − metres; an ISSUE transaction (reason Contrast fabric, “<part> on <order>”)."]],
 ["Contrast already approved is not deducted twice."],
 ["No contrast lines: only the desk is marked."],
 ["Pre-production Ready to send rises; Cut & scan out now moves the order (UF-PROD-10)."],
 [["an order with Pocket 0.15 m", "the team approves", "that fabric's physical stock falls by 0.15 m with a transaction line"],
  ["the order already compiled", "anyone approves again", "no second deduction happens (negative)"]],
 "2.4a", "src/store.ts · prepDone")

F("UF-UNIT-14", "Read an order's desk log",
 "Unit teams, production.", "Desk drawer · Desks · Desk log · N entries.",
 ["At least one desk action."],
 [["Opens Desk log.", "One line per action, oldest first: time (11 Sept, 11:15), desk, action (taken up, done, blocked in red, unblocked, CAD file uploaded), who, note.", "None."]],
 ["The log has no edit or delete control."],
 ["No actions: the Desk log line is not shown."],
 ["None."],
 [["CAD taken up, file uploaded, done", "anyone opens the log", "three lines show in time order"],
  ["the log", "anyone tries to change a line", "there is no way to (negative)"]],
 "2.4", "src/screens/Preprod.tsx · DeskLog")

F("UF-UNIT-15", "Check what my desk finished",
 "Any unit team.", "<Desk> desk · Done.",
 ["Orders done at this desk."],
 [["Opens Done.", "The last 60 finished here, newest first, with when, who and remark.", "None."]],
 ["No selection bar on Done."],
 ["None."],
 ["None."],
 [["an order finished an hour ago", "the team opens Done", "it is at the top with 1h-ago style timing"],
  ["Done", "the team ticks a row", "no checkbox is offered (negative)"]],
 "2.4", "src/screens/Preprod.tsx")

# ------------------------------------------------------------------ 8 merchandiser
h2("8. Factory merchandiser")
module("Factory merchandiser")
p("Each MTM factory's merchandiser (Yash, Pratish, Kunal, Sachin, Kamal, Harshada, Varsha; Abhin M, Bhupendra) works on My factory · merchandiser (#/factory), scoped to their own factory. Tabs: Today · output and the day's status, Pieces allocated to us, Ask for extra cloth. No sheet change ever reaches this screen.")

F("UF-FAC-01", "Log the day's output",
 "Factory merchandiser.", "My factory · Today · output and the day's status · What went out today.",
 ["The factory has pieces."],
 [["Picks Day (today by default), types Pieces out (the scanned count is the placeholder), types Anything worth saying.", "None.", "None."],
  ["Clicks Log the day.", "Toast “Output logged, N pieces for <date>. The production unit sees it against the scans.”", "FactoryOutput {factoryId, date, pieces, note, by, at}; a second log for the same day replaces it."],
  ["Reads Scanned out today, You keyed in, Your daily average (target).", "If the two disagree, a note: “Your count and the scans disagree by N pieces…”.", "None."]],
 ["Log the day is disabled while Pieces out is empty."],
 ["The last few days table lists the last 10 entries."],
 ["Factories & capacity · Daily output shows the keyed count beside the scans, amber when they differ."],
 [["18 scanned out", "the merchandiser logs 18", "no disagreement note shows"],
  ["Pieces out empty", "the merchandiser looks at Log the day", "it is disabled (negative)"]],
 "2.5", "src/screens/Factory.tsx · TodayTab; store.ts · logFactoryOutput")

F("UF-FAC-02", "Receive pieces at the factory",
 "Factory merchandiser.", "My factory · Pieces allocated to us · On its way here.",
 ["Pieces In production (scanned out of the unit)."],
 [["Clicks Received on a row, or ticks several and clicks Received · N.", "Toast “Scanned in at the factory.”", "Order: stage in-factory, scan with who and when."]],
 ["Only pieces On its way here can be received."],
 ["None."],
 ["The piece counts as on the floor; days in factory start; production's Factory floor shows Reached factory."],
 [["3 on their way", "the merchandiser receives all 3", "they show In factory with today's date"],
  ["a piece already in factory", "the merchandiser looks for Received", "the row shows Out instead (negative)"]],
 "2.5", "src/screens/Factory.tsx · OrdersTab")

F("UF-FAC-03", "Mark pieces out of the factory",
 "Factory merchandiser.", "My factory · Pieces allocated to us · On the floor.",
 ["Pieces In factory."],
 [["Clicks Out on a row, or ticks several and clicks Out of the factory · N.", "Toast “Marked ready.”", "Order: stage out-factory, scan."]],
 ["Only In factory pieces."],
 ["None."],
 ["Production can scan RTS; the Daily output scans rise."],
 [["5 on the floor", "the merchandiser marks 5 out", "they show Out factory"],
  ["a piece on its way", "the merchandiser looks for Out", "only Received is offered (negative)"]],
 "2.5", "src/screens/Factory.tsx · OrdersTab")

F("UF-FAC-04", "Read the pieces on my floor",
 "Factory merchandiser.", "My factory · Pieces allocated to us.",
 ["Pieces allocated."],
 [["Picks Everything, On its way here, On the floor, Ready to go back or Past ship-by (each with a count).", "Columns: Order, Customer · store, Fabric · cloth (code, metres), Ship by (red when late, moved pill), Stage, Days here (red past 5).", "None."],
  ["Clicks a row.", "The order drawer: stage, the order sheet (cut and stitched to), remarks from the store.", "None."]],
 ["No changed-sheet tab, filter or pill exists: nothing changed after planning reaches the factory."],
 ["Nothing in a filter: “Nothing here.”"],
 ["None."],
 [["a piece with ship-by moved", "the merchandiser opens the list", "the row shows a moved pill"],
  ["the screen", "the merchandiser looks for Changed after it reached us", "it does not exist (negative)"]],
 "2.5, 2.6", "src/screens/Factory.tsx")

F("UF-FAC-05", "Ask for extra cloth",
 "Factory merchandiser; the alteration and hemming unit raises the same kind of ask.", "My factory · Ask for extra cloth · Ask the production unit for cloth.",
 ["Pieces on this floor."],
 [["Finds the order (type BSC-… or a name, then pick).", "If the order has more than one cloth: Which cloth; else Cloth on this order with code and metres.", "None."],
  ["Picks Panel (Single front 0.8, Both fronts (patta) 0.9, Single sleeve 0.8, Both sleeves 0.9, Collar 0.3, Cuff 0.3), adjusts Metres, picks Reason, whose error (Damaged / yarn pull, factory error; Stain, factory error; Weaving defect, PP error; Fabric short, PP error; Shade mismatch, PP error), types Note.", "None.", "None."],
  ["Clicks Ask for N m of <fabric>.", "Toast “Asked. It is on the production unit's queue here, no email, no phone call.”", "ExtraFabricRequest {orderId, fabricId, factoryId, planId, metres, reason, panel, note, raisedBy, raisedOn, status requested}."]],
 ["The order must have a fabric and a factory."],
 ["Metres default to the panel allowance and can be changed."],
 ["The ask shows on production's Extra fabric (UF-PROD-22) and in What we have asked for."],
 [["an order on the floor", "the merchandiser asks Both sleeves for a shade mismatch", "an ask of 0.9 m with reason PP error is created"],
  ["no order picked", "the merchandiser looks at Ask", "it is disabled (negative)"]],
 "2.8", "src/screens/Factory.tsx · AskTab; store.ts · raiseExtraFabric")

F("UF-FAC-06", "Read the answer to my ask",
 "Factory merchandiser.", "My factory · Ask for extra cloth · What we have asked for.",
 ["Asks raised."],
 [["Reads the list.", "Each ask with status pill requested, approved, sent or declined and when decided; declined shows “why: <reason>”.", "None."]],
 ["None."],
 ["None yet: an empty table."],
 ["None."],
 [["a declined ask", "the merchandiser reads the list", "the reason shows under declined"],
  ["an approved ask", "the merchandiser looks for a reason", "none is shown (negative)"]],
 "2.8", "src/screens/Factory.tsx · AskTab")

# ------------------------------------------------------------------ 9 fabric master
h2("9. Fabric master")
module("Fabric master")
p("MTM fabric master (#/fabrics) holds three groups: Fabric master data (Fabric inventory, Core · weekly review, Ranges, Designs), Trim master data (Trims & packaging) and Purchase orders & supply (Purchase orders). A fabric opens in a drawer (?open=<id>) or as its own page (#/fabric/<id>) with a facts strip and five tabs: Overview, Purchase orders, Fabric info · Enigma, Inventory & movements, Files & conversation. Design (Kunal, Janak) and sourcing (Sreekanth, Srikanth) work here.")

F("UF-FAB-01", "Browse fabric inventory by book and state",
 "Design, sourcing.", "Fabric master data · Fabric inventory (#/fabrics?tab=books).",
 ["Fabrics in the master with swatch books."],
 [["Opens the tab.", "A strip: Every book (N can sell of M) and one card per book (N / 30 with N short or met). Columns: Fabric · code (swatch, name, code, book, design count), Category, Inventory type, Product type, Saleable (red when negative), Physical (+N coming), Reserved, Threshold, Status · action (the status pill with Make inactive or Make active under it).", "None."],
  ["Clicks a book card.", "Filters to that book; a link “raise an MTM fabric ask for the N short →” when the book is short.", "None."],
  ["Picks Every fabric, Can sell, Cloth coming, Out of stock, Inactive; Core + non-core, Core, Non-core; types Search by name…; picks Factory Warehouse or HO Warehouse.", "The table follows.", "None."],
  ["Clicks a row.", "The fabric drawer.", "None."]],
 ["Status is one of can sell, cloth coming, out of stock, inactive. Inactive wins over the others; cloth coming is physical 0 with metres on order; out of stock is physical − reserved ≤ threshold."],
 ["Nothing matches: “Nothing matches.” and “Widen the filter or the search.”", "Bespoke fabrics are not in this list."],
 ["None."],
 [["a fabric with 211 physical, 0 reserved, threshold 7", "design opens the list", "status reads can sell and saleable 204"],
  ["a fabric with 11 physical, 10 reserved, threshold 3", "design opens the list", "status reads out of stock and saleable −2 in red"],
  ["an inactive fabric with 400 m", "design filters Can sell", "it is not listed (negative)"]],
 "3.1", "src/screens/Fabrics.tsx · BooksTab")

F("UF-FAB-02", "Make a fabric inactive or active",
 "Design, sourcing (any role on the screen in the prototype).", "Fabric inventory · Actions; Core · weekly review · Status; the fabric's facts strip and Where it stands.",
 ["Any non-bespoke fabric."],
 [["Clicks Make inactive.", "Toast “Inactive: off Shopify and the stores.” Status reads inactive; the button reads Make active.", "Fabric: onHold true (Enigma's On Hold)."],
  ["Clicks Make active.", "Toast “Active: back on sale.” Status returns to can sell or out of stock.", "Fabric: onHold false; a design pause, if any, is cleared too."]],
 ["Inactive is only ever set or cleared by a person; the system never sets it."],
 ["Out of stock is not cleared by Make active; it clears when stock comes in."],
 ["Off Shopify and the stores' bill form; the Inactive filter counts it."],
 [["a can sell fabric", "design clicks Make inactive", "status reads inactive and the Inactive count rises by 1"],
  ["an out of stock fabric", "design clicks Make inactive then Make active", "status returns to out of stock, not can sell (negative)"]],
 "3.1", "src/screens/Fabrics.tsx · HoldButton, OfferCell; store.ts · setFabricHold")

F("UF-FAB-03", "Open a fabric and read where it stands",
 "Everyone with the screen.", "Fabric drawer or #/fabric/<id>.",
 ["A fabric."],
 [["Opens the fabric.", "Header: bucket pill, code, mill, domestic or international. Facts: Physical stock (red at or under threshold), Reserved, On order, Saleable, Threshold, Cost / m, Sells (shirts a week), Status with Make inactive / Make active.", "None."],
  ["Reads Overview.", "Where it stands: Bucket, Change the bucket, supply block (core), Family / range (N healthy of M planned), Fabric vendor (kind, place, measured lead, on time), Swatch book; Sales · last 12 weeks; In stores (swatch dispatches).", "None."],
  ["Switches tab.", "Purchase orders, Fabric info · Enigma, Inventory & movements, Files & conversation.", "None."]],
 ["None."],
 ["International: a note that Enigma's auto-PO does not reach it.", "Unknown id: “No such fabric.”"],
 ["None."],
 [["a core fabric", "sourcing opens it", "the supply block row shows"],
  ["a non-core fabric", "sourcing opens it", "no supply block row shows (negative)"]],
 "3.2", "src/screens/Fabrics.tsx · FabricRecord, Fabric360")

F("UF-FAB-04", "Rename a fabric",
 "Design.", "Fabric record · Rename this fabric.",
 ["Any fabric."],
 [["Clicks Rename this fabric.", "New name (hint: the code does not change) and Why.", "None."],
  ["Types, clicks Rename.", "Toast “Renamed. The code is the same fabric; the old name stays on the record, so the numbers stay one line.” A renamed pill and “formerly <old>”.", "Fabric: name; nameHistory + {name, until, by, note}."]],
 ["Rename is disabled while the new name is empty or the same."],
 ["Cancel closes the form."],
 ["Every screen shows the new name; search finds both."],
 [["a fabric", "design renames it with a reason", "formerly <old> shows with the same code"],
  ["the same name typed", "design looks at Rename", "it is disabled (negative)"]],
 "3.2", "src/store.ts · renameFabric")

F("UF-FAB-05", "Promote to core or demote to non-core",
 "Design.", "Overview · Where it stands · Change the bucket.",
 ["A core or non-core fabric (never bespoke)."],
 [["Clicks Promote to core →.", "Toast “Promoted to core, Enigma's auto-PO now applies. Sourcing still has to agree a supply block with the mill.”", "Fabric: bucket CORE; threshold lifted to 40 m if under 20."],
  ["Or clicks Demote to non-core →.", "Toast “Moved back to non-core, sells out once, the slot is refilled with a new fabric.”", "Fabric: bucket NON_CORE."]],
 ["Not offered on bespoke."],
 ["None."],
 ["Core appears on Core · weekly review and in reorder maths."],
 [["a non-core fabric with threshold 7", "design promotes it", "it is core and threshold reads 40"],
  ["a bespoke fabric", "design opens it", "no Change the bucket row shows (negative)"]],
 "3.2, 4 (rule)", "src/store.ts · setFabricBucket")

F("UF-FAB-06", "Agree, renew or end a core supply block",
 "Sourcing.", "Overview · Supply block with the mill (core only).",
 ["A core fabric."],
 [["Clicks Agree a block with <mill>… (or Renew / change…).", "“What did <mill> agree to hold?” One year, Two years, Until a date…; Metres a month (planned demand shown), Agreed over (email, WhatsApp, call), Terms.", "None."],
  ["Fills and saves.", "The row reads until <date> with metres a month, when, who, how; “Nd left, renew” within 60 days.", "Fabric: coreBlock {until, metresPerMonth, agreedOn, by, via, note}."],
  ["Or clicks End block.", "Amber toast “Supply block ended, the mill is free to drop the article.”", "coreBlock cleared."]],
 ["Save is disabled without metres (or without a date when Until a date…)."],
 ["No block: “none agreed” in red."],
 ["None."],
 [["a core fabric with no block", "sourcing agrees one year at 200 m a month", "the row shows until a year from today"],
  ["Until a date… with no date", "sourcing looks at save", "it is disabled (negative)"]],
 "3.2", "src/screens/Fabrics.tsx; store.ts · agreeCoreBlock, endCoreBlock")

F("UF-FAB-07", "Edit the fabric's Enigma fields",
 "Design, sourcing.", "Fabric info · Enigma tab · Edit Fabric Info; Vendor Information; Dynamic attributes · shirts.",
 ["Any fabric."],
 [["Clicks Edit Fabric Info.", "Fabric Name, Inventory Type, Category, Product Type, Fabric Code, Composition, On Hold; Vendor Name, Vendor Code for fabric, Mill Country, Mill Description, Currency, Cost per Unit, TAT (hours), MOQ, Mills.", "None."],
  ["Edits, clicks Save.", "Toast “Saved, Enigma keeps the same fields; this is what goes there.”", "Fabric: the edited fields under Enigma's names."],
  ["Edits dynamic attributes with Edit, Save.", "Same toast.", "Fabric attributes."]],
 ["Cancel discards."],
 ["None."],
 ["At write-back these go to Enigma as typed."],
 [["a fabric", "sourcing sets TAT 240", "TAT · MOQ reads 240 h"],
  ["a change", "sourcing clicks Cancel", "nothing is saved (negative)"]],
 "3.2", "src/screens/FabricInfo.tsx; store.ts · updateFabricInfo")

F("UF-FAB-08", "Edit inventory and bins",
 "Design, sourcing.", "Inventory & movements · Edit Inventory.",
 ["Any fabric."],
 [["Clicks Edit Inventory.", "Warehouse, Threshold, Max Inventory, Is Auto Replenishment, bins (Bin, Metres in bin; rack location and photo come from the backend).", "None."],
  ["Clicks Save.", "Toast as UF-FAB-07.", "Fabric: inventory fields; threshold."]],
 ["None."],
 ["None."],
 ["Saleable and status recompute with the new threshold."],
 [["threshold 7 and saleable 2", "sourcing sets threshold 12", "saleable becomes −3 and status out of stock"],
  ["Edit Inventory open", "sourcing clicks Cancel", "the threshold stays 7 (negative)"]],
 "3.2", "src/screens/FabricInfo.tsx")

F("UF-FAB-09", "Adjust stock",
 "Design, sourcing.", "Inventory & movements · Adjust stock….",
 ["Any fabric."],
 [["Clicks Adjust stock….", "Metres (±), Adjustment Reason (Physical count, Damaged roll, Shade variation, Sample cut, Found stock, Other), Adjustment Description, Bin.", "None."],
  ["Clicks Save adjustment.", "Toast “+N m (or −N m), on the shelf and in the transaction log with the reason.”", "Fabric: physical stock ± metres; an ADJUSTMENT transaction with reason, description, bin, who, when."]],
 ["Save adjustment is disabled while metres is 0 or empty."],
 ["Negative metres reduce stock (never below 0)."],
 ["Saleable and status follow."],
 [["physical 100", "sourcing adjusts −6 for Physical count", "physical reads 94 and a transaction line exists"],
  ["metres 0", "sourcing looks at Save adjustment", "it is disabled (negative)"]],
 "3.2", "src/screens/FabricInfo.tsx; store.ts · adjustFabricStock")

F("UF-FAB-10", "Read transactions and reservations",
 "Everyone with the screen.", "Inventory & movements · Fabric transactions; Fabric reservations.",
 ["Movements exist."],
 [["Reads Fabric transactions.", "Every movement: date, order, PO, type (GRN, ISSUE, ADJUSTMENT, WASH), created by, warehouse, bin, reason, metres.", "None."],
  ["Reads Fabric reservations.", "Every reservation on punch.", "None."]],
 ["Read-only."],
 ["None."],
 ["None."],
 [["contrast deducted at compiling", "anyone opens transactions", "an ISSUE line with reason Contrast fabric shows"],
  ["a transaction", "anyone looks for edit", "there is none (negative)"]],
 "3.2", "src/screens/FabricInfo.tsx")

F("UF-FAB-11", "Review a core fabric with its mill each week",
 "Sourcing.", "Fabric master data · Core · weekly review (#/fabrics?tab=core).",
 ["Core fabrics."],
 [["Opens the tab.", "Filters All, Review due, Under the reorder point, PO by hand, Inactive. Columns: Fabric, Mill (domestic or international · lead), Saleable (+ on order), Reorder (PO pill, above N m, under N m with Raise PO, or under N m · Enigma fires tonight), Weekly review · the mill (in stock, delayed or run out pill, when, back date; never asked), Status (can sell, out of stock, inactive with the button).", "None."],
  ["Clicks Review (due) or Update.", "A select In stock, Delayed, Run out; a back-in-stock date when not in stock; note; Save, Cancel.", "None."],
  ["Clicks Save.", "Toast by outcome: “Reviewed, in stock, nothing to do.”; “Reviewed, back in stock. Design can switch it back on for the stores.”; “Reviewed, delayed past the committed date. Escalated to planning and design on the fabric record.”; “Reviewed, run out at the supplier. Escalated to planning and design on the fabric record.”", "Fabric: supply {status, note, backOn, reviewedOn, by}."]],
 ["Review is due when never asked or 7 or more days ago.", "Only sourcing sees Review; others see sourcing."],
 ["A delayed or run-out fabric can be made inactive by hand (UF-FAB-02); out of stock follows the threshold on its own."],
 ["The bell's review item clears."],
 [["a core fabric reviewed 8 days ago", "sourcing opens Review due", "it is listed"],
  ["a design login", "it opens the tab", "no Review button, only “sourcing” (negative)"]],
 "4.2", "src/screens/Fabrics.tsx; store.ts · reviewCoreStock")

F("UF-FAB-12", "Read the ranges",
 "Design.", "Fabric master data · Ranges (#/fabrics?tab=noncore).",
 ["Ranges set up."],
 [["Opens Ranges.", "Each range with its plan of options against healthy fabrics and the gap.", "None."],
  ["Clicks a range.", "Its fabrics: Saleable, Selling; bespoke ones with the mill's last word.", "None."]],
 ["Read-only."],
 ["None."],
 ["None."],
 [["a range planned 24 with 13 healthy", "design opens Ranges", "the gap shows 11"],
  ["Ranges", "design looks for an edit", "there is none (negative)"]],
 "3.1", "src/screens/Fabrics.tsx")

F("UF-FAB-13", "Find a design",
 "Design, sourcing.", "Fabric master data · Designs (#/fabrics?tab=designs; #/designs opens it).",
 ["Designs exist."],
 [["Opens Designs.", "Search (product code, design name, fabric or code…), All · N, Not in Enigma · N, In Enigma · N, Export. Columns: Product code, Design (working name), Fabric (code), Style · type, MRP, Enigma (in Enigma · date or not pushed), Added (date, by).", "None."],
  ["Clicks a row.", "The fabric's requirement opens (#/design?open=<id>).", "None."]],
 ["One product code per fabric."],
 ["None found: “No design matches that.”"],
 ["None."],
 [["a pushed design", "design filters In Enigma", "it is listed with the sync date"],
  ["a design not pushed", "design filters In Enigma", "it is not listed (negative)"]],
 "6.6", "src/screens/Designs.tsx · DesignsList")

F("UF-FAB-14", "Export fabric inventory",
 "Design, sourcing.", "Fabric inventory · Export.",
 ["Rows on screen."],
 [["Clicks Export.", "fabric-inventory.xlsx: Code, Name, Category, Inventory Type, Product Type, Saleable Stock, Physical Stock, Reserved Stock, Threshold, Swatch book.", "None."]],
 ["Exports what the filters show."],
 ["None."],
 ["None."],
 [["the Core filter", "design exports", "only core rows are in the file"],
  ["an empty filter", "design exports", "the file has headers only (negative)"]],
 "3.1", "src/screens/Fabrics.tsx")

F("UF-FAB-15", "Switch a bespoke fabric off when the mill sells out",
 "Sourcing.", "Bespoke fabric · Overview · Mill availability.",
 ["A bespoke fabric the mill reports sold out, still live."],
 [["Reads the risk note.", "“The mill says gone; the channel still sells it.”", "None."],
  ["Clicks Switch off on Shopify & stores.", "Toast “Inactive: off Shopify and the stores.”", "Fabric: onHold true."],
  ["When the mill has it again, clicks Restore to sale.", "Toast “Active: back on sale.”", "onHold false."]],
 ["Only sourcing."],
 ["Bespoke is not in Fabric inventory; open it from a mill or search."],
 ["The store bill form stops offering it."],
 [["a sold-out bespoke fabric", "sourcing switches it off", "it reads Switched off on Shopify & in stores"],
  ["a design login", "it opens the fabric", "no switch-off button shows (negative)"]],
 "3.2", "src/screens/Fabrics.tsx")

# ------------------------------------------------------------------ 10 purchase orders
h2("10. Purchase orders and supply")
module("Purchase orders and supply")
p("A fabric PO is raised one of two ways, said on screen: Enigma · auto (its batch run orders domestic core under the threshold) or by hand (sourcing for international core, design for a new fabric). There is no mill confirmation step: a PO is on order until received, overdue once its expected date passes.")

F("UF-PO-01", "Read open fabric POs",
 "Sourcing.", "Purchase orders & supply · Purchase orders (#/fabrics?tab=pos).",
 ["Open fabric POs."],
 [["Opens the tab.", "Search PO, fabric, code, mill, remark…; All open · N, Enigma raised · auto · N, Raised by hand · N, Needs a PO by hand · N. A note on the two ways. Columns: PO (source pill, raised ago), Fabric (code · bucket), Mill, Metres, Expected (red once passed), Status (on order or overdue).", "None."]],
 ["Sorted by expected date."],
 ["Nothing open: “No fabric POs open.”"],
 ["None."],
 [["a PO expected yesterday", "sourcing opens the list", "its date is red and status overdue"],
  ["the list", "sourcing looks for Mill confirmed or Update date / remark", "neither exists (negative)"]],
 "4.1", "src/screens/Fabrics.tsx · POs tab")

F("UF-PO-02", "Raise a PO by hand for international core",
 "Sourcing.", "Purchase orders · Needs a PO by hand (also shown above the list under All open).",
 ["International core under its reorder point with nothing on order."],
 [["Reads Needs a PO by hand · N.", "Fabric, Mill (lead), Saleable (red), Reorder point, Suggested PO.", "None."],
  ["Clicks Raise PO · N m.", "Toast “PO for N m raised, now counting as incoming cover until the GRN lands.” The row leaves.", "FabricPo {poNo FPO-…, fabricId, vendorId, metres, raisedOn, source manual, expectedOn = today + mill lead}. Fabric: incoming + metres."]],
 ["Only international core under its point with no open PO is listed.", "Only sourcing sees the button."],
 ["Nothing waiting: “Nothing waiting on a person right now.”"],
 ["The PO lists under Raised by hand; the fabric's Purchase orders tab shows it."],
 [["an international core fabric under its point", "sourcing raises the suggested PO", "a manual PO for the MOQ is created"],
  ["a domestic core under its point", "sourcing opens Needs a PO by hand", "it is not listed; Enigma raises it (negative)"]],
 "4.1, 4 (rule)", "src/screens/Fabrics.tsx; store.ts · raiseFabricPo")

F("UF-PO-03", "Raise a PO from the fabric",
 "Sourcing, design.", "Fabric · Purchase orders tab · How this fabric is reordered.",
 ["A fabric under its reorder point with no open PO."],
 [["Reads Rule, Reorder point, Right now.", "None.", "None."],
  ["Clicks Raise PO now · N m.", "Toast as UF-PO-02.", "As UF-PO-02."]],
 ["Never for bespoke."],
 ["Above the point: no button."],
 ["As UF-PO-02."],
 [["a fabric under its point", "sourcing raises from the fabric", "Purchase orders · N on the fabric rises by 1"],
  ["a bespoke fabric", "sourcing opens Purchase orders", "no Raise PO now (negative)"]],
 "3.2, 4.1", "src/screens/Fabrics.tsx · FabricPoList")

F("UF-PO-04", "Book rolls on the receiving line",
 "Sourcing, warehouse (Shravani).", "The PO's receiving line: on the fabric's Purchase orders tab and on the requirement's Fabric in section.",
 ["An open PO."],
 [["Reads the line.", "Receiving Status (PENDING, PARTIALLY RECEIVED, RECEIVED, CANCELLED), Ordered Quantity, Total Received Quantity, Pending Quantity, Received Qty box (Meter), Close.", "None."],
  ["Types the metres that arrived, clicks Update Receiving Status.", "Toast “GRN done, the metres moved from incoming to the shelf. Saleable just went up in every store.” The receipt shows “N m on <date> by <name>”.", "PO: receivedMetres, receipts + {metres, on, by}. A GRN. Fabric: physical + metres, incoming − metres; a GRN transaction."]],
 ["Update is disabled until metres > 0 or Close is ticked.", "Received never above pending."],
 ["Rolls land in parts: each update is its own GRN."],
 ["Status moves to PARTIALLY RECEIVED or RECEIVED; a new fabric's requirement moves to Fabric in."],
 [["100 m ordered", "sourcing books 60", "status PARTIALLY RECEIVED, pending 40, physical + 60"],
  ["nothing typed and Close not ticked", "sourcing looks at Update Receiving Status", "it is disabled (negative)"]],
 "6.5", "src/screens/PoReceiving.tsx; store.ts · updateFabricPoReceiving")

F("UF-PO-05", "Close a line short",
 "Sourcing, warehouse.", "Receiving line · Close.",
 ["An open PO with metres pending."],
 [["Ticks Close (with or without metres).", "“closing cancels the N m still pending”.", "None."],
  ["Clicks Update Receiving Status.", "Toast “Receiving line closed.” (or the GRN toast if metres were booked). Status CANCELLED when short, RECEIVED when full.", "PO: closedOn, closedShort; pending cancelled."]],
 ["None."],
 ["None."],
 ["The PO leaves the open list."],
 [["40 m pending", "sourcing closes without metres", "status CANCELLED and pending shows 40 in red"],
  ["a closed line", "sourcing looks for Update", "no update control shows (negative)"]],
 "6.5", "src/screens/PoReceiving.tsx")

F("UF-PO-06", "Receive a washed fabric with shrinkage",
 "Sourcing, warehouse.", "Receiving line on a fabric marked washed on its requirement.",
 ["The requirement said the fabric will be washed."],
 [["Washes a cut, types Shrinkage % after washing (for example 5).", "A note: “Washed fabric: 5% shrinkage. The GRN records the metres received; the shelf books 95 m of the 100 m after washing.”", "None."],
  ["Types metres received, clicks Update Receiving Status.", "Toast as UF-PO-04.", "GRN keeps metres received; physical + usable metres; a WASH transaction for the difference (Washing shrinkage)."]],
 ["Update is disabled while metres are typed and shrinkage is empty, for washed fabric."],
 ["Not washed: no shrinkage field."],
 ["Saleable rises by the usable metres."],
 [["100 m received at 5%", "sourcing updates", "physical rises by 95 and a WASH line of 5 shows"],
  ["a washed fabric with no shrinkage", "sourcing types 100 m", "Update stays disabled (negative)"]],
 "6.5", "src/screens/PoReceiving.tsx")

F("UF-PO-07", "Order and receive trims and packaging",
 "Sourcing, production.", "Trim master data · Trims & packaging (#/fabrics?tab=trims).",
 ["Trims in the master."],
 [["Reads the list.", "Item, Supplier, On shelf, Committed, Available, Incoming, Threshold, ₹ each, Status (below threshold first).", "None."],
  ["Clicks Order N.", "Toast “Bulk order raised. It counts as cover until the delivery lands, head office buys these against the forecast, nothing auto-fires.”", "Trim: incoming + N."],
  ["When it lands, clicks Received.", "Toast “Received into the unit. The shelf number just moved.”", "Trim: on shelf + incoming; a GRN."]],
 ["Received shows only when something is incoming."],
 ["None."],
 ["The tab count of trims below threshold falls."],
 [["a trim below threshold", "sourcing orders it", "incoming rises"],
  ["nothing incoming", "sourcing looks for Received", "it is not shown (negative)"]],
 "4.3", "src/screens/Fabrics.tsx · TrimsTab")

# ------------------------------------------------------------------ 11 sourcing
h2("11. Sourcing")
module("Sourcing")
p("Sourcing (Sreekanth, Srikanth) works on Fabric sourcing (#/sourcing) and Fabric vendors · mills (#/mills). On Fabric sourcing, two tabs never overlap: Your move (state 1 and extensions asked) and Waiting on design (state 2). From PO punched on, a record is on Purchase orders instead.")

F("UF-SRC-01", "Work Your move and Waiting on design",
 "Sourcing.", "Fabric sourcing · Your move · N, Waiting on design · N.",
 ["MTM fabric requirements in state 1 or 2."],
 [["Opens Your move.", "Columns: Fabric ask (name, why), Book · wanted, Mill, Stage (Requirement requested; Vendor added · more time asked in red).", "None."],
  ["Clicks Waiting on design.", "State 2 rows with the vendor.", "None."],
  ["Clicks a row.", "The ask opens: What design asked for (working name, why, swatch book, wanted on the floor, construction, close to), Files from design, The vendor.", "None."]],
 ["None."],
 ["Nothing waiting: “Nothing waiting on sourcing.” and “New MTM fabric asks from design land here.”"],
 ["None."],
 [["a new ask with no vendor", "sourcing opens Your move", "it is listed as Requirement requested"],
  ["an ask with a PO punched", "sourcing opens either tab", "it is not listed (negative)"]],
 "5.1, 5.2", "src/screens/Sourcing.tsx · MtmSourcing, MtmBrief")

F("UF-SRC-02", "Put a vendor against an ask",
 "Sourcing.", "The ask · The vendor · Put a vendor against this concept.",
 ["The ask has no live vendor and no PO."],
 [["Fills Mill (Pick a mill…), Article no., Cloth name, ₹ / m, MOQ · m, Lead · days, Holds until, Composition, Panna (in), Swatch book, Note for design. First buy shows price × MOQ.", "None.", "None."],
  ["Clicks Save vendor.", "Toast “Vendor put against the concept.” The vendor card shows.", "Concept fabricOptions + {vendorId, vendorCode, name, cpm, moq, leadDays, holdUntil, composition, widthIn, book, note}."]],
 ["Save vendor is disabled until a mill, a price and a cloth name are given.", "One live vendor per ask."],
 ["None."],
 ["The ask is Vendor added but stays on Your move until sent (UF-SRC-04)."],
 [["an ask", "sourcing saves a vendor with mill, price and name", "the card shows with first buy"],
  ["no price", "sourcing looks at Save vendor", "it is disabled (negative)"]],
 "6.2", "src/screens/Concepts.tsx · ConceptOptions; OptionRequests.tsx · VendorEditor")

F("UF-SRC-03", "Edit the vendor",
 "Sourcing.", "Vendor card · Edit.",
 ["A live vendor not yet chosen."],
 [["Clicks Edit, changes fields, clicks Save changes.", "Toast “Vendor updated.”", "The option's fields."]],
 ["Save changes is disabled until something changes."],
 ["Cancel discards."],
 ["Design sees the new terms."],
 [["a card at ₹420", "sourcing edits to ₹400", "the card reads ₹400"],
  ["no change", "sourcing looks at Save changes", "it is disabled (negative)"]],
 "6.2", "src/screens/Concepts.tsx")

F("UF-SRC-04", "Send the vendor to design",
 "Sourcing.", "The vendor · Send to design →.",
 ["A live vendor, not yet sent."],
 [["Clicks Send to design →.", "Toast “Sent to design, the shade and the price are their call.” A pill “with design since <date>”.", "Concept: optionsSentOn."]],
 ["None."],
 ["None."],
 ["The ask moves to Waiting on design; design sees Push PO, Reject, More time (UF-DES-04)."],
 [["a saved vendor", "sourcing sends it", "it is on Waiting on design"],
  ["no vendor", "sourcing looks for Send to design", "it is not shown (negative)"]],
 "6.2, 6.3", "src/store.ts · conceptSendOptionsToDesign")

F("UF-SRC-05", "Answer an ask for more time",
 "Sourcing.", "The ask · “Design asked for an extension”.",
 ["Design clicked More time."],
 [["Reads the hold (date, Nd left or lapsed).", "None.", "None."],
  ["Picks new hold until, clicks Extend.", "Toast “Hold extended.”", "Option: holdUntil; extensionAsked cleared."],
  ["Clicks Send back to design.", "Toast “Back with design.”", "Concept: optionsSentOn now."]],
 ["Send back to design is disabled while the hold is lapsed (extend first)."],
 ["The mill will not hold: Drop vendor (UF-SRC-06)."],
 ["Back on design's Push PO."],
 [["a lapsed hold", "sourcing extends by 14 days and sends back", "design sees the new hold"],
  ["a lapsed hold not extended", "sourcing looks at Send back to design", "it is disabled (negative)"]],
 "6.4", "src/screens/Concepts.tsx")

F("UF-SRC-06", "Drop a vendor",
 "Sourcing.", "The ask · Drop vendor.",
 ["An extension asked."],
 [["Clicks Drop vendor.", "Amber toast “Vendor withdrawn, the concept is back with you to fill.”", "Option removed; optionsSentOn cleared."]],
 ["None."],
 ["None."],
 ["The ask is back to Requirement requested on Your move."],
 [["an extension asked", "sourcing drops the vendor", "the ask shows Put a vendor against this concept again"],
  ["no extension asked", "sourcing looks for Drop vendor", "it is not offered (negative)"]],
 "6.4", "src/store.ts · conceptRemoveFabricOption")

F("UF-SRC-07", "Find a fabric",
 "Sourcing.", "Fabric vendors · mills · Find a fabric (#/mills).",
 ["Fabrics in the master."],
 [["Types in Search a fabric (name, Enigma code, mill article, composition, book, or mill).", "The list follows.", "None."],
  ["Picks Mill, Where from (Anywhere, Domestic, International), Bucket, Swatch book, Sort by (Name, Cheapest, Fastest); Clear; Export.", "Columns, Enigma's fields only: Fabric (code · mill article), Composition (· panna), Vendor (domestic or international), TAT · MOQ, Cost / m (mill's currency), Inventory type, Swatch book.", "None."],
  ["Clicks a row.", "The fabric page.", "None."]],
 ["No buy yes or no, compare or show filters: only what Enigma holds."],
 ["Nothing: “No fabric matches that.”"],
 ["None."],
 [["search Albini", "sourcing searches", "only Albini fabrics show"],
  ["the list", "sourcing looks for a Compare column", "there is none (negative)"]],
 "5.3", "src/screens/Vendors.tsx · FindFabric")

F("UF-SRC-08", "Browse the mills and open one",
 "Sourcing.", "Fabric vendors · mills · The mills.",
 ["Mills in the vendor master."],
 [["Opens The mills.", "Code, Name, Vendor Type, Address, Office Phone, Office Email, Categories, Active, TAT · MOQ, Fabrics.", "None."],
  ["Clicks a mill.", "Drawer: Vendor · as in Enigma (Edit Vendor), Fabrics · N, Performance, Blocks, files and conversation.", "None."]],
 ["None."],
 ["Inactive mill: an inactive pill."],
 ["None."],
 [["a mill with 12 fabrics", "sourcing opens it", "Fabrics · 12 shows"],
  ["a design login", "it looks for The mills", "the screen is not in its sidebar (negative)"]],
 "5.4", "src/screens/Vendors.tsx")

F("UF-SRC-09", "Add a vendor",
 "Sourcing.", "The mills · + Add Vendor.",
 ["None."],
 [["Clicks + Add Vendor.", "Add Vendor: Code, Name, Vendor Type (FABRIC, TRIMS, DESIGN, SERVICE), Mill kind (Domestic, International), Address, Office Phone, Office Email, Categories, Active; Vendor Information: Mill Country, Mill Description, Currency (INR, USD, EUR), TAT (hours), MOQ (m).", "None."],
  ["Clicks Save vendor.", "Toast “<name> added, the same fields Enigma's Add Vendor form takes.” The mill opens.", "Vendor with its Enigma block."]],
 ["Save vendor is disabled until a name is given."],
 ["Close hides the form."],
 ["The mill is in Pick a mill… on every ask."],
 [["a new mill", "sourcing saves it with a name", "it opens and lists in The mills"],
  ["no name", "sourcing looks at Save vendor", "it is disabled (negative)"]],
 "5.4", "src/screens/Vendors.tsx · AddVendorForm; store.ts · addVendor")

F("UF-SRC-10", "Edit a vendor",
 "Sourcing.", "Mill drawer · Vendor · as in Enigma · Edit Vendor.",
 ["A mill."],
 [["Clicks Edit Vendor, changes fields, clicks Save.", "Toast “Factory master saved, the allocation rules use it from the next draft.”", "Vendor fields."]],
 ["None."],
 ["Cancel discards."],
 ["At write-back the edit goes to Enigma."],
 [["MOQ 150", "sourcing sets 300", "TAT · MOQ reads 300 m"],
  ["Edit open", "sourcing cancels", "nothing changes (negative)"]],
 "5.4", "src/screens/Vendors.tsx")

# ------------------------------------------------------------------ 12 design
h2("12. Design")
module("Design")
p("Design (Kunal, Janak) runs a new MTM fabric from ask to live online on Requirements (#/design). A requirement is always in one of five states: Requirement requested, Vendor added, PO punched, Fabric in, Live online. It opens in a drawer (?open=<id>) with the sections 1 · Requirement requested, Samples · optional, 2 · Vendor added, 3 · Fabric in, 4 · Live online, plus Design & sticker, files and conversation.")

F("UF-DES-01", "Read the requirements list",
 "Design.", "Requirements (#/design).",
 ["Requirements exist."],
 [["Opens Requirements.", "Stage filter: All, Requirement requested, Vendor added, PO punched, Fabric in, Live online (each with a count and a hint of whose move). Search requirement, fabric, style…. Columns: Requirement (name, why), Kind, Stage (pill), whose move and the next step.", "None."],
  ["Clicks a row.", "The requirement drawer.", "None."]],
 ["The state is derived, never typed."],
 ["None found: “Nothing here.”"],
 ["None."],
 [["an ask with a vendor added", "design filters Vendor added", "it is listed with design's move"],
  ["the stage pill", "design tries to change it by hand", "there is no control for it (negative)"]],
 "6", "src/screens/DesignHome.tsx")

F("UF-DES-02", "Raise a new MTM requirement",
 "Design.", "Requirements · + New requirement → An MTM fabric (#/design?new=mtm).",
 ["None."],
 [["Clicks + New requirement, then An MTM fabric.", "Form “From the design meeting”: Kind (Construction variant on an existing fabric, New fabric or shade), Working name, Why (the sentence the meeting never writes down), Will this fabric be washed? (new fabric only), more · book, wanted-by (Swatch book / range, Wanted on the floor by; for construction: Sampled on (inventory fabric), Collar, Placket, Cuff), Files (sketch, PAT, CAD, swatch image, tech pack).", "None."],
  ["Fills and clicks Log it.", "Toast “Concept logged, with the why, for once.” The requirement opens at Requirement requested.", "Concept {id, name, kind, brief, washed, spec, baseFabricId, book, targetMonth, raisedBy, raisedOn}; attachments."]],
 ["Log it is disabled until Working name and Why are filled.", "Sampled on lists only inventory fabric over 20 m, not bespoke, not paused or inactive."],
 ["New fabric: a note that bulk is bought only after the shipment sample is approved."],
 ["The ask lands on sourcing's Your move (UF-SRC-01)."],
 [["a name and a why", "design clicks Log it", "the requirement is created at Requirement requested"],
  ["no why", "design looks at Log it", "it is disabled (negative)"]],
 "6.1", "src/screens/Concepts.tsx · NewConcept; DesignHome.tsx")

F("UF-DES-03", "Work the optional samples checklist",
 "Production hands over and posts; design approves.", "Requirement · Samples · optional.",
 ["A requirement."],
 [["Picks Factory, clicks Mark handed over (Sample & PAT file handed to a factory).", "Toast “Sample and PAT file handed to the factory, logged.”", "Concept: factoryId, patSentOn."],
  ["When a PP sample is in, clicks Approve (remark optional) or Send back (remark required).", "Toasts “Approved, comments stay on the record with the round.” or “Sent back, a new round against the same concept, not a restart.”", "A sample round with decision and comments; the remark is posted to the conversation under PP sample."],
  ["Same for the shipment sample.", "As above.", "As above, under Shipment sample."],
  ["Production clicks Post approval (what to tell everyone, optional).", "Toast “Approval posted once on this record, every role reads the same line; no email, no second copy.”", "Concept: approvalSentOn; one conversation line under Approval."]],
 ["Mark handed over is disabled until a PAT file is attached.", "Send back is disabled until a remark is typed (“write what has to change first”).", "Post approval only after the shipment sample is approved."],
 ["The checklist is optional: no sample gate on Push PO."],
 ["Every remark is in the conversation under its step."],
 [["a PAT file attached", "production marks handed over", "the row shows done with the date"],
  ["a PP sample in and no remark", "design looks at Send back", "it is disabled (negative)"]],
 "6.1", "src/screens/Concepts.tsx · SamplesChecklist")

F("UF-DES-04", "Push the PO on the vendor card",
 "Design.", "Requirement · 2 · Vendor added · the vendor card.",
 ["Sourcing sent a vendor (with design since <date>)."],
 [["Reads the card: mill, article, cloth name, composition, panna, note; ₹ / m, MOQ, first buy, lead, holds until (Nd left, red at 5 or fewer).", "None.", "None."],
  ["Types Why (kept on the concept, sent back with a rejection) and metres (default the MOQ).", "The amount follows.", "None."],
  ["Clicks Push PO · ₹amount.", "Toast “Fabric PO raised, on the fabric master for sourcing to chase; the metres count as incoming.” The card reads chosen.", "A fabric joins the master (non-core, inactive, 0 m); a manual FabricPo (FPO-…, expected = today + lead); concept fabricPo; the option selected with chosenOn and rationale; fabric incoming + metres."]],
 ["Push PO is shown only to design once sent."],
 ["Hold lapsed: Push PO is not the primary button and “hold lapsed, the price is not promised” shows; ask More time first (UF-DES-05)."],
 ["State PO punched; the PO lists on Purchase orders (UF-PO-01); sourcing no longer sees the ask."],
 [["a card with MOQ 150 at ₹420", "design pushes the PO at the default", "a PO for 150 m at ₹63,000 is created and the fabric is in the master as inactive"],
  ["the card before sourcing sends it", "design opens it", "no Push PO shows (negative)"]],
 "6.3", "src/screens/Concepts.tsx; store.ts · conceptAcceptAndRaisePo")

F("UF-DES-05", "Ask sourcing for more time",
 "Design.", "Vendor card · More time.",
 ["A sent vendor, no extension asked yet."],
 [["Clicks More time.", "Toast “Extension asked. Sourcing will go back to the mills.” The card shows extension asked <date>.", "Option: extensionAsked; concept optionsExtension with the note (the Why text, or “need longer than the hold”)."]],
 ["Only once per open extension."],
 ["None."],
 ["The ask returns to sourcing's Your move as more time asked (UF-SRC-05)."],
 [["a sent vendor", "design asks for more time", "sourcing's Your move lists it"],
  ["an extension already asked", "design looks for More time", "it is not shown (negative)"]],
 "6.3, 6.4", "src/store.ts · conceptAskOptionExtension")

F("UF-DES-06", "Reject the vendor",
 "Design.", "Vendor card · Reject.",
 ["A sent vendor."],
 [["Types Why, clicks Reject.", "Amber toast “Rejected, the reason is on the record for sourcing.” The vendor moves to a struck line under the card with the reason.", "Option: rejected {by, on, reason}. With no live vendor left, optionsSentOn clears."]],
 ["The reason is taken from Why."],
 ["Reject with Why empty records “no reason given”."],
 ["Back to Requirement requested on sourcing's Your move."],
 [["a sent vendor", "design rejects with “shade too dark”", "the struck line shows the reason"],
  ["a chosen vendor", "design looks for Reject", "it is not offered (negative)"]],
 "6.3", "src/store.ts · conceptRejectFabricOption")

F("UF-DES-07", "Configure the fabric in Enigma",
 "Design.", "Requirement · 3 · Fabric in · Configured in Enigma.",
 ["The PO is punched."],
 [["Fills Template, Base m, Buffer m, Options the customer can pick.", "None.", "None."],
  ["Clicks Configured in Enigma.", "Toast “Configured, the option exists in Enigma. Still hidden until it is made live.”", "Concept enigma {template, consumptionBase, consumptionBuffer, options, configuredOn, by}."]],
 ["Disabled until a template and base metres are given."],
 ["None."],
 ["Order sheets on this fabric read base + buffer consumption."],
 [["template and base 1.6", "design configures", "the section reads configured with the date"],
  ["base empty", "design looks at the button", "it is disabled (negative)"]],
 "6.7", "src/screens/Concepts.tsx")

F("UF-DES-08", "Add the fabric's design (one product code)",
 "Design (sourcing can too).", "Requirement · Design & sticker · + Add the design.",
 ["The fabric has no design yet (the button shows only then)."],
 [["Clicks + Add the design.", "Form “The design on this fabric”: Design name, Style / preset, Category, SKU code, Product type, Weight (g), Region, Stock, Primary fabric (fixed), Status, Sales channel, Product media, Variant · option name, Option values; per value a price, discounted price and SKU; Description · PDP; Buzzwords.", "None."],
  ["Clicks Add design.", "Toast “Design added, the fabric's product code is minted.” The row shows BOM-SHI-FM-nnnn (or CS).", "Concept designs + one design {code, name, style, category, mrp (lowest variant price), variants, …}."]],
 ["Add design is disabled until a name is given.", "A second design on the same fabric is refused."],
 ["Sleeve, collar and the rest are order-sheet choices, not designs."],
 ["Listed on Fabric master data · Designs (UF-FAB-13) as Not in Enigma."],
 [["a fabric without a design", "design adds one", "a product code is minted and + Add the design disappears"],
  ["a fabric with a design", "design looks for + Add the design", "it is not shown (negative)"]],
 "6.6", "src/screens/Designs.tsx · DesignsOnFabric; store.ts · conceptAddDesign")

F("UF-DES-09", "Push the design to Enigma",
 "Design.", "Design & sticker · Push to Enigma →.",
 ["A design not yet in Enigma."],
 [["Clicks Push to Enigma →.", "Toast “Pushed to Enigma, <code> is now a design row there, with its name, MRP and attributes.” The status reads in Enigma · synced <date>.", "Design: enigmaOn, enigmaBy, enigmaSyncedOn."]],
 ["Only once; later price changes re-push and stamp the sync date."],
 ["None."],
 ["Designs list moves it to In Enigma."],
 [["a new design", "design pushes it", "the pill reads in Enigma with today's date"],
  ["a pushed design", "design looks for Push to Enigma", "it is not shown (negative)"]],
 "6.6", "src/store.ts · pushDesignToEnigma")

F("UF-DES-10", "Edit, remove or mark a design live in POS",
 "Design.", "Design & sticker · edit, remove, the live pill.",
 ["A design."],
 [["Clicks edit, changes fields, Save changes.", "Toast as add.", "Design fields; a rename keeps the earlier name."],
  ["Clicks the not live pill.", "Toast “Design live in POS.” (click again: “Design taken down.”)", "Design: liveOn."],
  ["Clicks remove (only while not live).", "Amber toast “Design removed.”", "The design is removed."]],
 ["remove is not offered on a live design."],
 ["None."],
 ["The store bill form offers a live design."],
 [["a design not live", "design marks it live", "the pill reads live"],
  ["a live design", "design looks for remove", "it is not shown (negative)"]],
 "6.6", "src/screens/Designs.tsx")

F("UF-DES-11", "Print the fabric's sticker",
 "Design (the swatch desk prints in phase two).", "Requirement · Design & sticker · Sticker · one per fabric.",
 ["The fabric is in the master."],
 [["Reads the sticker: fabric code, name with the mill's article, swatch book, MRP, Incl. of all taxes.", "Missing book or MRP shows in amber.", "None."],
  ["Picks Layout Label or Full page, clicks Print sticker.", "A print window with one sticker.", "None (in the MTM edition printing does not mark the swatch desk step)."]],
 ["One sticker per fabric."],
 ["No design yet: the name and price come from the fabric."],
 ["A name or price change after a print flags a reprint (phase two)."],
 [["a fabric with code and MRP", "design prints the label", "one sticker with the five lines prints"],
  ["the sticker", "design looks for a per-store copy count", "there is none (negative)"]],
 "6.6, 7 (phase two)", "src/screens/Swatches.tsx · StickerSheet")

F("UF-DES-12", "Set the final name and MRP",
 "Design.", "Requirement · Name & price.",
 ["A requirement."],
 [["Types Final product name and MRP ₹, clicks Set.", "Toast “Name and price set, website, sticker and system read the same thing.”", "Concept naming {newName, mrp, setOn}; the design's final name follows, with the earlier one kept."]],
 ["Set is disabled until a name and an MRP are given."],
 ["None."],
 ["Every list shows the final name; the sticker reads it."],
 [["a requirement", "design sets “Houndstooth Shirt - Light Grey” at 2990", "the drawer title and the sticker read the new name"],
  ["no MRP", "design looks at Set", "it is disabled (negative)"]],
 "6.8", "src/screens/Concepts.tsx; store.ts · conceptSetName")

F("UF-DES-13", "Take the fabric live online",
 "Design.", "Requirement · 4 · Live online · Live online.",
 ["A new fabric."],
 [["Clicks Mark done on Swatch photography, Video, Post-production · PDP ready (any order).", "Toasts “Swatch photography done.”, “Video done.”, “Post-production done, the PDP is ready.” The pill reads N of 3.", "Concept online {photosOn, videoOn, postOn}."],
  ["With all three done, clicks Go live online.", "Toast “Live online.” The pill reads live <date>.", "online.liveOn."]],
 ["Go live online shows only when all three are done."],
 ["Stores are not a gate here; live in stores follows the swatch desk in phase two."],
 ["State Live online."],
 [["three gates done", "design clicks Go live online", "the requirement reads Live online"],
  ["two gates done", "design looks for Go live online", "it is not shown (negative)"]],
 "6.9", "src/screens/Concepts.tsx; store.ts · conceptOnline")

# ------------------------------------------------------------------ 13 swatch desk
h2("13. Swatch desk, phase one")
module("Swatch desk")
p("Swatch desk (#/swatches). In phase one the desk runs from cloth in to the handover to Yusuf; cut, sticker, photos, dispatch and stores told come with the warehouse portal.")

F("UF-SW-01", "Mark the bulk received",
 "Warehouse (Shravani); production can in the prototype.", "Swatch desk · All or Cloth in · to hand to Yusuf.",
 ["A new fabric with a PO."],
 [["Reads the row: Fabric (code, book, N designs or no designs yet), Priority, Bulk received, To Yusuf.", "None.", "None."],
  ["Clicks Mark bulk received.", "Toast “Bulk inwarded at the warehouse.” The date shows.", "Concept swatch.inwardOn, by."]],
 ["Steps run in order: To Yusuf only after Bulk received."],
 ["Nothing on the desk: “Nothing on the desk, no new fabric is between the PO and the stores.”"],
 ["The next button is Mark to yusuf."],
 [["a fabric with a PO", "Shravani marks bulk received", "the date shows and Mark to yusuf appears"],
  ["bulk not received", "Shravani looks for Mark to yusuf", "it is not shown (negative)"]],
 "7.1", "src/screens/Swatches.tsx; store.ts · conceptSwatch")

F("UF-SW-02", "Hand the cloth to Yusuf, with priority",
 "Warehouse (Shravani).", "Swatch desk row.",
 ["Bulk received."],
 [["Clicks normal to set Priority-1 (click again to clear).", "Toast “Marked priority, cut this one first.” (or “Priority cleared.”) The row sorts to the top.", "swatch.priority."],
  ["Clicks Mark to yusuf.", "Toast “Handed to the swatch team.”", "swatch.handoverOn, by."]],
 ["None."],
 ["None."],
 ["Design sees with Yusuf; Priority-1 reminds until done."],
 [["two rows, one Priority-1", "the desk opens", "the Priority-1 row is first"],
  ["a design login", "it clicks the priority pill", "it is disabled (negative)"]],
 "7.1", "src/screens/Swatches.tsx")

# ------------------------------------------------------------------ 14 conversation
h2("14. Conversation, mentions, files and the bell")
module("Conversation and files")
p("Every record (order, customer, fabric, requirement, mill, return case) has Files · N and Conversation · N at its foot, open to anyone who can open the record. The bell, Waiting on you, sits top right on every screen.")

F("UF-COM-01", "Post on a record",
 "Anyone who can open the record.", "Any record · Conversation · N.",
 ["A record."],
 [["Types in “Write as <name>… @neha or @sourcing so it is addressed to them”.", "None.", "None."],
  ["Picks the step (order: General, Change from store, Fabric, Alteration; requirement: General and the sample steps).", "None.", "None."],
  ["Optionally clicks 📎 Attach and picks files.", "N files attached.", "None."],
  ["Clicks Post (or ⌘↵).", "Toast “Posted. Everyone mentioned sees it on this record until someone replies.” The comment shows with who, role, when and step.", "Thread comment {who, role, at, step, text}; files as attachments on the comment."],
  ["Filters by step (All N, <step> N).", "The list follows.", "None."]],
 ["Post is disabled until there is text or a file."],
 ["Nothing yet: “Nothing said here yet. This is where the WhatsApp about this record goes, so it stays with the record.”"],
 ["Mentioned people get a line on the bell (UF-COM-02)."],
 [["an order", "Swati posts under Fabric", "the comment shows with a Fabric pill"],
  ["no text and no file", "anyone looks at Post", "it is disabled (negative)"]],
 "8.1", "src/screens/Thread.tsx; store.ts · postComment")

F("UF-COM-02", "Mention a person or a team",
 "Anyone posting.", "Conversation box.",
 ["A record."],
 [["Types @ and a name or team (@kunal, @sourcing, @design) and posts.", "The mention is highlighted in the comment.", "Comment text; mentions resolved against people and roles."]],
 ["Unknown names stay plain text."],
 ["A team mention reaches every member."],
 ["Each person mentioned sees a line under Messages on the bell."],
 [["a comment with @sourcing", "it is posted", "Sreekanth and Srikanth each see it under Messages"],
  ["a comment with @nobody", "it is posted", "no one is notified (negative)"]],
 "8.2", "src/screens/Thread.tsx; Mentions.tsx")

F("UF-COM-03", "Deal with a mention",
 "The person mentioned.", "Waiting on you · Messages · N.",
 ["An unresolved mention."],
 [["Opens the bell and clicks Messages.", "Grouped Today, Yesterday, Earlier this week, Older; filters All N, This week, Earlier. Each line: record, step, text, writer.", "None."],
  ["Clicks Open the record.", "The record opens at its conversation.", "None."],
  ["Clicks Mark resolved.", "Toast “Marked resolved, it stays on the record, and whoever asked can see you dealt with it.” The line reads Resolved <when> · undo.", "Mention resolved {by, at}."],
  ["Clicks undo, or Mark all N resolved.", "“Put back on your list.” / every line resolved.", "As above."]],
 ["Done when dealt with, not when read."],
 ["None."],
 ["The bell count drops; the writer sees who resolved it."],
 [["one unresolved mention", "the person marks it resolved", "the bell count drops by 1"],
  ["a resolved mention", "the person reads it", "it is still on the record (negative: nothing is deleted)"]],
 "8.3", "src/screens/Mentions.tsx; store.ts · resolveMention")

F("UF-COM-04", "Work the things to do on the bell",
 "Every role.", "Waiting on you · Things to do · N.",
 ["Alerts for my role (for example: changed sheets pending, extra fabric to decide, past ship-by, review due, vendor added awaiting Push PO)."],
 [["Opens Things to do.", "Grouped by the job; each line is one record with Open →.", "None."],
  ["Clicks Open →.", "Goes to where the job is done.", "None."]],
 ["The list is computed; it clears when the job is done."],
 ["None."],
 ["None."],
 [["an extra-fabric ask to decide", "Swati opens the bell", "a line for it shows under Things to do"],
  ["the ask approved", "Swati opens the bell", "the line is gone (negative)"]],
 "4, 5, 9, 11 (alerts)", "src/screens/Mentions.tsx")

F("UF-COM-05", "Attach files to a record",
 "Anyone who can edit the record.", "Any record · Files · N.",
 ["A record."],
 [["Picks a label (per record kind; order: order sheet, alteration note, photo, measurement sheet; fabric: swatch image, test report, mill stock sheet, vendor quote, block confirmation, datasheet; requirement: PAT file, CAD / pattern, tech pack, sketch or reference, sample photo, green slip, approval note, swatch image).", "None.", "None."],
  ["Clicks + Add <label> and picks files.", "Toast “<name> on the record, no Slack needed.” Images preview inline.", "Attachment {kind, subjectId, label, step, name, by, at}."],
  ["Clicks remove on one.", "Toast “Removed.”", "Attachment removed."]],
 ["25 MB per file in the build."],
 ["Seeded files say “the file itself is not in this browser”."],
 ["The file stays with the record."],
 [["an order", "anyone adds a photo", "it shows under Files with the photo label"],
  ["a record opened read-only", "a reader looks for + Add", "it is not shown (negative)"]],
 "8.4", "src/screens/Files.tsx")

# ------------------------------------------------------------------ 15 RetailOS
h2("15. RetailOS interfaces")
module("RetailOS")
p("Store managers and owners have no screen in BSC PLM. Their side is built in RetailOS only. The flows below fix what passes between RetailOS and BSC PLM; the prototype's My store screen (#/stores) shows them for demonstration.")

F("UF-RET-01", "See and confirm the store's pre-confirmed orders",
 "Store manager. Built in RetailOS, shown in the prototype for demonstration.", "RetailOS · Orders · Pre-confirmed (prototype: My store · Pre-confirmed).",
 ["The store has pre-confirmed orders."],
 [["Opens Pre-confirmed.", "A reason filter (All and each reason). Columns: Order, Customer, Fabric, Why it is not confirmed (reason and note), Days pre-confirmed (red past 7), Confirm. Oldest first.", "None."],
  ["Clicks Confirm.", "Toast “Confirmed: the order joins the planning queue.”", "As UF-PROD-02 (written to BSC PLM)."]],
 ["Only the store's own orders."],
 ["None: “No pre-confirmed orders.”"],
 ["Production's Pre-confirmed list loses the row; the order enters Allocate."],
 [["an order 8 days pre-confirmed", "the manager opens the list", "8d shows in red"],
  ["another store's order", "the manager looks for it", "it is not listed (negative)"]],
 "2.1a", "src/screens/Stores.tsx · PreConfirmedTab")

F("UF-RET-02", "Correct an order sheet from the store",
 "Store. Built in RetailOS.", "RetailOS order sheet.",
 ["The order is Order or PP."],
 [["Corrects a field with a reason, as UF-PROD-20.", "V2 · changed once.", "The revision, sent to BSC PLM."]],
 ["After planning only a logistics remark (UF-PROD-21)."],
 ["None."],
 ["Production sees it on Changed sheets (UF-PROD-19); the factory never sees a change after planning."],
 [["a PP order", "the store changes the cuff", "Changed sheets lists it"],
  ["a planned order", "the store tries to change the cuff", "it is locked (negative)"]],
 "1.4", "src/screens/OrderSheet.tsx (who = store)")

F("UF-RET-03", "See a moved ship-by",
 "Store. Built in RetailOS.", "RetailOS orders list and the bell.",
 ["Production moved the ship-by (UF-PROD-17, UF-PROD-18)."],
 [["Reads the order.", "“moved from <date>, tell the customer” with the reason.", "None."]],
 ["None."],
 ["None."],
 ["None."],
 [["a moved order", "the store opens it", "the old date and the reason show"],
  ["an unmoved order", "the store opens it", "no moved note shows (negative)"]],
 "1.3, 2.7", "RetailOS")

# ------------------------------------------------------------------ 16 traceability
h2("16. Traceability")
p("Each flow, the PRD section it builds, and where it lives in the prototype.")
TRACE = len(C)   # the table is filled once every flow is known

# ------------------------------------------------------------------ 17 open points
h2("17. Open points")
p("Where the prototype's code and the PRD differ, this document follows the code. Each point needs a decision before the build.")
table(["#", "Area", "Code today", "PRD says", "Flows"], [
 ["1", "Push PO on a lapsed hold", "Push PO is still clickable; it only stops being the primary button and shows “hold lapsed, the price is not promised”.", "Push PO refused on a lapsed hold until extended.", "UF-DES-04"],
 ["2", "Reject reason", "Reject works with an empty Why and records “no reason given”.", "Reject needs a reason.", "UF-DES-06"],
 ["3", "Sending the vendor to design", "Sourcing must click Send to design → after Save vendor; until then the ask stays on Your move.", "Save vendor moves it to state 2 and Waiting on design.", "UF-SRC-02, UF-SRC-04"],
 ["4", "Price per variant", "Name & price sets one MRP per fabric (Set); the design also carries variant prices and its MRP is the lowest variant price.", "Price is per variant only.", "UF-DES-08, UF-DES-12"],
 ["5", "Design validation", "Add design needs only a name.", "A design needs a name and one variant with a price.", "UF-DES-08"],
 ["6", "Go live online gates", "Go live online appears only when photos, video and post are all done; there is no composition or description check; going live online does not clear the fabric's inactive flag.", "Gates advisory, skips kept; blocked until composition and a description are on the record; off hold for the website.", "UF-DES-13"],
 ["7", "Make inactive rights", "Make inactive / Make active has no role check on the list, the core review or the fabric page.", "A button shows only for the role that owns the step.", "UF-FAB-02"],
 ["8", "Old hold controls", "Bespoke still shows Switch off on Shopify & stores and Restore to sale; a core fabric back in stock shows Switch back on, in stock. Both set the same inactive flag under other names.", "One pair of words: Make inactive / Make active.", "UF-FAB-15"],
 ["9", "Edit Vendor toast", "Saving a mill shows the factory toast “Factory master saved, the allocation rules use it from the next draft.”", "None stated.", "UF-SRC-10"],
 ["10", "Extra fabric empty state", "Says merchandisers raise asks “from the Factory floor tab”; they raise them on My factory.", "Ask for extra cloth on My factory.", "UF-PROD-22"],
 ["11", "Shravani's actions", "Production can press Shravani: approve · issue from stock / approve & raise PO; there is no Shravani login in this edition.", "Shravani approves.", "UF-PROD-26, UF-PROD-27"],
 ["12", "Unit team logins", "The four desks open to production and the warehouse role; there are no CAD, cutting, fusing or compiling roles.", "Four teams, each with its own desk.", "UF-UNIT-01"],
 ["13", "Bespoke parcel inward", "The screen that books a bespoke parcel in (scan the mill's code) is on the warehouse portal, hidden in this edition, so a bespoke order cannot leave “waiting for cloth” here.", "Bespoke not planned before its parcel is in.", "UF-PROD-01"],
 ["14", "Files", "No 25 MB check and no step picker on the Files panel.", "25 MB per file; pick the label and optionally the step.", "UF-COM-05"],
 ["15", "Empty comment", "A comment can be a file with no text.", "A comment needs text.", "UF-COM-01"],
 ["16", "Swatch desk label", "The handover button reads Mark to yusuf.", "Handed to Yusuf.", "UF-SW-01, UF-SW-02"],
 ["17", "Changed sheets, factory side", "Code paths for “pending with the factory” and “Told <factory>” remain but can no longer be reached.", "Nothing reaches the factory after planning.", "UF-PROD-19"],
 ["18", "Job card", "The order drawer still has a Job card section beside the Order sheet; the factory screen calls the sheet “Order sheet · the job card”.", "Roles table: the merchandiser reads the order sheet and job card.", "UF-PROD-17, UF-FAC-04"],
 ["19", "Long dashes in labels", "Some labels and toasts use a long dash (for example Acknowledged, plan on this).", "Doctrine: no long dashes.", "All"],
])

# the traceability table, now that every flow is known
C.insert(TRACE, ('table', ['Flow', 'Title', 'PRD section', 'Screen / component'], [[fid, t, prd, src] for fid, t, prd, src, _m in FLOWS]))

# ===================================================================== HTML · devx Doctrine
def nd(t):
    """The doctrine allows no em dashes: a dash between clauses becomes a comma, an empty cell says None."""
    t=t.strip()
    if t in ('—', '-'): return 'None'
    t=re.sub(r'\s+—\s+', ', ', t)
    t=t.replace('—', ', ')
    return t
def split_head(t):
    m=re.match(r'(\d+)\.\s+(.*)$', t)
    return (m.group(1).zfill(2), None, m.group(2)) if m else ('', None, t)
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
css += """
h3{font-weight:600;font-size:18px;letter-spacing:-.01em;line-height:1.25;margin:40px 0 10px;padding-top:16px;border-top:1px solid var(--rule)}
h3 .fid{font-family:var(--f-mono);font-size:12px;font-weight:500;color:var(--accent);letter-spacing:.04em;margin-right:8px}
table.qa td:nth-child(2),table.qa td:nth-child(3),table.qa td:nth-child(4){min-width:160px}
"""
heads=[split_head(c[1]) for c in C if c[0]=='h2']
mods=sorted(set(m for *_x, m in FLOWS))
out=[f'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>BSC PLM · MTM user flows</title>{FONTS}<style>{css}</style></head><body><div class="page">']
out.append('<p class="eyebrow"><b>User flows</b> · Bombay Shirt Company · v1.0<span class="pill">Confidential</span></p>')
out.append('<h1>BSC PLM, the <em>made-to-measure</em> user flows</h1>')
out.append(f'<p class="lede">{esc(nd(SUB))}</p>')
out.append(f'<p class="meta">{DATE} · devx Labs · <a href="bsc-plm-prd-mtm.html">Read the PRD</a> · <a href="bsc-plm-flows-mtm-v1.0.docx">Download the Word file</a> · <a href="../">Open the prototype</a></p>')
out.append(f'<div class="stats"><div><div class="n">{len(FLOWS)}</div><div class="l">User flows</div></div><div><div class="n">{len(mods)}</div><div class="l">Modules</div></div><div><div class="n">{QA_N[0]}</div><div class="l">QA cases</div></div><div><div class="n">10</div><div class="l">Roles</div></div></div>')
out.append('<nav class="toc">'+''.join(f'<a href="#s{i}"><span>{h[0]}</span>{esc(h[2])}</a>' for i,h in enumerate(heads))+'</nav>')
hi=-1; open_sec=False
for c in C:
    if c[0]=='h2':
        if open_sec: out.append('</section>')
        hi+=1; num,wf,title=heads[hi]; open_sec=True
        out.append(f'<section id="s{hi}"><p class="eyebrow"><b>Section {num}</b></p><h2>{esc(title)}</h2><div class="rule-accent"></div>')
    elif c[0]=='h3':
        fid, _, t = c[1].partition(' · ')
        out.append(f'<h3 id="{esc(fid)}"><span class="fid">{esc(fid)}</span>{esc(nd(t))}</h3>')
    elif c[0]=='p': out.append(f'<p>{para_html(c[1])}</p>')
    elif c[0]=='b': out.append(f'<p><strong>{esc(nd(c[1]))}</strong> {para_html(c[2]) if c[2] else ""}</p>')
    elif c[0]=='ul': out.append('<ul>'+''.join(f'<li>{esc(nd(x))}</li>' for x in c[1])+'</ul>')
    elif c[0]=='table':
        cls=' class="steps"' if c[1][0]=='#' else (' class="qa"' if c[1][0]=='QA' else '')
        out.append(f'<table{cls}><thead><tr>'+''.join(f'<th>{esc(nd(h))}</th>' for h in c[1])+'</tr></thead><tbody>')
        for r in c[2]: out.append('<tr>'+''.join(f'<td>{para_html(x)}</td>' for x in r)+'</tr>')
        out.append('</tbody></table>')
if open_sec: out.append('</section>')
out.append('<div class="foot"><span>BSC PLM · MTM user flows</span><span>devx Labs · Confidential</span></div></div></body></html>')
html_out='\n'.join(out)
body=re.sub(r'<style>.*?</style>','',html_out,flags=re.S).replace('<!doctype html>','')
body_text=re.sub(r'<[^>]+>','',body)
assert '—' not in body, 'em dash left in output'
assert '!' not in body_text, 'exclamation mark in output'
for bad in ('Riddhiman', 'repunch'): assert bad.lower() not in body_text.lower(), f'{bad} in output'
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
    pr=el._element.get_or_add_tcPr()
    bb=OxmlElement('w:tcBorders')
    for side,(sz,col) in sides.items():
        e=OxmlElement(f'w:{side}'); e.set(qn('w:val'),'single'); e.set(qn('w:sz'),str(sz)); e.set(qn('w:color'),col); bb.append(e)
    for side in ('top','left','bottom','right'):
        if side not in sides:
            e=OxmlElement(f'w:{side}'); e.set(qn('w:val'),'nil'); bb.append(e)
    pr.append(bb)
def spacing(par, before=0, after=8):
    par.paragraph_format.space_before=Pt(before); par.paragraph_format.space_after=Pt(after)
d=Document()
st=d.styles['Normal']; st.font.name='Inter Tight'; st.font.size=Pt(10); st.font.color.rgb=INK2
st.element.rPr.rFonts.set(qn('w:eastAsia'),'Inter Tight')
for s in d.sections: s.left_margin=s.right_margin=Cm(2.0); s.top_margin=s.bottom_margin=Cm(2.0)
pp=d.add_paragraph(); font(pp.add_run('USER FLOWS · BOMBAY SHIRT COMPANY · V1.0 · CONFIDENTIAL'),'JetBrains Mono',7.5,MUTED); spacing(pp,0,12)
pp=d.add_paragraph(); font(pp.add_run('BSC PLM, the '),'Inter Tight',28,INK,False); font(pp.add_run('made-to-measure'),'Source Serif 4',28,ACCENT,False,True); font(pp.add_run(' user flows'),'Inter Tight',28,INK,False); spacing(pp,0,12)
pp=d.add_paragraph(); font(pp.add_run(nd(SUB)),'Inter Tight',11,INK2); spacing(pp,0,12)
pp=d.add_paragraph(); font(pp.add_run(f'{DATE.upper()} · DEVX LABS · {len(FLOWS)} USER FLOWS · {QA_N[0]} QA CASES'),'JetBrains Mono',7.5,MUTED); spacing(pp,0,24)
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
        pp=d.add_paragraph(); font(pp.add_run(f'SECTION {num}'),'JetBrains Mono',7.5,ACCENT); spacing(pp,24,4)
        pp=d.add_paragraph(); font(pp.add_run(title),'Inter Tight',18,INK,False); spacing(pp,0,10)
    elif c[0]=='h3':
        fid, _, t = c[1].partition(' · ')
        pp=d.add_paragraph(); font(pp.add_run(fid+'  '),'JetBrains Mono',9,ACCENT); font(pp.add_run(nd(t)),'Inter Tight',13,INK,True); spacing(pp,18,6)
    elif c[0]=='p':
        for l in c[1].split('\n'): pp=d.add_paragraph(); font(pp.add_run(nd(l)),'Inter Tight',10,INK2)
    elif c[0]=='b':
        pp=d.add_paragraph(); font(pp.add_run(nd(c[1])+' '),'Inter Tight',10,INK,True)
        if c[2]: font(pp.add_run(nd(c[2])),'Inter Tight',10,INK2)
        spacing(pp,4,2)
    elif c[0]=='ul':
        for x in c[1]: pp=d.add_paragraph(style='List Bullet'); font(pp.add_run(nd(x)),'Inter Tight',9.5,INK2); spacing(pp,0,2)
    elif c[0]=='table':
        t=d.add_table(rows=1, cols=len(c[1]))
        for i,h in enumerate(c[1]): add_cell(t.rows[0].cells[i], h, head=True)
        for row in c[2]:
            cells=t.add_row().cells
            for i,x in enumerate(row): add_cell(cells[i], x, first=(i==0))
        d.add_paragraph()
pp=d.add_paragraph(); font(pp.add_run('BSC PLM · MTM USER FLOWS · DEVX LABS · CONFIDENTIAL'),'JetBrains Mono',7,MUTED); spacing(pp,36,0)
d.save(sys.argv[2])
from collections import Counter
print('ok', len(FLOWS), 'flows', QA_N[0], 'qa', dict(Counter(m for *_x, m in FLOWS)))
