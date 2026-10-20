/* ==========================================================================
   Seed — deterministic, built from BSC's own sheets (src/domain/realdata.ts is
   generated from /Downloads/BSC/data-files). Style names, SKU codes, fabric
   codes, vendors, factories, sizes, stock, weekly sales, STO waves and swatch
   books are the sheets' rows. Anything the sheets do not carry (dates of a
   record, a unit cost the sample left blank) is placed here and says so.
   ========================================================================== */

import type { SwatchBookRequest, CreditEntry, OptionRequest, RequestOption, ConceptFabricOption, FabricBrief, ReturnCase, StockWriteOff, FitSample, Grn, Attachment, Concept, Block, Db, Escalation, Fabric, ProductionOrder, RtwOption, Vendor, GarmentCategory, Thread, Comment, RoleId, CustomerOrder, StockRequest, Launch, ProductionPlan, ExtraFabricRequest, FactoryOutput, Scan, SwatchBook, TrimItem, StockTransfer, FabricQuote, FabricPo, SampleRound , PlanningReview } from './types';
import { FIT_SAMPLE_FITS, FIT_SAMPLE_SIZES, SHEET_OPTIONS, MEASUREMENTS, defaultSpec, defaultPattern, PEOPLE, SIZE_SETS, MERCHANDISERS, DELAY_REASONS, RTW_SUBCATS, RANGES, STORES, isBottoms, BOTTOM_SIZES, SHIRT_SIZES, MTM_FITS, TRIM_MASTER, COLLAR_STYLES, POCKETS, EXTRA_FABRIC_REASONS, EXTRA_FABRIC_PANELS, PANEL_METRES, BOOK_EDITION, BIG_STORES, MTM_SWATCH_BOOKS } from './reference';
import { REAL_MTM_FABRICS, REAL_BLOCKS, REAL_RTW_SHIRTS, REAL_RTW_BOTTOMS, REAL_MERCH, REAL_DROPS, REAL_STO } from './realdata';
import { sourcingModeOf, buildMilestones, TODAY, addDays, iso, riskOf, coverageOf, defaultBom, defaultCosting, parseMentions, defaultLaunchPieces, daysBetween, consumptionFor, daysAgo, defaultMaterials, mintBespokeCode } from './engines';

/* mulberry32 — same seed, same book, every reload */
let s = 20260912;
const r = () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const int = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
const chance = (p: number) => r() < p;
const pad = (n: number, w = 4) => String(n).padStart(w, '0');
/* the health sheet appends the colour after "Shirt" on some rows ("Teal Cotton Linen Shirt Teal") — the name is the part up to Shirt */
const cleanName = (n: string) => n.replace(/^(.*\bShirt)\s+\S+$/i, '$1').trim();
const hash = (str: string) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/* ---------- vendors — the names in the sheets -----------------------------
   Factories make garments (Line-Item Detail "Vendor(s)", Merchandise Master
   "PRODUCT VENDOR"); fabric vendors sell cloth (Fabric Ordering "Vendor",
   Merchandise Master "FABRIC VENDOR", the Blocked sheet). Lead days, on-time
   rates and tailor counts are not in the sheets — placed. */
const VENDORS: Vendor[] = [
  /* RTW shirt factories — RTW_Shirts_Concise → Line-Item Detail → Vendor(s) */
  { id:'camellia', name:'Camellia',             kind:'CMT factory', location:'Mumbai',    region:'West',  leadDays:36, onTimeRate:.82, moq:150, blockWindowDays:0 },
  { id:'mrunali',  name:'Mrunali',              kind:'CMT factory', location:'Mumbai',    region:'West',  leadDays:34, onTimeRate:.86, moq:150, blockWindowDays:0 },
  { id:'ayaan',    name:'Ayaan',                kind:'CMT factory', location:'Mumbai',    region:'West',  leadDays:34, onTimeRate:.84, moq:150, blockWindowDays:0, mtm:true, tailors:9, distanceKm:6, dailyOut:[93, 88, 101, 79, 96, 90, 0], dailyTarget:90 },
  { id:'strand',   name:'Strand International', kind:'CMT factory', location:'Bengaluru', region:'South', leadDays:40, onTimeRate:.80, moq:200, blockWindowDays:0 },
  { id:'goodwill', name:'Goodwill',             kind:'CMT factory', location:'Bengaluru', region:'South', leadDays:40, onTimeRate:.82, moq:250, blockWindowDays:0 },
  { id:'kashvi',   name:'Kashvi',               kind:'CMT factory', location:'Mumbai',    region:'West',  leadDays:35, onTimeRate:.79, moq:150, blockWindowDays:0 },
  { id:'topnotch', name:'TopNotch',             kind:'CMT factory', location:'Mumbai',    region:'West',  leadDays:38, onTimeRate:.80, moq:200, blockWindowDays:0, mtm:true, tailors:6, distanceKm:14, dailyOut:[34, 40, 28, 41, 36, 30, 0], dailyTarget:40 },
  { id:'zen',      name:'Zen',                  kind:'CMT factory', location:'Mumbai',    region:'West',  leadDays:42, onTimeRate:.77, moq:150, blockWindowDays:0 },
  { id:'spintech', name:'SpinTech',             kind:'CMT factory', location:'Tirupur',   region:'South', leadDays:45, onTimeRate:.83, moq:200, blockWindowDays:0 },   // flat knits — "Spintec Flat Knit signature"
  /* bottoms & jackets — Merchandise Master → PRODUCT VENDOR; Option Count remarks */
  { id:'gseams',   name:'Golden Seams',         kind:'CMT factory', location:'Mumbai',    region:'West',  leadDays:55, onTimeRate:.84, moq:150, blockWindowDays:0 },
  { id:'united',   name:'United',               kind:'CMT factory', location:'Tirupur',   region:'South', leadDays:61, onTimeRate:.78, moq:250, blockWindowDays:0 },
  { id:'clayroots',name:'Clayroots',            kind:'CMT factory', location:'Ahmedabad', region:'West',  leadDays:58, onTimeRate:.81, moq:200, blockWindowDays:0 },
  { id:'axceller', name:'Axceller',             kind:'CMT factory', location:'Delhi',     region:'North', leadDays:60, onTimeRate:.80, moq:150, blockWindowDays:0 },
  { id:'rashvi',   name:'Rashvi',               kind:'CMT factory', location:'Mumbai',    region:'West',  leadDays:56, onTimeRate:.82, moq:150, blockWindowDays:0 },
  { id:'brio',     name:'Brio',                 kind:'CMT factory', location:'Mumbai',    region:'West',  leadDays:58, onTimeRate:.85, moq:150, blockWindowDays:0 },   // Neapolitan — Option Count remark
  { id:'dazzle',   name:'Dazzle',               kind:'CMT factory', location:'Tirupur',   region:'South', leadDays:50, onTimeRate:.72, moq:300, blockWindowDays:0 },   // knitwear — "Shipment rejected at Dazzle"
  /* MTM-only factories — the WhatsApp shipping report's rows */
  { id:'mahendra', name:'Mahendra',             kind:'MTM factory', location:'Mumbai',    region:'West',  leadDays:7,  onTimeRate:.90, moq:0, blockWindowDays:0, mtm:true, tailors:39, distanceKm:11, dailyOut:[357, 340, 362, 298, 351, 344, 0], dailyTarget:300, corporate:true },
  { id:'richman',  name:'Richman',              kind:'MTM factory', location:'Mumbai',    region:'West',  leadDays:5,  onTimeRate:.93, moq:0, blockWindowDays:0, mtm:true, tailors:9,  distanceKm:3,  dailyOut:[65, 70, 58, 66, 61, 64, 0], dailyTarget:60, urgentReserve:true },
  { id:'harsh',    name:'Harsh',                kind:'MTM factory', location:'Mumbai',    region:'West',  leadDays:7,  onTimeRate:.84, moq:0, blockWindowDays:0, mtm:true, tailors:14, distanceKm:9,  dailyOut:[86, 80, 60, 84, 79, 86, 0], dailyTarget:60 },
  { id:'hemunit',  name:'Hemming Unit',         kind:'Hemming unit', location:'Mumbai',   region:'West',  leadDays:2,  onTimeRate:.95, moq:0, blockWindowDays:0, mtm:true, tailors:2,  distanceKm:0,  dailyOut:[272, 260, 281, 240, 275, 268, 0] },
  /* fabric vendors — Fabric Ordering → Vendor; Merchandise Master → FABRIC VENDOR; Blocked sheet */
  { id:'sutra',    name:'Sutra',                kind:'Domestic mill', location:'Mumbai',    region:'West', leadDays:9,  onTimeRate:.92, moq:150, blockWindowDays:60 },
  { id:'parekh',   name:'Parekh Fab',           kind:'Domestic mill', location:'Mumbai',    region:'West', leadDays:10, onTimeRate:.88, moq:100, blockWindowDays:45 },
  { id:'mpb',      name:'M.P. Brothers',        kind:'Domestic mill', location:'Mumbai',    region:'West', leadDays:9,  onTimeRate:.90, moq:100, blockWindowDays:45 },
  { id:'nihal',    name:'Nihalchand',           kind:'Domestic mill', location:'Mumbai',    region:'West', leadDays:11, onTimeRate:.79, moq:100, blockWindowDays:45 },
  { id:'athena',   name:'Athena Corporation',   kind:'Domestic mill', location:'Mumbai',    region:'West', leadDays:12, onTimeRate:.86, moq:150, blockWindowDays:60 },
  { id:'taurus',   name:'Taurus',               kind:'Domestic mill', location:'Mumbai',    region:'West', leadDays:10, onTimeRate:.85, moq:100, blockWindowDays:45 },
  { id:'nandlal',  name:'Nandlal',              kind:'Domestic mill', location:'Mumbai',    region:'West', leadDays:9,  onTimeRate:.87, moq:100, blockWindowDays:45 },
  { id:'infitex',  name:'Infitex',              kind:'Domestic mill', location:'Mumbai',    region:'West', leadDays:12, onTimeRate:.84, moq:150, blockWindowDays:45 },
  { id:'dharmaji', name:'Dharmaji Textile',     kind:'Domestic mill', location:'Ahmedabad', region:'West', leadDays:14, onTimeRate:.88, moq:300, blockWindowDays:60 },
  { id:'bhagvan',  name:'Bhagvan Ent',          kind:'Domestic mill', location:'Ahmedabad', region:'West', leadDays:14, onTimeRate:.85, moq:300, blockWindowDays:60 },
  { id:'rsk',      name:'R.S.K Trading Company',kind:'Domestic mill', location:'Mumbai',    region:'West', leadDays:21, onTimeRate:.83, moq:300, blockWindowDays:60 },   // sells Japanese denim
  { id:'rishab',   name:'RISHAB',               kind:'Domestic mill', location:'Mumbai',    region:'West', leadDays:12, onTimeRate:.86, moq:200, blockWindowDays:45 },
  { id:'dees',     name:'Dees Enterprises',     kind:'Domestic mill', location:'Mumbai',    region:'West', leadDays:12, onTimeRate:.84, moq:150, blockWindowDays:45 },
  { id:'ramvijay', name:'RamVijay',             kind:'Domestic mill', location:'Mumbai',    region:'West', leadDays:12, onTimeRate:.82, moq:150, blockWindowDays:45 },
  { id:'soktas',   name:'Soktas',               kind:'Domestic mill', location:'Kolhapur',  region:'West', leadDays:14, onTimeRate:.88, moq:200, blockWindowDays:90 },
  { id:'fusion',   name:'Fusion Textile Co',    kind:'International mill', location:'Shaoxing', region:'Intl', leadDays:45, onTimeRate:.80, moq:200, blockWindowDays:90 },
  { id:'lulin',    name:'Suzhou Lulin Trading (ECHO)', kind:'International mill', location:'Suzhou', region:'Intl', leadDays:48, onTimeRate:.78, moq:300, blockWindowDays:90 },
  { id:'leggiuno', name:'Leggiuno (via R.P. Enterprises)', kind:'International mill', location:'Varese', region:'Intl', leadDays:58, onTimeRate:.90, moq:0, blockWindowDays:120 },   // the "Leggiuno Bespoke" book
  { id:'albini',   name:'Albini',               kind:'International mill', location:'Bergamo', region:'Intl', leadDays:62, onTimeRate:.71, moq:0, blockWindowDays:120 },   // "BSC x ALB"
  { id:'tmason',   name:'Thomas Mason',         kind:'International mill', location:'Bergamo', region:'Intl', leadDays:58, onTimeRate:.95, moq:0, blockWindowDays:120 },
  { id:'fabriano', name:'Manhattan Fabriano',   kind:'International mill', location:'Como',    region:'Intl', leadDays:60, onTimeRate:.80, moq:0, blockWindowDays:120 },
  /* trims & packaging — the Deduction Tracker sample names its vendor "ABC"; these two are placed */
  { id:'trimco',   name:'Trimco Accessories',   kind:'Trims', location:'Mumbai', region:'West', leadDays:18, onTimeRate:.88, moq:5000, blockWindowDays:0 },
  { id:'packwell', name:'Packwell',             kind:'Trims', location:'Vasai',  region:'West', leadDays:12, onTimeRate:.91, moq:2000, blockWindowDays:0 },
];
const V = (id: string) => VENDORS.find(v => v.id === id)!;
const factories = VENDORS.filter(v => v.kind === 'CMT factory');
const mills = VENDORS.filter(v => v.kind.endsWith('mill'));
const domesticMills = mills.filter(m => m.kind === 'Domestic mill');
/** the sheets spell a vendor three ways — resolve to one id */
const vendorId = (name: string | null | undefined): string | null => {
  if (!name) return null;
  const n = name.toLowerCase().split(',')[0].trim();
  const hit = VENDORS.find(v => v.name.toLowerCase() === n) ?? VENDORS.find(v => n.startsWith(v.name.toLowerCase().split(' ')[0]) || v.name.toLowerCase().startsWith(n.split(' ')[0]));
  return hit?.id ?? null;
};

/* ---------- production orders — the relay, at every stage --------------- */
function sizeCurve(category: GarmentCategory, total: number) {
  const sizes = SIZE_SETS[category]; const mid = (sizes.length - 1) / 2;
  const w = sizes.map((_, i) => 1 / (1 + Math.abs(i - mid))); const sum = w.reduce((a, b) => a + b, 0);
  return sizes.map((size, i) => ({ size, qty: Math.max(1, Math.round((w[i] / sum) * total)) }));
}

interface OrderSpec {
  styleName: string; category: GarmentCategory; subCategory: string; qty: number;
  stage: ProductionOrder['status'];
  factoryId?: string | null;          // Open / Closed
  fabricVendorId?: string | null;     // the real fabric vendor, when the sheet names one
  fabricSpec?: string | null;         // 'FODT2XSOBL-1560 · 98% Cotton, 2% Elastane · 2x1 Left Hand Twill'
  fabricNominated?: boolean;
  poAgeDays?: number;                 // how long ago the PO went
  deliveredQty?: number | null; incomingQty?: number;
  program?: string | null; launchMonth?: string | null; fit?: string | null; remarks?: string;
}
const orders: ProductionOrder[] = [];
let ordSeq = 0;
/* design's brief, reconstructed from the style name and the sheet's fabric spec:
   the words a designer actually uses — weave, cloth, colour. */
