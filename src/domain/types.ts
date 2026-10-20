/* ==========================================================================
   Domain — what BSC actually tracks, and who writes each field.
   ---------------------------------------------------------------------------
   Two spines, because the business runs two: MTM, where the FABRIC is the SKU
   and the shirt is made after the sale; and RTW, where the GARMENT is the SKU
   and everything is a forecast made 3–4 months ahead. Nothing here is a field
   nobody fills — every one comes from a sheet, a call, or the Production
   Tracker itself.
   ========================================================================== */

export type RoleId = 'owner' | 'design' | 'planning' | 'sourcing' | 'production' | 'warehouse' | 'store' | 'finance' | 'merchandiser';

export interface Person { id: string; name: string; role: RoleId; title: string }

/* ---------- vendors --------------------------------------------------- */
export type VendorKind = 'CMT factory' | 'MTM factory' | 'Hemming unit' | 'Domestic mill' | 'International mill' | 'Trims';

export interface Vendor {
  id: string;
  name: string;
  kind: VendorKind;
  location: string;              // city — the tracker's "Factory location"
  region: string;                // the tracker's "Region"
  leadDays: number;              // measured from past POs
  onTimeRate: number;            // 0..1
  moq: number;
  blockWindowDays: number;       // how long a mill holds a block (fabric vendors only)
  /* MTM factories — the planning inputs Swati studies by hand today */
  mtm?: boolean;                 // takes single-piece MTM orders
  tailors?: number;              // masters on the floor; × pieces per tailor per day = nominal capacity
  distanceKm?: number;           // from the production unit — urgent orders go to the nearest
  dailyOut?: number[];           // last 7 days' out-of-factory pieces (the WhatsApp shipping report)
  dailyTarget?: number;          // Swati's learned feed per day ("Mahendra 300, Harsh 60") — caps headroom when set
  corporate?: boolean;           // corporate orders always go here
  urgentReserve?: boolean;       // kept with breathing space for one-, two-, three-day urgents
}

/* ---------- RTW: the production order — one relay, six writers -------- */
export type GarmentCategory =
  | 'RTW CMT shirts' | 'RTW FOB shirts' | 'Bottoms / Knitwear / Jackets'
  | 'Flat Knits (T-shirts)' | 'Flat Knits (Shirts)' | 'Jeans' | 'Kurta';

export type OrderStatus = 'Requirement' | 'Quoting' | 'Allocated' | 'Open' | 'Closed' | 'Cancelled';

/* Sourcing quotes FABRIC, from fabric vendors — the third-party mills. Factories
   are not quoted; they are allocated by capacity, the way MTM is. */
export interface FabricQuote {
  id: string;
  vendorId: string;              // the fabric vendor
  cpm: number;                   // ₹ per metre
  moq: number;                   // metres the vendor will not go below
  widthCm: number;               // panna, off the order sheet
  leadDays: number;
  committedDelivery: string;     // ISO
  blockValidUntil: string | null; // ISO — how long the mill holds this price and these metres for us
  extendedOn: string | null;     // ISO — the last time sourcing went back and got the hold extended
  extensionAskedOn?: string | null;   // design asked for this one to be held longer
  composition: string | null;
  note: string | null;
  vendorCode?: string | null;    // the mill's own article number — becomes the tracker's Vendor Fabric Code
  selected: boolean;
}

/* Design's ask, in design's words. Sourcing shops against this, not against a
   style name. It is the email that used to say "something like last year's
   oxford but softer, in ecru". */
export interface FabricBrief {
  look: string;                  // 'Oxford', '2-ply poplin', 'brushed twill'
  composition: string | null;    // '100% cotton'
  colour: string | null;         // 'Ecru'
  weightGsm: number | null;
  referenceFabricId: string | null;  // an MTM fabric that is close, if there is one
  notes: string;
}

/* ---------- Option requests — the real shape of the ask ----------------------
   Design does not ask for a fabric. It asks for a CATEGORY and a NUMBER: "ten
   options for shirts this winter". Sourcing puts ONE vendor against each option
   it is going ahead with; design settles each option on its own — push the PO,
   reject the vendor, ask for the hold to be extended, or close the option. Seven
   of ten going live is a normal outcome, not a failure. The same request also
   carries the bill of materials design wants (filled by design) and the trims
   the trims master already holds stock for — trims are inventory, like cloth. */
export type RequestOptionStatus = 'open' | 'with-design' | 'extension' | 'po-raised' | 'closed';   // accept raises the PO in the same click, so there is no 'chosen' limbo
export interface RequestOption {
  id: string; index: number;             // Option 1 … Option N
  note: string;                          // design's word for the slot — "a dark check", "something brushed"
  /* the detailed ask for this one option — what sourcing shops against */
  ask?: { look: string; composition: string | null; colour: string | null; weightGsm: number | null; referenceFabricId: string | null; maxCpm: number | null; notes: string } | null;
  status: RequestOptionStatus;
  offers: ConceptFabricOption[];         // the one vendor sourcing put against this option (earlier ones stay as rejected/withdrawn history)
  sentOn: string | null;                 // when sourcing handed the slot's offers to design
  extension: { askedOn: string; by: string; note: string; resolvedOn: string | null } | null;
  closed: { by: string; on: string; reason: string } | null;
  fabricId: string | null;               // the master row once design chose
  fabricPoId: string | null;             // the PO on the fabric master once raised
}
export interface OptionRequest {
  id: string; reqNo: string;
  category: GarmentCategory | 'MTM shirts';
  brief: string;                         // why — the sentence from the meeting
  raisedBy: string; raisedOn: string;
  liveBy: string | null;                 // 'Nov 26'
  targetCost: number | null;             // per piece, all in
  optionCount: number;
  options: RequestOption[];
  bom: BomLine[];                        // design's bill of materials — its trim lines read stock off the trims master
}

/* Where the fabric sits between design and sourcing. Two hands, one record. */
export type SourcingStage = 'vendors' | 'design-choice' | 'extension' | 'chosen' | 'po-raised';
export interface SourcingState {
  stage: SourcingStage;
  submittedOn: string | null;    // when sourcing handed the options to design
  extension: { askedOn: string; by: string; note: string; resolvedOn: string | null } | null;
  fabricPo: { no: string; on: string; metres: number } | null;
}

export interface Milestone {
  key: string;                   // 'Cutting Start'
  label: string;
  owner: RoleId;
  stage: 'pre-production' | 'production';
  plan: string;                  // ISO — from the category template
  revised: string | null;        // ISO — the current commitment when it has moved
  actual: string | null;         // ISO — what really happened
  delayReason: string | null;    // required when revised is set by a person
}

