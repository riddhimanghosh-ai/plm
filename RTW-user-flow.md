# RTW in PLM: the complete user flow, screen by screen

One RTW style is one record. Every role opens the same record from its own list; the record shows a ten-step rail down the left, the open step beside it, and a "Your move / Next" bar on top. Lists everywhere show two columns from the same source: **Where it is** and **Next (who)**.

Deployed: bsc-plm-rtw.vercel.app (RTW edition) and plm-xi-green.vercel.app (full site).

## Who uses what

| Role | Sidebar entry | What the list shows | Opens the record at |
|---|---|---|---|
| Design | Design → Requirements; Design home | every ask at its stage, "waiting on me" first | the step that is design's move |
| Planning | Planning → RTW planning, Sheet, Stock health, What is selling, RTW launches, RTW production analytics | one review per option; drops | Launch |
| Sourcing | Sourcing → Fabric sourcing; Fabric vendors · mills | styles sent, with the cloth brief and quotes | Cloth vendor · fabric PO |
| Nitin (production) | Production · RTW → RTW production tracker | every bulk PO, date by date; status filter row | Factory · PO, then the TNA |
| Factory (merchandiser) | Merchandiser → My factory | POs for us · Cloth & material incoming · TNA | Factory · PO / Cloth / TNA |
| Warehouse | Warehouse → Inward, Goods received · GRN | dispatched POs on their way | Received at BSC |

The owner sees all of it; store managers have no PLM screen.

## The rail: ten steps, three phases

**Design** 1 Raised · 2 Proto, BOM, tech pack · 3 Sent
**Buy** 4 Cloth vendor, fabric PO · 5 Factory, PO · 6 Cloth at the factory
**Make, land, launch** 7 Sample approved · 8 Made (the TNA) · 9 Received at BSC · 10 Launched

Each step ticks itself when its data exists. The first unticked step is "where it is"; its `act` is "whose move".

---

## Step 0. Planning asks for the style (optional, before step 1)

**Screen:** Planning → RTW planning → Option count / Review
**Planning sees:** stock, rate of sale, weeks of cover and size gaps per option, from the planner's workbook.
**Planning does:** "Start the review · save today's figures", sets the ratio, picks a decision (reorder, new option, drop). A reorder lands with design as a new requirement.
**Hand-off:** Design → Requirements shows the ask with "Where it is: Raised · Next: design".

## Step 1. Raised (Design)

**Screen:** Design → Requirements → "+ New requirement" (kind RTW style), or the row planning created.
**Design sees:** "The ask": style, category, quantity spread over the usual sizes, need-by date, target cost.
**Design does:** fills the ask, saves. Can "Spread N over the usual sizes again".
**Next shown to everyone:** Proto · BOM · tech pack · design.

## Step 2. Proto · BOM · tech pack (Design)

**Screen:** the record, step 2 (from Requirements or Design home).
**Design sees:** three gates with a blocker line: prototype rounds, the cloth brief sourcing will shop against, the BOM with the tech pack.
**Design does:**
- logs "Prototype round N is back" with the outcome, or "No prototype needed for this style…" with a reason ("Record it");
- "Edit fabric details" to write the cloth brief (construction, weight, colour, metres per piece);
- fills the BOM lines and attaches the tech pack.
**Next:** when all three are in, the Send step reads "ready to send".

## Step 3. Sent to sourcing and production (Design)

**Screen:** the record, step 3.
**Design sees:** readiness pill (ready / what is still missing).
**Design does:** one click, "Send to sourcing and production →".
**What happens:** the cloth brief appears on Sourcing → Fabric sourcing; the style appears on Nitin's tracker as "Finding cloth & factory". Both start at once.

## Step 4. Cloth vendor · fabric PO (Sourcing, then Design)