const LOOKS = ['oxford', 'poplin', 'twill', 'linen', 'corduroy', 'crochet', 'dobby', 'flannel', 'denim', 'wool', 'seersucker', 'chambray', 'herringbone', 'satin', 'knit', 'jersey', 'pique', 'checks', 'stripes', 'print'];
const BRIEF_COLOURS = ['white', 'black', 'navy', 'blue', 'ecru', 'grey', 'green', 'brown', 'pink', 'teal', 'olive', 'ochre', 'red', 'indigo', 'beige', 'cream', 'lavender', 'mustard', 'sage', 'charcoal', 'ivory', 'rust'];
function briefFor(sp: OrderSpec): FabricBrief | null {
  if (!(sp.fabricNominated ?? !!sp.fabricVendorId)) return null;
  const name = sp.styleName.toLowerCase();
  /* the sheet's spec is "composition · weave", sometimes with the Enigma code in front */
  const raw = sp.fabricSpec?.split(' · ') ?? [];
  const parts = raw[0] && /\b[A-Z]{2,}[A-Z0-9]*-\d+\b/.test(raw[0]) ? raw.slice(1) : raw;
  const fromName = LOOKS.filter(l => name.includes(l)).map(l => l[0].toUpperCase() + l.slice(1)).join(' ');
  const look = parts[1] ?? (fromName || (sp.category === 'Jeans' ? 'Denim' : sp.category.includes('Knit') ? 'Knit' : 'Plain weave'));
  const colour = BRIEF_COLOURS.find(c => name.includes(c)); const col = colour ? colour[0].toUpperCase() + colour.slice(1) : null;
  const composition = parts[0] ?? (sp.category === 'Jeans' ? '98% cotton 2% elastane' : name.includes('linen') ? '100% linen' : name.includes('wool') ? '100% wool' : name.includes('blend') ? 'cotton blend' : '100% cotton');
  return { look, composition, colour: col, weightGsm: null, referenceFabricId: null,
    notes: pick(['handfeel over price — this is a hero for the drop', 'match last season\'s shade; the customer knows it', 'needs to hold a crease; no stretch', 'keep it under the target cost — a replenishment, not a launch', 'soft wash finish; the sample from the book was too crisp']) };
}
function makeOrder(sp: OrderSpec): ProductionOrder {
  const i = ++ordSeq;
  const category = sp.category; const qty = sp.qty;
  const poAge = sp.poAgeDays ?? (sp.stage === 'Closed' ? int(75, 240) : int(5, 60));
  const handover = sp.stage === 'Requirement' ? addDays(TODAY, -int(2, 6)) : sp.stage === 'Quoting' ? addDays(TODAY, -int(6, 11)) : sp.stage === 'Allocated' ? addDays(TODAY, -int(11, 14)) : addDays(TODAY, -(poAge + int(8, 14)));
  const fabricNominated = sp.fabricNominated ?? !!sp.fabricVendorId;
  const po: ProductionOrder = {
    id: `ord-${pad(i)}`, poNo: null,
    category, subCategory: sp.subCategory, styleName: sp.styleName, shipheroName: sp.styleName,
    program: sp.program ?? null, launchMonth: sp.launchMonth ?? pick(['Oct 26', 'Nov 26', 'Dec 26', 'Jan 27']),
    fit: sp.fit ?? (category.includes('hirt') ? pick(['Tailored Fit', 'Classic Fit', 'Slim Fit']) : null),
    orderQty: qty, sizeBreakup: sizeCurve(category, qty),
    targetInhouse: iso(addDays(handover, int(50, 95))),
    targetCost: int(280, 980), styleHandover: iso(handover), fabricNominated, fabricBrief: briefFor(sp),
    bom: [], costing: defaultCosting(category),
    sampleVendorId: null, samples: [], materials: [], qcAudits: [],
    sourcing: { stage:'vendors', submittedOn: null, extension: null, fabricPo: null },
    fabricQuotes: [], fabricVendorId: null, vendorFabricCode: null, enigmaCode: sp.fabricSpec?.match(/\b[A-Z]{2,}[A-Z0-9]*-\d+\b/)?.[0] ?? null, fabricBlocked: null, fabricMetres: null,
    vendorId: null, poDate: null, finalFob: null, costingClosure: { plan: iso(addDays(handover, 10)), revised: null, actual: null },
    merchant: null, jobCardNo: null, fabricReady: false, trimsReady: false, milestones: [],
    cutQty: null, deliveredQty: null, rejectedQty: null, receipts: [], split: null,
    status: sp.stage, remarks: sp.remarks ?? '', activity: [{ at: iso(handover), who: 'Charanjeet', what: 'Requirement handed over' }],
  };
  po.bom = defaultBom(category, sp.styleName, fabricNominated);
  if (sp.fabricSpec) po.bom[0].spec = sp.fabricSpec;
  po.bom[1].spec = category === 'Jeans' ? 'Antique brass Metal Button' : category.includes('hirt') ? pick(['Horn, 4-hole, 18L', 'Corozo, 4-hole, 16L', 'Mother-of-pearl, 2-hole, 18L']) : 'Sourced by BSC';   // Merchandise Master → BUTTON
  po.bom[1].qtyPerPc = category.includes('hirt') ? 11 : 1;
  if (category === 'Jeans' || isBottoms(sp.subCategory)) po.bom[2].spec = 'Poly Cot Twill';   // Merchandise Master → POCKETING

  /* fabric quotes come from fabric vendors, never from factories. The sheet names the vendor that won; the alternates are placed. */
  if (sp.stage !== 'Requirement' && fabricNominated) {
    const winner = sp.fabricVendorId ? V(sp.fabricVendorId) : null;
    const pool = [...(winner ? [winner] : []), ...domesticMills.filter(m => m.id !== winner?.id).sort(() => r() - .5).slice(0, winner ? int(1, 2) : int(2, 3))];
    const need = Math.ceil((po.costing.consumption ?? 1.6) * qty);
    po.fabricQuotes = pool.map((v, k): FabricQuote => ({
      id: `fq-${po.id}-${k}`, vendorId: v.id,
      cpm: int(v.kind === 'International mill' ? 420 : 210, v.kind === 'International mill' ? 890 : 520),
      moq: v.moq || pick([100, 150, 200, 300]),
      widthCm: pick([57, 58, 60, 44]),
      leadDays: v.leadDays,
      committedDelivery: iso(addDays(handover, v.leadDays + int(2, 10))),
      blockValidUntil: iso(addDays(handover, int(3, 6) + v.blockWindowDays)),   // the mill's own window, from the day it quoted
      extendedOn: null, extensionAskedOn: null,
      composition: sp.fabricSpec?.split(' · ')[1] ?? pick(['100% cotton', '98% cotton 2% elastane', 'cotton-linen', '2-ply 100s']),
      note: need < (v.moq || 150) ? `MOQ ${v.moq || 150} m against ${need} m needed` : null,
      selected: false,
    }));
    /* a Quoting row is somewhere in the handoff: sourcing still collecting, with
       design to choose, or bounced back for an extension because the holds lapsed */
    po.fabricQuotes = po.fabricQuotes.slice(0, 1);   // one vendor against a style — the same rule as a request's option
    if (sp.stage === 'Quoting') {
      const roll = i % 5;
      if (roll === 0) { po.fabricQuotes = po.fabricQuotes.slice(0, 1); }                                   // one vendor in, not yet sent
      else if (roll === 1) { po.fabricQuotes = []; }                                                       // nothing asked yet
      else if (roll === 4) { po.fabricQuotes.forEach(q => (q.blockValidUntil = iso(addDays(TODAY, -int(1, 4)))));   // holds lapsed while design sat on it
        po.sourcing = { stage:'extension', submittedOn: iso(addDays(handover, 4)), extension: { askedOn: iso(addDays(TODAY, -1)), by:'Neha', note:'Need the swatches in hand before we commit — can the holds run another two weeks?', resolvedOn: null }, fabricPo: null };
        po.activity.push({ at: iso(addDays(handover, 4)), who:'Sreekanth', what:'Vendor and terms sent to design' }, { at: iso(addDays(TODAY, -1)), who:'Neha', what:'Design asked sourcing for an extension · swatches not in hand yet' }); }
      else { po.sourcing = { stage:'design-choice', submittedOn: iso(addDays(handover, 4)), extension: null, fabricPo: null };
        po.activity.push({ at: iso(addDays(handover, 4)), who:'Sreekanth', what:'Vendor and terms sent to design' }); }
    }
  }
  const pickFabric = (o: ProductionOrder) => { const by = addDays(o.targetInhouse, -35);
    if (sp.fabricVendorId) return o.fabricQuotes.find(q => q.vendorId === sp.fabricVendorId) ?? o.fabricQuotes[0];
    const sorted = [...o.fabricQuotes].sort((a, b) => a.cpm - b.cpm);
    return sorted.find(q => new Date(q.committedDelivery) <= by) ?? sorted[0]; };
  const settleFabric = () => { if (!po.fabricQuotes.length) return; const fq = pickFabric(po); fq.selected = true; po.fabricVendorId = fq.vendorId; po.costing.cpm = fq.cpm;
    po.fabricMetres = Math.max(Math.ceil((po.costing.consumption ?? 1.6) * qty), fq.moq);
    po.vendorFabricCode = po.vendorFabricCode ?? `${V(fq.vendorId).name.split(' ')[0].toUpperCase().slice(0, 4)}#${int(1000, 99999)}`;
    po.fabricBlocked = Math.round(po.fabricMetres * (0.96 + r() * 0.1));
    po.activity.push({ at: iso(addDays(handover, 8)), who:'Neha', what:`Design chose ${V(fq.vendorId).name} at ₹${fq.cpm}/m` });
    /* an Allocated row has its fabric chosen; most have the PO raised, a few are waiting on sourcing to raise it */
    const raised = sp.stage !== 'Allocated' || i % 3 !== 0;
    po.sourcing = { stage: raised ? 'po-raised' : 'chosen', submittedOn: iso(addDays(handover, 4)), extension: null,
      fabricPo: raised ? { no: `FPO #${2300 + i}`, on: iso(addDays(handover, 9)), metres: po.fabricMetres } : null };
    if (raised) po.activity.push({ at: iso(addDays(handover, 9)), who:'Sreekanth', what:`Fabric PO FPO #${2300 + i} · ${po.fabricMetres} m from ${V(fq.vendorId).name}` }); };
  if (sp.stage === 'Allocated') settleFabric();

  if (sp.stage === 'Open' || sp.stage === 'Closed') {
    settleFabric();
    const v = sp.factoryId ? V(sp.factoryId) : pick(factories.filter(x => x.kind === 'CMT factory'));
    po.vendorId = v.id; po.poDate = iso(addDays(TODAY, -poAge));
    po.poNo = `PO #${15400 + i}`;
    po.merchant = pick(MERCHANDISERS); po.jobCardNo = `BOM ${int(300, 420)}`;
    po.costing.cpm = po.costing.cpm ?? int(240, 620);
    const sheetFob = (po.costing.cpm ?? 0) * (po.costing.consumption ?? 1.6) + (po.costing.cmp ?? 0);
    po.finalFob = sp.stage === 'Closed' || chance(.7) ? Math.round(sheetFob * (1 + (r() - .5) * .1)) : null;
    if (po.finalFob) po.costingClosure.actual = iso(addDays(po.poDate, int(3, 12))); else if (chance(.3)) po.costingClosure.revised = iso(addDays(po.costingClosure.plan!, int(5, 20)));
    po.milestones = buildMilestones(category, po.poDate);
    po.materials = defaultMaterials(po);

    /* progress: actuals in order; a slip somewhere in ~30% of open orders. A closed order has every actual. */
    const slipAt = sp.stage === 'Open' && chance(.3) ? int(1, po.milestones.length - 2) : -1;
    let broken = false;
    po.milestones.forEach((m, k) => {
      const planned = new Date(m.plan); const past = sp.stage === 'Closed' || planned < TODAY;
      const slipped = slipAt >= 0 && k >= slipAt;
      if (!broken && past && (!slipped || chance(.5))) {
        m.actual = iso(addDays(planned, slipped ? int(3, 14) : int(-2, 0)));
      } else { broken = true; if (past && slipped && chance(.65)) { m.revised = iso(addDays(planned, int(3, 12))); m.delayReason = pick(DELAY_REASONS); } }
    });
    po.sampleVendorId = v.id;
    const ppsSub = po.milestones.find(m => m.key === 'PPS Submission'); const ppsAp = po.milestones.find(m => m.key === 'PPS Approval');
    if (ppsSub?.actual) {
      const twoRounds = chance(.35);
      const c1 = [{ area:'Stitching' as const, text:'Placket puckering at the third button', major: twoRounds }, { area:'Fit' as const, text:'Collar stand reads 2 mm short against spec', major: twoRounds }];
      if (twoRounds) {
        po.samples.push({ round:1, submittedOn: ppsSub.actual, reviewedOn: iso(addDays(ppsSub.actual, 1)), reviewedBy:'Kunal', comments: c1, decision:'resubmit' });
        const r2 = iso(addDays(ppsSub.actual, int(4, 7)));
        po.samples.push({ round:2, submittedOn: r2, reviewedOn: ppsAp?.actual ?? null, reviewedBy: ppsAp?.actual ? 'Kunal' : null, comments: ppsAp?.actual ? [{ area:'Trims / labels / buttons' as const, text:'Button shade to match swatch card in bulk', major:false }] : [], decision: ppsAp?.actual ? 'approved' : 'pending' });
      } else {
        po.samples.push({ round:1, submittedOn: ppsSub.actual, reviewedOn: ppsAp?.actual ?? null, reviewedBy: ppsAp?.actual ? 'Kunal' : null, comments: ppsAp?.actual ? [{ area:'Fit' as const, text:'Sleeve length −0.5 cm in bulk, no resample', major:false }] : [], decision: ppsAp?.actual ? 'approved' : 'pending' });
      }
    }
    const fabEta = po.milestones.find(m => m.key === 'Fabric ETA')?.actual; const trimEta = po.milestones.find(m => m.key === 'Trims ETA')?.actual;
    po.materials.forEach(m => { const isFab = po.bom[m.bomIndex]?.kind === 'fabric'; const eta = isFab ? fabEta : trimEta;
      /* older receipts have long gone to the factory; some of the last ten days' are
         checked and still on the unit's floor — that is the issue queue */
      if (eta) { m.receivedOn = iso(addDays(eta, -int(1, 3))); m.checked = chance(.94) ? 'ok' : 'fail';
        if (m.checked === 'ok' && daysAgo(eta) > 12) m.issuedOn = eta; } });
    po.fabricReady = !!fabEta; po.trimsReady = !!trimEta;
    const fi = po.milestones.find(m => m.key === 'FI')?.actual;
    if (fi) { const checked = Math.round(qty * pick([0.1, 0.2, 1])); const rej = int(0, Math.round(checked * .04)); po.qcAudits.push({ at: fi, by: pick([`${v.name} QC · Ramesh`, 'BSC QC · Vishnu', 'BSC QC · Sunita']), checked, passed: checked - rej, issues: rej ? pick(['Loose thread at cuff seam on 3 pcs', 'Label misaligned, 2 pcs', 'Shade band variance on one roll']) : '', released: true }); }
    const dispatched = po.milestones.find(m => m.key === 'Dispatch')?.actual;
    if (dispatched) {
      po.cutQty = qty; po.deliveredQty = sp.deliveredQty ?? (chance(.8) ? qty : Math.round(qty * (0.9 + r() * .16))); po.rejectedQty = chance(.3) ? int(2, 30) : 0;
      po.costing.actualConsumption = Math.round(((po.costing.consumption ?? 1.6) * (0.97 + r() * 0.1)) * 100) / 100;
      /* most land in one lot; some in two — 300 first, the rest a week later */
      const inAt = po.milestones[po.milestones.length - 1].actual ?? dispatched;
      if (chance(.3) && po.deliveredQty > 150) { const first = Math.round(po.deliveredQty * pick([0.5, 0.6, 0.7])); po.receipts = [{ at: iso(addDays(dispatched, 1)), qty: first, rejected: 0, by:'Shravani', note:'first lot — factory split the dispatch', balanceExpectedOn: iso(addDays(dispatched, 8)) }, { at: inAt, qty: po.deliveredQty - first, rejected: po.rejectedQty, by:'Shravani', note:'balance', balanceExpectedOn: null }]; }
      else po.receipts = [{ at: inAt, qty: po.deliveredQty, rejected: po.rejectedQty, by:'Shravani', note:'', balanceExpectedOn: null }];
      if (po.milestones[po.milestones.length - 1].actual) po.status = 'Closed';
    }
    po.activity.push({ at: po.poDate, who: 'Sreekanth', what: `Allocated to ${v.name} · PO issued` });
  }
  orders.push(po);
  return po;
}

/* A. RTW shirts with a PO in the tracker — Line-Item Detail rows that name a factory */
const shirtsWithPo = REAL_RTW_SHIRTS.filter(x => x.vendors);
shirtsWithPo.forEach(x => {
  const fid = vendorId(x.vendors);
  const closed = (x.poStatus ?? '').startsWith('Closed');
  makeOrder({ styleName: cleanName(x.styleName), category: fid === 'spintech' ? 'Flat Knits (Shirts)' : 'RTW CMT shirts', subCategory: fid === 'spintech' ? 'Flat Knit shirts' : 'RTW CMT',
    qty: x.orderQty ?? 150, stage: closed ? 'Closed' : 'Open', factoryId: fid,
    fabricVendorId: x.mills === 'Soktas' ? 'soktas' : x.mills === 'Manhattan Fabriano' ? 'fabriano' : null,
    fabricSpec: x.composition ? `${x.composition}${x.weave ? ` · ${x.weave}` : ''}${x.mills && x.mills !== 'Fabric Mills' ? ` · ${x.mills}` : ''}` : null,
    fabricNominated: !!x.mills, deliveredQty: closed ? x.recdQty ?? null : null, incomingQty: x.incomingQty,
    program: x.sub1 === 'High Priced' ? 'High Priced' : x.range?.startsWith('BSC x') ? x.range : null, launchMonth: closed ? null : pick(['Oct 26', 'Nov 26']) });
});
/* B. bottoms — every named style in the Merchandise Master, with its real fabric code, fabric vendor and factory */
REAL_MERCH.forEach((m, k) => {
  const stage: ProductionOrder['status'] = k % 10 < 6 ? 'Closed' : k % 10 < 9 ? 'Open' : 'Allocated';
  const sub = m.sheet === 'Chinos' ? (m.productType?.toUpperCase().startsWith('SEMI') ? 'Formal Chinos' : 'Formal Chinos') : m.sheet === 'Neapolitan Pants' ? 'Neapolitan' : m.sheet;
  makeOrder({ styleName: m.styleName, category: m.sheet === 'JEANS' ? 'Jeans' : 'Bottoms / Knitwear / Jackets', subCategory: sub, qty: pick([150, 200, 250, 300]), stage,
    factoryId: vendorId(m.productVendor), fabricVendorId: vendorId(m.fabricVendor),
    fabricSpec: `${m.fabricCode} · ${m.composition ?? ''}${m.weave && m.weave !== 'Not Applicable' ? ` · ${m.weave}` : ''}`.trim(),
    program: m.productType?.toUpperCase().startsWith('SEMI') ? 'Semi-stitched' : 'Hemming', launchMonth: stage === 'Closed' ? null : 'Oct 26' });
});
/* C. core replenishment — the health sheet's REINTRODUCE rows become new requirements; ROS & Health Summary counts 8 + 9 + 1 in replenishment */
const reintroduce = REAL_RTW_SHIRTS.filter(x => x.action === 'REINTRODUCE' && !x.vendors).slice(0, 16);
reintroduce.forEach((x, k) => {
  makeOrder({ styleName: cleanName(x.styleName), category: 'RTW CMT shirts', subCategory: 'RTW CMT', qty: pick([150, 150, 200, 250]), stage: k < 6 ? 'Requirement' : k < 12 ? 'Quoting' : 'Allocated',
    fabricNominated: true, fabricSpec: x.composition ? `${x.composition}${x.weave ? ` · ${x.weave}` : ''}` : null, program: 'Core replenishment', launchMonth: 'Nov 26',
    remarks: `Health sheet: ${x.gap ?? 'sold out'} · top-6-week ROS ${x.top6 ?? '—'}` });
});
/* C2. in production now — ROS & Health Summary → "In Production": Casual Solid 14, Formal Solid 15, Formal Checks 4, Formal Stripes 6.
   The line items do not say which styles; the SIZE FILL rows of each sub-category are the ones a repeat would be cut for. */
const IN_PRODUCTION: Record<string, number> = { 'Casual Solid': 14, 'Formal Solid': 15, 'Formal Checks': 4, 'Formal Stripes': 6 };
const shirtFactories = ['camellia', 'mrunali', 'ayaan', 'strand', 'goodwill', 'kashvi', 'topnotch', 'zen'];
Object.entries(IN_PRODUCTION).forEach(([sub1, n]) => {
  REAL_RTW_SHIRTS.filter(x => x.sub1 === sub1 && !x.vendors && (x.action === 'SIZE FILL' || x.action === 'REVIEW') && !reintroduce.includes(x)).slice(0, n).forEach((x, k) => {
    makeOrder({ styleName: cleanName(x.styleName), category: 'RTW CMT shirts', subCategory: 'RTW CMT', qty: pick([150, 150, 200, 250, 300]), stage: 'Open', factoryId: shirtFactories[(k + hash(sub1)) % shirtFactories.length],
      poAgeDays: int(5, 55), fabricNominated: chance(.5), fabricSpec: x.composition ? `${x.composition}${x.weave ? ` · ${x.weave}` : ''}` : null, program: 'Core replenishment', launchMonth: pick(['Oct 26', 'Nov 26']) });
  });
});
/* D. the Option Count Summary's live remarks */
makeOrder({ styleName: 'Performance Jacket', category: 'Bottoms / Knitwear / Jackets', subCategory: 'Structured', qty: 150, stage: 'Allocated', fabricNominated: true, program: 'Jackets', launchMonth: 'Nov 26', remarks: 'Option Count: Fabric Order Placed' });
makeOrder({ styleName: 'BSC x ALB Ceremonial Wool Jacket', category: 'Bottoms / Knitwear / Jackets', subCategory: 'BSC x ALB', qty: 100, stage: 'Requirement', fabricNominated: true, program: 'BSC x ALB', launchMonth: 'Dec 26', remarks: 'Option Count: Wool Jacket — BSC x ALB-Ceremonial Jacket' });
const polo = makeOrder({ styleName: 'Signature Polo', category: 'Flat Knits (T-shirts)', subCategory: 'Polo T-shirts', qty: 400, stage: 'Open', factoryId: 'dazzle', poAgeDays: 58, program: 'Knitwear', launchMonth: 'Oct 26', remarks: 'Option Count: shipment rejected at Dazzle — quality issue; getting a replacement' });

/* Escalations — one per open order past its buffer, with a lifecycle; the Dazzle rejection is the sheet's own */
const escalations: Escalation[] = orders.filter(o => o.status === 'Open').flatMap(o => {
  const rk = riskOf(o);
  if (o.id !== polo.id && !['at-risk', 'critical', 'delayed'].includes(rk.risk)) return [];
  const st = o.id === polo.id ? 'Acknowledged' : pick(['Open', 'Open', 'Acknowledged', 'Accepted delay'] as const);
  return [{ id:`esc-${o.id}`, orderId:o.id, raisedAt: iso(addDays(TODAY, -int(1, 12))), status: st,
    recoveryAction: o.id === polo.id ? 'Shipment rejected at Dazzle on quality — replacement lot being made; second QC before dispatch' : st !== 'Open' ? pick(['Factory adding a second line from Monday', 'Air-freighting trims to recover 4 days', 'Split delivery — 60% by target, balance +7d', 'Fabric re-routed from mill direct to factory']) : null,
    resolutionNotes: null, closedAt: null }];
});
/* one escalation all the way through — raised, acknowledged, recovered, closed — so the screen has a finished example */
{ const e = escalations.find(x => x.orderId !== polo.id && x.status !== 'Open');
  if (e) { e.status = 'Resolved'; e.recoveryAction = e.recoveryAction ?? 'Factory added a second line'; e.resolutionNotes = 'Second line ran for six days; the lot shipped two days inside the revised date. No pieces short.'; e.closedAt = iso(addDays(TODAY, -2)); } }

/* ---------- RTW option book — the health sheets' own rows ----------------- */
const options: RtwOption[] = [];
const CORE_SHARE: Record<string, number> = { 'Casual Solid': 10 / 35, 'Formal Solid': 10 / 28, 'Formal Checks': .5, 'Formal Stripes': .25, 'High Priced': 1 };
const colourOf = (name: string, hint: string | null) => (hint ?? name.split(' - ').pop() ?? name.split(' ')[0]).toUpperCase().replace(/[^A-Z ]/g, '').trim();
const parseDdMmYy = (s: string | null) => { const m = s?.match(/^(\d{2})\/(\d{2})\/(\d{2})$/); return m ? `20${m[3]}-${m[2]}-${m[1]}` : null; };
const skuFor = (prefix: string, k: number, colour: string) => `${prefix}-${1100 + k * 12}-${colour || 'NA'}`;

/* shirts — RTW_Shirts_Concise → Line-Item Detail: stock, 12 weekly sales, sizes out, PO and vendor */
REAL_RTW_SHIRTS.forEach((x, k) => {
  const sc = RTW_SUBCATS.find(c => c.sub1 === x.sub1);
  const sizes = SHIRT_SIZES;
  /* the sheet gives total stock and how many sizes are out; which sizes is placed, mid sizes first as the sheet's own gap notes say */
  const order = [...sizes].sort((a, b) => (hash(x.styleName + a) % 7) - (hash(x.styleName + b) % 7));   // deterministic per style
  const out = new Set(order.slice(0, Math.min(x.szOOS, sizes.length - (x.stock > 0 ? 1 : 0))));
  const live = sizes.filter(sz => !out.has(sz));
  const w = live.map(sz => 1 + (hash(x.styleName + sz + 'w') % 3)); const wsum = w.reduce((a, b) => a + b, 0);
  const stockBySize: Record<string, number> = {}; let left = x.stock;
  sizes.forEach(sz => { stockBySize[sz] = 0; });
  live.forEach((sz, i) => { const q = i === live.length - 1 ? left : Math.floor(x.stock * w[i] / wsum); stockBySize[sz] = q; left -= q; });
  const inStockWeeks = x.weeks.map((_, i) => !(x.szOOS > 0 && i >= 12 - Math.min(x.szOOS, 5)));
  options.push({
    inactive: null, id:`opt-s-${k}`, styleName: cleanName(x.styleName), subCat1: x.sub1, subCat2: x.sub2 ?? x.sub1, core: sc ? chance(CORE_SHARE[x.sub1] ?? (sc.core ? 1 : 0)) : false,
    sizes, stockBySize, weeklySales: [...x.weeks], inStockWeeks,
    launchedAt: parseDdMmYy(x.latest) ?? iso(addDays(TODAY, -int(90, 420))),
    incomingQty: x.incomingQty, mrp: x.sub1 === 'High Priced' ? pick([5990, 6490, 6990, 7990]) : pick([2990, 3290, 3490, 3990, 4490]),   // MRP is not in the health sheet — placed by range
    sku: skuFor('BOM-SHI-RE', k, colourOf(x.styleName, x.colour)), vendorId: vendorId(x.vendors), fabricCode: null,
  });
});
/* bottoms — ROS & Health Report 020826: stock by size as the sheet has it, the last four weeks real, the eight before them from the sheet's ROS */
REAL_RTW_BOTTOMS.forEach((b, k) => {
  const sizes = [...new Set([...BOTTOM_SIZES, ...Object.keys(b.stockBySize)])].sort((a, c) => Number(a) - Number(c));
  const stockBySize: Record<string, number> = Object.fromEntries(sizes.map(sz => [sz, (b.stockBySize as Record<string, number>)[sz] ?? 0]));
  const back = Array.from({ length: 8 }, () => b.ros ? Math.max(0, Math.round(b.ros * (0.75 + r() * .5))) : 0);
  const merch = REAL_MERCH.find(m => m.styleName.toLowerCase() === b.styleName.toLowerCase());
  options.push({
    inactive: null, id:`opt-b-${k}`, styleName: b.styleName, subCat1: b.sub1, subCat2: b.sub2, core: b.sub1 === 'Formal Chinos' || b.sub1 === 'Performance Pants',
    sizes, stockBySize, weeklySales: [...back, b.lw[3], b.lw[2], b.lw[1], b.lw[0]], inStockWeeks: Array.from({ length: 12 }, (_, i) => !(b.lowStockSizes && b.lowStockSizes > 2 && i > 8)),
    launchedAt: b.launch ?? iso(addDays(TODAY, -int(14, 45))),
    incomingQty: b.grandTotal === 0 && b.totalSale > 0 ? pick([150, 200]) : 0, mrp: b.sub1 === 'Performance Pants' ? 4990 : 3490,   // placed — the ROS report carries no MRP
    sku: merch?.skuBase ?? skuFor(b.sub1 === 'Performance Pants' ? 'BOM-PER-HE' : 'BOM-CHI-SE', k, colourOf(b.styleName, null)),
    vendorId: merch ? vendorId(merch.productVendor) : b.sub1 === 'Performance Pants' ? 'united' : 'gseams', fabricCode: merch?.fabricCode ?? null,
  });
});
/* Merchandise Master styles the ROS report does not cover yet (Urban Ease, City Pace chinos; the Neapolitans) — sales placed low: new or hang-sold */
REAL_MERCH.filter(m => !options.some(o => o.styleName.toLowerCase() === m.styleName.toLowerCase())).forEach((m, k) => {
  const sizes = BOTTOM_SIZES; const stockBySize: Record<string, number> = {};
  sizes.forEach(sz => { stockBySize[sz] = int(0, 3) === 0 ? 0 : int(4, 30); });
  const sub1 = m.sheet === 'Neapolitan Pants' ? 'Neapolitan' : 'Formal Chinos';
  options.push({ inactive: null, id:`opt-m-${k}`, styleName: m.styleName, subCat1: sub1, subCat2: m.sheet === 'Neapolitan Pants' ? 'Relaxed Neapolitan' : m.productType?.toUpperCase().startsWith('SEMI') ? 'Stretch Chinos' : 'RTW Chinos', core: false,
    sizes, stockBySize, weeklySales: Array.from({ length: 12 }, () => int(0, 5)), inStockWeeks: Array.from({ length: 12 }, () => true),
    launchedAt: iso(addDays(TODAY, -int(30, 200))), incomingQty: 0, mrp: sub1 === 'Neapolitan' ? 5490 : 3490,
    sku: m.skuBase, vendorId: vendorId(m.productVendor), fabricCode: m.fabricCode });
});
/* the Display & Fit Sample Allocation's one jeans style */
options.push({ inactive: null, id:'opt-j-0', styleName:'Midnight Indigo Mid-Rise Stretch Jeans', subCat1:'RTW Stretch Jeans', subCat2:'Mid-Rise Stretch', core:true, sizes: BOTTOM_SIZES,
  stockBySize: Object.fromEntries(BOTTOM_SIZES.map(sz => [sz, int(3, 18)])), weeklySales: Array.from({ length: 12 }, () => int(2, 9)), inStockWeeks: Array.from({ length: 12 }, () => true),
  launchedAt: '2026-06-20', incomingQty: 0, mrp: 3990, sku:'BOM-MID-HE-4192-MID INDIGO', vendorId:'clayroots', fabricCode:'FORT3XSOMI-1509' });