/* ---------- costing — New Cogs Working v2.xlsx, column for column ------
   Fabric cost = CPM × consumption; FOB = fabric + CMP; Total cost (COGS) =
   FOB + trims & packaging + transportation + hemming + shipping + factory
   overheads; derived MRP = total × multiple. Nulls are simply "not costed yet". */
export interface Costing {
  cpm: number | null;            // ₹ per metre of fabric
  consumption: number | null;    // metres (or kg for knits) per piece — planned
  actualConsumption: number | null;  // what the cutting table actually used
  cmp: number | null;            // cut-make-pack, ₹/pc
  trimsPackaging: number;        // ₹/pc — Trims Working sheet, by sub-category
  transportation: number;
  hemming: number;               // bottoms only
  shipping: number;
  factoryOverheads: number;
  multiple: number;              // total cost × multiple → MRP
}

/* ---------- BOM — what the job card lists (Merchandise Master trim card +
   Trims Working packaging columns). One line per material. */
export interface BomLine {
  kind: 'fabric' | 'trim' | 'packaging';
  item: string;                  // 'Button', 'Courier bag', 'Washed Oxford — Sky Blue'
  spec: string | null;           // 'Soktas · 100% cotton 2×1 twill', 'Horn, 4-hole, 18L'
  qtyPerPc: number | null;
  unit: string;                  // 'm', 'kg', 'pc'
}

/* ---------- RTW sample approval — the gate before bulk ------------------
   Factory makes a sample from the tech pack and job card; the BSC Production
   Unit reviews it against them; comments go back on a green slip; major
   comments mean another round; otherwise PP go-ahead. */
export type SampleArea = 'Stitching' | 'Fit' | 'Pattern' | 'Construction' | 'Fabric handling' | 'Trims / labels / buttons' | 'Other';
export interface SampleRound {
  round: number;
  submittedOn: string;           // sample reached the production unit
  reviewedOn: string | null;
  reviewedBy: string | null;
  comments: { area: SampleArea; text: string; major: boolean }[];
  decision: 'pending' | 'resubmit' | 'approved';   // resubmit = major comments; approved = PP go-ahead (may carry minor comments)
}

/* Materials for the bulk — received centrally, checked, then issued to the factory. */
export interface MaterialLine {
  bomIndex: number;              // which BOM line
  requiredQty: number;           // per pc × order qty
  receivedOn: string | null;
  checked: 'pending' | 'ok' | 'fail';
  issuedOn: string | null;
}

/* BSC's own merchandiser and QC at the factory audit the output before it leaves. */
export interface QcAudit {
  at: string; by: string;
  checked: number; passed: number;
  issues: string;
  released: boolean;             // false = goods held until corrected
}

/* How the cloth is bought. BSC buys it (sourcing quotes mills, design pushes the
   PO); or FOB — BSC names the supplier by email and the VENDOR buys the cloth,
   funds and makes the garment, BSC buys finished pieces; or the vendor sources
   its own cloth with no say from BSC. `fabricNominated` stays as "BSC buys". */
export type SourcingMode = 'bsc-buys' | 'fob-nominated' | 'vendor-sources';
export interface FobNomination { supplierVendorId: string; emailedOn: string | null; by: string | null; note: string }

export interface ProductionOrder {
  id: string;
  poNo: string | null;           // null until sourcing allocates

  /* — Design writes these — */
  category: GarmentCategory;
  subCategory: string;
  styleName: string;             // the sheet's 'Style / Color'
  shipheroName: string | null;   // 'Shiphero Style Name' — what the warehouse system calls it
  program: string | null;        // 'High Priced', 'Core', …
  launchMonth: string | null;
  fit: string | null;
  orderQty: number;
  sizeBreakup: { size: string; qty: number }[];
  targetInhouse: string;         // ISO — the business commitment
  targetCost: number;
  styleHandover: string;         // ISO — lead time starts here
  fabricNominated: boolean;
  sourcingMode?: SourcingMode;                 // default: fabricNominated ? 'bsc-buys' : 'vendor-sources'
  fobNomination?: FobNomination | null;        // FOB: the supplier BSC named, and the email that said so
  fabricBrief: FabricBrief | null;   // what design asked for — null when the factory sources its own
  /* design may send a SHORTLIST instead of one cloth: sourcing finalises internally,
     picks one, records why, and adds the vendor for that one */
  fabricShortlist?: { id: string; look: string; composition: string | null; colour: string | null; referenceFabricId: string | null; note: string }[];
  fabricPick?: { shortlistId: string; by: string; on: string; why: string } | null;
  /* before any cloth is sourced: a prototype of the style on whatever shirt
     fabric is to hand. Design approves it, or marks that none is needed. */
  proto?: { standIn: string | null; rounds: SampleRound[]; skipped: { by: string; on: string; reason: string } | null } | null;
  bom: BomLine[];                // the tech pack's material list — the job card is cut from it
  /* ---- the RTW loop as Nitin runs it (3 Oct 2026) ----
     Production proposes a factory with its cost and date; design accepts or rejects with a
     comment; design raises the PO to the factory; sourcing buys the fabric and sends it to
     the factory; the factory confirms what landed; a short delivery asks design for a new cut ratio. */
  factoryProposals?: { id: string; vendorId: string; quotedCost: number; estimatedInhouse: string; note: string; proposedOn: string; by: string;
    decision: { by: string; on: string; accepted: boolean; comment: string } | null }[];
  factoryPo?: { raisedOn: string; by: string; docsSent: string[]; docsMissing: string[] } | null;
  fabricSupply?: { boughtOn: string | null; sentToFactoryOn: string | null; metresSent: number | null;
    receipt: { on: string; by: string; metresOk: number; metresDamaged: number; note: string } | null } | null;
  /* short or damaged cloth: production or the factory itself asks design either for a
     modified ratio (design decides the sizes) or to cut short (a reduced breakup is proposed) */
  cutRatios?: { askedOn: string; by: string; askedByRole?: 'production' | 'merchandiser'; kind?: 'ratio' | 'cut-short'; reason: string; originalBreakup: { size: string; qty: number }[];
    proposedBreakup?: { size: string; qty: number }[] | null;
    given: { on: string; by: string; breakup: { size: string; qty: number }[] } | null; sentToFactoryOn: string | null }[];
  /* after the fabric PO, sourcing walks the trim and packaging lines against
     stock at the unit and signs them off as covered */
  materialsCovered?: { on: string; by: string } | null;

