/* ==========================================================================
   Reference — lifted from BSC's own files, not invented.
   Every block names its source so a number can be traced back.
   ========================================================================== */

import type { GarmentCategory, Person, RoleId } from './types';

/* People named across discovery. Planning and Design are one team — the
   client said so directly — so they share a portal. */
/* One login per team. Colleagues inside a team still appear by name on the
   records they wrote — a merchandiser's scan, a designer's green slip — but the
   tool is signed into as the team that owns the decision. */
export const PEOPLE: Person[] = [
  { id:'kunal',      name:'Kunal',       role:'design',     title:'Head of design' },
  { id:'neha',       name:'Neha',        role:'planning',   title:'Chief Product Officer' },
  { id:'sreekanth',  name:'Sreekanth',   role:'sourcing',   title:'Sourcing' },
  { id:'parag',      name:'Parag',       role:'production', title:'Production & supply chain' },
  { id:'shravani',   name:'Shravani',    role:'warehouse',  title:'Warehouse — receipts, shipping, the tracker' },
  { id:'yusuf',      name:'Yusuf',       role:'warehouse',  title:'Warehouse — swatch desk: codes, stickers, cuts for every store' },
  { id:'aarav',      name:'Aarav Mehta', role:'store',      title:'Store manager' },
  { id:'nitin',      name:'Nitin Singh', role:'merchandiser', title:'Factory merchandiser · Mahendra' },
  { id:'sairam',     name:'Sairam',      role:'owner',      title:'Owner / CEO — sees every screen' },
];

export const ROLE_LABEL: Record<RoleId, string> = {
  owner:'Owner', design:'Design', planning:'Planning', sourcing:'Sourcing',
  production:'Production', warehouse:'Warehouse', store:'Store', finance:'Finance', merchandiser:'Factory merchandiser',
};

export const MERCHANDISERS = ['Nitin Singh', 'Abhin M', 'Bhupendra'];

/* ---------- the seven milestone templates ----------------------------
   Production Tracker Final V2.xlsx → Config sheet. Day offsets from PO date;
   null = the sheet's "NA" (does not apply to that category). Copied, not
   estimated. RTW CMT shirts carry no Fabric PO/ETA because the fabric is
   company-supplied; Flat Knits run knitting/interlock instead of cutting. */
export const GARMENT_CATEGORIES: GarmentCategory[] = [
  'RTW CMT shirts', 'Bottoms / Knitwear / Jackets',
  'Flat Knits (T-shirts)', 'Flat Knits (Shirts)', 'Jeans', 'Kurta',
];

export const MILESTONES = [
  'Yarn PO', 'Fabric PO', 'Yarn ETA', 'Fabric ETA', 'Trims ETA',
  'PPS Submission', 'PPS Approval', 'Size Set Sub', 'Size Set Appvl',
  'Knitting Start', 'Knitting End', 'Interlock Start', 'Interlock End',
  'Cutting Start', 'Cutting End', 'Stitching Start', 'Stitching End',
  'Finishing Start', 'Finishing End', 'FI', 'Dispatch', 'Inhouse ETA',
] as const;

const N = null;
export const OFFSETS: Record<GarmentCategory, (number | null)[]> = {
  'RTW CMT shirts':               [N, N, N, N, N,  7,  9, N,  N,  N,  N,  N,  N, 13, 17, 19, 26, 28, 30, 32, 33, 34],
  'RTW FOB shirts':               [N, 7, N, 14, 14, 7, 14, N,  N,  N,  N,  N,  N, 18, 22, 26, 33, 35, 39, 41, 42, 47],
  'Bottoms / Knitwear / Jackets': [N, 7, N, 14, 21, 7, 14, 21, 23, N,  N,  N,  N, 27, 31, 35, 49, 51, 55, 57, 58, 63],
  'Flat Knits (T-shirts)':        [7, N, 22, N, 12, 3,  5, N,  N, 24, 31, 32, 35, N,  N,  N,  N, 38, 41, 43, 44, 45],
  'Flat Knits (Shirts)':          [7, N, 22, N, 12, 3,  5, N,  N, 24, 38, 39, 46, N,  N,  N,  N, 49, 52, 54, 56, 57],
  'Jeans':                        [N, 7, N, 14, 21, 10, 17, 24, 26, N, N,  N,  N, 28, 35, 39, 54, 61, 68, 70, 72, 77],
  'Kurta':                        [N, N, N, N, N,  7,  9, N,  N,  N,  N,  N,  N, 13, 17, 19, 26, 28, 30, 32, 33, 34],
};

/* Who owns each milestone: material is sourcing's, approvals are design's,
   the floor is production's. */
