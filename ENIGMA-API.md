# Enigma APIs PLM needs, and what each one carries

PLM is built beside Enigma and talks to it over its JSON REST API. Enigma stays the system of record for fabric, finished stock, purchase orders, GRNs, customer orders, stores and stock transfers. PLM reads first; it writes only where BSC and the Enigma team agree access, in the last build phase.

What is known comes from the live read of 26 Aug 2026 (new-admin.bombayshirts.com, OAuth 2, versioned paths, a 115-module RBAC layer). Items marked *to confirm* were not visible on that read.

## Access

| Need | Detail |
|---|---|
| Auth | OAuth 2 bearer plus refresh token on `/oauth/token`. A dedicated read-only service account for PLM, then a second with write rights for the last phase. |
| RBAC modules | Fabric Module, Fabric Inventory, Fabric PO, Design Module, Design Inventory, Design PO, All Orders, Reports, Warehouse, Vendors; plus the ones blocked on 26 Aug: stock transfers, bin master, store master, allocation engine, restock and location history, ShipHero orders. |
| Environment | No sandbox was referenced from the production build. One is needed for the write phase. |
| Change filters | No `updatedAfter` anywhere today; the cheapest high-value change is a server-side `updatedAfter` on the fabric, order and inventory list endpoints. |

## 1. Reads: PLM pulls from Enigma

| # | API | What PLM takes from it | Where it shows in PLM | Side |
|---|---|---|---|---|
| R1 | Fabric master `GET /fabric/v2/…` with attribute templates | Code, name, category, product type, inventory type, vendor, vendor code, on-hold, auto-PO flag, the attribute set (composition, weave, mill, MOQ, cost per unit, consumed-in unit, swatch book) | MTM fabric master; the Enigma code sourcing records on an RTW cloth | MTM, RTW |
| R2 | Fabric inventory per warehouse | Physical, accounting (reserved), threshold, saleable per fabric and warehouse. Saleable is stored, so PLM recomputes it and uses Enigma's as a cross-check | MTM fabric record, extra-fabric asks, sourcing's "is cloth in hand" | MTM, RTW |
| R3 | Stock ledger `GET /inventory/deductionReport` (needs `sku`; date or id range to be added) | Every movement with running balance, purpose, reason, PO id, order line id. Consumption and sell-through come from here, not from the order table | Fabric consumption, "fabric issued for RTW", sell-through | MTM, RTW |
| R4 | Purchase orders `/purchase_order/v2` with lines and fulfilments | PO header (type FABRIC or DESIGN, status DRAFT, Open, Close, Cancelled, vendor, totals), lines (product code, quantity, price, consumed-in, order id), fulfilments as the GRN (amount, who, when) | Fabric PO status on the MTM fabric and the RTW cloth step; factory PO and its GRN on the RTW record step 9 | MTM, RTW |
| R5 | Orders `/order-module/…` with the 7 date filters and `statusHistory` | Customer order lines, 59 states scoped per factory, QR code URL, factory, fabric received, ship-by, shipped, sizing fields | MTM floor, production tracker, aging, the store's trial and alteration views | MTM |
| R6 | Designs and variants `/design/list-variants-with-inventory` | Finished-piece stock per variant SKU (code, colour, size) per warehouse, price, media, quantity tracked | Planning review, stock health, what is selling, the GRN of RTW goods (step 9), launch display stock | RTW |
| R7 | Vendors | Code, name, vendor type, contact, active. Lead time, MOQ, currency and terms are fabric attributes, not vendor fields | Cloth vendors and mills; factories | MTM, RTW |
| R8 | Stores and warehouses | Store code, display name, type, Shopify location id, ShipHero warehouse id, capacity, allocation rule | Store list, display and fit allocation, replenishment | MTM, RTW |
| R9 | Stock transfers `/stock-transfer/*`, `/transfers/sto/*` (403 today) | STO header and lines, shipped, received, closed | Display and fit pieces received at stores, replenishment, ghost-stock watch | RTW |
| R10 | Order status history and scans | Who moved an order line and when, factory scans | MTM desks and the tracker's audit line | MTM |