  /* — Sourcing writes these — */
  costing: Costing;

  /* the fabric, bought from a fabric vendor — quoted */
  sourcing: SourcingState;
  fabricQuotes: FabricQuote[];
  fabricVendorId: string | null;
  vendorFabricCode: string | null;   // the mill's own article number — 'Verdi SOK#24594'
  enigmaCode: string | null;         // BSC's fabric code in Enigma — 'FORPDOSOPI-81'
  fabricBlocked: number | null;      // metres the vendor is holding; cut qty comes off this ÷ consumption
  fabricMetres: number | null;   // consumption × qty, as ordered

  /* the FACTORY that makes the garment — allocated by capacity, never quoted */
  vendorId: string | null;
  poDate: string | null;
  finalFob: number | null;
  costingClosure: { plan: string | null; revised: string | null; actual: string | null };   // target · revised plan · actual, as the sheet has it

  /* — Production Unit writes these — */
  sampleVendorId: string | null; // who is making the sample (usually the bulk factory)
  samples: SampleRound[];
  materials: MaterialLine[];
  qcAudits: QcAudit[];

  /* — Production / merchandiser write these — */
  merchant: string | null;
  jobCardNo: string | null;
  fabricReady: boolean;
  trimsReady: boolean;
  milestones: Milestone[];

  /* — Warehouse writes these — */
  cutQty: number | null;
  deliveredQty: number | null;   // total across lots
  rejectedQty: number | null;    // total across lots
  /* goods land in lots: 300 of 500 today, the balance later. The PO stays open
     until the balance is in, or someone closes it short on purpose. */
  receipts: { at: string; qty: number; rejected: number; by: string; note: string; balanceExpectedOn: string | null }[];
  /* agreed mid-TNA by production with the factory: part of the order ships now,
     the balance on a later date. Not a second PO — the same row, split. */
  split: { at: string; by: string; reason: string; lots: { qty: number; dispatchOn: string; dispatched: boolean }[] } | null;

  status: OrderStatus;
  remarks: string;
  activity: { at: string; who: string; what: string }[];
}

/* ---------- Escalation — a record with a lifecycle, per the real log ---- */
export type EscalationStatus = 'Open' | 'Acknowledged' | 'Resolved' | 'Accepted delay';

export interface Escalation {
  id: string;
  orderId: string;
  raisedAt: string;
  status: EscalationStatus;
  recoveryAction: string | null;
  resolutionNotes: string | null;
  closedAt: string | null;
}

/* ---------- RTW option book (what the health sheet tracks) ------------- */
export type RtwAction =
  | 'REINTRODUCE' | 'REVIEW' | 'SIZE FILL' | 'URGENT REPLENISH'
  | 'LIQUIDATE' | 'EXIT' | 'CLEAR / DISCOUNT' | 'MAINTAIN' | 'MONITOR';

export interface RtwOption {
  id: string;
  styleName: string;
  subCat1: string;
  subCat2: string;
  core: boolean;
  sizes: string[];
  stockBySize: Record<string, number>;
  weeklySales: number[];         // last 12 weeks, oldest first
  inStockWeeks: boolean[];       // same 12 weeks — was every size available?
  launchedAt: string;            // ISO
  incomingQty: number;           // on open POs
  mrp: number;
  /* Merchandise Master / Replenishment sheet columns */
  /* Listed, or taken off the shelf. An option pulled from the floor — liquidated,
     exited, a quality doubt — is INACTIVE: it keeps its history, drops out of the
     option count, and stops being judged as if it were still trying to sell.
     Bringing it back is REINTRODUCE: make it active again, and order if wanted. */
  inactive: { on: string; by: string; reason: string } | null;
  sku: string | null;            // 'BOM-CHI-HE-5545-BLACK' — the size is appended
  vendorId: string | null;       // PRODUCT VENDOR — the factory that made it; a repeat goes back there
  fabricCode: string | null;     // 'FODT2XSOBL-1560' — the fabric to re-buy for a replenishment
  /* planning (8 Oct 2026): sales are read by size, not only by option. When the
     sheet gives only the option total, the per-size series is derived on read. */
  weeklySalesBySize?: Record<string, number[]>;
}

/* ---------- RTW planning review (8 Oct 2026) --------------------------------
   One review per option per sitting: the planner inspects the rate, the week-by-
   week projection by size, drafts a quantity and a cut ratio, records every
   constraint that moved the number, approves, and sends it to design as a
   requirement. Every assumption is kept so the next review can compare it with
   what actually sold. It is a planning decision, not a PO. */
export type PlanningKind = 'core' | 'non-core' | 'new';
export type PlanningStatus = 'draft' | 'approved' | 'sent';
export interface PlanningReview {
  id: string; optionId: string; styleName: string; kind: PlanningKind;
  on: string; by: string; status: PlanningStatus;
  observedRos: number;             // last 4 in-stock weeks ÷ 4, at the time of the review
  planRos: number;                 // the planner's rate — kept beside the observed one
  planReason: string;              // why it differs ("expected seasonal uplift")
  leadWeeks: number;               // vendor lead for a new order
  coverWeeksTarget: number;        // weeks of cover wanted after the new order lands
  usableNow: number;               // physical stock less display/trial reserve
  reserve: number;                 // pieces held for display and trial
  projectedAtArrival: number;      // usable stock when the new order would land
  draftQty: number;                // target demand − projected stock, before constraints
  displayExtra: number | null;     // new display/trial pieces wanted — null until confirmed
  moq: number | null;              // vendor minimum — null until confirmed
  approvedQty: number | null;      // the planner's number
  constraintNote: string;          // why approved ≠ draft (MOQ, production multiple, display)
  draftRatio: { size: string; qty: number }[];
  approvedRatio: { size: string; qty: number }[] | null;
  approvedOn: string | null; approvedBy: string | null;
  requirementId: string | null;    // the RTW requirement created on "Send to design"
  note: string;
}

/* ---------- MTM fabrics ---------------------------------------------- */
export type FabricBucket = 'CORE' | 'NON_CORE' | 'BESPOKE';