/* this month's drops — Monthly Drops sheet: launched in August, six weeks of sales */
REAL_DROPS.forEach((d, k) => {
  const sub1 = /check/i.test(d.styleName) ? 'Formal Checks' : 'Formal Solid';
  const stockBySize: Record<string, number> = {}; SHIRT_SIZES.forEach(sz => { stockBySize[sz] = int(8, 28); });
  options.push({ inactive: null, id:`opt-d-${k}`, styleName: d.styleName, subCat1: sub1, subCat2: sub1, core: false, sizes: SHIRT_SIZES, stockBySize,
    weeklySales: [0, 0, 0, 0, 0, 0, int(4, 9), int(8, 16), int(10, 18), int(9, 17), int(8, 15), int(7, 14)], inStockWeeks: Array.from({ length: 12 }, () => true),
    launchedAt: '2026-08-01', incomingQty: 0, mrp: 3490, sku: skuFor('BOM-SHI-RE', 70 + k, colourOf(d.styleName, d.styleName.split(' ')[0])), vendorId: null, fabricCode: null });
});

/* ---------- MTM fabrics — Copy of Fabric ordering → Fabric Ordering sheet ------
   The 24 coded rows are the sheet's. The rest follow its code scheme
   (NO + vendor + weave + pattern + colour − running number), its vendors, its
   books and its thresholds (3 m international, 7 m domestic; 2 m bespoke). */
const fabrics: Fabric[] = [];
let fi = 0; let codeSeq = 1539;
const familyOf = (composition: string | null, weave: string | null, pattern: string | null) => {
  if (/linen/i.test(composition ?? '')) return 'Linen';
  if (/stripe/i.test(pattern ?? '')) return 'Stripes';
  if (/check/i.test(pattern ?? '')) return 'Checks';
  if (/print/i.test(pattern ?? '')) return 'Print';
  const w = weave ?? ''; return /twill/i.test(w) ? 'Twill' : /oxford/i.test(w) ? 'Oxford' : /dobby/i.test(w) ? 'Dobby' : 'Poplin';
};
const addFabric = (f: Omit<Fabric, 'id' | 'stockMetres' | 'reservedMetres' | 'incomingMetres' | 'millAvailable' | 'millStockMetres' | 'millReportedAt' | 'onHold' | 'paused' | 'weeklySalesShirts'>) => {
  const v = V(f.vendorId);
  const sales = Array.from({ length: 12 }, () => int(f.bucket === 'CORE' ? 6 : 1, f.bucket === 'CORE' ? 40 : 14));
  const stock = f.bucket === 'BESPOKE' ? 0 : int(0, 420);
  fabrics.push({ ...f, id:`fab-${pad(++fi)}`,
    stockMetres: stock, reservedMetres: f.bucket === 'BESPOKE' ? 0 : int(0, Math.min(40, stock)),
    incomingMetres: f.bucket !== 'BESPOKE' && chance(.18) ? pick([200, 300, 500]) : 0,
    millAvailable: f.bucket === 'BESPOKE' ? chance(.88) : null, millStockMetres: f.bucket === 'BESPOKE' ? (chance(.15) ? 0 : pick([40, 60, 85, 120, 180, 240])) : null, millReportedAt: f.bucket === 'BESPOKE' ? iso(addDays(TODAY, -int(0, 3))) : null,
    onHold: false, paused: null, weeklySalesShirts: sales, international: v.kind === 'International mill' });
};
REAL_MTM_FABRICS.forEach(f => {
  const vid = vendorId(f.vendor) ?? 'sutra';
  const bucket: Fabric['bucket'] = f.inventoryType === 'MTM' ? 'CORE' : f.inventoryType === 'Bespoke' ? 'BESPOKE' : 'NON_CORE';
  addFabric({ code: f.code, name: f.name ?? f.code, bucket, family: familyOf(f.composition, f.weave, f.pattern), vendorId: vid, international: false,
    thresholdMetres: f.threshold ?? 7, vendorCode: f.vendorCode, composition: f.composition, widthIn: f.panna, cpm: f.price, mrp: f.mrp, swatchBook: f.book });
});
/* the sheet's abbreviations, read off its own codes: NOSUPOSOWH = NO · SU(tra) · PO(plin) · SO(lid) · WH(ite) */
const VCODE: Record<string, string> = { sutra:'SU', nihal:'MN', mpb:'MB', parekh:'PA', taurus:'TA', athena:'AH', fusion:'FT', lulin:'SL', nandlal:'NL', infitex:'IF', soktas:'SK' };
const WEAVES = [['Poplin', 'PO'], ['Plain', 'PL'], ['Twill', 'TW'], ['Oxford', 'OX'], ['Dobby', 'DO'], ['Herringbone', 'HE']] as const;
const PATTERNS = [['Solid', 'SO'], ['Stripes', 'ST'], ['Checks', 'CH'], ['Print', 'PR']] as const;
const COLOURS = [['White', 'WH'], ['Light Blue', 'LI'], ['Mid Blue', 'MI'], ['Navy', 'NA'], ['Pink', 'PI'], ['Grey', 'GR'], ['Brown', 'BR'], ['Olive', 'OL'], ['Black', 'BL'], ['Beige', 'BE'], ['Purple', 'PU'], ['Dark Green', 'DA']] as const;
const COMPS = [['100% cotton', 'Cotton'], ['100% Linen', 'Linen'], ['Linen Lyocell', 'Linen Lyocell'], ['Cotton Linen', 'Cotton Linen'], ['2-ply 100s cotton', 'Cotton 2-Ply']] as const;
const mkFabric = (bucket: Fabric['bucket'], book: string, v: Vendor) => {
  const [weave, wc] = pick(WEAVES); const [pattern, pc] = pick(PATTERNS); const [colour, cc] = pick(COLOURS); const [comp, compWord] = bucket === 'CORE' ? COMPS[0] : pick(COMPS);
  const code = `${bucket === 'BESPOKE' ? 'BE' : 'NO'}${VCODE[v.id] ?? v.name.slice(0, 2).toUpperCase()}${wc}${pc}${cc}-${codeSeq++}`;
  /* the sheet's names: "Cotton Poplin - white", "100% Linen Stripes - Light blue", "Cotton Twill - Light Blue" */
  const name = bucket === 'BESPOKE' ? `${pick(['Celestial', 'Riviera', 'Como', 'Portofino', 'Bergamo', 'Lago'])} - ${v.id === 'leggiuno' ? 'LL' : v.id === 'albini' ? 'AL' : v.id === 'tmason' ? 'TM' : 'MF'}${1100 + codeSeq} ${v.name.split(' ')[0]}`
    : `${compWord}${weave === 'Plain' ? (/linen/i.test(comp) ? '' : ' Poplin') : ` ${weave}`}${pattern === 'Solid' ? '' : ` ${pattern}`} - ${colour}`;
  /* the book follows the cloth: linen in LINEN SHIRTS, prints and checks in CASUAL, the rest in the two FORMAL volumes */
  if (bucket !== 'BESPOKE') book = /linen/i.test(comp) ? 'LINEN SHIRTS' : pattern === 'Print' || pattern === 'Checks' || weave === 'Oxford' ? 'CASUAL SHIRTS VOL.1' : pick(['FORMAL SHIRTS - VOL.1', 'FORMAL SHIRTS - VOL.2']);
  addFabric({ code, name, bucket, family: familyOf(comp, weave, pattern), vendorId: v.id, international: false,
    thresholdMetres: bucket === 'BESPOKE' ? 2 : v.kind === 'International mill' ? 3 : 7,
    vendorCode: bucket === 'BESPOKE' ? name.split(' ')[2] : `${pick(['FY', 'PC', 'CAK', 'DS', 'MOON'])}${int(1000, 9999)}`, composition: comp, widthIn: pick([55, 56, 57, 58]),
    cpm: bucket === 'BESPOKE' ? int(1400, 3200) : int(180, 520), mrp: bucket === 'BESPOKE' ? int(11990, 24990) : int(2990, 6590), swatchBook: book });
};
const mtmVendors = domesticMills.filter(m => ['sutra', 'parekh', 'mpb', 'nihal', 'athena', 'taurus'].includes(m.id));
for (let k = 0; k < 30; k++) mkFabric('CORE', pick(MTM_SWATCH_BOOKS), pick(mtmVendors));
RANGES.forEach(rg => { for (let k = 0; k < rg.target - int(0, 5); k++) mkFabric('NON_CORE', pick(MTM_SWATCH_BOOKS), chance(.15) ? pick([V('fusion'), V('lulin')]) : pick(mtmVendors)); });
for (let k = 0; k < 60; k++) mkFabric('BESPOKE', 'Leggiuno Bespoke', V('leggiuno'));
for (let k = 0; k < 60; k++) { const v = pick([V('albini'), V('tmason'), V('fabriano')]); mkFabric('BESPOKE', `${v.name.split(' ')[0]} Bespoke`, v); }

/* Blocks — the Blocked sheet's rows: what is reserved at a vendor, at what price, against which article */
const blocks: Block[] = REAL_BLOCKS.map((b, k) => {
  const v = V(vendorId(b.vendor) ?? 'sutra'); const agreed = addDays(TODAY, -int(5, 70)); const exp = addDays(agreed, v.blockWindowDays);
  const converted = /received|taken/i.test(String((b as { status?: string | null }).status ?? ''));
  return { id:`blk-${k}`, fabricName: `${b.desc}${b.vendorCode ? ` · ${b.vendorCode}` : ''}`, vendorId: v.id, metres: Math.round(b.qtyReserved ?? 100),
    agreedOn: iso(agreed), expiresOn: iso(exp), via: pick(['email', 'whatsapp', 'call'] as const), status: converted ? 'converted' : exp < TODAY ? 'expired' : 'held' };
});

/* ---------- stores, swatches, STOs, returns ------------------------------- */
const swatchDispatches = Array.from({ length: 40 }, (_, k) => {
  const d = addDays(TODAY, -int(1, 30));
  return { id:`sw-${k}`, fabricId: pick(fabrics.filter(f => f.bucket !== 'BESPOKE')).id, storeId: pick(STORES).id, dispatchedOn: iso(d), confirmedOn: chance(.35) ? iso(addDays(d, int(2, 6))) : null };
});

/* STOs go out in waves — the tracker's "STO Series No." is one row per wave, one
   STO per store inside it. The three August waves are the sheet's; the
   replenishment waves after them follow its shape. */
const transfers: StockTransfer[] = [];
let stoNo = 1931;
const holders = STORES.filter(s => s.holdsRtwStock);
const wave = (opts: { stores: typeof STORES; stoType: StockTransfer['stoType']; styleName: string; total: number; hemmingType: string | null; shippedOn: string; expected: string | null; remarks?: string; state?: (i: number) => 'transit' | 'arrived' | 'closed' }) => {
  const first = stoNo; const per = Math.floor(opts.total / opts.stores.length); let extra = opts.total - per * opts.stores.length;
  const series = `${first}-${first + opts.stores.length - 1}`;
  opts.stores.forEach((st, i) => {
    const qty = per + (extra-- > 0 ? 1 : 0);
    const st8 = opts.state ? opts.state(i) : 'closed';
    const shipped = new Date(opts.shippedOn); let arrived: Date | null = st8 === 'transit' ? null : addDays(shipped, int(2, 5));
    if (arrived && arrived > TODAY) arrived = null;   // still on the road
    transfers.push({ id:`sto-${stoNo}`, stoNo:`STO ${stoNo++}`, series, stoType: opts.stoType, toStoreId: st.id, styleName: opts.styleName, qty,
      shippedOn: iso(shipped), arrivedOn: arrived ? iso(arrived) : null, closedOn: arrived && st8 === 'closed' ? iso(addDays(arrived, int(0, 2))) : null,
      hemmingType: opts.hemmingType, expectedShipping: opts.expected, remarks: opts.remarks ?? '' });
  });
};
const stoReal = REAL_STO;
wave({ stores: STORES.filter(s => s.id !== 'nyc'), stoType: 'Display', styleName: 'Urban Ease Ready-to-Wear Chinos', total: stoReal[0].qty ?? 360, hemmingType: stoReal[0].hemmingType, shippedOn: '2026-08-03', expected: null, remarks: `${stoReal[0].category} · ${stoReal[0].productRef}`, state: i => (i % 9 === 4 ? 'arrived' : 'closed') });   // 1931-1965: four still open after arrival
wave({ stores: holders.filter(s => BIG_STORES.has(s.id) || ['kal', 'ggn', 'src', 'lav'].includes(s.id)).slice(0, 11), stoType: 'Off the rack', styleName: 'Urban Ease Ready-to-Wear Chinos', total: stoReal[1].qty ?? 550, hemmingType: stoReal[1].hemmingType, shippedOn: '2026-08-04', expected: null, remarks: `${stoReal[1].category} · ${stoReal[1].productRef}` });   // 1968-1978
stoNo = 1981;
wave({ stores: STORES.filter(s => s.id !== 'nyc').slice(0, 30), stoType: 'Display', styleName: 'Spintec Flat Knit Signature Shirt', total: stoReal[2].qty ?? 144, hemmingType: 'NA', shippedOn: '2026-08-04', expected: null, remarks: `${stoReal[2].category} · ${stoReal[2].productRef}`, state: i => (i % 11 === 7 ? 'arrived' : 'closed') });   // 1981-2010
stoNo = 2014;
/* Options taken off the shelf. Some earned their way off — nothing sold, the
   shade was retired; one or two were pulled while they were still selling, and
   those are the ones the health screen puts back up as REINTRODUCE. */
const soldWell = options.filter(o => Object.values(o.stockBySize).every(q => q === 0) && o.weeklySales.slice(-8).reduce((a, b) => a + b, 0) >= 20);
soldWell.slice(0, 3).forEach((o, k) => { o.inactive = { on: iso(addDays(TODAY, -(28 + k * 21))), by:'Charanjeet · planning',
  reason: pick(['pulled when the fabric ran out at the mill', 'delisted at the season change — never put back', 'taken off after the shade was retired']) }; });
const neverSold = options.filter(o => !o.inactive && o.weeklySales.reduce((a, b) => a + b, 0) <= 2 && Object.values(o.stockBySize).reduce((a, b) => a + b, 0) === 0);
neverSold.slice(0, 2).forEach((o, k) => { o.inactive = { on: iso(addDays(TODAY, -(60 + k * 30))), by:'Charanjeet · planning', reason:'never found its customer — cleared and delisted' }; });

const fillers = options.filter(o => o.subCat1 !== 'Neapolitan' && Object.values(o.stockBySize).some(q => q > 0) && o.weeklySales.slice(-4).reduce((a, b) => a + b, 0) > 20).slice(0, 4);
fillers.forEach((o, k) => {
  const shipped = addDays(TODAY, -(2 + k * 3));
  wave({ stores: holders.filter((_, i) => (i + k) % 3 !== 0), stoType: 'Replenishment', styleName: o.styleName, total: int(30, 70), hemmingType: isBottoms(o.subCat1) ? 'Bottom Open/ Unhemmed.' : 'NA',
    shippedOn: iso(shipped), expected: iso(addDays(shipped, 4)), state: i => (k === 0 ? (i % 4 === 0 ? 'arrived' : 'transit') : k === 1 ? (i % 5 === 0 ? 'arrived' : 'closed') : 'closed') });
});

/* ---------- conversation — the WhatsApp that now lives on the record ------ */
let cid = 0;
const say = (daysBack: number, who: string, role: RoleId, text: string, step: string | null = null): Comment =>
  ({ id:`c-${++cid}`, at: iso(addDays(TODAY, -daysBack)), who, role, text, step, mentions: parseMentions(text) });
const withPps = orders.filter(o => o.status === 'Open' && o.milestones.some(m => m.key === 'PPS Approval' && !m.actual));
const critical = orders.filter(o => o.status === 'Open' && ['critical', 'delayed'].includes(riskOf(o).risk));
const quoting = orders.filter(o => o.status === 'Quoting');
const intlCore = fabrics.filter(f => f.bucket === 'NON_CORE' && f.international);
const threads: Thread[] = [];
if (withPps[0]) threads.push({ id:'t-1', kind:'order', subjectId: withPps[0].id, comments: [
  say(6, 'Nitin Singh', 'production', `Sample from ${V(withPps[0].vendorId!).name} reached the production unit — 2 pcs. Collar stand reads short and the placket puckers at the third button. @parag for review; @kunal in case the collar spec itself is off.`, 'PPS sample'),
  say(5, 'Kunal', 'design', 'Round 1 — resubmit. Green slip attached: collar stand +2 mm, re-block the placket, match the button shade to the swatch card. Kunal confirms the spec is right; execution is the issue.', 'PPS sample'),
  say(1, 'Nitin Singh', 'production', 'Round 2 submitted this morning, courier lands at the unit tomorrow. @parag — PP go-ahead needed before bulk cutting can start on Monday.', 'PPS sample'),
] });
if (withPps[1]) threads.push({ id:'t-2', kind:'order', subjectId: withPps[1].id, comments: [
  say(9, 'Abhin M', 'production', 'Size set: 38 and 42 in. Chest on 42 is 1 cm over spec, rest within tolerance. @kunal ok to approve with comments?', 'Size set'),
  say(8, 'Janak · design', 'design', 'Approved with comments — 42 chest to be corrected in bulk, not resampled. Noted on the tech pack.', 'Size set'),
] });
threads.push({ id:'t-3', kind:'order', subjectId: polo.id, comments: [
  say(4, 'Nitin Singh', 'production', 'Dazzle shipment rejected at inward — pilling on the collar rib and shade variance across the lot. Whole lot held. @parag @neha', 'Escalation'),
  say(3, 'Parag', 'production', 'Replacement lot agreed with Dazzle at their cost. Second QC at their unit before dispatch this time — BSC QC goes there. Lands ~3 weeks late against the October drop.', 'Escalation'),
  say(2, 'Neha', 'planning', 'Accept the delay. Move Signature Polo to the November drop; October keeps the flat knits. Log it as accepted delay.', 'Escalation'),
] });
if (critical[0] && critical[0].id !== polo.id) threads.push({ id:'t-3b', kind:'order', subjectId: critical[0].id, comments: [
  say(3, 'Parag', 'production', `${V(critical[0].vendorId!).name} adds a second stitching line from Monday. Even so we land 6 days past target. @neha — accept the delay, or split the order and air the first 300?`, 'Escalation'),
  say(2, 'Neha', 'planning', 'Accept +6d. Splitting costs more than the six days are worth for this drop. Log it as accepted delay and move the target.', 'Escalation'),
] });
if (quoting[0]) threads.push({ id:'t-4', kind:'order', subjectId: quoting[0].id, comments: [
  say(4, 'Sreekanth', 'sourcing', `Best fabric quote is ₹${quoting[0].fabricQuotes.length ? Math.min(...quoting[0].fabricQuotes.map(q => q.cpm)) : 0}/m and the MOQ forces an over-buy. At ${quoting[0].orderQty} pcs that lands us over the ₹${quoting[0].targetCost} target. @neha can we take 300 instead to use the MOQ properly, or hold the qty and move the cost?`),
  say(3, 'Neha', 'planning', 'Hold the qty. Move target cost to the quote — this is a core repeat and the MRP carries it. @kunal update the requirement please.'),
] });
if (intlCore[0]) threads.push({ id:'t-5', kind:'fabric', subjectId: intlCore[0].id, comments: [
  say(7, 'Yulette · planning', 'planning', `${V(intlCore[0].vendorId).name} is at ${V(intlCore[0].vendorId).leadDays} days. Can we block 300 m against the October drop before it goes below reorder point? @sreekanth`),
  say(6, 'Sreekanth', 'sourcing', 'Block agreed on email — 300 m, held to mid-November. Logged under Blocks so it counts down here instead of in my inbox.'),
] });
const soldOut = options.find(o => Object.values(o.stockBySize).every(q => q === 0) && o.weeklySales.slice(-6).some(q => q > 0));
if (soldOut) threads.push({ id:'t-6', kind:'option', subjectId: soldOut.id, comments: [
  say(12, 'Charanjeet · planning', 'planning', `${soldOut.styleName} is at zero and still sold ${soldOut.weeklySales.slice(-4).reduce((a, b) => a + b, 0)} in the last four weeks. Reordering at MOQ — the 12-week ROS understates it because the mid sizes went first.`),
] });