**Screen (sourcing):** Sourcing → Fabric sourcing → open the style.
**Sourcing sees:** the brief, the mills with lead times and block windows (from Fabric vendors · mills), suggested matches.
**Sourcing does:** "Pick this one…" puts one vendor against the brief with price, lead time and hold date; "Save vendor"; "Send to design →". Can "Extend" a hold, "Drop vendor", or "Unchoose".
**Screen (design):** the same record, step 4, now "design to push the fabric PO".
**Design sees:** the one vendor, price, metres, hold expiry.
**Design does:** "Push PO" (raises the fabric PO; metres editable), or "Send back to design"/"Reject" with a reason, or asks sourcing to "Extend".
**Next:** step 4 ticks with "PO number · mill". Tracker status becomes "Cloth ordered".

## Step 5. Factory · PO (Nitin, then Design)

**Screen (Nitin):** Production · RTW → RTW production tracker → open the style → Factory · PO.
**Nitin sees:** the style, quantity, need-by date; factories on file.
**Nitin does:** proposes a factory with the cost and date agreed on the phone. "Replace this proposal…" if it changes.
**Screen (design):** the record, step 5, "design to accept or send back".
**Design does:** accepts or sends back with a reason. On accept: "Raise PO to <factory>". The PO date generates the TNA.
**On the tracker:** the Factory column stays blank while a proposal is with design; the name appears once design accepts, the PO number once it is raised. The factory itself sees nothing until the PO exists.
**What the factory sees:** Merchandiser → My factory → POs for us lists the PO with style, pcs, due date. Step 5 shows "Documents the factory works from": PO, tech pack, BOM, size breakup.
**Tracker status:** "PO raised".

## Step 6. Cloth at the factory (Sourcing, then Factory)

**Screen (sourcing):** the record, step 6, "sourcing to send it".
**Sourcing does:** after the factory PO exists, marks the cloth and trims as sent to the factory with the date and metres ("Issue materials to factory"; or "Materials covered" when nothing is to send).
**Screen (factory):** My factory → Cloth & material incoming.
**Factory sees:** one row per PO: PO · style · pcs · "Cloth for this PO" (m sent, from which mill) · "Trims for this PO" (n of m in) · status pill · Next ("count the cloth in").
**Factory does:** opens the row; the panel is stamped "Everything below is for PO · style · pcs". Counts the cloth in: metres OK, damaged, note, "Save". Trims: "All in" or "Less…" with the count.
**If the cloth is short:** the pill turns "short N m". The factory asks design for a cut ratio from the same panel: cut fewer pieces, or a new size ratio on the metres received. The cloth count is now final; the count-in inputs disappear.
**Cut-ratio loop (one trail, both sides see it):**
- Factory: "Cut ratio" block, pill "with design", note "the cloth count above is final".
- Design: record step 6 shows the trail; gives the new sizes (or approves cutting fewer). Pill "new cut ratio given · to send". Design can later "Change the sizes…" and "Give the changed ratio".
- Nitin: "Send the new ratio to <factory>" (skipped when the factory raised the ask itself: it goes straight through).
- Factory: pill "new cut ratio at the factory"; cloth row reads "short N m · sizes changed"; "Sizes to cut" grid shows design's new sizes. Nothing to recount.
**Tracker status:** "Cloth at factory".

## Step 7. Sample approved (Factory, then Production)

**Screen (factory):** My factory → open the PO → Sample.
**Factory does:** sends the first sample made from bulk cloth: round, date, photos or note.
**Screen (production):** tracker → record → Sample, "production to review".
**Production does:** approves (PP go-ahead) or asks for another round with comments. The factory sees "resubmit" with the comments and sends round N+1.
**Tracker status:** "In production" once approved.

## Step 8. Made · the TNA (Factory, Nitin watches)