export interface Fabric {
  id: string;
  code: string;                  // Enigma mints this
  name: string;
  bucket: FabricBucket;
  family: string;                // 'Houndstooth' — the swatch-book range
  vendorId: string;
  international: boolean;
  stockMetres: number;           // CORE / NON_CORE — BSC-owned
  reservedMetres: number;
  thresholdMetres: number;       // Enigma reorder floor
  incomingMetres: number;        // on open POs, not yet received — counts toward cover so the same fabric is not ordered twice
  millAvailable: boolean | null; // BESPOKE — what the mill last reported
  millStockMetres: number | null; // BESPOKE — metres the mill says it holds, from the evening sheet
  millReportedAt: string | null;
  onHold: boolean;               // suppressed from Shopify / stores — sourcing switches it off when the supplier has run out
  /* Design's own pause: the cloth may be on the shelf and the mill may have plenty,
     but design does not want it sold — a shade being retired, a quality doubt, a
     book about to change. A pause is a status with a reason and a name on it. */
  paused: { at: string; by: string; note: string } | null;
  /* CORE — sourcing's weekly stock-status review with the supplier. An issue is escalated to design,
     who switch the fabric off; when it is back, they switch it on again. */
  supply?: { status: 'ok' | 'delayed' | 'out'; reviewedOn: string; by: string; note: string; backOn: string | null } | null;
  /* CORE — the long block. Non-core is bought once; when a fabric is promoted to core, sourcing asks the
     mill to hold it for a year or two so the auto-PO always has something to draw on. */
  promotedOn?: string | null;
  coreBlock?: { agreedOn: string; until: string; metresPerMonth: number; via: 'email' | 'whatsapp' | 'call'; by: string; note: string } | null;
  weeklySalesShirts: number[];   // 12 weeks
  /* the Fabric Ordering sheet's own columns */
  vendorCode?: string | null;    // the mill's article number — what goes on the PO (weave / pattern / colour live in the name and family)
  composition?: string | null;   // '100% Linen' — drives consumption and wash-care
  widthIn?: number | null;       // "Panna" — the marker is cut to this
  cpm?: number | null;           // "Fabric Price" per metre
  mrp?: number | null;           // the shirt's price in this fabric
  swatchBook?: string | null;    // 'FORMAL SHIRTS - VOL.1' — which book the store finds it in
  /* Design renames cloth — a shade gets a better name, a range is rebranded.
     The CODE is the identity; the name is a label with a history. Every
     analytics screen keys on the code and shows the current name, so "ABCD
     sold in July, BCDC sells in August" reads as one fabric, not two. */
  nameHistory?: { name: string; until: string; by: string; note: string }[];
}

/* Trims, labels, buttons and packaging are NOT bought per style — head office
   buys them in bulk against a forecast and the unit holds them. A production
   order draws them down when the materials are issued to the factory.
   "Auto PO नहीं जाता है, manually bulk ही देते हैं" — not in Enigma at all today. */
export interface TrimItem {
  id: string;
  name: string;                  // matches the BOM line's item, so a PO's needs map straight onto stock
  kind: 'trim' | 'packaging';
  unit: string;
  stock: number;                 // pieces on the shelf at the unit
  threshold: number;             // below this, order more
  costPer: number;               // ₹ each — rolls up into the COGS sheet's trims & packaging
  vendorId: string | null;       // who supplies it
  incoming: number;              // on an open bulk order, not yet received
  lastOrderedOn: string | null;
}

export interface Range { family: string; targetOptions: number }

export interface Block {
  id: string;
  fabricName: string;
  vendorId: string;
  metres: number;
  agreedOn: string;
  expiresOn: string;
  via: 'email' | 'whatsapp' | 'call';
  status: 'held' | 'converted' | 'released' | 'expired';
}

/* ---------- stores ---------------------------------------------------- */
export interface Store { id: string; name: string; region: string; holdsRtwStock: boolean }

export interface SwatchDispatch {
  id: string; fabricId: string; storeId: string;
  dispatchedOn: string; confirmedOn: string | null;
}

/* One STO to one store. The tracker logs a wave as a series ("1931-1965") — one
   STO per store — with the type, the hemming state and the mail it went out on. */
export type StoType = 'Display' | 'Off the rack' | 'Replenishment';
export interface StockTransfer {
  id: string; stoNo: string; toStoreId: string; styleName: string; qty: number;
  shippedOn: string; arrivedOn: string | null; closedOn: string | null;
  series: string;                // 'STO Series No.' — the wave this STO belongs to
  stoType: StoType;
  /* why the pieces go: shown to be sold, sold off the rack, or tried on before an order (8 Oct 2026) */
  purpose?: 'display' | 'off-rack' | 'trial';
  hemmingType: string | null;    // 'Closed hem/finished bottom' · 'Bottom Open/ Unhemmed.' · 'NA' — decides whether the unit hems before it ships
  expectedShipping: string | null;
  remarks: string;
  /* the store counted in fewer than the box said: the gap is the warehouse's
     to close — send the balance, or write it off and say why */
  shortfall?: { sentQty: number; receivedQty: number; note: string; on: string; by: string; resolvedOn: string | null; resolution: 'balance-sent' | 'written-off' | null; resolutionNote?: string } | null;
}

export type ReturnReason = 'Fit' | 'Fabric defect' | 'Stitching' | 'Wrong size sent' | 'Changed mind' | 'Colour / shade';
export type ReturnWant = 'Credit note' | 'Refund' | 'Remake' | 'Exchange';
/* The ladder, as the store described it: "first we try alteration or refit; if that
   doesn't work we may remake; if the customer is still unhappy, store credit or
   refund." An MTM piece travels back to the factory for the first three rungs.
   Today the whole thing is a Slack thread and someone keeps checking whether the
   factory got the piece and whether the refund actually moved. */