/* ---------- customer orders at the stores — MTM and RTW, kept apart ------ */
/* customers — a pool of ~700 names; each store has its own regulars, and one in eight orders is a customer visiting from elsewhere */
const SURNAMES = ['Mehta', 'Iyer', 'Kapoor', 'Nair', 'Bhatt', 'Desai', 'Rao', 'Fernandes', 'Shah', 'Khan', 'Sethi', 'Joshi', 'Menon', 'Reddy', 'Pillai', 'Chopra', 'Malhotra', 'Bose', 'Ghosh', 'Banerjee', 'Patel', 'Jain', 'Agarwal', 'Gupta', 'Verma', 'Singh', 'Kulkarni', 'Deshpande', 'Naidu', 'Krishnan'];
const INITIALS = ['A', 'B', 'D', 'H', 'J', 'K', 'M', 'N', 'P', 'R', 'S', 'T', 'V', 'Y', 'G', 'L', 'C', 'U', 'I', 'O', 'E', 'F', 'W'];
const CUSTOMER_POOL = INITIALS.flatMap(i => SURNAMES.map(sn => `${i}. ${sn}`));
const storeRegulars = new Map<string, string[]>(STORES.map((st, i) => [st.id, Array.from({ length: 22 }, (_, k) => CUSTOMER_POOL[(i * 37 + k * 13) % CUSTOMER_POOL.length])]));
const customerFor = (storeId: string) => chance(.125) ? pick(CUSTOMER_POOL) : pick(storeRegulars.get(storeId)!);
const MTM_FACTORIES = VENDORS.filter(v => v.mtm && v.kind !== 'Hemming unit');
const HEM = VENDORS.find(v => v.kind === 'Hemming unit')!;
const plans: ProductionPlan[] = [];
let planSeq = 41260;
const planFor = (factoryId: string, day: Date) => {
  const key = `${factoryId}-${iso(day).slice(0, 10)}`;
  let pl = plans.find(p => p.id === key);
  if (!pl) { pl = { id: key, planNo: `#${++planSeq}`, factoryId, category: 'Shirts', createdOn: iso(day), closedOn: null, orderIds: [] }; plans.push(pl); }
  return pl;
};
const STAGE_SEQ: CustomerOrder['stage'][] = ['planned', 'in-transit', 'in-factory', 'out-factory', 'rts', 'dispatched', 'delivered'];
const customerOrders: CustomerOrder[] = [];
let coSeq = 0;
/* Enigma's sheet, filled the way a store fills it: the sheet's own values most of the time, a customer's choice now and then */
const sheetSpec = (): CustomerOrder['spec'] => { const d = defaultSpec()!; SHEET_OPTIONS.forEach(o => { if (chance(o.key === 'collar' || o.key === 'cuff' || o.key === 'pocket' ? .5 : .12)) d[o.key] = pick(o.options); }); return d; };
/* measurements scale with the fit; half-inch steps like a tape */
const sheetMeasurements = (fit: string): CustomerOrder['measurements'] => { const k = fit === 'Slim Fit' ? 0.9 : fit === 'Tailored Fit' ? 0.95 : 1.0; const m = {} as NonNullable<CustomerOrder['measurements']>;
  MEASUREMENTS.forEach(x => { m[x.key] = x.unit === 'n' ? x.def : Math.round((x.def * (x.key === 'chest' || x.key === 'waist' || x.key === 'hips' ? k : 1) + (r() - .5) * (x.def > 20 ? 2 : x.def > 8 ? 1 : 0.25)) * 4) / 4; }); return m; };
const punchOrder = (kind: 'MTM' | 'RTW', punched: Date): CustomerOrder => {
  const store = pick(STORES);
  const base = { id:`co-${coSeq}`, orderNo:`BSC-${73100 + coSeq++}`, storeId: store.id, customer: customerFor(store.id), punchedOn: iso(punched), tag:'normal' as const, planId: null, factoryId: null, changeSeenOn: null as string | null, changeToldFactoryOn: null as string | null, changeFactorySeenOn: null as string | null, consumptionM: null, scans: [] as Scan[], bespoke: null as CustomerOrder['bespoke'], spec: null as CustomerOrder['spec'], measurements: null as CustomerOrder['measurements'], pattern: null as CustomerOrder['pattern'], revisions: [] as CustomerOrder['revisions'] };
  if (kind === 'RTW') {
    const o = pick(options.filter(x => Object.values(x.stockBySize).some(q => q > 0)));
    const bottoms = isBottoms(`${o.subCat1} ${o.subCat2} ${o.styleName}`);   // not a shirt — hemmed to the customer's inseam before it goes out
    const ageD = daysAgo(iso(punched));
    /* a bottom cannot ship until the bench cuts it to the customer's inseam, so
       the recent ones sit at 'hemming' — that queue is real work, not a status */
    const stage = ageD < 1 ? 'punched'
      : ageD < 4 ? (bottoms ? pick(['punched', 'hemming', 'hemming', 'dispatched'] as const) : pick(['punched', 'dispatched', 'dispatched'] as const))
      : chance(.9) ? 'delivered' : 'dispatched';
    const scans: Scan[] = stage === 'punched' ? []
      : stage === 'hemming' ? [{ stage:'hemming' as const, at: iso(addDays(punched, 1)), by:'Meera' }]
      : [{ stage:'dispatched' as const, at: iso(addDays(punched, bottoms ? 2 : 1)), by:'Vishal' }];
    return { ...base, kind:'RTW', styleName: o.styleName, fabricId: null, optionId: o.id, fit: null, size: pick(o.sizes.filter(sz => o.stockBySize[sz] > 0)), hemLength: bottoms ? pick([30, 31, 32, 33, 34]) : null, qty: 1, promisedOn: iso(addDays(punched, bottoms ? 3 : 1)), stage, remarks: '', scans };
  }
  const isBespoke = chance(.14);
  const f = pick(fabrics.filter(x => !x.paused && !x.onHold && (isBespoke ? x.bucket === 'BESPOKE' && x.millAvailable !== false : x.bucket !== 'BESPOKE')));
  const tag: CustomerOrder['tag'] = chance(.08) ? 'urgent' : chance(.06) ? 'corporate' : 'normal';
  return { ...base, kind, tag, styleName: f.name, fabricId: f.id, optionId: null, fit: pick(MTM_FITS), size: null, hemLength: null, qty: 1,
    promisedOn: iso(addDays(punched, f.bucket === 'BESPOKE' ? 21 : tag === 'urgent' ? 2 : 7)), stage: 'punched', consumptionM: consumptionFor(f.family === 'Linen' ? 1.85 : 1.6),
    spec: sheetSpec(), measurements: sheetMeasurements(pick(MTM_FITS)), pattern: { ...defaultPattern(), lowNeck: chance(.3), slopingShoulders: chance(.2), backDown: chance(.4) },
    bespoke: f.bucket === 'BESPOKE' ? { code: mintBespokeCode(f.vendorId, coSeq), requestedOn: daysAgo(iso(punched)) < 1 ? null : iso(addDays(punched, 1)), inwardOn: null } : null,
    remarks: chance(.25) ? pick(['Monogram RM on cuff', 'Contrast inner collar', 'No pocket']) : '' };
};
/* 18 days of MTM history, ~110 a day in the seed (real: ~500) */
for (let d = 18; d >= 0; d--) {
  const day = addDays(TODAY, -d);
  const n = d === 0 ? 46 : int(95, 125);
  for (let k = 0; k < n; k++) {
    const punched = new Date(day.getTime() + int(9, 20) * 36e5 + int(0, 59) * 6e4);
    if (punched > TODAY) continue;
    const o = punchOrder('MTM', punched);
    const ageH = (TODAY.getTime() - punched.getTime()) / 36e5;
    if (o.bespoke) {
      if (!o.bespoke.requestedOn) { o.stage = ageH < 1.5 ? 'punched' : 'pp'; customerOrders.push(o); continue; }
      const reqAgeD = daysAgo(o.bespoke.requestedOn);
      if (reqAgeD < int(6, 12)) { o.stage = ageH < 1.5 ? 'punched' : 'pp'; customerOrders.push(o); continue; }
      const inward = addDays(o.bespoke.requestedOn, int(6, 10));
      if (inward > TODAY) { o.stage = ageH < 1.5 ? 'punched' : 'pp'; customerOrders.push(o); continue; }   // parcel still on its way
      o.bespoke.inwardOn = iso(inward);
    }
    if (ageH < 1.5) { customerOrders.push(o); continue; }
    if (ageH < 26 && chance(.55)) { o.stage = 'pp'; customerOrders.push(o); continue; }
    const factory = o.tag === 'corporate' ? MTM_FACTORIES.find(v => v.id === 'mahendra')! : o.tag === 'urgent' ? MTM_FACTORIES.find(v => v.id === 'richman')! : pick([...MTM_FACTORIES, ...MTM_FACTORIES.filter(v => v.id === 'mahendra'), ...MTM_FACTORIES.filter(v => v.id === 'mahendra')]);
    const planDay = o.bespoke?.inwardOn ? addDays(new Date(o.bespoke.inwardOn), 0) : addDays(punched, ageH < 26 ? 0 : 1);
    const pl = planFor(factory.id, planDay); pl.orderIds.push(o.id); o.planId = pl.id; o.factoryId = factory.id;
    const cut = factory.kind === 'Hemming unit' ? [0, 0.3, 0.6, 1.5, 2, 2.5] : [0, 0.5, 1, int(3, 5) + (o.tag === 'urgent' ? -2 : 0), 5.5, 6.5];
    let t = new Date(planDay.getTime() + 11 * 36e5);
    o.stage = 'planned'; o.scans.push({ stage:'planned', at: iso(t), by:'Swati' });
    for (let i = 1; i < STAGE_SEQ.length - 1; i++) {
      const at = new Date(planDay.getTime() + cut[i] * 864e5 + 11 * 36e5);
      if (at > TODAY) break;
      if (STAGE_SEQ[i] === 'out-factory' && chance(factory.id === 'harsh' ? .12 : .03)) break;
      t = at; o.stage = STAGE_SEQ[i]; o.scans.push({ stage: STAGE_SEQ[i], at: iso(at), by: STAGE_SEQ[i] === 'in-factory' || STAGE_SEQ[i] === 'out-factory' ? `${factory.name} merchandiser` : STAGE_SEQ[i] === 'dispatched' ? 'Vishal' : 'Swati' });
    }
    if (o.stage === 'dispatched' && daysAgo(t) >= 2) o.stage = 'delivered';
    customerOrders.push(o);
  }
}
for (let k = 0; k < 90; k++) customerOrders.push(punchOrder('RTW', addDays(TODAY, -int(0, 30))));
/* the hemming bench always has a few pairs on it — bottoms sell every day and
   each one waits on its inseam before it can leave the unit */
for (let k = 0; k < 7; k++) {
  const bottomOpts = options.filter(o => isBottoms(`${o.subCat1} ${o.subCat2} ${o.styleName}`) && Object.values(o.stockBySize).some(q => q > 0));
  if (!bottomOpts.length) break;
  const o = punchOrder('RTW', addDays(TODAY, -int(0, 3)));
  const opt = pick(bottomOpts);
  o.optionId = opt.id; o.styleName = opt.styleName;
  o.size = pick(opt.sizes.filter(sz => opt.stockBySize[sz] > 0));
  o.hemLength = pick([30, 31, 32, 33, 34]);
  o.stage = k < 5 ? 'hemming' : 'punched';
  o.scans = o.stage === 'hemming' ? [{ stage:'hemming', at: iso(addDays(TODAY, -int(0, 1))), by:'Meera' }] : [];
  o.promisedOn = iso(addDays(TODAY, int(0, 2)));
  customerOrders.push(o);
}

/* customers change their minds — four or five a day, right to the end */
/* both halves of the story: a change that arrives before production allocates
   (theirs to read) and one that arrives after (theirs to ring the factory about) */
const preAlloc = customerOrders.filter(o => o.kind === 'MTM' && o.stage === 'pp' && !o.factoryId);
const postAlloc = customerOrders.filter(o => o.kind === 'MTM' && ['planned', 'in-transit', 'in-factory'].includes(o.stage));
const changeable = [...[...preAlloc].sort(() => r() - .5).slice(0, 8), ...[...postAlloc].sort(() => r() - .5).slice(0, 10)];
changeable.forEach((o, k) => {
  const amend = o.stage === 'in-transit' || o.stage === 'in-factory';
  const at = iso(addDays(TODAY, -int(0, 2)));
  const store = STORES.find(s => s.id === o.storeId)!;
  if (k % 4 === 3 && o.spec) { const to = pick(COLLAR_STYLES.filter(c => c !== o.spec!.collar));
    o.revisions.push({ rev:1, at, by: `${store.name} store`, role:'store', note:'Customer rang the store', changes:[{ field:'Collar', from:o.spec.collar, to }], reprint: amend });
    o.spec.collar = to;
  } else if (k % 4 === 2 && o.spec) { const to = pick(POCKETS.filter(c => c !== o.spec!.pocket));
    o.revisions.push({ rev:1, at, by: `${store.name} store`, role:'store', note:'Customer changed their mind on the pocket', changes:[{ field:'Pocket', from:o.spec.pocket, to }], reprint: amend });
    o.spec.pocket = to;
  } else if (k % 4 === 1) { const to = pick(MTM_FITS.filter(f => f !== o.fit));
    o.revisions.push({ rev:1, at, by: `${store.name} store`, role:'store', note:'Customer tried the fit sample again', changes:[{ field:'Fit', from:o.fit ?? '—', to }], reprint: amend });
    o.fit = to;
  } else {
    o.revisions.push({ rev:1, at, by:'Swati', role:'production', note:'Store called — customer is flying Thursday', changes:[{ field:'Tag', from:o.tag, to:'urgent' }], reprint: amend });
    o.tag = 'urgent'; o.promisedOn = iso(addDays(new Date(o.punchedOn), 2));
  }
});
/* most changes have already been read or passed on — what is left is today's
   handful, which is what the two lists on MTM daily production are for */
customerOrders.filter(o => (o.revisions?.length ?? 0) > 0).forEach((o, k) => {
  const last = o.revisions[o.revisions.length - 1];
  if (k % 5 < 2) return;                                     // still unread — lands on a production list
  o.changeSeenOn = iso(addDays(new Date(last.at), 1));
  if (o.factoryId && k % 5 === 3) o.changeToldFactoryOn = o.changeSeenOn;
});

plans.forEach(pl => { const os = pl.orderIds.map(id => customerOrders.find(o => o.id === id)!); if (os.every(o => ['rts', 'dispatched', 'delivered'].includes(o.stage))) pl.closedOn = iso(addDays(new Date(pl.createdOn), 7)); });

/* returns — the ladder at every rung: some fixed by alteration, one at the factory, one waiting on finance, a couple closed */
const returns: ReturnCase[] = Array.from({ length: 14 }, (_, k) => {
  /* the demo store gets one case at every rung; the rest spread out */
  const st = k < 7 ? STORES.find(s => s.id === 'plh') ?? pick(STORES) : pick(STORES); const opened = addDays(TODAY, -int(1, 25));
  const mtmOrder = customerOrders.find(o => o.storeId === st.id && o.kind === 'MTM' && o.stage === 'delivered') ?? customerOrders.find(o => o.kind === 'MTM' && o.stage === 'delivered');
  const rtwOrder = customerOrders.find(o => o.storeId === st.id && o.kind !== 'MTM' && o.stage === 'delivered');
  const isMtm = k % 3 !== 2 && !!mtmOrder; const o = isMtm ? mtmOrder! : rtwOrder ?? mtmOrder!;
  const reason = pick(['Fit', 'Fit', 'Fabric defect', 'Stitching', 'Wrong size sent', 'Changed mind', 'Colour / shade'] as const);
  const r: ReturnCase = { id:`ret-${k}`, caseNo:`RET-${4100 + k}`, storeId: st.id, styleName: o?.styleName ?? pick(options).styleName, kind: isMtm ? 'MTM' : 'RTW', orderId: o?.id ?? null,
    openedOn: iso(opened), stage:'raised', slaDays: 10, reason, wants: reason === 'Changed mind' ? 'Refund' : pick(['Remake', 'Exchange', 'Refund'] as const),
    remarks: pick(['Chest tight on the 40, customer tried the 42 and it was long in the sleeve.', 'Loose thread at the cuff seam, noticed on second wear.', 'Shade lighter than the swatch the customer chose from.', 'Ordered 38, received 40 — label says 38.', 'Customer changed mind after delivery; unworn, tags on.', '']),
    attempts: [], factoryLeg: null, refund: null, closedOn: null };
  const factoryId = o?.factoryId ?? 'mahendra';
  const day = (n: number) => { const d = addDays(opened, n); return iso(d > TODAY ? addDays(TODAY, -int(0, 1)) : d); };   // nothing in a case happens after today
  switch (k === 6 ? 6 : k % 7 === 6 ? 7 : k % 7) {
    case 0: break;   // just raised — store decides the first rung
    case 6: /* the other alteration route: through the warehouse to the hemming unit — at the unit today */
      r.kind = rtwOrder ? 'RTW' : r.kind; r.orderId = rtwOrder?.id ?? r.orderId; r.styleName = rtwOrder?.styleName ?? r.styleName; r.reason = 'Fit'; r.wants = 'Exchange';
      r.remarks = 'Length an inch long after the first wash — customer wants it taken up at the unit, will collect from the store.';
      r.attempts.push({ step:'alteration', startedOn: day(1), by:'Aarav Mehta', outcome:'pending', note:'Take up 1 inch · hemming unit', decidedOn: null, where:'hemming-unit' });
      r.hemLeg = { destination:'store', handedOn: day(1), inwardAtWarehouseOn: day(2), atUnitOn: day(3), hemmedOn: null, backAtWarehouseOn: null, dispatchedOn: null, deliveredOn: null }; r.stage = 'at-factory'; break;
    case 1: r.attempts.push({ step:'alteration', startedOn: day(1), by:'Aarav Mehta', outcome:'pending', note:'Take in chest 2 cm', decidedOn: null, where:'factory' }); r.factoryLeg = { factoryId, sentOn: day(1), receivedAtFactoryOn: null, backAtStoreOn: null }; r.stage = 'at-factory'; break;   // in the vehicle, factory yet to scan
    case 2: r.attempts.push({ step:'alteration', startedOn: day(1), by:'Aarav Mehta', outcome:'pending', note:'Sleeve −1.5 cm', decidedOn: null, where:'factory' }); r.factoryLeg = { factoryId, sentOn: day(1), receivedAtFactoryOn: day(2), backAtStoreOn: null }; r.stage = 'at-factory'; break;   // at the factory
    case 3: r.attempts.push({ step:'alteration', startedOn: day(1), by:'Aarav Mehta', outcome:'not enough', note:'Still pulls at the chest', decidedOn: day(6), where:'store' }, { step:'remake', startedOn: day(6), by:'Aarav Mehta', outcome:'pending', note:'Re-measured; chest +1", new sheet', decidedOn: null, where:'factory' }); r.factoryLeg = { factoryId, sentOn: day(6), receivedAtFactoryOn: day(7), backAtStoreOn: null }; r.stage = 'at-factory'; break;
    case 4: r.attempts.push({ step:'alteration', startedOn: day(1), by:'Aarav Mehta', outcome:'not enough', note:'', decidedOn: day(5) }, { step:'refund', startedOn: day(5), by:'Aarav Mehta', outcome:'pending', note:'Customer does not want another try', decidedOn: null }); r.refund = { kind:'refund', amount: 3490, requestedOn: day(5), movedOn: null, by: null }; r.stage = 'back-at-store'; break;   // waiting on finance
    case 5: r.attempts.push({ step:'alteration', startedOn: day(1), by:'Aarav Mehta', outcome:'accepted', note:'Collar eased by our tailor', decidedOn: day(2), where:'store' }); r.closedOn = day(2); r.stage = 'closed'; break;   // the store did it itself
    default: r.attempts.push({ step:'store-credit', startedOn: day(1), by:'Aarav Mehta', outcome:'accepted', note:'Changed mind, unworn', decidedOn: day(1) }); r.refund = { kind:'store-credit', amount: 2990, requestedOn: day(1), movedOn: day(1), by:`${st.name} store` }; r.closedOn = day(1); r.stage = 'refunded';   // given by the store on the spot
  }
  return r;
});
/* store credit: every store-credit case put money on the customer's account;
   one Pali Hill regular also has a balance from before the tool, part spent */
const creditLedger: CreditEntry[] = [];
returns.filter(r => r.refund?.kind === 'store-credit').forEach((r, k) => { const o = customerOrders.find(x => x.id === r.orderId); if (!o) return;
  creditLedger.push({ id:`cr-${k}`, customer: o.customer, at: r.refund!.movedOn ?? r.openedOn, amount: r.refund!.amount, note: `store credit on ${r.caseNo} · ${r.styleName}`, by:'Aarav Mehta', storeId: r.storeId, caseId: r.id, orderId: o.id }); });
{ const regular = customerOrders.filter(o => o.storeId === 'plh' && o.stage === 'delivered').map(o => o.customer).find(n => customerOrders.filter(o => o.customer === n).length >= 2) ?? customerOrders.find(o => o.storeId === 'plh')?.customer;
  if (regular) { creditLedger.push({ id:'cr-plh-1', customer: regular, at: iso(addDays(TODAY, -40)), amount: 2990, note:'store credit carried over · exchange declined, Aug', by:'Aarav Mehta', storeId:'plh', caseId: null, orderId: null },
    { id:'cr-plh-2', customer: regular, at: iso(addDays(TODAY, -12)), amount: -1200, note:'spent on a bill', by:'Aarav Mehta', storeId:'plh', caseId: null, orderId: null }); } }

/* damaged and unsellable — written off the day it was found, or it is still "in stock" on the system */
const writeOffs: StockWriteOff[] = Array.from({ length: 6 }, (_, k) => { const o = options.filter(x => Object.values(x.stockBySize).some(q => q > 0))[k * 17 % 200]; const size = o.sizes.find(sz => (o.stockBySize[sz] ?? 0) > 0) ?? o.sizes[0]; const st = STORES.filter(s => s.holdsRtwStock)[k * 5 % 20];
  o.stockBySize[size] = Math.max(0, (o.stockBySize[size] ?? 0) - 1);
  return { id:`wo-${k}`, storeId: st.id, optionId: o.id, styleName: o.styleName, size, qty: 1, reason: pick(['Damaged', 'Soiled', 'Display worn', 'Lost'] as const), disposition: k % 3 === 0 ? 'destroyed' : 'sent back to unit', at: iso(addDays(TODAY, -int(1, 20))), by:`${st.name} store`, backAtUnitOn: k % 3 === 1 ? iso(addDays(TODAY, -int(0, 5))) : null }; });