**Screen (factory):** My factory → TNA tab, or the record step 8.
**Factory sees:** every milestone from fabric PO to dispatch as a flow (done / done late / past plan, nothing logged / next up / planned), "all N steps →" for the table.
**Factory does:** logs its own actual dates against each milestone; late steps go red.
**Screen (Nitin):** tracker list shows "Where it is: <TNA stage> · Nd late" in red when behind; "As the sheet" view mirrors the Excel tracker column for column. Nitin can log or correct a date in the same grid. "Split the dispatch" when part ships early; "Cancel split" to undo.
**Screen (planning):** Planning → RTW production analytics: OTIF, daily monitor, escalations, merchandiser alerts read off the same dates.
**Tracker status:** "Shipped to BSC" once Dispatch has an actual date.

## Step 9. Received at BSC (Warehouse)

**Screen:** Warehouse → Inward (dispatched POs on their way) → open the PO → Received at BSC.
**Warehouse sees:** PO, style, expected pcs by size, lots received so far.
**Warehouse does:** counts a lot in by size, rejects marked separately; "Received" (or receives and flags a shortfall). Partial receipts show "N of M in". Each lot posts to Goods received · GRN, where finance picks it up ("Pick up · GST & recon").
**Tracker status:** "At warehouse".

## Step 10. Launched (Planning, with Design)

**Screen:** Planning → RTW launches → "+ Add to a drop" (or "Add to drop" from the requirement).
**Planning sees:** the style with its drop month, launch date, stores, marketing name, display and fit plan.
**Planning does:** "Allocate default display & fit plan", "Mint the design code", "Goods received at HO", "Dispatch" per store or "Dispatch all remaining", "Mark received for them", then "Make live in Enigma · launch".
**Everywhere:** the record's rail is fully ticked; lists read "launched <date>". Stock health and What is selling pick the option up from here.

---

## Cut ratio, from material intake to the factory cutting

1. **Factory, Cloth & material incoming.** Opens the PO row, enters metres OK, metres damaged, a note, saves.
2. **Short cloth.** Pill "short N m". Two buttons: "Ask design to change the sizes", or "Propose to cut fewer…" (size grid prefilled to what the cloth allows, plus Why). The cloth count is final from here; the inputs disappear.
3. **Factory after asking.** "Cut ratio" block with the trail: who asked, when, old sizes, proposed sizes, pill "with design". Row Next: "design to give new sizes" or "design to approve cutting fewer".
4. **Design is told.** Waiting on you: critical alert. Requirements and tracker rows show the same Next. The record opens on step 6, Cloth at the factory.
5. **Design answers.** One input per size for the cloth that is there (usable metres and the pieces they allow shown above), prefilled with the proposal. "Give this cut ratio" or "Approve the cut-short". The order's sizes and cut quantity change.
6. **Who sends it on.** Factory raised it: goes straight to the factory. Nitin raised it from the tracker: pill "new cut ratio given · to send", Nitin clicks "Send the new ratio to <factory>".
7. **Factory sees the result.** Pill "new cut ratio at the factory"; cloth row "short N m · sizes changed"; green note with the date and new piece count; "Sizes to cut" grid shows design's sizes. Nothing to count again.
8. **Design changes it later.** "Change the sizes…" then "Give the changed ratio" adds a line to the trail; the factory sees new sizes as a status change, cloth count untouched. Same send rule as 6.

## The one status row, as every list shows it

With design → Finding cloth & factory → Cloth ordered → PO raised → Cloth at factory → In production → Shipped to BSC → At warehouse → Launched.

Row tone: amber while buying, green while making, red when the TNA is behind, grey when launched.

## Rules the flow keeps

- BSC buys all cloth; sourcing sends it to the factory. No FOB.
- Vendor means cloth vendor. The garment maker is always the factory.
- No new drawers, no new status words: anything new is a step on the rail or a column on the list.
- The factory never counts cloth twice; a short count goes to design as a cut-ratio ask, and the answer comes back on the same trail.
- Planning sits beside the chain as a decision tool (steps 0 and 10) and reads the TNA for analytics; it does not run production.