export type ResolutionStep = 'alteration' | 'exchange' | 'refit' | 'remake' | 'store-credit' | 'refund';   // exchange = another size off the shelf, on the spot (RTW)
export interface ReturnAttempt { step: ResolutionStep; startedOn: string; by: string; outcome: 'pending' | 'accepted' | 'not enough'; note: string; decidedOn: string | null; where?: 'store' | 'factory' | 'hemming-unit' }   // alteration: the store's own tailor, or back to the factory
export interface ReturnCase {
  id: string; caseNo: string; storeId: string; styleName: string;
  kind: 'MTM' | 'RTW'; orderId: string | null;
  openedOn: string; stage: 'raised' | 'at-factory' | 'back-at-store' | 'refunded' | 'closed';
  slaDays: number;
  reason: ReturnReason;          // why it came back — the store hears this first
  wants: ReturnWant;             // what the customer asked for
  remarks: string;               // what happened, in the store's words
  attempts: ReturnAttempt[];     // the rungs tried, in order
  factoryLeg: { factoryId: string | null; sentOn: string | null; receivedAtFactoryOn: string | null; backAtStoreOn: string | null } | null;   // MTM: the piece's round trip, scanned not assumed
  refund: { kind: 'store-credit' | 'refund'; amount: number; requestedOn: string; movedOn: string | null; by: string | null; approvedOn?: string | null; approvedBy?: string | null } | null;   // a full refund to the bank needs HO approval first; store credit does not       // finance moves it; the store sees that it moved
  /* the other alteration route: the piece goes to the hemming unit THROUGH the
     warehouse — handed to the vehicle, inwarded at the warehouse, to the unit,
     hemmed, back at the warehouse, dispatched to the store or straight to the
     customer. Every hop is a scan, so nobody asks on Slack where the trouser is. */
  hemLeg?: { destination: 'store' | 'customer'; handedOn: string | null; inwardAtWarehouseOn: string | null; atUnitOn: string | null; hemmedOn: string | null; backAtWarehouseOn: string | null; dispatchedOn: string | null; deliveredOn: string | null } | null;
  closedOn: string | null;
}

/* Damaged or unsellable stock, written off the moment the store decides — not
   "physically removed, still in the system", which is where ghost inventory is born. */
export type WriteOffReason = 'Damaged' | 'Soiled' | 'Display worn' | 'Lost' | 'Wrong item received';
export interface CreditEntry { id: string; customer: string; at: string; amount: number; note: string; by: string; storeId: string; caseId: string | null; orderId: string | null; creditNoteNo?: string }   // creditNoteNo: the note handed to the customer when a piece comes back   // + given, − spent

export interface StockWriteOff {
  id: string; storeId: string; optionId: string; styleName: string; size: string; qty: number;
  reason: WriteOffReason; disposition: 'sent back to unit' | 'destroyed';
  at: string; by: string; backAtUnitOn: string | null;
}

/* ---------- Enigma's MTM order sheet -------------------------------------
   cms.bombayshirts.com/order-sheet: a measurement block, four pattern flags, and
   one tile per construction option. The job card is the summary; this is the
   sheet the factory cuts and sews to, so every field is on the record and any
   change to it is a revision. */
export type SheetOptionKey = 'collar' | 'stiffness' | 'collarContrast' | 'collarPiping' | 'collarTopButton' | 'sleeves' | 'cuff' | 'cuffStiffness' | 'cuffContrast' | 'placket' | 'placketContrast' | 'buttons' | 'buttonThread' | 'stitchingThread' | 'back' | 'bottomCut' | 'pocket' | 'elbowPatch' | 'gusset' | 'shirtLength' | 'monogram' | 'placketStay';
export type OrderSpec = Record<SheetOptionKey, string>;
export type MeasureKey = 'collar' | 'chest' | 'waist' | 'hips' | 'shoulder' | 'shoulderYoke' | 'shirtLength' | 'sleeveLength' | 'bicep' | 'leftCuff' | 'rightCuff' | 'forearm' | 'frontAcross' | 'backAcross' | 'shortSleeveLength' | 'shortSleeveBicep' | 'shortSleeveOpening' | 'armHole' | 'buttonCount' | 'buttonPlacement';
export type OrderMeasurements = Record<MeasureKey, number>;
export interface PatternFlags { shirtMargin: boolean; lowNeck: boolean; slopingShoulders: boolean; backDown: boolean }

/* ---------- customer orders at the store -------------------------------
   Punched in Enigma today (59 states). Here: the store's own view of what it
   sold, MTM and RTW kept apart because they are different promises — a shirt
   to be made, or a garment on a shelf that may need hemming. */
/* Two kinds of promise, not three: a shirt to be made, or a garment off the
   shelf. Bottoms are a category of RTW — they may be hemmed to the customer's
   inseam before they go out, which is a step on an RTW order, not a kind. */
export type OrderKind = 'MTM' | 'RTW';
/* MTM stages are Enigma's own, in Enigma's words. 'punched' is the 1–2 hour
   freeze window; 'pp' (pre-production) is "lying with us", waiting for a plan;
   the four scans follow. RTW garments only use punched / ready / hemming / delivered. */
export type CustomerOrderStage = 'punched' | 'pp' | 'planned' | 'in-transit' | 'in-factory' | 'out-factory' | 'rts' | 'dispatched' | 'ready' | 'hemming' | 'delivered' | 'cancelled';
/* MTM is a shirt made from scratch. Hemming and alteration are not MTM orders —
   hemming belongs to RTW bottoms, an alteration is a return case. */