if (returns[1]) threads.push({ id:'t-7', kind:'return', subjectId: returns[1].id, comments: [
  say(2, 'Aarav Mehta', 'store', 'Customer wants a refund, not a remake — the 40 fits like a 38 across the chest. Second case on this style this month. @production is the size set off?'),
] });

/* the daily "EXTRA FABRIC" email, as records */
const extraFabric: ExtraFabricRequest[] = customerOrders.filter(o => o.kind === 'MTM' && o.stage === 'in-factory' && o.factoryId !== HEM.id).slice(0, 9).map((o, k) => {
  const panel = pick(EXTRA_FABRIC_PANELS); const raised = addDays(TODAY, -int(0, 3));
  return { id:`xf-${k}`, orderId: o.id, fabricId: o.fabricId!, factoryId: o.factoryId!, metres: PANEL_METRES[panel], reason: pick(EXTRA_FABRIC_REASONS), panel,
    planId: o.planId ?? null, raisedBy: `${V(o.factoryId!).name} merchandiser`, raisedOn: iso(raised), status: k < 4 ? 'requested' : k < 7 ? 'approved' : 'sent', decidedOn: k < 4 ? null : iso(addDays(raised, 1)), note: k === 1 ? 'Second time this week on this fabric lot' : '' };
});

/* what each factory keyed in as its own count for the last few days — the number
   the merchandiser stands behind, next to the one the scans produce */
const factoryOutputs: FactoryOutput[] = [];
VENDORS.filter(v => v.mtm && v.kind !== 'Hemming unit').forEach(v => {
  for (let d = 1; d <= 4; d++) { const day = addDays(TODAY, -d); if (day.getDay() === 0) continue;
    const scanned = customerOrders.filter(o => o.factoryId === v.id && o.scans.some(sc => sc.stage === 'out-factory' && sc.at.slice(0, 10) === iso(day).slice(0, 10))).length;
    factoryOutputs.push({ id:`fo-${v.id}-${d}`, factoryId: v.id, date: iso(day).slice(0, 10), pieces: Math.max(0, scanned + (d % 3 === 0 ? int(1, 3) : 0)),
      note: d % 3 === 0 ? 'two pieces held for a button change, counted tomorrow' : '', by:`${v.name} merchandiser`, at: iso(addDays(day, 0)) });
  }
});

const stockRequests: StockRequest[] = Array.from({ length: 6 }, (_, k) => {
  const o = pick(options.filter(x => Object.values(x.stockBySize).some(q => q > 0))); const from = pick(holders); const to = pick(holders.filter(x => x.id !== from.id));
  return { id:`sr-${k}`, styleName: o.styleName, optionId: o.id, size: pick(o.sizes), qty: 1, fromStoreId: from.id, toStoreId: k === 0 ? 'plh' : to.id,
    requestedOn: iso(addDays(TODAY, -int(0, 6))), status: k === 1 ? 'shipped' : pick(['requested', 'requested', 'accepted', 'shipped', 'received', 'declined'] as const), note: pick(['Customer waiting in store', 'Reserve for Saturday', '']) };
});
stockRequests[2] = { ...stockRequests[2], fromStoreId: 'plh', toStoreId: 'kal', status: 'requested' };
stockRequests[1] = { ...stockRequests[1], toStoreId: 'plh', fromStoreId: 'scw', status: 'shipped' };
/* one ask of Pali Hill all the way through — asked, shipped, received */
stockRequests[3] = { ...stockRequests[3], fromStoreId: 'plh', toStoreId: 'kal', status: 'received' };   // "asked of this store" = Pali Hill is the one giving

/* ---------- launches — the Monthly Drops sheet, one row per new option ----- */
const holderIds = holders.map(x => x.id);
const launches: Launch[] = [];
/* August's six — Monthly Drops: Delivered, "Received at ho - 15 JULY 26", displays Sent */
REAL_DROPS.forEach((d, k) => {
  const o = options.find(x => x.styleName === d.styleName)!;
  const launchOn = addDays(new Date('2026-08-01T09:00:00+05:30'), k < 3 ? 0 : 7);
  launches.push({ id:`ln-aug-${k}`, optionId: o.id, styleName: d.styleName, dropMonth: 'Aug 26', orderId: null,
    expectedAtHo: '2026-07-15', receivedAtHo: '2026-07-15', pieces: defaultLaunchPieces(d.styleName, holderIds).map(p => ({ ...p, dispatchedOn: '2026-07-18', receivedOn: '2026-07-22' })),
    marketingName: d.styleName, marketingBriefOn: '2026-07-20', launchOn: iso(launchOn), launchedOn: iso(launchOn), hero: k === 0,
    keyPointers: d.keyPointers ?? '' });
});
/* the next drops — the newest options that are not yet in a store */
const newOptions = [...options].filter(o => !REAL_DROPS.some(d => d.styleName === o.styleName)).sort((a, b) => b.launchedAt.localeCompare(a.launchedAt)).slice(0, 8);
const openPool = orders.filter(x => x.status === 'Open');
newOptions.forEach((o, k) => {
  const linked = orders.find(x => x.status !== 'Requirement' && x.styleName === o.styleName) ?? openPool.filter(x => x.category.includes('shirt') === !isBottoms(o.subCat1))[k] ?? null;
  const drop = k < 4 ? 'Oct 26' : 'Nov 26';
  const launchOn = addDays(TODAY, drop === 'Oct 26' ? int(12, 40) : int(45, 75));
  const expected = addDays(launchOn, -int(14, 24));
  const receivedAtHo = daysBetween(expected, TODAY) > -3 && chance(.8) ? iso(addDays(expected, int(-1, 4))) : null;
  let pieces = receivedAtHo && chance(.85) ? defaultLaunchPieces(o.styleName, holderIds) : [];
  if (pieces.length) {
    const shipped = chance(.7);
    pieces = pieces.map((p, i) => { const d = shipped && (i % 7 !== 3 || chance(.5)) ? iso(addDays(new Date(receivedAtHo!), int(1, 4))) : null; return { ...p, dispatchedOn: d, receivedOn: d && chance(.6) ? iso(addDays(new Date(d), int(1, 3))) : null }; });
  }
  const briefOn = chance(.5) ? iso(addDays(launchOn, -int(10, 16))) : null;
  launches.push({ id:`ln-${k}`, optionId: o.id, styleName: o.styleName, dropMonth: drop, orderId: linked?.id ?? null,
    expectedAtHo: iso(expected), receivedAtHo, pieces, marketingName: briefOn ? o.styleName : null,
    marketingBriefOn: briefOn, launchOn: iso(launchOn), launchedOn: null, hero: k % 5 === 0,
    keyPointers: pick(['100% cotton, soft & breathable — say it in the first sentence', 'Wrinkle-free; travel story', 'Heavier hand than last season\'s; premium positioning', '']) });
});
/* every launched style already has its design code; one received style is waiting on design for it */
launches.forEach((l, i) => { if (l.launchedOn) { l.designCode = `BOM-${isBottoms(options.find(o => o.id === l.optionId)?.subCat1 ?? '') ? 'BOT' : 'SHI'}-RW-${5500 + i}`; l.designCodeOn = iso(addDays(new Date(l.receivedAtHo!), 1)); l.designCodeBy = 'Kunal'; } });
const up = launches.filter(l => !l.launchedOn);
if (up[1]) { up[1].receivedAtHo = iso(addDays(TODAY, -3)); up[1].pieces = defaultLaunchPieces(up[1].styleName, holderIds).map((p, i) => ({ ...p, dispatchedOn: i % 5 === 4 ? null : iso(addDays(TODAY, -2)), receivedOn: i % 5 !== 4 && p.storeId !== 'plh' && i % 3 === 0 ? iso(addDays(TODAY, -1)) : null })); }
if (up[2]) { up[2].marketingBriefOn = null; up[2].launchOn = iso(addDays(TODAY, 6)); }
threads.push({ id:'t-8', kind:'launch', subjectId: up[2]?.id ?? 'ln-2', comments: [
  say(2, 'Charanjeet · planning', 'planning', `Displays for ${up[2]?.styleName ?? 'the drop'} went out Monday. Marketing still needs the final name — @kunal is it "Signature" or "Everyday"? Shopify listing is blocked on it.`),
] });

/* ---------- swatch books — every store × MTM / RTW / bespoke ------------------ */
const bespokeMills = [...new Set(fabrics.filter(f => f.bucket === 'BESPOKE').map(f => f.vendorId))];
const swatchBooks: SwatchBook[] = [];
/* one open ask, so the warehouse's list is not empty on day one */
const bookRequests: SwatchBookRequest[] = [
  { id:'bkr-1', storeId:'plh', kind:'MTM', copies: 1, reason:'a second stylist joined — one book between two is slowing the floor', status:'requested', askedOn: iso(addDays(TODAY, -1)), by:'Aarav Mehta', decidedOn: null, note:'', bookId: null },
];
STORES.forEach((st, i) => {
  (['MTM', 'RTW', 'BESPOKE'] as const).forEach((kind, k) => {
    const roll = (i * 7 + k * 3) % 10;
    if (roll === 9) return;                                   // never sent
    const sent = addDays(TODAY, -int(2, 24));
    const received = roll < 6 ? iso(addDays(sent, int(1, 5))) : null;   // ~60% confirmed
    swatchBooks.push({ id:`bk-${st.id}-${kind}`, storeId: st.id, kind, edition: BOOK_EDITION, copies: kind === 'BESPOKE' ? 1 : BIG_STORES.has(st.id) ? 2 : 1, from: kind === 'BESPOKE' ? pick(bespokeMills) : 'unit', dispatchedOn: iso(sent), receivedOn: received,
      trackingNo: `${int(10, 99)}${int(100000000, 999999999)}` });   // the tracker's column; the numbers are placed
  });
});

/* one store holds all three books, confirmed — the finished row of the store matrix */
{ const st = STORES[0]; (['MTM', 'RTW', 'BESPOKE'] as const).forEach(kind => {
  const b = swatchBooks.find(x => x.storeId === st.id && x.kind === kind);
  if (b) { b.receivedOn = b.receivedOn ?? iso(addDays(new Date(b.dispatchedOn), 3)); }
  else swatchBooks.push({ id:`bk-${st.id}-${kind}`, storeId: st.id, kind, edition: BOOK_EDITION, copies: kind === 'BESPOKE' ? 1 : 2, from: kind === 'BESPOKE' ? pick(bespokeMills) : 'unit', dispatchedOn: iso(addDays(TODAY, -12)), receivedOn: iso(addDays(TODAY, -9)), trackingNo: `${int(10, 99)}${int(100000000, 999999999)}` }); }); }

/* ---------- trims & packaging, bought in bulk and held at the unit ---------- */
const trimVendors = VENDORS.filter(v => v.kind === 'Trims');
const committedFor = (name: string) => orders.filter(o => o.status === 'Open' || o.status === 'Allocated')
  .reduce((a, o) => a + (o.materials ?? []).filter(m => !m.issuedOn && o.bom[m.bomIndex]?.item === name).reduce((b, m) => b + m.requiredQty, 0), 0);
const trims: TrimItem[] = TRIM_MASTER.map((t, k) => {
  const committed = committedFor(t.name);
  const threshold = Math.max(500, Math.round(committed * 0.3 / 100) * 100);
  const low = t.name === 'Button' || t.name === 'Courier Bag' || t.name === 'Flasher';   // running down
  return { id:`trim-${k}`, name:t.name, kind:t.kind, unit:'pc', costPer:t.costPer, threshold,
    stock: committed + Math.round(threshold * (low ? 0.55 + r() * 0.3 : 2 + r())),
    vendorId: trimVendors.length ? pick(trimVendors).id : null,
    incoming: t.name === 'Courier Bag' ? threshold * 3 : 0,                    // one already on order
    lastOrderedOn: iso(addDays(TODAY, -int(6, 40))) };
});

/* ---------- concepts — idea to sellable, at every gate --------------------------
   Names and fabrics are the Fabric Ordering sheet's; the stages are the ones
   discovery described. Dates are placed. */
const concepts: Concept[] = [];
const byCode = (code: string) => fabrics.find(f => f.code === code)!;
const emptyEnigma = () => ({ template: null, consumptionBase: null, consumptionBuffer: null, options: [] as string[], configuredOn: null, by: null });
const round = (gate: 'pp' | 'shipment', n: number, daysBack: number, decision: 'pending' | 'resubmit' | 'approved', comments: Concept['rounds'][number]['comments'] = []): Concept['rounds'][number] =>
  ({ gate, round: n, submittedOn: iso(addDays(TODAY, -daysBack)), reviewedOn: decision === 'pending' ? null : iso(addDays(TODAY, -daysBack + 1)), reviewedBy: decision === 'pending' ? null : 'Kunal', comments, decision });
const concept = (c: Partial<Concept> & Pick<Concept, 'id' | 'name' | 'kind' | 'brief' | 'raisedBy' | 'raisedOn'>): Concept =>
  ({ spec: null, designs: [], swatch: null, online: null, baseFabricId: null, fabricOptions: [], optionsSentOn: null, fabricId: null, blockId: null, fabricPo: null, factoryId: null, patSentOn: null, rounds: [], approvalSentOn: null, approvalBy: null, enigma: emptyEnigma(), naming: { oldName: c.name, newName: null, mrp: null, setOn: null }, liveOn: null, ...c });
const daysBack = (n: number) => iso(addDays(TODAY, -n));
/* 1 · idea only, three weeks old — nothing captured it until now */
concepts.push(concept({ id:'cn-1', name:'Band collar on Cotton Poplin', kind:'construction', brief:'Kala Ghoda and Khan Market both asked for a band collar on the formal poplins — the Mandarin sells on bespoke but is not on the MTM sheet.', raisedBy:'Kunal', raisedOn: daysBack(22), spec:'Mandarin · French placket · Single button', baseFabricId: byCode('NOSUPOSOWH-1405').id }));
/* 2 · new fabric, with sourcing — a swatch is in, no price yet */
{ const f = byCode('NOMBDOSOLI-1533'); f.onHold = true; f.cpm = null; concepts.push(concept({ id:'cn-2', name: f.name, kind:'new-fabric', brief:'Light-blue dobby for FORMAL VOL.1 — the vendor swatch came with the July lot; the book has two gaps at the light end.', raisedBy:'Janak', raisedOn: daysBack(12), fabricId: f.id, factoryId:'richman', patSentOn: daysBack(6) })); }
/* 3 · fabric priced, PAT with the factory off the swatch yardage, no PP sample back yet — nothing blocked or bought */
{ const f = byCode('NOAHPLSTGR-1455'); f.onHold = true; f.cpm = f.cpm ?? 312;
  concepts.push(concept({ id:'cn-3', name: f.name, kind:'new-fabric', brief:'Grey linen-lyocell stripe for FORMAL VOL.2 — the vendor showed it at the July meeting; approved shade at the 21 Aug design meeting.', raisedBy:'Kunal', raisedOn: daysBack(34), fabricId: f.id, factoryId:'ayaan', patSentOn: daysBack(11) })); }
/* 4 · PP round 1 came back with majors; round 2 on the desk for four days */
{ concepts.push(concept({ id:'cn-4', name:'Cutaway collar · Giza Poplin', kind:'construction', brief:'Cutaway is the most requested collar change on alteration orders — three a week — and every one is a remake today.', raisedBy:'Yulette', raisedOn: daysBack(40), spec:'Cutaway · French placket · Two button', baseFabricId: byCode('NOSUOXSTBR-1410').id, factoryId:'mahendra', patSentOn: daysBack(24),
  rounds: [round('pp', 1, 15, 'resubmit', [{ area:'Construction', text:'Collar points sit 8 mm too wide against the PAT; band height fine', major:true }, { area:'Fit', text:'Sleeve length as spec', major:false }]), round('pp', 2, 4, 'pending')] })); }
/* 5 · stuck at the shipment gate — nine days, nobody has looked */
{ const f = byCode('NOMBPLCHMI-1453'); f.onHold = true; f.cpm = f.cpm ?? 268;
  concepts.push(concept({ id:'cn-5', name: f.name, kind:'new-fabric', brief:'Madras check for CASUAL VOL.1 — the Blue & Grey replaces the discontinued green madras. The vendor holds 135 m; nothing is blocked until the shipment sample clears.', raisedBy:'Kunal', raisedOn: daysBack(70), fabricId: f.id, factoryId:'ayaan', patSentOn: daysBack(38),
  rounds: [round('pp', 1, 28, 'approved', [{ area:'Fabric handling', text:'Check matching at the placket — hold in bulk', major:false }]), round('shipment', 1, 9, 'pending')] })); }
/* 5b · a concept through its gates and waiting on the decision that actually
   spends money: three mills have quoted the same check, design picks the shade
   and, with it, the cheque — the MOQ at that mill's rate. */
{ const c = concept({ id:'cn-9', name:'Washed Cotton Check - Ink & Sand', kind:'new-fabric',
    brief:'A darker check for CASUAL VOL.1 — the book has nothing between the madras and the solids, and Kala Ghoda has asked twice.',
    raisedBy:'Kunal', raisedOn: daysBack(64), factoryId:'mahendra', patSentOn: daysBack(44),
    rounds: [round('pp', 1, 34, 'approved', [{ area:'Fabric handling', text:'Check matches at the placket; keep the same repeat in bulk', major:false }]), round('shipment', 1, 15, 'approved')],
    approvalSentOn: daysBack(9), approvalBy:'Kunal' });
  concepts.push(c);
  const opt = (k: number, vendorId: string, name: string, article: string, cpm: number, moq: number, comp: string, note: string) =>
    ({ id:`cfo-cn9-${k}`, fabricId: null, name, vendorId, vendorCode: article, composition: comp, widthIn: 58,
       book:'CASUAL SHIRTS - VOL.1', cpm, moq, leadDays: V(vendorId).leadDays, holdUntil: iso(addDays(TODAY, [12, 5, 26][k])), note,
       selected: false, chosenBy: null, chosenOn: null, rationale:'' });
  /* one vendor against the concept — sourcing's first pick was withdrawn when the mill would not hold */
  c.fabricOptions = [
    { ...opt(1, 'sutra', 'Washed Check - Ink & Sand', '0921/4', 244, 200, '100% Cotton', 'a shade lighter in the ink; cheaper a metre, but the MOQ is 200 m'), rejected: { by:'Sreekanth', on: daysBack(5), reason:'withdrawn by sourcing — the mill would not hold' } },
    opt(0, 'mpb', 'Washed Cotton Check - Ink & Sand', 'MB-4471', 268, 120, '100% Cotton', 'the swatch the sample was made on'),
  ];
  c.optionsSentOn = daysBack(3); }

/* 5c · a second concept at the decision, with one mill already thrown out —
   design rejected the deeper indigo, so two live offers are left to choose from */
{ const c = concept({ id:'cn-10', name:'Brushed Herringbone - Charcoal', kind:'new-fabric',
    brief:'A winter-weight herringbone for FORMAL VOL.2 — the book has nothing brushed, and Delhi asks for it every November.',
    raisedBy:'Janak', raisedOn: daysBack(52), factoryId:'richman', patSentOn: daysBack(36),
    rounds: [round('pp', 1, 26, 'approved'), round('shipment', 1, 12, 'approved')],
    approvalSentOn: daysBack(6), approvalBy:'Kunal' });
  concepts.push(c);
  const opt = (k: number, vendorId: string, name: string, article: string, cpm: number, moq: number, note: string, rejected?: string) =>
    ({ id:`cfo-cn10-${k}`, fabricId: null, name, vendorId, vendorCode: article, composition:'100% Brushed Cotton', widthIn: 58,
       book:'FORMAL SHIRTS - VOL.2', cpm, moq, leadDays: V(vendorId).leadDays, holdUntil: iso(addDays(TODAY, [14, 4, 21][k])), note,
       selected: false, chosenBy: null, chosenOn: null, rationale:'',
       rejected: rejected ? { by:'Kunal', on: daysBack(1), reason: rejected } : null });
  c.fabricOptions = [
    opt(0, 'nandlal', 'Brushed Herringbone - Charcoal', 'VENICE D164', 289, 150, 'the swatch the samples were made on'),
    opt(1, 'infitex', 'Brushed Herringbone - Graphite', 'PORTOFINO 220', 264, 200, 'cheaper, but the brush is lighter and the hold runs out first'),
    opt(2, 'athena', 'Herringbone Flannel - Charcoal', 'ATH-5521', 355, 100, 'flannel rather than brushed twill', 'too heavy for a shirt — this is jacketing weight'),
  ];
  c.optionsSentOn = daysBack(2); }

/* 6 · approved a week ago, still not configured in Enigma — the gap between the email and the customer */
{ concepts.push(concept({ id:'cn-6', name:'Mitred cuff · Cotton Twill', kind:'construction', brief:'Mitred cuff was dropped from the sheet in 2024; bespoke customers keep asking for it back.', raisedBy:'Janak', raisedOn: daysBack(58), spec:'Prince Charlie · Standard placket · Mitred', baseFabricId: byCode('NOSUTWSOLI-1450').id, factoryId:'richman', patSentOn: daysBack(45),
  rounds: [round('pp', 1, 36, 'approved'), round('shipment', 1, 22, 'resubmit', [{ area:'Stitching', text:'Mitre corner puckers on two of five pieces', major:true }]), round('shipment', 2, 12, 'approved')], approvalSentOn: daysBack(7), approvalBy:'Kunal' })); }
/* 7 · approved, bulk blocked and bought, configured — waiting on a name and price. The bible's REVISED NAME row NCSOTWO000-11: working name "Wrinkle Free Evercrest Twill Shirt" */
{ addFabric({ code:'NCSOTWO000-11', name:'Wrinkle-Free Bamboo-Blend - Lavender', bucket:'NON_CORE', family:'Twill', vendorId:'athena', international:false, thresholdMetres:7, vendorCode:null, composition:'Bamboo-blend twill', widthIn:58, cpm:420, mrp:4790, swatchBook:'FORMAL SHIRTS - VOL.2' });
  const f = fabrics[fabrics.length - 1]; f.onHold = true;
  const b7 = { id:'blk-cn7', fabricName:`${f.name} · Athena`, vendorId:'athena', metres: 200, agreedOn: daysBack(19), expiresOn: daysBack(19 - 60), via:'email' as const, status:'converted' as const }; blocks.unshift(b7);
  concepts.push(concept({ id:'cn-7', name:'Wrinkle Free Evercrest Twill Shirt', kind:'new-fabric', brief:'Lavender to complete the wrinkle-free bamboo range — seven core shades live, the book has a gap at the cool end.', raisedBy:'Kunal', raisedOn: daysBack(88), fabricId: f.id, blockId: b7.id, fabricPo: { on: daysBack(16), metres: 200 }, factoryId:'ayaan', patSentOn: daysBack(52),
  rounds: [round('pp', 1, 40, 'approved'), round('shipment', 1, 26, 'approved')], approvalSentOn: daysBack(20), approvalBy:'Kunal',
  enigma: { template:'Shirt · standard', consumptionBase: 1.6, consumptionBuffer: 0.15, options:['French Charlie', 'Button Down', 'Single button', 'Standard placket'], configuredOn: daysBack(9), by:'Janak' } })); }