export const MILESTONE_OWNER: Record<string, RoleId> = {
  'Yarn PO':'sourcing', 'Fabric PO':'sourcing', 'Yarn ETA':'sourcing', 'Fabric ETA':'sourcing', 'Trims ETA':'sourcing',
  'PPS Submission':'production', 'PPS Approval':'production', 'Size Set Sub':'production', 'Size Set Appvl':'production',   // the production unit approves samples; design is consulted on the thread
};
export const PRE_PRODUCTION = new Set(['Yarn PO', 'Fabric PO', 'Yarn ETA', 'Fabric ETA', 'Trims ETA', 'PPS Submission', 'PPS Approval', 'Size Set Sub', 'Size Set Appvl']);

/* Config sheet → Risk Thresholds. Buffer = days between the currently
   expected inhouse date and the Target Inhouse Date. */
export const RISK = { criticalBufferDays: 7, atRiskBufferDays: 10 };

/* OTIF Dashboard legend: On Time = Dispatch Actual ≤ Target Inhouse;
   In Full = Delivered within ±3% of Cut/Order Qty. */
export const OTIF_TOLERANCE = 0.03;

/* Causes named in the production walkthrough. A revised date without one of
   these is what makes a tracker untrustworthy. */
export const DELAY_REASONS = [
  'Fabric not received from mill', 'Trims short-supplied', 'PPS approval pending at production unit',
  'Factory capacity taken by another order', 'Quality rework after inline check',
  'Fabric quality rejected at inspection', 'Labour shortage at unit', 'Awaiting size-set approval',
];

/* Real category / sub-category pairs seen in the tracker's data rows. */
export const SUB_CATEGORIES: Record<GarmentCategory, string[]> = {
  'RTW CMT shirts': ['RTW CMT', 'Casual Co-ord Shirt'],
  'RTW FOB shirts': ['RTW FOB'],
  /* Trims Working sheet → Sub-Category column, Bottom / Top rows */
  'Bottoms / Knitwear / Jackets': ['Washed Chinos', 'Formal Chinos', 'Corduroy', 'Fatigue Pants', 'Linen Pants', 'Lounge Pants', 'Dress Pants', 'Knit Pants', 'Neapolitan', 'Performance Pants', 'Joggers', 'Shacket', 'Structured', 'Unstructured', 'Bundi', 'BSC x ALB', 'Soft Tailoring', 'Polo T-shirts', 'Round Neck T-shirts', 'Sweatshirts'],
  'Flat Knits (T-shirts)': ['Flat knit T-shirts'],
  'Flat Knits (Shirts)': ['Flat Knit shirts'],
  'Jeans': ['RTW Stretch Jeans', 'RTW Non-Stretch Jeans', 'Tailored 5 Pocket'],
  'Kurta': ['Short Kurta', 'Long Kurta'],
};