export type OrderTag = 'normal' | 'urgent' | 'corporate';
export interface Scan { stage: CustomerOrderStage; at: string; by: string }
export interface CustomerOrder {
  id: string; orderNo: string; storeId: string; kind: OrderKind;
  billNo?: string | null;        // the bill this piece was sold on — one customer, one visit, several pieces; each piece still runs as its own order
  designId?: string | null;      // MTM: the design (product code) chosen on this fabric
  customer: string;
  styleName: string;             // MTM: the fabric; RTW: the option
  fabricId: string | null;       // MTM
  optionId: string | null;       // RTW
  fit: string | null;            // MTM — the customer's saved fit
  size: string | null;           // RTW
  hemLength: number | null;      // RTW bottoms — inseam in inches; hemming is a step on the way to delivery, not a different kind of order
  qty: number;
  punchedOn: string; promisedOn: string;   // promisedOn = Enigma's "ship by" — the CURRENT one; a revision moves it and is kept below
  /* store manager, 13 Oct 2026: Enigma sets the ship-by once; when a factory is delayed or
     shut, production moves it with a reason and the store sees the move, so it can tell the customer */
  promiseRevisions?: { at: string; by: string; from: string; to: string; reason: string }[];
  /* store manager, 14 Oct 2026: the window piece was sold — it is not shelf stock, so the store's
     display count for this option goes to −1 and the next order must include one for display */
  soldDisplay?: boolean;
  stage: CustomerOrderStage;
  remarks: string;
  /* store manager call, 13 Oct 2026: what the store needs on the order and has nowhere to put today */
  fitProfile?: string | null;        // MTM — which of the customer's saved fits this piece uses ("Formal · structured", "Casual · relaxed")
  measuredBy?: string | null;        // MTM — the master or stylist who took the measurements; today only the store's notebook knows
  trial?: boolean;                   // MTM — a new customer's trial shirt first: ~10–12 days, then the real order ~10–12 days
  express?: boolean;                 // urgent: 7–8 days instead of 10–12, ₹600 express charge
  factoryComment?: string | null;    // "styling comment" — reaches the factory with the sheet
  logisticComment?: string | null;   // for the shipping team: "suit · sold together, match the trouser"
  /* MTM production */
  tag: OrderTag;
  planId: string | null;
  factoryId: string | null;
  consumptionM: number | null;   // Enigma's formula: base + buffer, per order sheet
  scans: Scan[];
  /* the customisation a customer actually changes their mind about. The full
     order sheet lives in Enigma; these are the fields a change request touches. */
  spec: OrderSpec | null;                    // every option tile on Enigma's order sheet
  measurements: OrderMeasurements | null;    // the measurement block, inches; button count and placement as counts
  pattern: PatternFlags | null;              // the four yes/no pattern details
  /* every edit after the order is punched, on the record: what changed, when,
     by whom. The factory works to the latest revision — an amended sheet after
     the bundle has gone is a reprint, not a quiet overwrite. */
  revisions: { rev: number; at: string; by: string; role: RoleId; note: string; changes: { field: string; from: string; to: string }[]; reprint: boolean }[];
  /* a change to a sheet is only useful if someone acts on it: production reads it
     while the order is still theirs, or rings the factory when it is not. */
  changeSeenOn: string | null;         // production has read the latest change
  changeToldFactoryOn: string | null;  // production has told the factory's merchandiser
  changeFactorySeenOn: string | null;  // the factory's merchandiser has read it themselves
  /* bespoke: the fabric is at the mill, not on the shelf. The order cannot be
     planned until the fabric is called, arrives with the mill's sticker code,
     and is inwarded against the order. The code is minted here at request
     time so the parcel matches itself — the mill never sees the order number. */
  /* the receiving bench: a piece the factory declared but that was not on the
     vehicle, or came in and was turned back — each with the round it happened on */
  receiving?: { shortOn: string | null; rejected: { on: string; reason: string; by: string }[] } | null;
  bespoke: { code: string; requestedOn: string | null; inwardOn: string | null } | null;   // requestedOn null = fabric not yet called from the mill
}

/* A production plan — Enigma's "In Progress Production Plan #41274": one factory,
   one category, a set of order sheets printed on coloured paper and sent with the fabric. */
export interface ProductionPlan {
  forcedOver?: number | null; forcedBy?: string | null;   // pieces pushed past the factory's capacity, and who decided
  id: string; planNo: string; factoryId: string; category: string;
  createdOn: string; closedOn: string | null; orderIds: string[];
}

/* The daily "EXTRA FABRIC" email, as a record: who needs what, why, and whether
   the production unit agreed. Approval is what moves the inventory. */
export type ExtraFabricReason = 'Damaged / yarn pull — factory error' | 'Stain — factory error' | 'Weaving defect — PP error' | 'Fabric short — PP error' | 'Shade mismatch — PP error';
export type ExtraFabricPanel = 'Single front' | 'Both fronts (patta)' | 'Single sleeve' | 'Both sleeves' | 'Collar' | 'Cuff';
/* One bundle to a factory carries many pieces in many fabrics. A request is
   always against one of those pieces — the merchandiser picks which. */
export interface ExtraFabricRequest {
  id: string; orderId: string; fabricId: string; factoryId: string; planId?: string | null;
  metres: number; reason: ExtraFabricReason; panel: ExtraFabricPanel;
  raisedBy: string; raisedOn: string;
  status: 'requested' | 'approved' | 'declined' | 'sent';
  decidedOn: string | null; note: string;
}

/* What the factory says came off the line today. The scans give production a
   number; the merchandiser's own count is the one the factory stands behind, and
   the two sitting side by side is the conversation. */
export interface FactoryOutput { id: string; factoryId: string; date: string; pieces: number; note: string; by: string; at: string }

/* Swatch books — the shopfront of MTM and bespoke, and the RTW look-book. The
   production unit is responsible for every store having all three; MTM and RTW
   books it sends itself, bespoke books the mills send direct. Receipt is a
   Slack / WhatsApp reply today. */
export type SwatchBookKind = 'MTM' | 'RTW' | 'BESPOKE';
export interface SwatchBook {
  id: string; storeId: string; kind: SwatchBookKind; edition: string; copies: number;
  from: 'unit' | string;         // 'unit' = production unit; else the mill's vendor id
  dispatchedOn: string; receivedOn: string | null;
  trackingNo: string | null;     // the courier's number — the only thing anyone chases
}

/* A store asking the unit for swatch books: a new stylist, a worn book, a
   corporate visit that needs a spare. Today a WhatsApp to Shravani. */
export interface SwatchBookRequest {
  id: string; storeId: string; kind: SwatchBookKind; copies: number; reason: string;
  status: 'requested' | 'shipped' | 'declined';
  askedOn: string; by: string; decidedOn: string | null; note: string; bookId: string | null;
}

/* One store asking another for a size it does not have. Today a WhatsApp. */
export type StockRequestStatus = 'requested' | 'accepted' | 'declined' | 'shipped' | 'received';
export interface StockRequest {
  id: string; styleName: string; optionId: string; size: string; qty: number;
  fromStoreId: string;           // who has it
  toStoreId: string;             // who asked
  requestedOn: string; status: StockRequestStatus; note: string;
  purpose?: 'size' | 'display';   // a size to sell, or a display piece the store owes its window
}

/* ---------- launches — Monthly Drops sheet + Display/Fit Sample Allocation --
   A new RTW option is not "launched" when the PO closes. It is launched when
   goods are at HO, every store has its display and fit pieces (issued at COGS,
   never sellable), marketing has the name 10–15 days out, and the date is set. */
export type LaunchPieceKind = 'display' | 'fit';
export interface LaunchPiece {
  storeId: string; kind: LaunchPieceKind; size: string; qty: number;
  dispatchedOn: string | null; receivedOn: string | null;
}
export interface Launch {
  id: string;
  optionId: string;
  styleName: string;
  dropMonth: string;             // 'Oct 26'
  orderId: string | null;        // the production order feeding it
  expectedAtHo: string;          // ISO — Monthly Drops "Expected Date"
  receivedAtHo: string | null;
  pieces: LaunchPiece[];         // display / fit allocation, one line per store × size
  marketingName: string | null;  // final product name → Shopify, system, website; styleName on the order stays the working name
  nameHistory?: { name: string; until: string; by: string; note: string }[];   // every earlier official name, appended on a rename
  marketingBriefOn: string | null;
  launchOn: string | null;       // planned launch date
  launchedOn: string | null;
  hero: boolean;
  keyPointers: string;           // "100% cotton, soft & breathable" — what the store says
  /* the design code (product code) is minted by design once the garments are
     produced and received — before that the style has no sellable code */
  designCode?: string | null; designCodeOn?: string | null; designCodeBy?: string | null;
}