## 2. Writes: PLM pushes to Enigma (last phase, access to be agreed)

| # | API | What PLM sends | Trigger in PLM | Side |
|---|---|---|---|---|
| W1 | Create fabric `POST /fabric/v2/…` with attributes per template | A new MTM fabric: code, name, category, product type, inventory type, vendor, vendor code, composition, weave, mill, MOQ, cost per unit, consumed-in, swatch book | "Save details" on the fabric record once sourcing has the vendor | MTM |
| W2 | Create design / product code (Design Module) | The product code, name it sells as, category, style, MRP, sizes with per-size SKU, description, media, product type (CUSTOM_DESIGN for MTM, READY_TO_WEAR for RTW) | MTM: "Save details" mints the one product code. RTW: "Mint the design code · to Enigma" and "+ Another design code" on the launch, one row per code | MTM, RTW |
| W3 | Update design | Name, price, description, attributes; the code never changes | "Save · sync to Enigma" on a design code; marketing renames | MTM, RTW |
| W4 | Create purchase order `POST /purchase_order/v2` (DRAFT then Open) | Fabric PO to the mill: fabric code, metres, price, consumed-in, vendor. Factory PO for RTW: type DESIGN, factory as vendor, style, quantity, price | Design "Push PO" on the fabric; design "Raise PO to the factory" on the RTW record | MTM, RTW |
| W5 | Amend purchase order quantity | The PO's size breakup after a cut ratio or cut-short, if BSC wants Enigma's PO to follow | Design gives a new cut ratio; Nitin sends it to the factory | RTW |
| W6 | Stock adjustment with reason | Fabric issued for RTW (cloth sent to the factory), moving pieces to the non-sellable bin for display, pull-backs, sampling, swatch and shrinkage testing | Sourcing marks cloth sent; planning allocates display pieces | MTM, RTW |
| W7 | Fabric on-hold flag | `isOnHold` on a fabric | Design or sourcing puts a fabric on hold | MTM |
| W8 | Order line status transition | The next of the 59 states, with remarks | MTM desks: CAD, cutting, fusing, compiling, out-factory scan | MTM |
| W9 | Create stock transfer (STO) | Display and fit pieces to each store, replenishment moves | "Dispatch" on the launch; replenishment approval | RTW |
| W10 | Make live, Shopify sync | Design and variants visible to sell; trigger of the per-warehouse inventory sync that is a manual button today | "Make live in Enigma · launch" | RTW |

## 3. Enigma to PLM: events

Enigma has a `webhook` permission; whether it backs a real outbound facility is open (question N8). If it does, PLM wants these events. If not, PLM polls the lists above, which is why `updatedAfter` matters.

| # | Event | What PLM does with it |
|---|---|---|
| E1 | GRN posted on a PO | Fills the MTM fabric's "cloth in"; fills RTW step 9 by lot and size; moves the tracker to Received |
| E2 | Order line state changed | Moves the MTM order on the floor view and the tracker |
| E3 | STO shipped, received, closed | Ticks display and fit pieces at the store; clears the ghost-stock watch |
| E4 | Fabric or design created or edited in Enigma | Keeps the PLM masters in step when someone works in Enigma directly |
| E5 | Stock adjustment posted | Keeps consumption and saleable current between polls |

## 4. API changes to ask the Enigma team for

1. `updatedAfter` on the fabric, order and inventory list endpoints.
2. A date or id range on `/inventory/deductionReport`, so `sku` is optional.
3. A GRN number, invoice reference and dye lot on the PO fulfilment; today it carries amount, who and when only.
4. `estimatedArrivalDate` filled on POs, so lead time can be measured.
5. Rate limit and maximum page size stated.
6. A non-production environment for the write phase.
7. A read-only service account, then a write account scoped to W1 to W10.

## 5. Order of use

Reads R1, R2, R4, R7 and R8 come first: fabric master, fabric stock, POs, vendors, stores. R3 and R5 follow for consumption and the MTM floor. R6 and R9 unlock planning and launches on the RTW side; R9 is blocked on RBAC today. Writes come last, W2 and W4 first, since the design code and the PO are what the rest of BSC's systems key on.