/* the tracker sheet's Order Qty Break-Up columns, in its order — every RTW style is entered against these */
export const RTW_SIZES = ['28', '30', '32', '34', '36', '38', '40', '42', '44', '46', '48', '50', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'] as const;
/* the sizes a category is usually cut in — only where the curve starts; any of RTW_SIZES can be used */
export const SIZE_SETS: Record<GarmentCategory, string[]> = {
  'RTW CMT shirts':               ['36', '38', '40', '42', '44', '46'],   // Replenishment Sample sku suffixes
  'RTW FOB shirts':               ['36', '38', '40', '42', '44', '46'],
  'Bottoms / Knitwear / Jackets': ['28', '30', '32', '34', '36', '38', '40', '42'],
  'Flat Knits (T-shirts)':        ['S', 'M', 'L', 'XL', '2XL'],
  'Flat Knits (Shirts)':          ['S', 'M', 'L', 'XL', '2XL'],
  'Jeans':                        ['28', '30', '32', '34', '36', '38', '40'],
  'Kurta':                        ['38', '40', '42', '44', '46'],
};

/* ---------- RTW health — the real Action & Velocity rules ---------------
   RTW_Shirts_Concise_Updated 10.xlsx → "Action & Gap Parameters" and
   "Velocity Parameters" tabs. These are BSC's own rules, reverse-engineered
   by their team from 642 rows; we run them, we do not invent alternatives. */
export const VELOCITY = [
  { grade:'A', min:10,  label:'Fastest movers' },
  { grade:'B', min:5,   label:'Strong, consistent' },
  { grade:'C', min:2,   label:'Moderate' },
  { grade:'D', min:0.1, label:'Slow' },
  { grade:'E', min:0,   label:'Not selling' },
] as const;

export const WOF_CLEAR = 30;      // 30 ≤ WOF < 55 → CLEAR / DISCOUNT
export const WOF_EXIT = 55;       // WOF ≥ 55 → EXIT
export const WOF_URGENT = 3;      // Healthy and WOF ≤ 3 → URGENT REPLENISH
export const MID_SIZES = new Set(['40', '41', '42', '32', '34', 'M', 'L']);

/* RTW shirts sub-categories and ideal option counts — the plan the client
   said starts from an "ideal option count", which is the root of over-buy. */
export const RTW_SUBCATS: { sub1: string; sub2: string; core: boolean; ideal: number | null; coreIdeal: number | null }[] = [
  /* shirts — RTW_Shirts_Concise "ROS & Health Summary": Ideal count core + non-core; Option Count Summary "x N" */
  { sub1:'Casual Solid',            sub2:'Casual Solid',            core:true,  ideal:35, coreIdeal:10 },   // 10 core + 25 non-core
  { sub1:'Formal Solid',            sub2:'Formal Solid',            core:true,  ideal:28, coreIdeal:10 },   // 10 + 18 — "1. Solids x 28"
  { sub1:'Casual Checks + Stripes', sub2:'Casual Checks + Stripes', core:false, ideal:10, coreIdeal:0 },
  { sub1:'Casual Print',            sub2:'Casual Print',            core:false, ideal:null, coreIdeal:null }, // the sheet says "Not specified"
  { sub1:'On Trend',                sub2:'On Trend',                core:false, ideal:10, coreIdeal:0 },
  { sub1:'Formal Checks',           sub2:'Formal Checks',           core:true,  ideal:8, coreIdeal:4 },    // 4 + 4
  { sub1:'Formal Stripes',          sub2:'Formal Stripes',          core:true,  ideal:8, coreIdeal:2 },    // 2 + 6
  { sub1:'Solid Cuban',             sub2:'Solid Cuban',             core:false, ideal:10, coreIdeal:0 },
  { sub1:'High Priced',             sub2:'High Priced',             core:true,  ideal:25, coreIdeal:15 },   // "High End Fabrics x 15+10"
  /* bottoms — ROS & Health Report 020826 sub-category tree; ideal counts from Option Count Summary */
  { sub1:'Formal Chinos',           sub2:'Formal Chinos',           core:true,  ideal:14, coreIdeal:14 },   // "Stretch Chinos x 14" — Casual Pants
  { sub1:'Performance Pants',       sub2:'Performance Pants',       core:true,  ideal:5, coreIdeal:5 },    // "Performance Pants x 5 (fold) Hemming" — Formal Pants
  { sub1:'Dress Pants',             sub2:'Dress Pants',             core:true,  ideal:40, coreIdeal:15 },  // transcript: "within formal pants 40 options — 15 core, 25 non-core"; Option Count "Dress Pants x 40 (15 core)"
  { sub1:'Neapolitan',              sub2:'Neapolitan',              core:false, ideal:20, coreIdeal:3 },   // "Neapolitan x 20 (3 core)" — Formal Pants
  { sub1:'RTW Stretch Jeans',       sub2:'RTW Stretch Jeans',       core:true,  ideal:null, coreIdeal:null },
];

/* ---------- MTM fabric families — the range plan hiding in labels ----- */
export const RANGES = [
  /* Copy of Fabric ordering → Weave and Pattern columns. The per-family targets are not in any sheet — placed. */
  { family:'Poplin', target:20 }, { family:'Twill', target:18 }, { family:'Oxford', target:12 }, { family:'Dobby', target:8 },
  { family:'Linen', target:14 }, { family:'Stripes', target:30 }, { family:'Checks', target:24 }, { family:'Print', target:10 },
];

/* Store rule of thumb: under 15 m ≈ 30–34 shirts → treat as low. */
export const STORE_LOW_METRES = 15;

/* ---------- replenishment parameters ----------------------------------
   From the discovery record (Invisit meeting notes §4; MTM Question Bank
   assumptions 2, 3, 4 and Q66). Every one is BSC's stated practice or a
   number they gave — and every one is still marked "confirm" with them, so
   the screens show the factor, not just the result. */
export const GROWTH_UPLIFT = 0.5;                                   // RTW only — business-plan growth on base rate of sale (Invisit §4). Not used for MTM core: Enigma's threshold rule needs no uplift.
export const METRES_PER_SHIRT = 2.15;                               // Fit Smart base consumption; Close-Out Q1 asks whether pattern uplift is inside this
export const TARGET_COVER_DAYS = { domestic: 45, international: 105 };  // reorder quantity buys up to this cover
export const REVIEW_WINDOW_DAYS = { domestic: 3, international: 7 };    // auto-PO reaches the vendor in 3d; a human review takes 7d
export const RTW_REORDER_TRIGGER_DAYS = 90;                         // RTW: coverage below this → place order
export const RTW_MOQ = 150;                                         // factory MOQ per style


export const STORES = [
  /* The store columns of the STO & Swatches Tracker (MTM_Swatches / FOB_Swatches header row), plus the
     stores named in Display & Fit Sample Allocation and Replenishment Sample. Names as the sheets spell them. */
  { id:'plh', name:'Pali Hill',              region:'West',  holdsRtwStock:true },
  { id:'kal', name:'Kala Ghoda',             region:'West',  holdsRtwStock:true },
  { id:'kmc', name:'Kemps Corner',           region:'West',  holdsRtwStock:false },
  { id:'and', name:'Andheri',                region:'West',  holdsRtwStock:false },
  { id:'juh', name:'Juhu',                   region:'West',  holdsRtwStock:false },
  { id:'kur', name:'Kurla',                  region:'West',  holdsRtwStock:false },
  { id:'bor', name:'Borivali',               region:'West',  holdsRtwStock:false },
  { id:'sky', name:'Sky City Borivali',      region:'West',  holdsRtwStock:false },
  { id:'obm', name:'Oberoi Mall',            region:'West',  holdsRtwStock:true },
  { id:'inm', name:'Inorbit Malad',          region:'West',  holdsRtwStock:true },
  { id:'sea', name:'Seawoods',               region:'West',  holdsRtwStock:false },
  { id:'lks', name:'Lakeshore Mall',         region:'West',  holdsRtwStock:false },
  { id:'pun', name:'Pune',                   region:'West',  holdsRtwStock:true },
  { id:'ahm', name:'Ahmedabad',              region:'West',  holdsRtwStock:true },
  { id:'khm', name:'Khan Market',            region:'North', holdsRtwStock:true },
  { id:'sox', name:'South Ex.',              region:'North', holdsRtwStock:false },
  { id:'vkj', name:'Vasant Kunj',            region:'North', holdsRtwStock:true },
  { id:'scw', name:'Select City Walk',       region:'North', holdsRtwStock:true },
  { id:'vgd', name:'Vegas Mall Dwarka',      region:'North', holdsRtwStock:true },
  { id:'ggn', name:'Gurugram',               region:'North', holdsRtwStock:true },
  { id:'moi', name:'Noida',                  region:'North', holdsRtwStock:true },
  { id:'jai', name:'Jaipur',                 region:'North', holdsRtwStock:false },
  { id:'hyd', name:'Hyderabad',              region:'South', holdsRtwStock:true },
  { id:'src', name:'Sarath City',            region:'South', holdsRtwStock:true },
  { id:'inh', name:'Inorbit Mall Hyd',       region:'South', holdsRtwStock:true },
  { id:'lav', name:'Lavelle Rd',             region:'South', holdsRtwStock:true },
  { id:'idn', name:'Indiranagar',            region:'South', holdsRtwStock:true },
  { id:'jay', name:'Jayanagar',              region:'South', holdsRtwStock:false },
  { id:'pwf', name:'Whitefield',             region:'South', holdsRtwStock:true },
  { id:'knk', name:'KNK Rd Chennai',         region:'South', holdsRtwStock:true },
  { id:'exa', name:'Express Avenue Chennai', region:'South', holdsRtwStock:false },
  { id:'koc', name:'Kochi',                  region:'South', holdsRtwStock:false },
  { id:'ccu', name:'Kolkata',                region:'East',  holdsRtwStock:true },
  { id:'nyc', name:'New York',               region:'Intl',  holdsRtwStock:false },
];

/* ---------- costing & BOM references ------------------------------------
   New Cogs Working v2.xlsx (sample row), Trims Working Sample.xlsx columns,
   Merchandise Master trim-card columns. The sheet's own numbers, so a wrong
   one is theirs to correct, not ours to have guessed. */
export const COSTING_DEFAULTS = { trimsPackaging: 44.35, transportation: 10, hemming: 9, shipping: 132, factoryOverheads: 103.6, multiple: 3.5 };
export const DISCOUNT_BAU = 0.10;          // "Discounts (BAU) (10%)"
export const DISCOUNT_ADDITIONAL = 0.02;   // "Additional Discount (2%)"
export const gstFor = (mrp: number) => (mrp > 2500 ? 0.18 : 0.05);   // apparel GST slabs, Sep 2025 onward
export const PACKAGING_BOM = ['Compostable inner Bag', 'Courier Bag', 'Packaging Box', 'Paper Bag', 'Flasher', 'Denim Bag', 'Outer Hanger Bag', 'Outer Hanger', 'Additional Consumable'];   // Trims Working → Trims sheet, column for column
export const TRIM_CARD = ['Button', 'Pocketing', 'Wash-care label'];
/** Bulk-marker consumption per piece by template — planning's starting point, edited per style. */
export const CONSUMPTION_DEFAULT: Record<GarmentCategory, { qty: number; unit: string }> = {
  'RTW CMT shirts': { qty: 1.6, unit: 'm' }, 'RTW FOB shirts': { qty: 1.6, unit: 'm' }, 'Bottoms / Knitwear / Jackets': { qty: 1.35, unit: 'm' },
  'Flat Knits (T-shirts)': { qty: 0.28, unit: 'kg' }, 'Flat Knits (Shirts)': { qty: 0.34, unit: 'kg' }, 'Jeans': { qty: 1.45, unit: 'm' }, 'Kurta': { qty: 2.2, unit: 'm' },
};
export const HEMMED = new Set<GarmentCategory>(['Bottoms / Knitwear / Jackets', 'Jeans']);
/** Which part of an order a comment is about. PPS and size set are the sampling rounds. */
export const ORDER_STEPS = ['General', 'PPS sample', 'Size set', 'Fabric & trims', 'Escalation', 'Receipt'];

export const RETURN_REASONS = ['Fit', 'Fabric defect', 'Stitching', 'Wrong size sent', 'Changed mind', 'Colour / shade'] as const;
export const RETURN_WANTS = ['Exchange', 'Credit note', 'Remake', 'Refund'] as const;
export const RESOLUTION_LADDER: { step: import('./types').ResolutionStep; label: string; who: string }[] = [
  { step:'alteration', label:'Alteration', who:'the store alters it itself, or sends it to the factory, or to the hemming unit through the warehouse' }, { step:'exchange', label:'Swap from the shelf', who:'another size off the rack, on the spot — RTW' }, { step:'refit', label:'Refit', who:'re-measure and adjust' }, { step:'remake', label:'Remake', who:'a new piece on the corrected sheet, at the factory' },
  { step:'store-credit', label:'Credit note', who:'generated the moment the piece is taken back; good for a year' }, { step:'refund', label:'Refund', who:'finance moves the money' },
];
export const WRITE_OFF_REASONS = ['Damaged', 'Soiled', 'Display worn', 'Lost', 'Wrong item received'] as const;

/* Bottoms are sold unhemmed and finished to the customer's length — Merchandise
   Master "PRODUCT TYPE: Hemming"; Trims Working "Shipping & Hemming" sheet. */
/* A garment type, never a cloth: denim and corduroy are fabrics, and a denim
   shirt is a shirt. Matching on them put inseams on shirts and sent them to
   the hemming bench. "Shorts" has to beat "short-sleeve" too. */
export const isBottoms = (subCatOrStyle: string) =>
  /\b(pants?|chinos?|jeans?|trousers?|bottoms?|neapolitan|joggers?|shorts)\b/i.test(subCatOrStyle)
  && !/half[- ]?sleeve|short[- ]?sleeve/i.test(subCatOrStyle);
export const BOTTOM_SIZES = ['28', '30', '32', '34', '36', '38', '40', '42'];
export const SHIRT_SIZES = ['36', '38', '40', '42', '44', '46'];   // Replenishment Sample sku_code suffixes 36–46
export const MTM_FITS = ['Tailored Fit', 'Classic Fit', 'Slim Fit', 'Saved fit'];
export const ORDER_STAGE_NEXT: Record<string, string> = { punched:'ready', ready:'delivered', hemming:'delivered', delivered:'delivered', cancelled:'cancelled' };   // RTW only — MTM moves by scan

/* ---------- MTM production — the production manager's own rules ----------
   From the MTM production walk (12 Sep 2026). */
export const PP_FREEZE_HOURS = 2;               // orders punched in the last 2h are not planned — stores still change them
export const PLAN_HORIZON_DAYS = 7;             // Swati plans seven days ahead, date-wise, FIFO
export const PIECES_PER_TAILOR_DAY = 12;        // nominal: masters × 12; the daily report is what actually counts
export const AGING_DAYS = 5;                    // in-factory longer than this is "aging" on her pivot
export const MTM_STAGES: { id: string; label: string; scan: string | null; who: string }[] = [
  { id:'punched',     label:'Order',                 scan:null,                            who:'store / online — order sheet: fabric, measurements, collar, cuff, buttons' },
  { id:'pp',          label:'PP',                    scan:null,                            who:'planning — waiting for a factory; frozen for store-side changes' },
  { id:'planned',     label:'PP · planned',          scan:'plan submitted · job card printed · fabric cut', who:'production unit' },
  { id:'in-transit',  label:'In production',         scan:'QR out of production unit',     who:'production unit — material on its way to the factory' },
  { id:'in-factory',  label:'In factory',            scan:'QR in at factory',              who:'factory merchandiser — manufacturing begins' },
  { id:'out-factory', label:'Out factory',           scan:'QR piece ready — QC done at the factory',  who:'factory merchandiser' },
  { id:'rts',         label:'RTS',                   scan:'QR back at production unit',    who:'production unit — return to source' },
  { id:'dispatched',  label:'Fitting / shipping',    scan:'shipping team',                 who:'downstream handling, then shipped to the customer' },
  { id:'delivered',   label:'Delivered',             scan:null,                            who:'store / courier' },
];
export const ORDER_TAGS = ['normal', 'urgent', 'corporate'] as const;
export const EXTRA_FABRIC_REASONS = ['Damaged / yarn pull — factory error', 'Stain — factory error', 'Weaving defect — PP error', 'Fabric short — PP error', 'Shade mismatch — PP error'] as const;
export const EXTRA_FABRIC_PANELS = ['Single front', 'Both fronts (patta)', 'Single sleeve', 'Both sleeves', 'Collar', 'Cuff'] as const;
export const PANEL_METRES: Record<string, number> = { 'Single front':0.8, 'Both fronts (patta)':0.9, 'Single sleeve':0.8, 'Both sleeves':0.9, 'Collar':0.3, 'Cuff':0.3 };   // the email's 80 cm / 90 cm full width
export const MTM_SWATCH_BOOKS = ['FORMAL SHIRTS - VOL.1', 'FORMAL SHIRTS - VOL.2', 'CASUAL SHIRTS VOL.1', 'LINEN SHIRTS'];   // Fabric Ordering → Swatch book
export const BESPOKE_BOOKS = ['Leggiuno Bespoke'];
export const STO_TYPES = ['Display', 'Off the rack', 'Replenishment'] as const;   // STO tracker → STO Type
export const HEMMING_TYPES = ['Closed hem/finished bottom', 'Bottom Open/ Unhemmed.', 'NA'] as const;   // STO tracker → Hemming type
export const CORPORATE_FACTORY = 'mahendra';    // corporate orders go to one factory, always
export const URGENT_FACTORY = 'richman';        // kept with breathing space for one-, two-, three-day urgents

/* Launch rules — Invisit notes §Marketing and the Display/Fit allocation sheet. */
export const MARKETING_LEAD_DAYS = 10;                       // name & description to marketing 10–15 days before launch
export const DISPLAY_PLAN = { display: { shirts: '40', bottoms: '32' }, fit: { shirts: ['38', '40', '42'], bottoms: ['30', '32', '34'] } };  // one display piece, a fit set of three, per holding store

export const SAMPLE_AREAS = ['Stitching', 'Fit', 'Pattern', 'Construction', 'Fabric handling', 'Trims / labels / buttons', 'Other'] as const;

/* swatch books */
export const BOOK_EDITION = 'AW26';
export const SWATCH_KINDS = ['MTM', 'RTW', 'BESPOKE'] as const;
export const BOOK_CONFIRM_DAYS = 7;   // unconfirmed after this is a chase
export const BIG_STORES = new Set(['plh', 'scw', 'khm', 'hyd', 'pwf', 'vkj', 'moi']);   // two books each

/* ---------- the order sheet's customisation, as the real one has it ----------
   Order-sheet screenshot, 12 Sep 2026: collar style + stiffness, cuff, placket,
   pocket. These are what a customer rings up to change ("collar change कर दो").
   The rest of the sheet — measurements, thread, monogram — stays in Enigma. */
export const COLLAR_STYLES = ['French Charlie', 'Prince Charlie', 'Button Down', 'Cutaway', 'Club', 'Mandarin', 'Wing'];
export const STIFFNESS = ['Stiff', 'Soft'];
export const CUFF_STYLES = ['Single button', 'Two button', 'French', 'Mitred'];
export const PLACKETS = ['French placket', 'Standard placket', 'Covered placket'];
export const POCKETS = ['Single pocket', 'No pocket', 'Two pockets'];
/* Editing the sheet is free until the bundle is cut and scanned out; after that
   an accepted change is an amended sheet the factory must be re-issued. */
/* The store's window closes the moment production allocates a factory: until then
   the sheet is theirs to correct, after it only a remark. Production keeps the
   single-field amend while the piece is in transit or on the floor. */
export const SHEET_FREE_EDIT = new Set(['punched', 'pp', 'planned']);
export const SHEET_STORE_EDIT = new Set(['punched', 'pp']);
export const SHEET_AMEND = new Set(['in-transit', 'in-factory']);
/* A change to any of these may send the order to a different factory. */
export const REALLOCATING_FIELDS = new Set(['Fabric', 'Tag', 'Quantity']);

/* Trims & packaging master — the Trims Working sheet's own columns, costed so
   the per-piece total lands on the sheet's ₹44.35. Ordered in bulk, held at the
   unit, drawn down when a PO's materials are issued. */
export const TRIM_MASTER: { name: string; kind: 'trim' | 'packaging'; costPer: number; threshold: number }[] = [
  /* Trims Working → Trims sheet columns (Compostable inner Bag … Additional Consumable) and the Merchandise
     Master trim card (Button, Pocketing, wash-care). The sheet's sample carries no unit costs — these are placed
     so a shirt's trims + packaging lands on the COGS sheet's ₹44.35; the Denim Bag applies to jeans only. */
  { name:'Button',                kind:'trim',      costPer:1.20, threshold:40000 },
  { name:'Pocketing',             kind:'trim',      costPer:4.00, threshold:3000 },
  { name:'Wash-care label',       kind:'trim',      costPer:2.50, threshold:4000 },
  { name:'Compostable inner Bag', kind:'packaging', costPer:6.00, threshold:3000 },
  { name:'Courier Bag',           kind:'packaging', costPer:5.00, threshold:2500 },
  { name:'Packaging Box',         kind:'packaging', costPer:7.00, threshold:2000 },
  { name:'Paper Bag',             kind:'packaging', costPer:3.00, threshold:2500 },
  { name:'Flasher',               kind:'packaging', costPer:1.50, threshold:3000 },
  { name:'Denim Bag',             kind:'packaging', costPer:9.00, threshold:800 },
  { name:'Outer Hanger Bag',      kind:'packaging', costPer:1.50, threshold:2000 },
  { name:'Outer Hanger',          kind:'packaging', costPer:0.75, threshold:2000 },
  { name:'Additional Consumable', kind:'packaging', costPer:1.90, threshold:1500 },
];

/* ---------- files each record actually carries today — in Drive, Slack, WhatsApp — now on the record ---------- */
export const FILE_LABELS = {
  concept:       ['PAT file', 'CAD / pattern', 'Tech pack', 'Sketch / reference image', 'Sample photo', 'Green slip', 'Approval note', 'Fabric swatch image'],
  order:         ['Tech pack', 'Job card', 'Trim card', 'PAT / CAD', 'PPS sample photo', 'Size-set photo', 'QC report', 'Vendor quote', 'Invoice', 'Packing list'],
  fabric:        ['Swatch image', 'Test report', 'Mill stock sheet', 'Vendor quote', 'Block confirmation', 'Datasheet'],
  option:        ['Product shots', 'Tech pack', 'Size chart'],
  launch:        ['Marketing brief', 'Display allocation sheet', 'Product shots', 'Key pointers'],
  return:        ['Photo', 'Invoice', 'Alteration note'],
  vendor:        ['Agreement', 'Rate card', 'Capacity sheet', 'Audit report'],
  customerOrder: ['Order sheet', 'Alteration note', 'Photo', 'Measurement sheet'],
  extraFabric:   ['Photo of damage', 'Cutting note'],
  comment:       ['Attachment'],
  customer:      ['Photo of the customer in the fit sample', 'Reference image', 'Measurement sheet', 'Old bill'],
} as const;

/* ---------- Enigma's MTM order sheet, field for field --------------------------
   Read off cms.bombayshirts.com/order-sheet (BSC-1002370). The measurement keys and
   the option tiles are Enigma's; the value shown on that sheet is listed first
   in each option. Alternatives beyond what the sheet showed are placed until the
   full pick-list is exported from Enigma. */
export const MEASUREMENTS: { key: import('./types').MeasureKey; label: string; unit: 'in' | 'n'; def: number }[] = [
  { key:'collar', label:'Collar', unit:'in', def:16.5 }, { key:'chest', label:'Chest', unit:'in', def:46.5 }, { key:'waist', label:'Waist', unit:'in', def:45 }, { key:'hips', label:'Hips', unit:'in', def:47 },
  { key:'shoulder', label:'Shoulder', unit:'in', def:19.25 }, { key:'shoulderYoke', label:'Shoulder yoke', unit:'in', def:2.5 }, { key:'shirtLength', label:'Shirt length', unit:'in', def:30 }, { key:'sleeveLength', label:'Sleeve length', unit:'in', def:26.125 },
  { key:'bicep', label:'Bicep', unit:'in', def:17.5 }, { key:'leftCuff', label:'Left cuff', unit:'in', def:10.5 }, { key:'rightCuff', label:'Right cuff', unit:'in', def:10.5 }, { key:'forearm', label:'Forearms', unit:'in', def:14 },
  { key:'frontAcross', label:'Front across', unit:'in', def:17.75 }, { key:'backAcross', label:'Back across', unit:'in', def:18.75 }, { key:'shortSleeveLength', label:'Short sleeve length', unit:'in', def:7.5 }, { key:'shortSleeveBicep', label:'Short sleeve biceps', unit:'in', def:18 },
  { key:'shortSleeveOpening', label:'Short sleeve bottom opening', unit:'in', def:16 }, { key:'armHole', label:'Arm hole', unit:'in', def:1 }, { key:'buttonCount', label:'Button count', unit:'n', def:8 }, { key:'buttonPlacement', label:'Button placement', unit:'n', def:3 },
];
export const PATTERN_FLAGS: { key: keyof import('./types').PatternFlags; label: string }[] = [
  { key:'shirtMargin', label:'Shirt margin' }, { key:'lowNeck', label:'Low neck' }, { key:'slopingShoulders', label:'Sloping shoulders' }, { key:'backDown', label:'Back down' },
];
export const SHEET_OPTIONS: { key: import('./types').SheetOptionKey; label: string; options: string[]; realloc?: boolean }[] = [
  { key:'collar',          label:'Collar style',        options: COLLAR_STYLES },
  { key:'stiffness',       label:'Collar stiffness',    options: STIFFNESS },
  { key:'collarContrast',  label:'Collar contrast',     options: ['None', 'White', 'Contrast fabric'] },
  { key:'collarPiping',    label:'Collar piping',       options: ['None', 'Self', 'Contrast'] },
  { key:'collarTopButton', label:'Collar top button',   options: ['Single button', 'Double button', 'No button'] },
  { key:'sleeves',         label:'Sleeves',             options: ['Long sleeves', 'Short sleeves'] },
  { key:'cuff',            label:'Cuff style',          options: CUFF_STYLES },
  { key:'cuffStiffness',   label:'Cuff stiffness',      options: STIFFNESS },
  { key:'cuffContrast',    label:'Cuff contrast',       options: ['None', 'White', 'Contrast fabric'] },
  { key:'placket',         label:'Placket',             options: PLACKETS },
  { key:'placketContrast', label:'Placket contrast',    options: ['None', 'White', 'Contrast fabric'] },
  { key:'buttons',         label:'Buttons',             options: ['Natural', 'White', 'Black', 'Horn', 'Mother of pearl'] },
  { key:'buttonThread',    label:'Button thread color', options: ['Self', 'White', 'Contrast navy', 'Contrast red'] },
  { key:'stitchingThread', label:'Stitching thread',    options: ['Self', 'Contrast'] },
  { key:'back',            label:'Back',                options: ['No pleats', 'Box pleat', 'Side pleats', 'Darts'] },
  { key:'bottomCut',       label:'Bottom cut',          options: ['Round', 'Straight'] },
  { key:'pocket',          label:'Pocket',              options: POCKETS },
  { key:'elbowPatch',      label:'Elbow patch',         options: ['None', 'Self', 'Suede'] },
  { key:'gusset',          label:'Gusset',              options: ['None', 'Self', 'Contrast'] },
  { key:'shirtLength',     label:'Shirt length',        options: ['Formal', 'Casual', 'Untucked'] },
  { key:'monogram',        label:'Monogram',            options: ['None', 'Cuff', 'Chest', 'Collar'] },
  { key:'placketStay',     label:'Placket stay',        options: ['No', 'Yes'] },
];
export const SHEET_LABEL: Record<string, string> = Object.fromEntries([...SHEET_OPTIONS.map(o => [o.key, o.label]), ...MEASUREMENTS.map(m => [m.key, m.label]), ...PATTERN_FLAGS.map(p => [p.key, p.label])]);
/** The sheet as Enigma showed it for BSC-1002370 — the store's starting point when punching. */
export const defaultSpec = (): import('./types').OrderSpec => Object.fromEntries(SHEET_OPTIONS.map(o => [o.key, o.key === 'collar' ? 'Prince Charlie' : o.key === 'cuff' ? 'French' : o.key === 'placket' ? 'French placket' : o.key === 'pocket' ? 'Single pocket' : o.options[0]])) as import('./types').OrderSpec;
export const defaultMeasurements = (): import('./types').OrderMeasurements => Object.fromEntries(MEASUREMENTS.map(m => [m.key, m.def])) as import('./types').OrderMeasurements;
export const defaultPattern = (): import('./types').PatternFlags => ({ shirtMargin: true, lowNeck: true, slopingShoulders: false, backDown: true });

/* ---------- the MTM fit set every store holds — transcript: "slim, standard and heavy fit, across sizes" ----------
   Sizes in the set are placed until BSC confirms which the stores actually carry. */
export const FIT_SAMPLE_FITS = ['Slim', 'Standard', 'Heavy'] as const;
/* What the three fits mean on the floor, so a new store hand is not guessing. */
export const FIT_SAMPLE_NOTE: Record<string, string> = {
  Slim: 'closest to the body — tapered waist, narrow sleeve',
  Standard: 'the house cut — what most customers are measured against',
  Heavy: 'fullest cut — more room through chest, waist and sleeve',
};
export const FIT_SAMPLE_SIZES = ['38', '40', '42', '44'] as const;

export const SHIRT_STYLES = ['Boardroom', 'French Cuff', 'Business Casual', 'Band Collar', 'Half Sleeve', 'Popover', 'Kurta'];
/* The six preset shirt styles design sets a fabric up against — three were named
   in discovery; the other three are placeholders until the Bombay visit. A
   preset + a category + a fabric code = the DESIGN CODE Shopify sells. */
export const SHIRT_PRESETS: { id: string; name: string; code: string; placeholder?: boolean }[] = [
  { id:'boardroom', name:'Boardroom', code:'BRD' },
  { id:'french-cuff', name:'French Cuff', code:'FRC' },
  { id:'business-casual', name:'Business Casual', code:'BSC' },
  { id:'weekend', name:'Weekend', code:'WKD', placeholder: true },
  { id:'resort', name:'Resort', code:'RST', placeholder: true },
  { id:'evening', name:'Evening', code:'EVE', placeholder: true },
];
/* Website filter families — the exact composition stays exact; this is the bucket the customer filters by. */
export const COMPOSITION_FAMILIES = ['Cotton', 'Linen blend', 'Bamboo blend', 'Cotton-lyocell', 'Stretch cotton', 'Wool blend', 'Giza / 2-ply'];
/* The MTM assortment design plans around: about thirty active options. A gap
   against it is what raises an option request. */
export const MTM_ACTIVE_TARGET = 30;