/* ---------- concepts — one record from the idea to the day it is sellable ----
   Today the same concept lives in a design meeting nobody minutes, the fabric
   ordering sheet, three copies of the block sheet, a PO tracker, whoever's
   inbox holds the PP sample comments, one blanket approval email, and Enigma.
   Here it is one record with eleven gates, each derived from what happened. */
export type ConceptKind = 'new-fabric' | 'construction';
export type ConceptGate = 'pp' | 'shipment';
export interface ConceptRound extends SampleRound { gate: ConceptGate }
/* A mill's offer against a concept: the same three questions as an RTW quote —
   what it costs a metre, how long it takes, and how long they will hold it —
   plus the swatch details, because for a new fabric the cloth IS the concept. */
export interface ConceptFabricOption {
  id: string;
  fabricId: string | null;       // when the option is a fabric already on the master
  name: string;
  vendorId: string;
  vendorCode: string;            // the mill's article number
  composition: string;
  widthIn: number;
  book: string;
  cpm: number;                   // ₹ per metre
  moq: number;                   // metres the mill will not go below
  leadDays: number;
  holdUntil: string | null;      // ISO — how long this price and these metres are promised
  note: string;
  selected: boolean;
  /* who chose it and why — a concept has no activity log, so the decision
     travels with the option it was made on */
  chosenBy?: string | null; chosenOn?: string | null; rationale?: string;
  /* design can throw one out — kept, not deleted, so sourcing sees what to
     go back to the mill with */
  rejected?: { by: string; on: string; reason: string } | null;
  /* design asked sourcing to hold this one longer — cleared when they extend it */
  extensionAsked?: { by: string; on: string } | null;
}

export interface Concept {
  id: string; name: string; kind: ConceptKind;
  brief: string;                 // why — the sentence the design meeting never wrote down
  raisedBy: string; raisedOn: string;
  spec: string | null;           // construction variant: 'Cutaway collar · French placket' — what changes
  book?: string | null;          // which swatch book / range it fills a gap in
  targetMonth?: string | null;   // when design wants it on the floor
  baseFabricId: string | null;   // construction variant is sampled on a fabric already in inventory
  fabricOptions?: ConceptFabricOption[];   // the mills sourcing brought back, for design to choose between
  optionsSentOn?: string | null;           // when sourcing handed those options to design
  optionsExtension?: { askedOn: string; by: string; note: string; resolvedOn: string | null } | null;   // design needs longer than the mills are holding
  fabricId: string | null;       // new fabric: the Fabric record once chosen; hidden (onHold) until live
  blockId: string | null;        // the vendor block, with its countdown
  fabricPo: { on: string; metres: number } | null;   // the fabric PO — raised by design or sourcing, still contested
  factoryId: string | null;      // who makes the samples
  patSentOn: string | null;      // sample + PAT file handed to the factory — a real-world handoff, logged
  rounds: ConceptRound[];        // PP rounds, then shipment rounds; a fail is a new round, never a restart
  approvalSentOn: string | null; approvalBy: string | null;   // the one email to every department, now a thread post
  enigma: { template: string | null; consumptionBase: number | null; consumptionBuffer: number | null; options: string[]; configuredOn: string | null; by: string | null;
    largeCheck?: boolean;                      // pattern over ~2 in — must be matched in cutting, so consumption goes up
    compositionFamily?: string | null };       // the website filter ("bamboo blend"), beside the exact composition
  naming: { oldName: string | null; newName: string | null; mrp: number | null; setOn: string | null };   // the bible's REVISED NAME tab
  marketing?: { blurb: string; channels: string[]; setOn: string | null } | null;   // what the store and the website say on launch day
  liveOn: string | null;         // LIVE IN STORES — the gate someone passes, once swatches are on the floor
  /* Design setup runs in parallel with the swatches: a preset shirt style, a
     category, and the DESIGN CODE Shopify sells — the fabric code is attached
     to it, not the other way round. The name starts temporary; marketing
     supplies the final one. */
  designs?: ConceptDesign[];     // one fabric, several designs — each with the PRODUCT CODE Shopify sells
  /* The swatch desk — the dates between the cloth landing and stores showing it.
     Today a Slack channel and a blue highlight. */
  swatch?: SwatchDesk | null;
  /* Online is its own track, ~2 weeks behind stores: photography, video, post. */
  online?: { photosOn: string | null; videoOn: string | null; postOn: string | null; liveOn: string | null } | null;
}
/* One fabric, five designs: the product master's row — Product Code, Design Name,
   Design Type, MRP — hangs off the fabric code. Sourcing creates these. */
export interface ConceptDesign {
  id: string; code: string;                 // the PRODUCT CODE Shopify sells
  name: string; finalName?: string | null;  // working name; marketing's final name — the code is the identity, the name is a label with a history
  nameHistory?: { name: string; until: string; by: string; note: string }[];   // every earlier final name, newest last (the working name stays in `name`)
  style?: string | null;                    // the shirt configuration — Boardroom, French Cuff, Business Casual …
  category: 'Formal' | 'Casual';
  mrp: number | null; cost?: number | null;
  description?: string | null; buzzwords?: string | null;   // PDP copy; the fabric's speciality
  enigmaOn?: string | null;                 // pushed to Enigma from here — the design row is created there over the API
  enigmaBy?: string | null;                 // who pushed it
  liveOn?: string | null;                   // this design live in POS
  setOn: string; by: string;
}
export interface SwatchDesk {
  inwardOn: string | null;       // bulk received at the warehouse — the tracker's "Fabric Bulk Received date"
  handoverOn: string | null;     // handed to the swatch team
  priority: boolean;             // cut this one first
  cutOn: string | null;          // 25 × 25 swatches cut and prepared
  dispatchedOn: string | null;   // handed to shipping, out to stores
  photosOn: string | null;       // photos of the dispatch shared
  stickerOn: string | null;      // the sticker page printed — the tracker's empty "Sticker Link" column
  storesToldOn: string | null;   // stores told to display
  by?: Partial<Record<'inward' | 'handover' | 'cut' | 'sticker' | 'dispatched' | 'photos' | 'storesTold', string>>;   // who marked each step
}