/* 8 · live three weeks — the bible's REVISED NAME row CONVHOO000-06: "Grey Stone Houndstooth Shirt" → "Houndstooth Shirt - Light Grey" ₹2,990 */
{ addFabric({ code:'CONVHOO000-06', name:'Houndstooth - Light Grey', bucket:'CORE', family:'Dobby', vendorId:'nihal', international:false, thresholdMetres:7, vendorCode:null, composition:'100% cotton', widthIn:58, cpm:310, mrp:2990, swatchBook:'CASUAL SHIRTS VOL.1' });
  const f = fabrics[fabrics.length - 1]; f.onHold = false;
  const b8 = { id:'blk-cn8', fabricName:`${f.name} · Nihalchand`, vendorId:'nihal', metres: 400, agreedOn: daysBack(49), expiresOn: daysBack(49 - 60), via:'call' as const, status:'converted' as const }; blocks.unshift(b8);
  concepts.push(concept({ id:'cn-8', name:'Grey Stone Houndstooth Shirt', kind:'new-fabric', brief:'Houndstooth range — six shades for the casual book; light grey is the anchor.', raisedBy:'Janak', raisedOn: daysBack(120), fabricId: f.id, blockId: b8.id, fabricPo: { on: daysBack(46), metres: 400 }, factoryId:'mahendra', patSentOn: daysBack(84),
  rounds: [round('pp', 1, 70, 'approved'), round('shipment', 1, 55, 'approved')], approvalSentOn: daysBack(50), approvalBy:'Kunal',
  enigma: { template:'Shirt · standard', consumptionBase: 1.6, consumptionBuffer: 0.15, options:['French Charlie', 'Prince Charlie', 'Cutaway', 'French placket', 'Standard placket'], configuredOn: daysBack(40), by:'Janak' },
  naming: { oldName:'Grey Stone Houndstooth Shirt', newName:'Houndstooth Shirt - Light Grey', mrp: 2990, setOn: daysBack(32) }, liveOn: daysBack(21) }));
  STORES.forEach((st, i) => swatchDispatches.push({ id:`sw-cn8-${st.id}`, fabricId: f.id, storeId: st.id, dispatchedOn: daysBack(26), confirmedOn: i % 6 === 4 ? null : daysBack(int(19, 24)) })); }
/* the approval that already went out, as the post it now is */
threads.push({ id:'t-cn6', kind:'concept', subjectId:'cn-6', comments: [
  say(7, 'Kunal', 'design', 'Mitred cuff · Cotton Twill cleared the shipment sample (round 2). @planning @production @warehouse @store — approved for production. Construction: Prince Charlie · Standard placket · Mitred. Trainer: this post is the knowledge-repository entry; nothing to retype.', 'Approval'),
  say(2, 'Aarav Mehta', 'store', 'Customers are asking already — when does it show on the order sheet? @janak', 'Enigma'),
] });
threads.push({ id:'t-cn5', kind:'concept', subjectId:'cn-5', comments: [
  say(8, 'Nitin Singh', 'production', 'Shipment sample from Ayaan reached the unit yesterday, 5 pcs. @kunal it needs your eyes — M.P. Brothers has 135 m of this and two other buyers asking; the block only goes on once you approve.', 'Shipment sample'),
] });

/* ---------- files already on records — the ones that live in Drive and WhatsApp today (metadata only; bytes are not seeded) ---------- */
const att = (kind: Attachment['kind'], subjectId: string, label: string, name: string, size: number, mime: string, by: string, daysBackN: number, step: string | null = null): Attachment =>
  ({ id:`att-seed-${subjectId}-${name}`, kind, subjectId, label, step, name, size, mime, by, at: daysBack(daysBackN), stored: false });