/* ---------- files on the record ------------------------------------------
   The PAT file, the CAD, the tech pack, the sample photo, the mill's stock
   sheet, the vendor's block confirmation — attached to the record they are
   about, not sent on Slack. Bytes live in the browser's IndexedDB in this
   prototype (files.ts); this is the metadata that travels with the record. */
export type AttachmentKind = ThreadKind | 'customerOrder' | 'extraFabric' | 'comment';
export interface Attachment {
  id: string; kind: AttachmentKind; subjectId: string;
  label: string;                 // 'PAT file', 'Tech pack', 'Sample photo' — from the record's own list
  step: string | null;           // 'PP round 2', 'Shipment sample' — where in the record it belongs
  name: string; size: number; mime: string;
  by: string; at: string;
  stored: boolean;               // false on seeded records — the file itself is not in this browser
}

/* ---------- conversation — on the record, never beside it ---------------
   One thread per subject. A comment that @mentions a person or a role becomes
   addressed to them on this record until someone from that side replies. */
export type ThreadKind = 'order' | 'fabric' | 'option' | 'return' | 'launch' | 'vendor' | 'concept' | 'customer' | 'request';

export interface Comment {
  id: string;
  at: string;
  who: string;                   // person name
  role: RoleId;
  text: string;
  step: string | null;           // 'PPS sample', 'Escalation' — which part of the record it is about
  mentions: string[];            // person ids and/or role ids
  /* a mention is not done when it is read, it is done when it is dealt with —
     and it stays on the record afterwards rather than disappearing */
  resolved?: { by: string; at: string }[];
}

export interface Thread { id: string; kind: ThreadKind; subjectId: string; comments: Comment[] }

/* ---------- fabric POs — Enigma's auto-PO and the manual international ones.
   Raising is not receiving: sourcing still phones the mill to confirm it has the
   order and when it will ship — and the mill often says "a few days more". */
export interface FabricPo {
  id: string; poNo: string; fabricId: string; vendorId: string; metres: number;
  raisedOn: string; source: 'auto' | 'manual';   // auto = Enigma threshold; manual = planning raised it (international)
  expectedOn: string;                            // raisedOn + mill lead, until the mill says otherwise
  vendorConfirmedOn: string | null; vendorConfirmedBy: string | null;
  remark: string;                                // what the mill said — "3 days more, loom down", "shade lot changed"
  receivedOn: string | null;            // set when the last metre is in, or the line is closed
  /* Enigma's receiving line: metres can land in parts; the line is closed when the last part is in, or closed short */
  receivedMetres?: number;              // total received so far
  receipts?: { on: string; metres: number; by: string }[];
  closedOn?: string | null; closedShort?: boolean;   // Close ticked with metres still pending → CANCELLED for the balance
}

/* ---------- MTM fit samples at the store -------------------------------------
   A store holds a fit set — one shirt per fit per size — so the customer can
   try the fit before the garment is made ("it works a lot on trust"). Sent by
   the production unit like the swatch books; the store counts it in and says
   when a piece is worn out or has gone missing. */
export type FitSampleState = 'ok' | 'worn' | 'missing';
export interface FitSample {
  id: string; storeId: string; fit: string; size: string;
  dispatchedOn: string; receivedOn: string | null; state: FitSampleState;
}

/* ---------- Goods Received Note — every inward raises one -------------------
   Fabric rolls against a fabric PO, RTW bulk against a PO, a bespoke parcel
   against its minted code, finished MTM pieces back on the vehicle round, and
   trims. One numbered note per receipt, with who counted it and against what.
   The Deduction Tracker matches invoice to PO today; the GRN is the leg it lacks. */
export type GrnKind = 'fabric' | 'rtw-po' | 'bespoke-parcel' | 'mtm-round' | 'trims' | 'store-inward';
export interface Grn {
  id: string; grnNo: string; kind: GrnKind;
  ref: string;                   // the PO no., parcel code, or "round · Mahendra"
  refLabel: string;              // what it was — fabric name, style, "12 finished shirts"
  vendorId: string | null;
  storeId?: string | null;       // store-inward: which store counted it in
  receivedOn: string; by: string;
  qty: number; unit: 'm' | 'pc'; rejected: number;
  invoiceNo: string | null;      // when the vendor's invoice is matched — finance's three-way match starts here
  poNo: string | null;           // the PO this receipt is against, so finance gets GRN and PO together
  financeSeenOn: string | null;  // finance has picked it up for GST filing and the merchandiser for reconciliation
  remarks: string;
}

export interface TrackerConfig {
  offsets: Record<GarmentCategory, (number | null)[]>;   // one entry per MILESTONES key; null = NA for the category
  risk: { criticalBufferDays: number; atRiskBufferDays: number };
  otifTolerance: number;                                   // 0.03 = ±3 %
  updatedOn: string | null; updatedBy: string | null;
}

/* ---------- the whole database ----------------------------------------- */
export interface Db {
  people: Person[];
  vendors: Vendor[];
  orders: ProductionOrder[];
  escalations: Escalation[];
  options: RtwOption[];
  fabrics: Fabric[];
  ranges: Range[];
  blocks: Block[];
  stores: Store[];
  swatchDispatches: SwatchDispatch[];
  transfers: StockTransfer[];
  returns: ReturnCase[];
  threads: Thread[];
  customerOrders: CustomerOrder[];
  stockRequests: StockRequest[];
  launches: Launch[];
  plans: ProductionPlan[];
  extraFabric: ExtraFabricRequest[];
  factoryOutputs: FactoryOutput[];
  swatchBooks: SwatchBook[];
  bookRequests?: SwatchBookRequest[];
  fabricPos: FabricPo[];
  /* the tracker's Config and Auto Plan Logic tabs: days from PO per milestone per
     category, the risk thresholds, the in-full tolerance. Changing them re-plans
     every open PO's planned dates that have no actual yet. */
  trackerConfig?: TrackerConfig;
  planningReviews?: PlanningReview[];
  trims: TrimItem[];
  concepts: Concept[];
  attachments: Attachment[];
  grns: Grn[];
  fitSamples: FitSample[];
  optionRequests?: OptionRequest[];
  writeOffs: StockWriteOff[];
  /* store credit, per customer: given on a case, spent on a bill. The balance is
     the sum — a field on the customer's master data that the stores can trust. */
  creditLedger?: CreditEntry[];
}