const openPo = orders.find(o => o.status === 'Open' && o.category === 'RTW CMT shirts')!;
const attachments: Attachment[] = [
  att('concept', 'cn-3', 'PAT file', 'LinenLyocell_Stripe_Grey_PAT_v1.dxf', 412_300, 'application/dxf', 'Janak', 11),
  att('concept', 'cn-3', 'Fabric swatch image', 'USS-S-M-Grey-swatch.jpg', 1_240_000, 'image/jpeg', 'Sreekanth', 30),
  att('concept', 'cn-4', 'CAD / pattern', 'Cutaway_collar_block_v2.plt', 96_400, 'application/octet-stream', 'Janak', 24),
  att('concept', 'cn-4', 'Sample photo', 'PP1_collar_points_8mm.jpg', 2_100_000, 'image/jpeg', 'Nitin Singh', 15, 'PP round 1'),
  att('concept', 'cn-4', 'Green slip', 'GreenSlip_PP1_Cutaway.pdf', 88_000, 'application/pdf', 'Kunal', 14, 'PP round 1'),
  att('concept', 'cn-4', 'Sample photo', 'PP2_front.jpg', 1_900_000, 'image/jpeg', 'Nitin Singh', 4, 'PP round 2'),
  att('concept', 'cn-5', 'Sample photo', 'Madras_shipment_sample_x5.jpg', 2_600_000, 'image/jpeg', 'Nitin Singh', 9, 'Shipment round 1'),
  att('concept', 'cn-6', 'Tech pack', 'Mitred_cuff_techpack_v3.pdf', 1_450_000, 'application/pdf', 'Janak', 8),
  att('concept', 'cn-6', 'Approval note', 'Approval_MitredCuff_Twill.pdf', 62_000, 'application/pdf', 'Parag', 7),
  att('order', openPo.id, 'Tech pack', `${openPo.styleName.replace(/[^A-Za-z0-9]+/g, '_')}_techpack.pdf`, 1_800_000, 'application/pdf', 'Janak', 30),
  att('order', openPo.id, 'Job card', `${openPo.jobCardNo?.replace(' ', '_') ?? 'BOM'}_jobcard.xlsx`, 44_000, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Sreekanth', 28),
  att('fabric', fabrics.find(f => f.bucket === 'BESPOKE')!.id, 'Mill stock sheet', 'Leggiuno_stock_11Sep.xlsx', 210_000, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Shravani', 1),
  att('fabric', byCode('NOMBPLCHMI-1453').id, 'Block confirmation', 'MPBrothers_B-608_hold_email.pdf', 71_000, 'application/pdf', 'Sreekanth', 45),
  att('fabric', byCode('NOMBPLCHMI-1453').id, 'Swatch image', 'B-608_madras.jpg', 980_000, 'image/jpeg', 'Sreekanth', 52),
  att('launch', 'ln-aug-0', 'Key pointers', 'Aug26_drops_key_pointers.pdf', 130_000, 'application/pdf', 'Charanjeet', 50),
  att('launch', 'ln-aug-0', 'Display allocation sheet', 'Display_Fit_Sample_Allocation_Aug26.xlsx', 15_000, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Charanjeet', 48),
  ...(returns[1] ? [att('return', returns[1].id, 'Photo', 'chest_fit_40.jpg', 1_500_000, 'image/jpeg', 'Aarav Mehta', 2)] : []),
  ...(extraFabric[1] ? [att('extraFabric', extraFabric[1].id, 'Photo of damage', 'yarn_pull_front_panel.jpg', 1_300_000, 'image/jpeg', `${V(extraFabric[1].factoryId).name} merchandiser`, 1)] : []),
];

/* ---------- RTW before sourcing: prototypes, shortlists, tech packs, trims cover ----
   The requirement-stage styles show every state of the proto gate; a quoting
   style carries a shortlist sourcing has not picked from; PO-raised styles have
   their trims covered or short. */
{
  const rtwReq = orders.filter(o => o.status === 'Requirement' && o.fabricNominated);
  const proto = (o: ProductionOrder, rounds: { back: number; decision: 'pending' | 'resubmit' | 'approved'; comments?: SampleRound['comments'] }[], standIn: string) => {
    o.proto = { standIn, skipped: null, rounds: rounds.map((r, i) => ({ round: i + 1, submittedOn: daysBack(r.back), reviewedOn: r.decision === 'pending' ? null : daysBack(Math.max(0, r.back - 2)), reviewedBy: r.decision === 'pending' ? null : 'Kunal', comments: r.comments ?? [], decision: r.decision })) };
  };
  /* 0 · ready to send: proto approved, shortlist of three, tech pack on */
  if (rtwReq[0]) { const o = rtwReq[0];
    proto(o, [{ back: 12, decision: 'resubmit', comments: [{ area:'Fit', text:'Chest 2 cm tight on 40 — open the side seam', major: true }] }, { back: 5, decision: 'approved', comments: [{ area:'Construction', text:'Placket stitch 1/16 in — carry into the tech pack', major: false }] }], 'white poplin off the shelf');
    o.fabricShortlist = [
      { id:'sl-a', look:'Cotton oxford', composition:'100% cotton', colour:'Sky blue', referenceFabricId: null, note:'first choice if under ₹340/m' },
      { id:'sl-b', look:'Cotton dobby', composition:'100% cotton', colour:'Sky blue', referenceFabricId: null, note:'if oxford minimum is over 400 m' },
      { id:'sl-c', look:'Cotton-linen chambray', composition:'70/30 cotton linen', colour:'Light blue', referenceFabricId: null, note:'only if the hand is close to the proto' },
    ];
    attachments.push(att('order', o.id, 'Tech pack', `${o.styleName.replace(/[^A-Za-z0-9]+/g, '_')}_techpack_v2.pdf`, 1_620_000, 'application/pdf', 'Janak', 3));
    o.activity.unshift({ at: daysBack(3), who:'Kunal', what:'Prototype approved on round 2' });
  }
  /* 1 · proto on design's desk */
  if (rtwReq[1]) proto(rtwReq[1], [{ back: 6, decision: 'pending' }], 'grey chambray from the fit-sample shelf');
  /* 2 · sent back, the unit owes another */
  if (rtwReq[2]) proto(rtwReq[2], [{ back: 9, decision: 'resubmit', comments: [{ area:'Pattern', text:'Collar stand 5 mm too tall — reads formal', major: true }, { area:'Fit', text:'Sleeve length fine', major: false }] }], 'off-white poplin');
  /* 3 · none needed — a repeat */
  if (rtwReq[3]) { const o = rtwReq[3]; o.proto = { standIn: null, rounds: [], skipped: { by:'Kunal', on: daysBack(2), reason:'repeat of the AW25 style — pattern and sizes unchanged' } }; }
  /* quoting styles: one shortlist not yet picked, one picked */
  const quoting = orders.filter(o => o.status === 'Quoting' && o.fabricNominated);
  if (quoting[0]) { const o = quoting[0]; o.fabricShortlist = [
      { id:'sl-q1', look: o.fabricBrief?.look ?? 'Cotton twill', composition: o.fabricBrief?.composition ?? '100% cotton', colour: o.fabricBrief?.colour ?? 'Olive', referenceFabricId: null, note:'as briefed' },
      { id:'sl-q2', look:'Brushed cotton twill', composition:'100% cotton', colour: o.fabricBrief?.colour ?? 'Olive', referenceFabricId: null, note:'warmer hand — fine if the price holds' } ];
    o.proto = { standIn:'navy poplin', skipped: null, rounds: [{ round: 1, submittedOn: daysBack(16), reviewedOn: daysBack(14), reviewedBy:'Kunal', comments: [], decision:'approved' }] }; }
  if (quoting[1]) { const o = quoting[1]; o.fabricShortlist = [
      { id:'sl-p1', look: o.fabricBrief?.look ?? 'Cotton poplin', composition: o.fabricBrief?.composition ?? '100% cotton', colour: o.fabricBrief?.colour ?? 'White', referenceFabricId: null, note:'' },
      { id:'sl-p2', look:'Cotton satin', composition:'100% cotton', colour: o.fabricBrief?.colour ?? 'White', referenceFabricId: null, note:'' } ];
    o.fabricPick = { shortlistId:'sl-p1', by:'Sreekanth', on: daysBack(4), why:'satin minimum was 600 m; poplin holds at ₹310/m for 21 days' };
    o.proto = { standIn: null, skipped: { by:'Kunal', on: daysBack(20), reason:'minor variant of a live style — collar only' }, rounds: [] }; }
  /* every style past the requirement carries an approved proto, so the record reads whole */
  orders.filter(o => o.status !== 'Requirement' && !o.proto).forEach((o, i) => { o.proto = i % 5 === 0 ? { standIn: null, rounds: [], skipped: { by:'Kunal', on: daysBack(40), reason:'repeat style' } } : { standIn:'poplin from the shelf', skipped: null, rounds: [{ round: 1, submittedOn: daysBack(45), reviewedOn: daysBack(43), reviewedBy:'Kunal', comments: [], decision:'approved' }] }; });
  /* ---- the RTW loop as Nitin runs it: proposals, the PO with its documents, the cloth at the factory, cut ratios ---- */
  {
    const factoriesAll = VENDORS.filter(v => v.kind.endsWith('factory') && v.kind !== 'Hemming unit');
    const docFor = (o: ProductionOrder, label: string, back: number) => { if (!attachments.some(a => a.subjectId === o.id && a.label === label)) attachments.push(att('order', o.id, label, `${o.styleName.replace(/[^A-Za-z0-9]+/g, '_')}_${label.replace(/[^A-Za-z0-9]+/g, '_').toLowerCase()}.pdf`, int(120_000, 2_400_000), 'application/pdf', 'Janak', back)); };
    const loopRows = orders.filter(o => sourcingModeOf(o) !== 'fob-nominated');
    /* with production: one proposal with design, one sent back, one accepted, the rest to propose */
    const quoting = loopRows.filter(o => o.status === 'Quoting');
    quoting.forEach((o, i) => { const f = factoriesAll[i % factoriesAll.length]; const over = i % 2 === 0;
      if (i === 0) o.factoryProposals = [{ id:`fp-${o.id}-1`, vendorId: f.id, quotedCost: Math.round(o.targetCost * 1.18), estimatedInhouse: iso(addDays(o.targetInhouse, 12)), note:'best they can do with the current load', proposedOn: daysBack(2), by:'Nitin Singh', decision: null }];
      else if (i === 1) o.factoryProposals = [{ id:`fp-${o.id}-1`, vendorId: f.id, quotedCost: Math.round(o.targetCost * 1.35), estimatedInhouse: iso(addDays(o.targetInhouse, 20)), note:'', proposedOn: daysBack(5), by:'Nitin Singh', decision: { by:'Kunal', on: daysBack(4), accepted: false, comment:'Too costly and three weeks late — try Golden Seams, or hold them to ₹' + Math.round(o.targetCost * 1.05) } }];
      else if (i === 2) o.factoryProposals = [{ id:`fp-${o.id}-1`, vendorId: f.id, quotedCost: Math.round(o.targetCost * 1.3), estimatedInhouse: iso(addDays(o.targetInhouse, 15)), note:'', proposedOn: daysBack(9), by:'Nitin Singh', decision: { by:'Kunal', on: daysBack(8), accepted: false, comment:'Over budget' } }, { id:`fp-${o.id}-2`, vendorId: factoriesAll[(i + 2) % factoriesAll.length].id, quotedCost: Math.round(o.targetCost * (over ? 1.04 : 0.98)), estimatedInhouse: iso(addDays(o.targetInhouse, -2)), note:'second factory, agreed on the call', proposedOn: daysBack(3), by:'Nitin Singh', decision: { by:'Kunal', on: daysBack(1), accepted: true, comment:'Go ahead' } }];
      if (i < 3) { docFor(o, 'Tech pack', 6); if (i !== 1) docFor(o, 'Job card', 5); } });
    /* legacy "Allocated" rows read as accepted, PO still to raise */
    loopRows.filter(o => o.status === 'Allocated').forEach((o, i) => { const f = factoriesAll[(i + 1) % factoriesAll.length]; o.factoryProposals = [{ id:`fp-${o.id}-1`, vendorId: f.id, quotedCost: Math.round(o.targetCost * 1.02), estimatedInhouse: iso(addDays(o.targetInhouse, -3)), note:'', proposedOn: daysBack(4), by:'Nitin Singh', decision: { by:'Kunal', on: daysBack(2), accepted: true, comment:'' } }]; docFor(o, 'Tech pack', 4); docFor(o, 'Job card', 4); if (i % 2) docFor(o, 'Trim card', 3); });
    /* open POs: the proposal that won, the PO with its documents, the cloth */
    /* the MTM factories also stitch bulk shirts — Nitin's floor is not only the RTW vendors */
    loopRows.filter(o => (o.status === 'Open' || o.status === 'Closed') && o.category === 'RTW CMT shirts').forEach((o, i) => { if (i % 3 === 0) { o.vendorId = ['mahendra', 'richman', 'harsh'][(i / 3) % 3]; if (o.sampleVendorId) o.sampleVendorId = o.vendorId; } });
    loopRows.filter(o => o.status === 'Open' && o.vendorId && o.poDate).forEach((o, i) => {
      const age = daysAgo(o.poDate!);
      o.factoryProposals = [{ id:`fp-${o.id}-1`, vendorId: o.vendorId!, quotedCost: o.finalFob ?? Math.round(o.targetCost * 1.05), estimatedInhouse: o.targetInhouse, note:'', proposedOn: iso(addDays(o.poDate!, -3)), by:'Nitin Singh', decision: { by:'Kunal', on: iso(addDays(o.poDate!, -1)), accepted: true, comment:'' } }];
      const full = i % 5 !== 2; docFor(o, 'Tech pack', age + 1); if (full) { docFor(o, 'Job card', age + 1); docFor(o, 'Trim card', age); }
      o.factoryPo = { raisedOn: o.poDate!, by:'Kunal', docsSent: full ? ['Tech pack', 'Job card', 'Trim card', 'BOM'] : ['Tech pack', 'BOM'], docsMissing: full ? [] : ['Job card', 'Trim card'] };
      if (!o.fabricNominated) return;
      const need = o.fabricMetres ?? Math.ceil((o.costing.consumption ?? 1.6) * o.orderQty); o.fabricMetres = need;
      const k = i % 9;
      /* the fabric loop runs beside the factory loop: some open POs still have no fabric PO — a vendor to put, or one with design */
      if (age <= 3 || k === 7) { o.fabricSupply = null; o.sourcing = { stage: k === 7 ? 'design-choice' : 'vendors', submittedOn: k === 7 ? iso(addDays(o.poDate!, -1)) : null, extension: null, fabricPo: null };
        o.fabricQuotes = k === 7 ? o.fabricQuotes.slice(0, 1).map(q => ({ ...q, selected: false, vendorCode: `ART-${1000 + i}` })) : []; o.fabricVendorId = null; o.enigmaCode = null; o.fabricBlocked = null; o.vendorFabricCode = null; return; }
      if (!o.sourcing?.fabricPo) { o.sourcing = { stage:'po-raised', submittedOn: iso(addDays(o.poDate!, -4)), extension: null, fabricPo: { no:`FPO #${2400 + i}`, on: iso(addDays(o.poDate!, -2)), metres: need } }; }
      if (!o.fabricVendorId) { const q = o.fabricQuotes.find(x => x.selected) ?? o.fabricQuotes[0]; if (q) { o.fabricVendorId = q.vendorId; o.costing.cpm = o.costing.cpm ?? q.cpm; } }
      o.fabricBlocked = o.fabricBlocked ?? need;
      if (k === 6) { o.fabricSupply = { boughtOn: o.sourcing!.fabricPo!.on, sentToFactoryOn: null, metresSent: null, receipt: null }; return; }
      if (k === 5) { o.fabricSupply = { boughtOn: o.sourcing!.fabricPo!.on, sentToFactoryOn: iso(addDays(o.poDate!, 6)), metresSent: need, receipt: null }; return; }
      if (k === 4) { const okm = Math.round(need * 0.82); o.fabricSupply = { boughtOn: iso(addDays(o.poDate!, 2)), sentToFactoryOn: iso(addDays(o.poDate!, 6)), metresSent: need, receipt: { on: iso(addDays(o.poDate!, 8)), by: o.merchant ?? 'Nitin Singh', metresOk: okm, metresDamaged: Math.round(need * 0.1), note:'two rolls water-stained' } };
        o.cutRatios = [{ askedOn: iso(addDays(o.poDate!, 8)), by:'Nitin Singh', reason:`fabric short by ${need - okm} m — two rolls damaged`, originalBreakup: o.sizeBreakup.map(x => ({ ...x })), given: null, sentToFactoryOn: null }]; return; }
      if (k === 3) { const okm = Math.round(need * 0.88); const orig = o.sizeBreakup.map(x => ({ ...x })); const nb = o.sizeBreakup.map(x => ({ size: x.size, qty: Math.floor(x.qty * 0.88) }));
        o.fabricSupply = { boughtOn: iso(addDays(o.poDate!, 2)), sentToFactoryOn: iso(addDays(o.poDate!, 6)), metresSent: need, receipt: { on: iso(addDays(o.poDate!, 8)), by: o.merchant ?? 'Nitin Singh', metresOk: okm, metresDamaged: 0, note:'mill sent less than the PO' } };
        o.cutRatios = [{ askedOn: iso(addDays(o.poDate!, 8)), by:'Nitin Singh', reason:`fabric short by ${need - okm} m — mill sent less`, originalBreakup: orig, given: { on: iso(addDays(o.poDate!, 9)), by:'Kunal', breakup: nb }, sentToFactoryOn: k === 3 && i % 2 ? iso(addDays(o.poDate!, 9)) : null }]; o.sizeBreakup = nb; o.cutQty = nb.reduce((a, x) => a + x.qty, 0); return; }
      o.fabricSupply = { boughtOn: iso(addDays(o.poDate!, 2)), sentToFactoryOn: iso(addDays(o.poDate!, 5)), metresSent: need, receipt: { on: iso(addDays(o.poDate!, 7)), by: o.merchant ?? 'Nitin Singh', metresOk: need, metresDamaged: 0, note:'' } };
    });
  }
  /* trims cover: signed off on most open POs; two still short */
  orders.filter(o => o.fabricNominated && o.sourcing?.fabricPo && (o.status === 'Allocated' || o.status === 'Open')).forEach((o, i) => { if (i % 4 !== 1) o.materialsCovered = { on: daysBack(int(3, 20)), by:'Sreekanth' }; });
}


/* one live split: the factory can ship 60% now, the rest in ten days */
{ const cand = orders.find(o => o.status === 'Open' && o.orderQty >= 300 && !o.milestones.find(m => m.key === 'Dispatch')?.actual && o.milestones.some(m => m.key === 'Cutting Start' && m.actual)) ?? orders.find(o => o.status === 'Open' && o.orderQty >= 300 && !o.milestones.find(m => m.key === 'Dispatch')?.actual);
  if (cand) { const first = Math.round(cand.orderQty * 0.6); const soon = iso(addDays(TODAY, 2)); const later = iso(addDays(TODAY, 12));
    cand.split = { at: iso(addDays(TODAY, -1)), by:'Parag', reason:'Size 42 and 44 fabric roll short at the factory — balance after the second roll lands', lots:[{ qty: first, dispatchOn: soon, dispatched: false }, { qty: cand.orderQty - first, dispatchOn: later, dispatched: false }] };
    const inh = cand.milestones[cand.milestones.length - 1]; if (inh && !inh.actual) { inh.revised = later; inh.delayReason = `Split dispatch — ${cand.orderQty - first} pcs balance by ${new Date(later).toLocaleDateString('en-IN')}`; }
    cand.activity.unshift({ at: iso(addDays(TODAY, -1)), who:'Parag', what:`Split dispatch agreed with factory · ${first} now, ${cand.orderQty - first} by ${new Date(later).toLocaleDateString('en-IN')}` }); } }

/* BSC keeps international fabrics in core too — Leggiuno, Albini, Fabriano
   linens that sell every week. Enigma's auto-PO reaches only domestic mills, so
   these are the ones Planning rebuilds in Excel each week and raises by hand;
   the "international-core Excel" is exactly this list. */
fabrics.filter(f => f.international && f.bucket === 'NON_CORE').slice(0, 6).forEach((f, i) => {
  f.bucket = 'CORE'; f.thresholdMetres = 3; f.promotedOn = iso(addDays(TODAY, -int(40, 400)));
  f.weeklySalesShirts = f.weeklySalesShirts.map(n => n + int(4, 14));
  if (i % 2 === 0) { f.stockMetres = int(20, 90); f.incomingMetres = 0; }   // some are already under the line, waiting on a person
});

/* ---------- Enigma's Vendor Information — once per mill ---------- */
VENDORS.filter(v => v.kind.endsWith('mill')).forEach((v, i) => {
  const intl = v.kind === 'International mill';
  v.enigma = { vendorCode: `${VCODE[v.id] ?? v.name.slice(0, 2).toUpperCase()}-${String(100 + i).padStart(3, '0')}`, country: intl ? (v.location.split(',').pop()?.trim() ?? 'Italy') : 'India', description: `${v.name} · ${v.location}`, currency: intl ? 'EUR' : 'INR', tatHours: v.leadDays * 24,
    vendorType: 'FABRIC', address: intl ? `${v.location}` : `${pick(['12', '41', '7', '118', '23'])}, ${pick(['Kalbadevi', 'Mangaldas Market', 'Swadeshi Market', 'Lower Parel', 'Dadar West'])}, ${v.location} 4000${pick(['02', '13', '28', '01'])}`,
    officePhone: intl ? `+${pick(['39 031', '44 20', '86 512', '34 93'])} ${int(100000, 999999)}` : `+91 22 ${int(2200, 2899)} ${int(1000, 9999)}`, officeEmail: `${pick(['sales', 'orders', 'info', 'export'])}@${v.name.toLowerCase().replace(/[^a-z]+/g, '').slice(0, 12)}.com`,
    active: i % 9 !== 8, categories: intl ? ['Fabric', 'Bespoke'] : ['Fabric'] };
});

/* ---------- Enigma's fabric master — the attribute block its Edit Fabric Info screen shows ---------- */
fabrics.forEach((f, i) => {
  const v = V(f.vendorId); const comp = f.composition ?? '100% cotton'; const words = f.name.split(' ');
  const weave = ['Poplin', 'Twill', 'Oxford', 'Dobby', 'Herringbone', 'Plain'].find(w => f.name.includes(w)) ?? (/linen/i.test(comp) ? 'Plain' : 'Poplin');
  const pattern = ['Stripes', 'Checks', 'Print'].find(w => f.name.includes(w)) ?? 'Solid';
  f.category = 'Shirts'; f.productType = 'Fabric';
  f.mill = { country: v.enigma?.country ?? 'India', description: v.enigma?.description ?? v.name, currency: v.kind === 'International mill' ? 'EUR' : 'INR', costPerUnit: f.cpm ?? null, tatHours: v.leadDays * 24, moq: f.bucket === 'CORE' ? 300 : f.bucket === 'NON_CORE' ? 150 : 1, mills: v.name };
  f.attrs = { panna: f.widthIn ?? null, bigChecked: pattern === 'Checks' && i % 3 === 0, threadCount: /2-ply|100s/.test(comp) ? '100s' : /linen/i.test(comp) ? '40s' : '60s', ply: /2-ply/i.test(comp) ? '2-Ply' : 'Single', wrinkleResistance: /linen/i.test(comp) ? 'Wrinkle Prone' : i % 4 === 0 ? 'Wrinkle Resistant' : 'Easy Iron', stretch: i % 7 === 0 ? 'Mechanical Stretch' : 'No Stretch',
    consumedIn: 'Shirts', construction: weave === 'Oxford' ? 'Basket' : 'Plain', compositionFamily: /linen/i.test(comp) ? 'Linen blend' : /lyocell/i.test(comp) ? 'Cotton-lyocell' : /2-ply|100s/.test(comp) ? 'Giza / 2-ply' : 'Cotton', washed: i % 5 === 0, washcare: 'Machine wash cold · do not bleach · iron medium',
    weightClass: /linen|oxford/i.test(f.name) ? 'Medium' : 'Light', weaveDescription: `${weave} weave`, pattern, colour: words.slice(words.indexOf('-') + 1).join(' ') || null, contrastFabric: false, piping: false, isCutroll: f.bucket === 'BESPOKE', isUniform: false, weave };
  f.inventory = { warehouse: 'Dadar unit', thresholdMetres: f.thresholdMetres, maxMetres: f.bucket === 'CORE' ? 600 : f.bucket === 'NON_CORE' ? 250 : null, autoReplenish: f.bucket === 'CORE' && !f.international, bins: f.bucket === 'BESPOKE' ? [] : [{ bin: `R${1 + (i % 9)}-${String.fromCharCode(65 + (i % 6))}`, metres: f.stockMetres }] };
  if (i % 11 === 0 && f.bucket !== 'BESPOKE') f.transactions = [{ on: iso(addDays(TODAY, -int(2, 20))), orderNo: null, poId: null, type: 'ADJUSTMENT', by: 'Shravani', warehouse: 'Dadar unit', bin: f.inventory.bins[0]?.bin ?? null, reason: pick(['Physical count', 'Damaged roll', 'Shade variation']), desc: pick(['count differed from the system by one roll', 'end of roll water-stained', 'last 6 m off-shade — cut for samples']), metres: -pick([4, 6, 12]) }];
});

/* ---------- core stock status — sourcing's weekly supplier check ------------ */
fabrics.filter(f => f.bucket === 'CORE').forEach((f, i) => {
  const r = (i * 7919) % 100;
  if (r < 12) { f.supply = null; return; }                                                  // slipped this week's review
  const reviewedOn = iso(addDays(TODAY, -int(0, 6)));
  if (r < 78) f.supply = { status:'ok', reviewedOn, by:'Sreekanth', note:'', backOn:null };
  else if (r < 90) { f.supply = { status:'delayed', reviewedOn, by:'Sreekanth', note: pick(['Mill: dyeing backlog, dispatch a week past commitment', 'Greige not in — supplier pushed by 10 days', 'Finishing plant shut for two days, will slip']), backOn: iso(addDays(TODAY, int(6, 14))) }; if (r < 84) f.onHold = true; }
  else { f.supply = { status:'out', reviewedOn, by:'Sreekanth', note: pick(['Supplier says the shade is discontinued — sampling a substitute', 'Run out at the mill; next weave in 3 weeks', 'Yarn shortage — no committed date yet']), backOn: r < 95 ? iso(addDays(TODAY, int(15, 30))) : null }; if (r < 94) f.onHold = true; }
});
/* the long block — most core has one; two were promoted recently and sourcing has not yet spoken to the mill; one block is running out */
fabrics.filter(f => f.bucket === 'CORE').forEach((f, i) => {
  const r = (i * 4241) % 100;
  if (r < 8) { f.promotedOn = iso(addDays(TODAY, -int(2, 12))); f.coreBlock = null; return; }
  const years = chance(.6) ? 1 : 2;
  const agreed = r < 16 ? addDays(TODAY, -(365 * years - int(10, 45))) : addDays(TODAY, -int(30, 365 * years - 90));
  const until = addDays(agreed, 365 * years);
  f.coreBlock = { agreedOn: iso(agreed), until: iso(until), metresPerMonth: [200, 300, 400, 500][i % 4], via: pick(['email', 'whatsapp', 'call'] as const), by:'Sreekanth', note: years === 2 ? 'Two-year hold, price fixed for the first year' : 'One year, price reviewed at renewal' };
});
/* a couple came back in stock but nobody switched them on again */
/* two fabrics design has paused — nothing wrong with the cloth, design does not want it sold */
fabrics.filter(f => f.bucket === 'CORE' && f.supply?.status === 'ok' && !f.onHold).slice(2, 4).forEach((f, i) => { f.paused = { at: iso(addDays(TODAY, -int(2, 20))), by:'Kunal', note: i === 0 ? 'Shade being retired at the end of the book — do not take new orders' : 'Two fit complaints on this weave; holding it until the next sample' }; });
fabrics.filter(f => f.bucket === 'CORE' && f.supply?.status === 'ok').slice(0, 2).forEach(f => { f.onHold = true; f.supply = { ...f.supply!, note:'Back in stock — 600 m received on Tuesday' }; });

/* Enigma's auto-PO, modelled rather than described: a domestic core fabric that
   fell under its reorder point had the PO fired for it automatically, usually
   days ago. A few fell under the line today and are waiting for tonight's run,
   and the international ones wait for a person — which is the whole point. */
fabrics.filter(f => f.bucket === 'CORE' && !f.international && !(f.incomingMetres ?? 0)).forEach(f => {
  const v = V(f.vendorId); const c = coverageOf(f, v.leadDays, v);
  if (c.belowRop && chance(.7)) f.incomingMetres = c.suggestedPo;
});

/* ---------- fabric POs — one per fabric with incoming metres ------------------- */
let fpoSeq = 7040;
const fabricPos: FabricPo[] = fabrics.filter(f => (f.incomingMetres ?? 0) > 0).map(f => {
  const mill = V(f.vendorId); const raised = addDays(TODAY, -int(1, 9)); const expected = addDays(raised, mill.leadDays);
  const confirmed = chance(.6);
  const slipped = confirmed && chance(.4);
  return { id:`fpo-${f.id}`, poNo:`FPO-${++fpoSeq}`, fabricId: f.id, vendorId: f.vendorId, metres: f.incomingMetres, raisedOn: iso(raised), source: f.international ? 'manual' : 'auto',
    expectedOn: iso(slipped ? addDays(expected, int(3, 8)) : expected), vendorConfirmedOn: confirmed ? iso(addDays(raised, int(0, 2))) : null, vendorConfirmedBy: confirmed ? 'Sreekanth' : null,
    remark: slipped ? pick(['Mill says 4 days more — loom down last week', 'Shade lot changed, re-dyeing; a week more', 'Dispatching in two lots, second one late', 'Transporter strike — 3 days more']) : confirmed ? pick(['Confirmed on call', 'Confirmed by email, on schedule', '']) : '', receivedOn: null };
});

/* ---------- GRNs — one per receipt already on the record --------------------- */
const grns: Grn[] = [];
let grnSeq = 0;
const pushGrn = (g: Omit<Grn, 'id' | 'grnNo' | 'poNo' | 'financeSeenOn'> & { poNo?: string | null }) => { grnSeq++; const withPo = g.kind === 'rtw-po' || g.kind === 'fabric'; grns.push({ ...g, id:`grn-seed-${grnSeq}`, grnNo:`GRN-26-${String(grnSeq).padStart(4, '0')}`, poNo: g.poNo ?? (withPo ? g.ref : null), financeSeenOn: withPo && daysAgo(g.receivedOn) > 3 && (daysAgo(g.receivedOn) > 12 || chance(.7)) ? iso(addDays(new Date(g.receivedOn), int(1, 3))) : null }); };
orders.filter(o => o.receipts?.length).forEach(o => o.receipts.forEach(rcpt => pushGrn({ kind:'rtw-po', ref: o.poNo ?? o.id, refLabel: o.styleName, vendorId: o.vendorId, receivedOn: rcpt.at, by: rcpt.by, qty: rcpt.qty, unit:'pc', rejected: rcpt.rejected, invoiceNo: daysAgo(rcpt.at) > 21 || chance(.55) ? `INV-${int(1000, 9999)}` : null, remarks: rcpt.note })));
fabricPos.filter(p => p.receivedOn).forEach(p => { const f = fabrics.find(x => x.id === p.fabricId); pushGrn({ kind:'fabric', ref: p.poNo, refLabel: f?.name ?? p.fabricId, vendorId: p.vendorId, receivedOn: p.receivedOn!, by:'Shravani', qty: p.metres, unit:'m', rejected: 0, invoiceNo: (daysAgo(p.receivedOn!) > 21 || chance(.6)) ? `${V(p.vendorId).name.split(' ')[0].toUpperCase().slice(0, 4)}/${int(100, 999)}` : null, remarks: '' }); });
customerOrders.filter(o => o.bespoke?.inwardOn).forEach(o => { const f = fabrics.find(x => x.id === o.fabricId); pushGrn({ kind:'bespoke-parcel', ref: o.bespoke!.code, refLabel: `${f?.name ?? 'bespoke'} · ${o.orderNo}`, vendorId: f?.vendorId ?? null, receivedOn: o.bespoke!.inwardOn!, by:'Shravani', qty: o.consumptionM ?? 0, unit:'m', rejected: 0, invoiceNo: null, remarks: '' }); });
/* the vehicle round: one GRN per factory per day for the pieces that came back */
{ const byDay = new Map<string, CustomerOrder[]>();
  customerOrders.filter(o => o.kind === 'MTM' && o.scans.some(sc => sc.stage === 'rts')).forEach(o => { const sc = o.scans.find(x => x.stage === 'rts')!; const k = `${sc.at.slice(0, 10)}|${o.factoryId}`; byDay.set(k, [...(byDay.get(k) ?? []), o]); });
  [...byDay.entries()].sort().forEach(([k, list]) => { const [day, fid] = k.split('|'); pushGrn({ kind:'mtm-round', ref:`round · ${V(fid).name}`, refLabel:`${list.length} finished MTM piece${list.length === 1 ? '' : 's'}`, vendorId: fid, receivedOn: `${day}T03:00:00.000Z`, by:'Shravani', qty: list.length, unit:'pc', rejected: 0, invoiceNo: null, remarks: '' }); }); }
transfers.filter(t => t.closedOn).forEach(t => pushGrn({ kind:'store-inward', ref: t.stoNo, refLabel: `${t.stoNo} · ${t.styleName} → ${STORES.find(s => s.id === t.toStoreId)?.name}`, vendorId: null, storeId: t.toStoreId, receivedOn: t.closedOn!, by:`${STORES.find(s => s.id === t.toStoreId)?.name} store`, qty: t.qty, unit:'pc', rejected: 0, invoiceNo: null, remarks: t.stoType }));
grns.sort((a, b) => b.receivedOn.localeCompare(a.receivedOn));

/* ---------- fit samples — most stores hold the full set; a few pieces are worn, missing, or still in the post ---------- */
const fitSamples: FitSample[] = [];
STORES.forEach((st, i) => FIT_SAMPLE_FITS.forEach((fit, fi) => FIT_SAMPLE_SIZES.forEach((size, si) => {
  const roll = (i * 5 + fi * 3 + si * 7) % 97;
  if (roll === 0) return;                                                   // never sent
  const sent = addDays(TODAY, -int(20, 200));
  fitSamples.push({ id:`fit-${st.id}-${fit}-${size}`, storeId: st.id, fit, size, dispatchedOn: iso(sent), receivedOn: roll === 1 ? null : iso(addDays(sent, int(2, 5))), state: roll === 2 ? 'worn' : roll === 3 ? 'missing' : 'ok' });
})));

/* ---------- a renamed fabric — the code stayed, the label moved, both on the record ----------
   Design renamed the light-blue dobby when the book was reprinted; every screen
   keys on NOMBDOSOLI-1533 and shows the new name with "formerly" beside it. */
{ const f = fabrics.find(x => x.code === 'NOMBDOSOLI-1533'); if (f) { f.nameHistory = [{ name: f.name, until: daysBack(21), by:'Kunal', note:'renamed for the FORMAL VOL.1 reprint — "Dobby" read as a weave, not a shade' }]; f.name = 'Sky Dobby - Light Blue'; } }

/* ---------- option requests — a category and a number, mid-flight ----------
   The winter shirt ask: ten options. Sourcing has filled six slots so far;
   design has settled two (PO out), closed one, has two on its desk, one is
   waiting on an extension, and four are still with sourcing. That spread is
   the point — seven of ten going live is how these requests actually end. */
const optionRequests: OptionRequest[] = [];
{
  const off = (idx: number, k: number, vendorId: string, name: string, article: string, cpm: number, moq: number, comp: string, note: string, holdDays: number, extra: Partial<ConceptFabricOption> = {}): ConceptFabricOption =>
    ({ id:`off-r1-${idx}-${k}`, fabricId: null, name, vendorId, vendorCode: article, composition: comp, widthIn: 58, book:'CASUAL SHIRTS - VOL.1',
       cpm, moq, leadDays: V(vendorId).leadDays, holdUntil: iso(addDays(TODAY, holdDays)), note, selected: false, chosenBy: null, chosenOn: null, rationale:'', rejected: null, extensionAsked: null, ...extra });
  const slot = (index: number, note: string, status: RequestOption['status'], offers: ConceptFabricOption[], extra: Partial<RequestOption> = {}): RequestOption =>
    ({ id:`orq-1-o${index}`, index, note, status, offers, sentOn: status === 'open' ? null : daysBack(4), extension: null, closed: null, fabricId: null, fabricPoId: null, ...extra });

  /* two slots already settled: the cloth is on the master and the PO is out */
  const settled = (index: number, note: string, vendorId: string, name: string, article: string, cpm: number, moq: number, comp: string, metres: number) => {
    addFabric({ code:`NO${V(vendorId).name.slice(0, 2).toUpperCase()}${name.replace(/[^A-Za-z]/g, '').slice(0, 6).toUpperCase()}-${1700 + index}`, name, bucket:'NON_CORE', family: /check/i.test(name) ? 'Checks' : 'Twill', vendorId, international: false, thresholdMetres: 7, vendorCode: article, composition: comp, widthIn: 58, cpm, mrp: null, swatchBook:'CASUAL SHIRTS - VOL.1' });
    const f = fabrics[fabrics.length - 1]; f.onHold = true; f.incomingMetres = metres;
    const po = { id:`fpo-r1-${index}`, poNo:`FPO-${++fpoSeq}`, fabricId: f.id, vendorId, metres, raisedOn: daysBack(2), source:'manual' as const, expectedOn: iso(addDays(TODAY, V(vendorId).leadDays - 2)), vendorConfirmedOn: null, vendorConfirmedBy: null, remark:`REQ-001 option ${index} · RTW CMT shirts · chosen by Kunal at ₹${cpm}/m · article ${article}`, receivedOn: null };
    fabricPos.unshift(po);
    const chosen = off(index, 0, vendorId, name, article, cpm, moq, comp, 'the swatch the meeting liked', 30, { fabricId: f.id, selected: true, chosenBy:'Kunal', chosenOn: daysBack(2), rationale:'hand and shade both right' });
    return slot(index, note, 'po-raised', [chosen], { fabricId: f.id, fabricPoId: po.id });
  };

  optionRequests.push({
    id:'orq-1', reqNo:'REQ-001', category:'RTW CMT shirts',
    brief:'Winter casual shirts — ten options for the November drop: brushed, checks, a dark solid or two. The book is thin above the poplins and Delhi asks for weight every October.',
    raisedBy:'Kunal', raisedOn: daysBack(18), liveBy:'Nov 26', targetCost: 620, optionCount: 10,
    options: [
      settled(1, 'a brushed check, dark', 'nandlal', 'Brushed Check - Ink & Rust', 'VENICE D170', 289, 150, '100% Brushed Cotton', 300),
      settled(2, 'plain twill, charcoal', 'mpb', 'Cotton Twill - Charcoal', 'MB-4490', 254, 120, '100% Cotton', 250),
      slot(3, 'a lighter check for the south stores', 'with-design', [
        off(3, 0, 'parekh', 'Washed Check - Sky & Sand', 'PC-2801', 271, 100, '100% Cotton', 'the swatch the meeting liked', 11),
      ]),
      /* design threw the first vendor out; sourcing came back with a second */
      slot(4, 'herringbone, any dark shade', 'with-design', [
        off(4, 0, 'athena', 'Herringbone Flannel - Charcoal', 'ATH-5521', 355, 100, '100% Cotton', 'flannel rather than brushed twill', 21, { rejected: { by:'Kunal', on: daysBack(3), reason:'jacketing weight — too heavy for a shirt' } }),
        off(4, 1, 'nandlal', 'Brushed Herringbone - Charcoal', 'VENICE D164', 289, 150, '100% Brushed Cotton', 'the swatch the sample was made on', 14),
      ]),
      slot(5, 'a dobby with texture', 'extension', [
        off(5, 0, 'sutra', 'Cotton Dobby - Slate', '0944/1', 276, 150, '100% Cotton', 'the hold lapsed while the lab dip was awaited', -2, { extensionAsked: { by:'Kunal', on: daysBack(1) } }),
      ], { extension: { askedOn: daysBack(1), by:'Kunal', note:'Sutra: want the lab dip in hand before committing', resolvedOn: null } }),
      slot(6, 'corduroy, fine wale', 'closed', [
        off(6, 0, 'athena', 'Fine Wale Corduroy - Moss', 'ATH-5590', 388, 150, '100% Cotton', 'the only fine wale anyone had', 12),
      ], { closed: { by:'Kunal', on: daysBack(3), reason:'₹388/m puts it over the target cost — drop the slot, seven is fine' } }),
      slot(7, 'a dark solid, not black', 'open', []),
      slot(8, 'a second check, lighter weight', 'open', []),
      slot(9, 'something with a wash-down look', 'open', []),
      slot(10, 'wildcard — whatever the mills are excited about', 'open', []),
    ],
    bom: [
      { kind:'fabric', item:'Shell fabric', spec:'per option — see slots', qtyPerPc: 1.6, unit:'m' },
      { kind:'trim', item:'Buttons', spec:'Corozo, 4-hole, 16L, tonal', qtyPerPc: 11, unit:'pc' },
      { kind:'trim', item:'Main label', spec:'Woven, BSC winter', qtyPerPc: 1, unit:'pc' },
      { kind:'trim', item:'Collar band interlining', spec:'Fusible, 90 gsm', qtyPerPc: 0.12, unit:'m' },
      { kind:'packaging', item:'Polybag + tissue', spec:'compostable', qtyPerPc: 1, unit:'set' },
    ],
  });
  /* the detailed ask design wrote for each option */
  { const r = optionRequests.find(x => x.id === 'orq-1'); const A = (look: string, composition: string | null, colour: string | null, weightGsm: number | null, maxCpm: number | null, notes: string) => ({ look, composition, colour, weightGsm, referenceFabricId: null, maxCpm, notes });
    const asks: Record<number, ReturnType<typeof A>> = {
      1: A('Brushed twill check', '100% cotton, brushed both sides', 'ink navy and rust', 150, 300, 'a check you can see across the store; hand must feel warm, not fuzzy'),
      2: A('Plain twill', '100% cotton', 'charcoal, not black', 140, 270, 'the base winter shirt — holds a crease, takes a collar stay'),
      3: A('Lightweight check', '100% cotton', 'sky and sand, soft contrast', 110, 280, 'for Bangalore, Hyderabad and Chennai — winter there is mild'),
      4: A('Herringbone', 'cotton, brushed or flannel', 'charcoal or deep navy', 150, 300, 'shirt weight — not jacketing; the swatch the sample was made on is the reference'),
      5: A('Dobby with texture', '100% cotton', 'slate or graphite', 130, 290, 'the texture has to show from a metre away; lab dip before committing'),
      6: A('Fine wale corduroy', '100% cotton', 'moss or olive', 180, 330, 'only if it fits the target cost'),
      7: A('Solid oxford or twill', '100% cotton', 'bottle green or burgundy — a dark solid that is not black', 140, 280, 'one colour the book does not have yet'),
      8: A('Check, lighter weight', 'cotton or cotton-linen', 'blue family', 115, 270, 'a second check for stores that sell lighter shirts in winter'),
      9: A('Garment-washed twill or oxford', '100% cotton', 'muted — faded indigo, stone', 135, 290, 'the wash-down look must be in the cloth, not added at the factory'),
      10: A('Wildcard', null, null, null, 300, 'whatever the mills are excited about this season — send two swatches if you have them'),
    };
    r?.options.forEach(o => { o.ask = asks[o.index] ?? null; }); }
}

/* ---------- a request's bought cloth is a concept too — that is how it reaches the swatch desk ------ */
optionRequests.forEach(r => r.options.filter(o => o.status === 'po-raised' && o.fabricId).forEach(o => {
  if (concepts.some(c => c.fabricId === o.fabricId)) return;
  const f = fabrics.find(x => x.id === o.fabricId)!; const chosen = o.offers.find(x => x.selected);
  concepts.push(concept({ id:`cn-${r.reqNo.toLowerCase()}-o${o.index}`, name: f.name, kind:'new-fabric',
    brief:`${r.reqNo} · option ${o.index}${o.note ? ` — ${o.note}` : ''}. ${r.brief}`, raisedBy: r.raisedBy, raisedOn: r.raisedOn,
    book: chosen?.book ?? null, targetMonth: r.liveBy ?? null, fabricId: f.id, fabricPo: { on: daysBack(2), metres: fabricPos.find(p => p.id === o.fabricPoId)?.metres ?? 300 },
    approvalSentOn: daysBack(2), approvalBy:'Kunal', naming: { oldName: f.name, newName: null, mrp: null, setOn: null } }));
}));

/* ---------- the swatch desk, the designs on each fabric, the online track ------
   One fabric, several designs (the product master's rows); the warehouse's six
   dates between the cloth landing and the stores showing it; online two weeks
   after stores on the one that is live. */
{
  let seq = 4200;
  const STYLES = ['Boardroom', 'Half Sleeve', 'Band Collar', 'Kurta', 'Popover'];
  const design = (c: Concept, name: string, cat: 'Formal' | 'Casual', mrp: number, on: string): void => { const k = (c.designs ?? []).length; const live = !!c.liveOn;
    c.designs = [...(c.designs ?? []), { id:`dsn-${c.id}-${seq}`, code:`BOM-SHI-${cat === 'Formal' ? 'FM' : 'CS'}-${seq++}`, name, finalName: live && k === 0 ? (c.naming.newName ?? null) : null, style: STYLES[k % STYLES.length], category: cat, mrp, cost: Math.round(mrp * 0.36 / 10) * 10,
      description: k === 0 ? `${name} in ${c.name.replace(/ - .*$/, '')} — cut for the ${cat === 'Formal' ? 'boardroom' : 'weekend'}.` : null, buzzwords: k === 0 ? (/wrinkle|bamboo/i.test(c.name) ? 'wrinkle-free, breathable' : /linen/i.test(c.name) ? 'breathable, summer weight' : 'soft hand, easy care') : null,
      enigmaOn: live ? on : (k === 0 ? on : null), liveOn: live ? c.liveOn : null, setOn: on, by:'Sreekanth' }]; };
  const shirtNames = (base: string) => [`${base} Shirt`, `${base} Shirt - Half Sleeve`, `${base} Band Collar Shirt`, `${base} Kurta Shirt`, `${base} Popover`];
  concepts.filter(c => c.kind === 'new-fabric' && c.liveOn).forEach(c => {
    const live = c.liveOn!; const d = (n: number) => iso(addDays(live, -n)); const base = (c.naming.newName ?? c.name).replace(/ Shirt.*$/, '');
    c.swatch = { inwardOn: d(16), handoverOn: d(14), priority: true, cutOn: d(11), stickerOn: d(10), dispatchedOn: d(9), photosOn: d(9), storesToldOn: d(1) };
    const cat: 'Formal' | 'Casual' = /casual|check|madras|linen/i.test(c.name) ? 'Casual' : 'Formal';
    shirtNames(base).slice(0, 5).forEach((n, k) => design(c, n, cat, (c.naming.mrp ?? 2990) + [0, -300, 200, 500, 300][k], d(12)));
    c.enigma.largeCheck = /check|madras/i.test(c.name); c.enigma.compositionFamily = /linen/i.test(c.name) ? 'Linen blend' : 'Cotton';
    c.online = { photosOn: iso(addDays(live, 3)), videoOn: iso(addDays(live, 7)), postOn: iso(addDays(live, 11)), liveOn: daysAgo(live) >= 14 ? iso(addDays(live, 14)) : null };
  });
  /* the ones still on the desk — three different places on it */
  concepts.filter(c => c.kind === 'new-fabric' && !c.liveOn && c.fabricPo).forEach((c, k) => {
    const w = k % 3; const base = c.name.replace(/ - .*$/, '');
    c.swatch = w === 0 ? { inwardOn: daysBack(3), handoverOn: null, priority: true, cutOn: null, stickerOn: null, dispatchedOn: null, photosOn: null, storesToldOn: null }
      : w === 1 ? { inwardOn: daysBack(6), handoverOn: daysBack(5), priority: false, cutOn: daysBack(2), stickerOn: null, dispatchedOn: null, photosOn: null, storesToldOn: null }
      : { inwardOn: daysBack(9), handoverOn: daysBack(8), priority: false, cutOn: daysBack(5), stickerOn: daysBack(4), dispatchedOn: daysBack(2), photosOn: daysBack(2), storesToldOn: null };
    if (w !== 0) shirtNames(base).slice(0, w === 1 ? 2 : 3).forEach((n, i2) => design(c, n, 'Formal', 2990 + i2 * 300, daysBack(4)));
  });
}
/* ---------- how the cloth is bought: BSC buys it for every bulk style (no FOB — Riddhiman, 3 Oct 2026) ---------- */
orders.forEach(o => { o.sourcingMode = 'bsc-buys'; o.fabricNominated = true; o.fobNomination = null; });

/* ---------- one worked example with everything on it ----------------------
   The Design requirements screen opens on four examples, and one of them has
   to show what "done" looks like: brief written, cloth bought on a PO, factory
   allocated, PP sample approved, materials in and issued, QC released, costing
   closed, and launched into the stores. Take the most complete Closed style
   that BSC bought the cloth for, and finish anything the sheets left blank. */
{
  const filled = (o: ProductionOrder) => [o.fabricBrief, o.sourcing?.fabricPo, o.vendorId, o.samples.length, o.materials.length, o.finalFob, o.qcAudits.length, o.costingClosure.actual].filter(Boolean).length;
  const shirt = (o: ProductionOrder) => /shirt/i.test(o.category) ? 1 : 0;   // a shirt company's worked example is a shirt
  const done = orders.filter(o => o.status === 'Closed' && o.fabricNominated && o.vendorId && o.sourcing?.fabricPo).sort((a, b) => shirt(b) - shirt(a) || filled(b) - filled(a))[0]
    ?? orders.filter(o => o.status !== 'Requirement' && o.fabricNominated).sort((a, b) => filled(b) - filled(a))[0];
  if (done) {
    const h = new Date(done.styleHandover);
    done.fabricBrief = done.fabricBrief ?? { look:'2-ply poplin', composition:'100% cotton', colour:'White', weightGsm: 120, referenceFabricId: null, notes:'the reference is the core white poplin; same hand, tighter weave' };
    if (!done.samples.some(x => x.decision === 'approved')) done.samples.push({ round: done.samples.length + 1, submittedOn: iso(addDays(h, 18)), reviewedOn: iso(addDays(h, 20)), reviewedBy:'Kunal', comments: [{ area:'Fabric handling', text:'Collar band a touch soft — keep the fused band in bulk', major:false }], decision:'approved' });
    done.materials = done.materials.length ? done.materials : defaultMaterials(done);
    done.materials.forEach((m, k) => { m.receivedOn = m.receivedOn ?? iso(addDays(h, 24 + k)); m.checked = 'ok'; m.issuedOn = m.issuedOn ?? iso(addDays(h, 27 + k)); });
    done.fabricReady = true; done.trimsReady = true;
    done.finalFob = done.finalFob ?? Math.round((done.costing.cpm ?? 320) * (done.costing.consumption ?? 1.6) + (done.costing.cmp ?? 180));
    done.costingClosure.actual = done.costingClosure.actual ?? iso(addDays(h, 12));
    if (!done.qcAudits.some(q => q.released)) done.qcAudits.push({ at: iso(addDays(h, 48)), by:'BSC QC · Vishnu', checked: Math.round(done.orderQty * .2), passed: Math.round(done.orderQty * .2) - 1, issues:'one loose button, corrected on the line', released: true });
    done.milestones.forEach(m => { m.actual = m.actual ?? m.revised ?? m.plan; });
    done.deliveredQty = done.deliveredQty ?? done.orderQty;
    /* it launched in the August drop */
    const ln = launches.find(l => l.launchedOn && !l.orderId) ?? launches.find(l => l.launchedOn);
    if (ln) { ln.orderId = done.id; ln.styleName = done.styleName; ln.marketingName = done.styleName; }
    done.activity.push({ at: iso(addDays(h, 50)), who:'Charanjeet', what:'Launched in the August drop · all stores' });
  }
}

/* one open PO with every milestone landed — made, packed, only the delivery to
   log — so the tracker's open tab has a finished example too */
{ const o = orders.filter(o => o.status === 'Open' && o.milestones.length > 0).sort((a, b) => b.milestones.filter(m => m.actual).length - a.milestones.filter(m => m.actual).length)[0];
  if (o) { let last = o.poDate ? new Date(o.poDate) : addDays(TODAY, -40);
    o.milestones.forEach(m => { if (!m.actual) { last = addDays(last, 4); if (last > TODAY) last = addDays(TODAY, -1); m.actual = iso(last); m.delayReason = null; } else last = new Date(m.actual) > last ? new Date(m.actual) : last; });
    o.fabricReady = true; o.trimsReady = true;
    o.activity.push({ at: iso(addDays(TODAY, -1)), who: o.merchant ?? 'Production', what: 'Packed and ready · delivery to the unit to log' }); } }

/* Bills: a customer often buys several pieces in one visit — two shirts and a
   trouser on one bill. Pieces punched by the same customer at the same store on
   the same day share a bill; Pali Hill gets one three-piece bill for certain. */
{ const key = (o: CustomerOrder) => `${o.storeId}|${o.customer}|${o.punchedOn.slice(0, 10)}`; const bills = new Map<string, string>();
  customerOrders.forEach(o => { const k = key(o); if (!bills.has(k)) bills.set(k, `BILL-${o.orderNo.replace(/\D/g, '')}`); o.billNo = bills.get(k)!; });
  const plh = customerOrders.filter(o => o.storeId === 'plh' && !['delivered', 'cancelled'].includes(o.stage)).slice(0, 3);
  if (plh.length === 3) { const [a, b, c] = plh; b.customer = a.customer; c.customer = a.customer; b.punchedOn = a.punchedOn; c.punchedOn = a.punchedOn; b.billNo = a.billNo; c.billNo = a.billNo;
    if (c.kind === 'MTM' && b.kind === 'MTM' && a.kind === 'MTM') { const rtw = customerOrders.find(o => o.storeId === 'plh' && o.kind === 'RTW' && o.stage === 'punched'); if (rtw) { rtw.customer = a.customer; rtw.punchedOn = a.punchedOn; rtw.billNo = a.billNo; } } }
}

/* the demo store's delivered off-the-shelf pieces can be swapped: the next size
   up and down of that style is on the Pali Hill shelf */
customerOrders.filter(o => o.storeId === 'plh' && o.kind !== 'MTM' && o.stage === 'delivered' && o.optionId).forEach(o => {
  const opt = options.find(x => x.id === o.optionId); if (!opt || !o.size) return;
  const i = opt.sizes.indexOf(o.size); [opt.sizes[i - 1], opt.sizes[i + 1]].filter(Boolean).forEach(sz => { opt.stockBySize[sz] = Math.max(opt.stockBySize[sz] ?? 0, 40); });
});

/* ---------- RTW planning reviews (8 Oct 2026) ----------
   One review from six weeks ago, already sent to design and now a "no PO yet" row
   on the tracker, so the next sitting has something to compare against. */
const planningReviews: PlanningReview[] = (() => {
  const out: PlanningReview[] = [];
  const live = options.filter(x => !x.inactive && Object.values(x.stockBySize).reduce((a, b) => a + b, 0) >= 40 && x.weeklySales.slice(-4).reduce((a, b) => a + b, 0) >= 12);
  const req = orders.find(o => o.status === 'Open' && o.poNo && live.some(x => x.styleName.toLowerCase() === o.styleName.toLowerCase()));
  const opt = req ? live.find(x => x.styleName.toLowerCase() === req.styleName.toLowerCase()) : null;
  if (req && opt) {
    const last4 = opt.weeklySales.slice(-10, -6); const obs = last4.reduce((a, b) => a + b, 0) / Math.max(1, last4.length);
    const plan = Math.round(obs * 1.2 * 10) / 10;
    out.push({ id:'pr-seed-1', optionId: opt.id, styleName: opt.styleName, kind: opt.core ? 'core' : 'non-core', on: iso(addDays(TODAY, -42)), by:'Swati', status:'sent',
      observedRos: Math.round(obs * 10) / 10, planRos: plan, planReason:'festive weeks ahead — the last four were lean', leadWeeks: 8, coverWeeksTarget: 12,
      usableNow: Object.values(opt.stockBySize).reduce((x, y) => x + y, 0), reserve: 0, projectedAtArrival: Math.max(0, Math.round(Object.values(opt.stockBySize).reduce((x, y) => x + y, 0) - plan * 8)),
      draftQty: req.orderQty - 16, displayExtra: 0, moq: 200, approvedQty: req.orderQty, constraintNote:'factory cuts in multiples of 20',
      draftRatio: req.sizeBreakup, approvedRatio: req.sizeBreakup, approvedOn: iso(addDays(TODAY, -41)), approvedBy:'Swati', requirementId: req.id, note:'' });
  }
  return out;
})();
/* every store transfer says why the pieces go */
transfers.forEach((t, i) => { t.purpose = t.stoType === 'Display' || /display/i.test(t.remarks) ? 'display' : /fit|trial|sample/i.test(`${t.stoType} ${t.remarks}`) ? 'trial' : i % 7 === 0 ? 'display' : 'off-rack'; });

/* store manager, 13 Oct 2026: a factory shut for two days — production moved the ship-by on its open pieces */
(() => { const shut = customerOrders.filter(o => o.kind === 'MTM' && o.factoryId === 'topnotch' && ['in-transit', 'in-factory'].includes(o.stage)).slice(0, 6);
  shut.forEach(o => { const to = iso(addDays(new Date(o.promisedOn), 2)); o.promiseRevisions = [{ at: iso(addDays(TODAY, -1)), by: 'Vishnu', from: o.promisedOn, to, reason: 'TopNotch shut for two days — power work on the floor' }]; o.promisedOn = to; }); })();

/* store manager, 14 Oct 2026: Pali Hill sold the window piece of a launched style — the window reads −1 until an order brings one */
(() => { const ln = launches.find(l => l.launchedOn && l.pieces.some(p => p.storeId === 'plh' && p.kind === 'display' && p.receivedOn)); const opt = ln ? options.find(o => o.id === ln.optionId) : null;
  if (opt) { const sz = ln!.pieces.find(p => p.storeId === 'plh' && p.kind === 'display')!.size;
    customerOrders.unshift({ id:'co-display-plh', orderNo:'BSC-73099', storeId:'plh', kind:'RTW', billNo:'BILL-73099', customer:'R. Mehta', styleName: opt.styleName, fabricId: null, optionId: opt.id, fit: null, size: sz, hemLength: null, qty: 1,
      punchedOn: iso(addDays(TODAY, -2)), promisedOn: iso(addDays(TODAY, -2)), stage:'delivered', remarks:'customer wanted the one in the window', soldDisplay: true, tag:'normal', planId: null, factoryId: null, consumptionM: null,
      scans:[{ stage:'delivered', at: iso(addDays(TODAY, -2)), by:'Pali Hill store' }], spec: null, measurements: null, pattern: null, revisions: [], changeSeenOn: null, changeToldFactoryOn: null, changeFactorySeenOn: null, bespoke: null } as CustomerOrder); } })();

/* sourcing's desk needs work on it: one ask design raised yesterday with no vendor yet, and one where design asked for more time */
concepts.push(concept({ id:'cn-12', name:'Olive Linen Slub', kind:'new-fabric', brief:'A slubby olive linen for LINEN SHIRTS — the book has sage and sand but nothing darker; Bandra and Khan Market both asked for it this summer.', raisedBy:'Kunal', raisedOn: iso(addDays(TODAY, -1)), book:'LINEN SHIRTS', targetMonth:'Dec 26' }));
concepts.push(concept({ id:'cn-13', name:'Chambray - Washed Indigo', kind:'new-fabric', brief:'A light chambray for CASUAL VOL.1 — the denim shirts sell out every drop and there is no lighter option beside them.', raisedBy:'Janak', raisedOn: iso(addDays(TODAY, -4)), book:'CASUAL SHIRTS VOL.1', targetMonth:'Nov 26' }));
/* the vendor board must have something to show on every new-fabric concept: where the
   seed chose the cloth straight onto the record, put that mill against it with its terms
   and a hold, marked chosen once the PO is punched */
concepts.filter(c => c.kind === 'new-fabric' && c.fabricId && !(c.fabricOptions ?? []).length).forEach((c, k) => {
  const f = fabrics.find(x => x.id === c.fabricId)!; const v = V(f.vendorId);
  c.fabricOptions = [{ id:`cfo-${c.id}-0`, fabricId: f.id, name: f.name, vendorId: f.vendorId, vendorCode: f.vendorCode ?? `ART-${1200 + k}`, composition: f.composition ?? '100% Cotton', widthIn: f.widthIn ?? 58,
    book: f.swatchBook ?? 'FORMAL SHIRTS - VOL.1', cpm: f.cpm ?? 285 + k * 7, moq: v.moq ?? 150, leadDays: v.leadDays, holdUntil: c.fabricPo ? null : iso(addDays(TODAY, [9, 14, 21, 4][k % 4])), note: '',
    selected: !!c.fabricPo, chosenBy: c.fabricPo ? 'Kunal' : null, chosenOn: c.fabricPo ? c.fabricPo.on : null, rationale: '' }];
  c.optionsSentOn = c.optionsSentOn ?? iso(addDays(new Date(c.raisedOn), 3));
});
/* design asked for more time on one of them — the mill's hold is about to lapse */
{ const c = concepts.find(x => x.id === 'cn-3')!; const q = (c.fabricOptions ?? [])[0]; if (q) { q.holdUntil = iso(addDays(TODAY, 2)); q.extensionAsked = { by:'Kunal', on: iso(addDays(TODAY, -1)) }; }
  c.optionsExtension = { askedOn: iso(addDays(TODAY, -1)), by:'Kunal', note:'need the shade matched against the approved sample before we commit — a week more', resolvedOn: null }; }

export const SEED: Db = {
  people: PEOPLE, vendors: VENDORS, orders, escalations, options, fabrics,
  ranges: RANGES.map(x => ({ family: x.family, targetOptions: x.target })),
  blocks, stores: STORES, swatchDispatches, transfers, planningReviews, returns, creditLedger, threads, customerOrders, stockRequests, launches, plans, extraFabric, factoryOutputs, swatchBooks, bookRequests, trims, concepts, attachments, fabricPos, grns, fitSamples, writeOffs, optionRequests,
};
