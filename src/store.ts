/* ==========================================================================
   State — one database, persisted to the browser, every write logged on the
   record it changed. Optimistic and local: what you type is what the next
   screen reads, immediately.
   ========================================================================== */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ConceptDesign, SourcingMode, ResolutionStep, StockWriteOff, Grn, Attachment, AttachmentKind, Concept, ConceptFabricOption, OptionRequest, OrderSpec, OrderMeasurements, PatternFlags, SheetOptionKey, MeasureKey, Db, RoleId, ProductionOrder, GarmentCategory, FabricQuote, Milestone, Escalation, RtwOption, BomLine, Costing, ThreadKind, ReturnCase, CustomerOrder, StockRequest, Launch, LaunchPiece, CustomerOrderStage, ExtraFabricRequest, OrderTag, SampleRound, QcAudit, Vendor, TrackerConfig, PlanningReview } from './domain/types';
import { SEED } from './domain/seed';
import { putFile, deleteFile, clearFiles } from './domain/files';
import { storeInboundOf, sheetEditMode, factoryLoadOf, type StoreInboundKind, buildMilestones, applyTrackerConfig, daysBetween, addDays, iso, TODAY, defaultBom, defaultCosting, parseMentions, defaultLaunchPieces, consumptionFor, defaultMaterials, mintBespokeCode } from './domain/engines';
import { PEOPLE, MERCHANDISERS, ORDER_STAGE_NEXT, METRES_PER_SHIRT, STORES, SHEET_LABEL, SHIRT_PRESETS, defaultSpec, defaultMeasurements, defaultPattern } from './domain/reference';

/* `undoAt` is the depth of the stack this toast was raised at: its Undo button
   may only revert its own change, never a later one that landed on top. */
interface Toast { id: number; text: string; tone: 'ok' | 'warn'; undo?: boolean; undoAt?: number }
/* One step back. Every write goes through touch(), so the snapshot before it is
   the only thing undo needs — people trust a system that can forget. */
interface UndoStep { db: Db; label: string }

export type HemLegStep = 'inwardAtWarehouse' | 'atUnit' | 'hemmed' | 'backAtWarehouse' | 'dispatched' | 'delivered';
export type PunchInput = Pick<CustomerOrder, 'kind' | 'customer' | 'styleName' | 'fabricId' | 'designId' | 'optionId' | 'fit' | 'size' | 'hemLength' | 'qty' | 'remarks' | 'promisedOn' | 'fitProfile' | 'measuredBy' | 'trial' | 'express' | 'factoryComment' | 'logisticComment' | 'soldDisplay'> & { tag?: OrderTag; spec?: OrderSpec; measurements?: OrderMeasurements; pattern?: PatternFlags; billNo?: string | null; _idSuffix?: string };

export interface AppState {
  db: Db;
  role: RoleId;
  factoryId: string;          // which factory a merchandiser is standing in
  /* Prototype walkthrough: every screen and every button reachable whoever you
     are signed in as. The line that used to say "not your role" still says
     whose step it is — it just no longer stops you. */
  demoAll: boolean;
  setDemoAll(v: boolean): void;
  personId: string;
  storeId: string;
  toasts: Toast[];
  undoStack: UndoStep[];
  undo(): void;
  /* a filter combination someone opens every morning, kept by name */
  views: { id: string; name: string; href: string }[];
  saveView(name: string, href: string): void;
  deleteView(id: string): void;
  settings: { ppFreezeHours: number; quiet?: boolean };   // quiet = pilot mode: no ledes, no ⓘ, no guidance notes, no worked-example strips
  setQuiet(on: boolean): void;
  setFreezeHours(h: number): void;
  setRole(r: RoleId): void;
  setPerson(id: string): void;
  setStore(id: string): void;
  setFactory(id: string): void;
  logFactoryOutput(factoryId: string, date: string, pieces: number, note: string): void;
  markFactoryRead(orderIds: string[]): void;
  toast(text: string, tone?: Toast['tone'], undo?: boolean): void;
  undoTo(depth: number): void;
  reset(): void;

  /* planning & design */
  createRequirement(input: Omit<ProductionOrder, 'id' | 'poNo' | 'quotes' | 'vendorId' | 'poDate' | 'finalFob' | 'costingClosure' | 'merchant' | 'jobCardNo' | 'fabricReady' | 'trimsReady' | 'milestones' | 'cutQty' | 'deliveredQty' | 'rejectedQty' | 'receipts' | 'split' | 'status' | 'activity' | 'bom' | 'costing' | 'sampleVendorId' | 'samples' | 'materials' | 'qcAudits' | 'shipheroName' | 'vendorFabricCode' | 'enigmaCode' | 'fabricBlocked' | 'fabricQuotes' | 'fabricVendorId' | 'fabricMetres' | 'sourcing'> & { bom?: BomLine[] }): string;
  updateRequirement(id: string, patch: Partial<Pick<ProductionOrder, 'orderQty' | 'sizeBreakup' | 'targetInhouse' | 'targetCost' | 'fabricNominated' | 'remarks' | 'fabricBrief'>>): void;
  handToSourcing(id: string): void;
  updateBom(id: string, bom: BomLine[]): void;
  /* RTW before sourcing: the prototype on a stand-in cloth, the shortlist, the tech pack */
  logProto(orderId: string, standIn: string): void;
  reviewProto(orderId: string, round: number, comments: SampleRound['comments'], decision: 'resubmit' | 'approved'): void;
  skipProto(orderId: string, reason: string): void;
  updateShortlist(orderId: string, list: NonNullable<ProductionOrder['fabricShortlist']>): void;
  pickFromShortlist(orderId: string, shortlistId: string, why: string): void;
  markMaterialsCovered(orderId: string): void;
  /* launches */
  createLaunch(input: Pick<Launch, 'optionId' | 'styleName' | 'dropMonth' | 'orderId' | 'expectedAtHo' | 'launchOn' | 'hero' | 'keyPointers'>): string;
  updateLaunch(id: string, patch: Partial<Pick<Launch, 'receivedAtHo' | 'marketingName' | 'marketingBriefOn' | 'launchOn' | 'launchedOn' | 'hero' | 'keyPointers' | 'expectedAtHo'>>): void;
  allocateLaunch(id: string, pieces: LaunchPiece[] | 'default'): void;
  mintLaunchDesignCode(id: string): void;   // design, once the goods are received
  dispatchLaunch(id: string, storeId: string | 'all'): void;
  receiveLaunch(id: string, storeId: string): void;
  decideOption(optionId: string, decision: 'promote-to-core' | 'liquidate' | 'reorder' | 'reintroduce' | 'make-inactive', note: string, qty?: number): void;
  /* RTW planning review (8 Oct 2026): a planning decision per option, kept with every assumption */
  startPlanningReview(input: Omit<PlanningReview, 'id' | 'on' | 'by' | 'status' | 'approvedQty' | 'approvedRatio' | 'approvedOn' | 'approvedBy' | 'requirementId' | 'constraintNote' | 'displayExtra' | 'moq'>): string;
  updatePlanningReview(id: string, patch: Partial<PlanningReview>): void;
  approvePlanningReview(id: string, approvedQty: number, approvedRatio: { size: string; qty: number }[], constraintNote: string): void;
  sendPlanningReviewToDesign(id: string, category: GarmentCategory, subCategory: string, targetCost: number): string | null;

  /* option requests — a category and a number, slot by slot */
  createOptionRequest(i: { category: OptionRequest['category']; brief: string; liveBy: string | null; targetCost: number | null; optionCount: number; notes: string[]; bom: BomLine[] }): string;
  updateRequestBom(id: string, bom: BomLine[]): void;
  updateOptionAsk(requestId: string, optionId: string, ask: NonNullable<import('./domain/types').RequestOption['ask']>, note: string): void;                                       // design
  addRequestOffer(id: string, optionId: string, o: Omit<ConceptFabricOption, 'id' | 'selected'>): void;   // sourcing — one live vendor per slot
  updateRequestOffer(id: string, optionId: string, offerId: string, patch: Partial<ConceptFabricOption>): void;   // sourcing edits the vendor's fields
  removeRequestOffer(id: string, optionId: string, offerId: string): void;                 // sourcing, before sending
  sendOptionToDesign(id: string, optionId: string): void;                                  // sourcing
  closeOption(id: string, optionId: string, reason: string): void;                         // design: not going ahead with this slot
  reopenOption(id: string, optionId: string): void;                                        // design: changed my mind
  rejectRequestOffer(id: string, optionId: string, offerId: string, reason: string): void; // design: not this mill
  askOptionExtension(id: string, optionId: string, offerId: string | null, note: string): void;   // design
  extendRequestOffer(id: string, optionId: string, offerId: string, until: string): void;  // sourcing
  sendOptionBack(id: string, optionId: string): void;                                      // sourcing: holds extended
  acceptOfferAndRaisePo(id: string, optionId: string, offerId: string, metres: number, rationale: string): void;   // design: one click, fabric on the master + PO

  /* sourcing ↔ design — the fabric handoff */
  addFabricQuote(orderId: string, q: Omit<FabricQuote, 'id' | 'selected' | 'extendedOn'>): void;
  removeFabricQuote(orderId: string, quoteId: string): void;
  submitToDesign(orderId: string): void;                       // sourcing: the options are ready, design's turn
  askExtension(orderId: string, note: string, quoteId?: string): void;   // design: cannot decide before the holds lapse
  extendQuote(orderId: string, quoteId: string, until: string): void;   // sourcing: went back to the mill, new hold
  sendBackToDesign(orderId: string): void;                     // sourcing: holds extended, design's turn again
  chooseFabricVendor(orderId: string, quoteId: string, rationale: string): void;   // design picks
  rejectFabricQuote(orderId: string, quoteId: string, reason: string): void;       // design: not this mill
  unchooseFabricVendor(orderId: string): void;                                    // design: change my mind, before the PO
  raiseOrderFabricPo(orderId: string, metres?: number | null): void;   // metres: what design typed over the computed need, if anything                   // design: raise the fabric PO; sourcing then gets the cloth in
  acceptQuoteAndRaisePo(orderId: string, quoteId: string, rationale: string, metres?: number | null): void;   // design's one click: this vendor, and the PO
  updateFabricQuote(orderId: string, quoteId: string, patch: Partial<FabricQuote>): void;
  allocateFactory(orderId: string, factoryId: string, rationale: string): void;
  /* the RTW loop: production proposes, design decides, design raises the PO, sourcing supplies, the factory confirms */
  proposeFactory(orderId: string, vendorId: string, quotedCost: number, estimatedInhouse: string, note: string): void;
  decideFactory(orderId: string, proposalId: string, accepted: boolean, comment: string): void;
  raiseFactoryPo(orderId: string): void;
  saveFabricDetails(orderId: string, d: { fabricVendorId: string | null; vendorFabricCode: string | null; enigmaCode: string | null; cpm: number | null; fabricBlocked: number | null; consumption: number | null }): void;
  markFabricBought(orderId: string): void;
  markFabricSent(orderId: string, metres: number | null): void;
  confirmFabricReceipt(orderId: string, metresOk: number, metresDamaged: number, note: string): void;
  askCutRatio(orderId: string, reason: string, kind?: 'ratio' | 'cut-short', proposedBreakup?: { size: string; qty: number }[] | null): void;
  giveCutRatio(orderId: string, breakup: { size: string; qty: number }[]): void;
  sendCutRatio(orderId: string): void;
  convertBlock(blockId: string): void;
  releaseBlock(blockId: string): void;
  setFabricHold(fabricId: string, hold: boolean): void;
  pauseFabric(fabricId: string, note: string): void;   // design: stop offering it, with a reason
  renameFabric(fabricId: string, newName: string, note: string): void;   // design: the code stays, the name changes, the old name stays on the record
  resumeFabric(fabricId: string): void;
  reviewCoreStock(fabricId: string, status: 'ok' | 'delayed' | 'out', note: string, backOn: string | null): void;
  raiseFabricPo(fabricId: string, metres: number): void;
  setFabricBucket(fabricId: string, bucket: 'CORE' | 'NON_CORE', note: string): void;
  agreeCoreBlock(fabricId: string, until: string, metresPerMonth: number, via: 'email' | 'whatsapp' | 'call', note: string): void;
  endCoreBlock(fabricId: string): void;
  confirmFabricPo(id: string, expectedOn: string | null, remark: string): void;
  remarkFabricPo(id: string, expectedOn: string | null, remark: string): void;
  receiveFabricPo(id: string): void;
  updateFabricPoReceiving(id: string, metres: number, close: boolean): void;   // Enigma's Update Receiving Status: a received quantity, and whether to close the line
  updateCosting(orderId: string, patch: Partial<Costing>): void;

  /* everyone */
  postComment(kind: ThreadKind, subjectId: string, text: string, step: string | null, files?: File[]): void;
  /* a mention is dealt with, not deleted — it stays on the record, greyed */
  resolveMention(commentId: string, resolved: boolean): void;
  /* files on the record */
  attachFiles(kind: AttachmentKind, subjectId: string, label: string, step: string | null, files: File[]): Promise<void>;
  removeAttachment(id: string): void;
  /* concepts — idea to sellable */
  addConcept(i: { id?: string; name: string; kind: Concept['kind']; brief: string; spec: string | null; baseFabricId: string | null; book?: string | null; targetMonth?: string | null }): string;
  conceptChooseFabric(id: string, pick: { fabricId: string } | { name: string; vendorId: string; vendorCode: string; cpm: number; composition: string; widthIn: number; book: string }): void;
  /* the same handoff as RTW, on a concept: sourcing brings mills back, design picks */
  conceptAddFabricOption(id: string, o: Omit<ConceptFabricOption, 'id' | 'selected'>): void;
  conceptRemoveFabricOption(id: string, optionId: string): void;                 // sourcing: the mill will not hold — withdraw it, put another
  conceptUpdateFabricOption(id: string, optionId: string, patch: Partial<ConceptFabricOption>): void;
  conceptAcceptAndRaisePo(id: string, optionId: string, metres: number, rationale: string): void;   // design's one click: this vendor, and the PO
  conceptRejectFabricOption(id: string, optionId: string, reason: string): void;
  conceptSendOptionsToDesign(id: string): void;
  conceptChooseFabricOption(id: string, optionId: string, rationale: string): void;
  conceptUnchooseFabric(id: string): void;                                   // design: change my mind, before anything is bought
  conceptAskOptionExtension(id: string, note: string, optionId?: string): void;   // design: the holds run out before I can decide
  conceptExtendOption(id: string, optionId: string, until: string): void;    // sourcing: went back to the mill
  conceptSendOptionsBack(id: string): void;                                  // sourcing: holds extended, design's turn again
  conceptBlockFabric(id: string, metres: number, via: 'email' | 'whatsapp' | 'call'): void;
  priceFabric(fabricId: string, cpm: number, vendorCode: string | null): void;
  conceptRaiseFabricPo(id: string, metres: number): void;
  conceptSendPat(id: string, factoryId: string): void;
  conceptSubmitSample(id: string, gate: Concept['rounds'][number]['gate']): void;
  conceptReviewSample(id: string, round: number, comments: SampleRound['comments'], decision: 'resubmit' | 'approved'): void;
  conceptSendApproval(id: string, text: string): void;
  conceptConfigureEnigma(id: string, e: { template: string; consumptionBase: number; consumptionBuffer: number; options: string[] }): void;
  conceptSetName(id: string, newName: string, mrp: number): void;
  conceptSetMarketing(id: string, blurb: string, channels: string[]): void;
  conceptGoLive(id: string): void;                                            // live in stores
  conceptAddDesign(id: string, d: Pick<ConceptDesign, 'name' | 'category' | 'mrp'> & Partial<Pick<ConceptDesign, 'style' | 'cost' | 'description' | 'buzzwords' | 'productType' | 'weightGrams' | 'region' | 'stockMode' | 'status' | 'salesChannel' | 'discountedPrice' | 'media' | 'sizes' | 'variants'>>): void;   // one more design on this fabric, with its product code
  conceptUpdateDesign(id: string, designId: string, patch: Partial<Omit<ConceptDesign, 'id' | 'code'>>): void;
  conceptDesignFlag(id: string, designId: string, flag: 'enigma' | 'live', on: boolean): void;
  pushDesignToEnigma(id: string, designId: string): void;   // design: create the design row in Enigma from here
  conceptRemoveDesign(id: string, designId: string): void;
  conceptSetEnigmaFlags(id: string, f: { largeCheck: boolean; compositionFamily: string | null }): void;
  conceptSwatch(id: string, step: 'inward' | 'handover' | 'cut' | 'sticker' | 'dispatched' | 'photos' | 'storesTold'): void;
  conceptSwatchPriority(id: string, priority: boolean): void;
  conceptOnline(id: string, step: 'photos' | 'video' | 'post' | 'live'): void;
  setSourcingMode(orderId: string, mode: SourcingMode, supplierVendorId?: string | null, note?: string): void;
  markFobEmailed(orderId: string): void;

  /* production unit — RTW gates */
  submitSample(orderId: string, vendorId: string | null): void;
  reviewSample(orderId: string, round: number, comments: SampleRound['comments'], decision: 'resubmit' | 'approved'): void;
  receiveMaterial(orderId: string, bomIndex: number, checked: 'ok' | 'fail'): void;
  orderTrims(trimId: string, qty: number): void;
  receiveTrims(trimId: string): void;
  setGrnInvoice(grnId: string, invoiceNo: string): void;
  financeSeenGrn(grnId: string): void;
  issueMaterials(orderId: string): void;
  recordQcAudit(orderId: string, input: Omit<QcAudit, 'at' | 'by'>): void;

  /* production */
  updateExecution(orderId: string, patch: Partial<Pick<ProductionOrder, 'merchant' | 'jobCardNo' | 'fabricReady' | 'trimsReady' | 'finalFob' | 'remarks'>>): void;
  setMilestone(orderId: string, key: string, patch: Partial<Pick<Milestone, 'plan' | 'revised' | 'actual' | 'delayReason'>>): void;
  /** production agrees with the factory: part now, balance later — the same PO, split */
  splitDispatch(orderId: string, lots: { qty: number; dispatchOn: string }[], reason: string): void;
  dispatchSplitLot(orderId: string, index: number): void;
  clearSplit(orderId: string): void;
  updateEscalation(id: string, patch: Partial<Pick<Escalation, 'status' | 'recoveryAction' | 'resolutionNotes'>>): void;
  /* the tracker's Config tab: save, and re-plan every open PO's dates that have no actual */
  setTrackerConfig(cfg: Omit<TrackerConfig, 'updatedOn' | 'updatedBy'>, replan: boolean): void;
  notifyMerchant(orderId: string, milestoneKey: string, kind: 'overdue' | 'due'): void;

  /* warehouse */
  receive(orderId: string, input: { cutQty: number; deliveredQty: number; rejectedQty: number }): void;
  receiveLot(orderId: string, input: { qty: number; rejected: number; note: string; balanceExpectedOn: string | null; cutQty?: number; closeShort?: boolean }): void;
  closeTransfer(id: string): void;
  storeInward(kind: StoreInboundKind, id: string, receivedQty?: number, note?: string): void;   // fewer than sent → a shortfall on the STO, for the warehouse
  resolveShortfall(transferId: string, resolution: 'balance-sent' | 'written-off', note: string): void;
  dispatchFitSample(storeId: string, fit: string, size: string): void;
  markFitSample(id: string, state: 'ok' | 'worn' | 'missing'): void;

  /* store */
  confirmSwatch(id: string): void;
  advanceReturn(id: string): void;
  raiseReturn(input: Pick<ReturnCase, 'styleName' | 'reason' | 'wants' | 'remarks'> & { orderId?: string | null; kind?: 'MTM' | 'RTW' }): string;
  startResolution(id: string, step: ResolutionStep, note: string, where?: 'store' | 'factory' | 'hemming-unit', extra?: { size?: string }): void;   // store: try the next rung; alteration says where; exchange says which size
  redeemCredit(customer: string, amount: number, orderId: string | null, note: string): void;   // store: spend a customer's credit on a bill
  sendReturnToHemming(id: string, destination: 'store' | 'customer'): void;    // store hands the piece to the vehicle for the warehouse → hemming unit
  hemLegStep(id: string, step: HemLegStep): void;                              // warehouse / hemming unit / store: each hop of the round trip, as it happens
  decideResolution(id: string, outcome: 'accepted' | 'not enough', note: string): void;   // store, with the customer
  sendReturnToFactory(id: string, factoryId: string): void;                    // store hands the piece to the vehicle
  factoryReceivedReturn(id: string): void;                                     // production scans it in at the factory
  returnDoneAtFactory(id: string): void;                                       // production: work done, piece on its way back
  moveRefund(id: string): void;                                                // finance: the money has moved
  approveRefund(id: string): void;                                             // HO (owner / planning): a full refund to the bank is approved
  writeOffStock(input: { optionId: string; size: string; qty: number; reason: StockWriteOff['reason']; disposition: StockWriteOff['disposition'] }): void;
  updateReturn(id: string, patch: Partial<Pick<ReturnCase, 'reason' | 'wants' | 'remarks'>>): void;
  punchOrder(input: PunchInput): string;
  punchBill(inputs: PunchInput[]): string[];   // one customer, several pieces, one bill — each piece is punched as its own order
  /* MTM production */
  setOrderTag(id: string, tag: OrderTag): void;
  editOrderSheet(id: string, patch: { fabricId?: string; fit?: string; qty?: number; tag?: OrderTag; remarks?: string; spec?: Partial<OrderSpec>; measurements?: Partial<OrderMeasurements>; pattern?: Partial<PatternFlags> }, note: string, who?: 'store' | 'unit'): void;
  /* production's two answers to a changed sheet */
  markChangeSeen(orderIds: string[]): void;
  markFactoryTold(orderIds: string[]): void;
  unplanOrders(orderIds: string[], note: string): void;
  reissueSheet(orderIds: string[]): void;
  submitPlan(factoryId: string, orderIds: string[], force?: boolean): string;   // capacity is a cap; force is a decision someone takes on the record
  scanOrders(orderIds: string[], stage: CustomerOrderStage): void;
  /* the vehicle round, piece by piece: received pieces get the RTS scan and one
     GRN; pieces not on the vehicle stay with the factory and are marked short;
     rejected pieces go back to the factory with the reason on the record */
  receiveRound(factoryId: string, round: { received: string[]; short: string[]; rejected: { id: string; reason: string }[]; vehicle: string; note: string }): void;
  closePlan(planId: string): void;
  updateVendor(id: string, patch: Partial<Pick<Vendor, 'tailors' | 'distanceKm' | 'leadDays' | 'moq' | 'dailyTarget' | 'corporate' | 'urgentReserve' | 'mtm' | 'location' | 'region' | 'blockWindowDays'>>): void;
  raiseExtraFabric(input: Pick<ExtraFabricRequest, 'orderId' | 'metres' | 'reason' | 'panel' | 'note'>): void;   // one piece of a bundle, never the whole bundle
  decideExtraFabric(id: string, status: 'approved' | 'declined' | 'sent'): void;
  /* warehouse — bespoke */
  reportMillStock(fabricId: string, available: boolean, metres?: number): void;
  inwardBespoke(code: string): { ok: boolean; orderNo?: string };
  importMillSheet(millId: string, text: string): number;
  saveMillStock(updates: { fabricId: string; metres: number }[], millId: string): void;
  callBespokeFabric(orderIds: string[]): void;
  receiveFabricGrn(fabricId: string, metres?: number): void;
  /* hub — RTW fulfilment */
  fulfilOrder(id: string): void;
  /* swatch books */
  dispatchSwatchBook(storeId: string, kind: 'MTM' | 'RTW' | 'BESPOKE', copies: number, from: string): void;
  askSwatchBooks(kind: 'MTM' | 'RTW' | 'BESPOKE', copies: number, reason: string): void;        // store → the unit
  answerBookRequest(id: string, decision: 'shipped' | 'declined', note?: string): void;          // warehouse: dispatch the books, or say why not
  receiveSwatchBook(id: string): void;
  advanceOrder(id: string): void;
  /* production moves the ship-by date of open MTM pieces, with the reason; the store sees the move */
  reviseShipBy(moves: { id: string; to: string }[], reason: string): void;
  cancelOrder(id: string): void;
  requestStock(input: Pick<StockRequest, 'optionId' | 'styleName' | 'size' | 'qty' | 'fromStoreId' | 'note'> & { purpose?: StockRequest['purpose'] }): void;
  respondStockRequest(id: string, status: StockRequest['status']): void;
}

let seq = 0;
/* The prototype's clock is fixed at TODAY so the seeded history is coherent.
   Writes advance from there in real time, so an edit reads "just now", not "in 1d". */
const BOOT = Date.now();
const now = () => new Date(TODAY.getTime() + (Date.now() - BOOT)).toISOString();

export const useAppStore = create<AppState>()(persist((set, get) => {
  const who = () => PEOPLE.find(p => p.id === get().personId)?.name ?? 'System';
  const round2 = (n: number) => Math.round(n * 100) / 100;
/* every sourcing action starts from a well-formed handoff state */
const ensureSourcing = (o: ProductionOrder) => { o.sourcing = o.sourcing ?? { stage:'vendors', submittedOn: null, extension: null, fabricPo: null }; };
/* what one MTM order holds on the shelf: its own costed consumption × pieces,
   falling back to the house average only when the sheet has no consumption */
const orderMetres = (o: { qty: number; consumptionM?: number | null }) => round2((o.consumptionM ?? METRES_PER_SHIRT) * o.qty);
/* stages past the point the cloth left the shelf — it is spent, not reserved */
const MTM_SPENT = ['in-transit', 'in-factory', 'out-factory', 'rts', 'dispatched', 'delivered', 'hemming'];

const touch = (fn: (db: Db) => void, msg?: string, tone: Toast['tone'] = 'ok') => {
    const prev = get().db;
    const db = structuredClone(prev); fn(db);
    set({ db, undoStack: [...get().undoStack, { db: prev, label: msg ?? 'that change' }].slice(-10) });
    if (msg) get().toast(msg, tone, true);
  };
  const log = (o: ProductionOrder, what: string) => o.activity.unshift({ at: now(), who: who(), what });
  /* The cloth becomes real at the PO, so it joins the fabric master here: an RTW
     fabric was only ever a quote until now, which is why nobody downstream could
     see it. Mint the row from the offer design accepted — name, composition,
     width, rate, the mill's article — then raise the same PO row the master
     already understands, so sourcing chases it and the warehouse receives it on
     the screens they already use. Shared by "raise the PO" and "push PO". */
  const mintFabricPo = (db: Db, o: ProductionOrder, q: FabricQuote) => {
    const no = `FPO #${2400 + db.orders.filter(x => x.sourcing?.fabricPo).length + 1}`;
    o.fabricMetres = o.fabricMetres ?? q.moq;                 // uncosted → the mill's minimum
    o.sourcing = { ...o.sourcing!, stage:'po-raised', fabricPo: { no, on: now(), metres: o.fabricMetres } };
    o.fabricBlocked = o.fabricMetres;
    const v = db.vendors.find(x => x.id === q.vendorId);
    const b = o.fabricBrief;
    const fabName = b?.look ? `${b.look}${b.colour ? ` - ${b.colour}` : ''}` : `${o.styleName}`;
    let f = db.fabrics.find(x => x.vendorId === q.vendorId && x.name.toLowerCase() === fabName.toLowerCase());
    if (!f) {
      f = { id:`fab-${Date.now().toString(36)}`,
        code: o.enigmaCode ?? `NO${(v?.name ?? 'XX').slice(0, 2).toUpperCase()}${fabName.replace(/[^A-Za-z]/g, '').slice(0, 6).toUpperCase().padEnd(6, 'X')}-${1600 + db.fabrics.length}`,
        name: fabName, bucket:'NON_CORE', family: /linen/i.test(q.composition ?? '') ? 'Linen' : 'Poplin',
        vendorId: q.vendorId, international: v?.kind === 'International mill',
        stockMetres: 0, reservedMetres: 0, thresholdMetres: v?.kind === 'International mill' ? 3 : 7, incomingMetres: 0,
        millAvailable: null, millStockMetres: null, millReportedAt: null, onHold: false, paused: null, weeklySalesShirts: Array(12).fill(0),
        vendorCode: q.vendorCode ?? o.vendorFabricCode ?? null, composition: q.composition, widthIn: q.widthCm ? Math.round(q.widthCm / 2.54) : null, cpm: q.cpm, mrp: null, swatchBook: null };
      db.fabrics.push(f);
    }
    f.cpm = f.cpm ?? q.cpm; f.incomingMetres = (f.incomingMetres ?? 0) + o.fabricMetres;
    o.enigmaCode = o.enigmaCode ?? f.code;
    /* the fabric PO is what fills the tracker's Fabric Details: vendor, the mill's article, the Enigma code, CPM, blocked */
    o.fabricVendorId = q.vendorId; o.costing.cpm = q.cpm; if (q.vendorCode) o.vendorFabricCode = q.vendorCode;
    o.fabricSupply = { boughtOn: now(), sentToFactoryOn: o.fabricSupply?.sentToFactoryOn ?? null, metresSent: o.fabricSupply?.metresSent ?? null, receipt: o.fabricSupply?.receipt ?? null };
    db.fabricPos = db.fabricPos ?? [];
    db.fabricPos.unshift({ id:`fpo-${Date.now().toString(36)}`, poNo: `FPO-${7100 + db.fabricPos.length}`, fabricId: f.id, vendorId: q.vendorId,
      metres: o.fabricMetres, raisedOn: now(), source:'manual', expectedOn: iso(addDays(TODAY, q.leadDays)),
      vendorConfirmedOn: null, vendorConfirmedBy: null,
      remark: `RTW bulk · ${o.styleName} · chosen by design at ₹${q.cpm}/m${q.moq > 0 ? ` · MOQ ${q.moq} m` : ''}`, receivedOn: null });
    const fm = o.milestones.find(m => m.key === 'Fabric PO'); if (fm && !fm.actual) fm.actual = now();
    log(o, `Fabric PO ${no} raised by design · ${o.fabricMetres} m from ${v?.name} at ₹${q.cpm}/m`);
  };
  /* every inward raises a numbered Goods Received Note */
  const grn = (db: Db, g: Omit<Grn, 'id' | 'grnNo' | 'receivedOn' | 'by' | 'invoiceNo' | 'poNo' | 'financeSeenOn'> & { invoiceNo?: string | null; poNo?: string | null }) => {
    db.grns = db.grns ?? []; const n = db.grns.length + 1; const grnNo = `GRN-26-${String(n).padStart(4, '0')}`;
    /* the note goes to finance the moment it is written — with the PO it was received against */
    db.grns.unshift({ ...g, id: `grn-${Date.now().toString(36)}-${n}`, grnNo, receivedOn: now(), by: who(), invoiceNo: g.invoiceNo ?? null, poNo: g.poNo ?? (g.kind === 'rtw-po' || g.kind === 'fabric' ? g.ref : null), financeSeenOn: null }); return grnNo; };

  return {
    db: SEED, role: 'design', personId: 'kunal', storeId: 'plh', factoryId: 'mahendra', toasts: [], undoStack: [], views: [], settings: { ppFreezeHours: 2, quiet: true }, demoAll: true,
    setDemoAll: v => { set({ demoAll: v }); get().toast(v ? 'Walkthrough mode on — every team\u2019s screens and buttons are open to you. Each one still says whose step it is.' : 'Walkthrough mode off — you only see and click what your own role does.'); },
    setQuiet: on => { set(s => ({ settings: { ...s.settings, quiet: on } })); },
    setFreezeHours: h => { set(s => ({ settings: { ...s.settings, ppFreezeHours: Math.max(0, Math.min(24, h)) } })); get().toast(`Freeze window set to ${Math.max(0, Math.min(24, h))} h — orders punched since then are held back from the plan.`); },
    setRole: r => set({ role: r, personId: PEOPLE.find(p => p.role === r)!.id }),
    setPerson: id => set({ personId: id, role: PEOPLE.find(p => p.id === id)!.role }),
    setStore: id => set({ storeId: id }),
    setFactory: id => set({ factoryId: id }),
    /* the merchandiser's own count for the day — production sees it against the scans */
    logFactoryOutput(factoryId, date, pieces, note) {
      touch(db => { db.factoryOutputs = db.factoryOutputs ?? [];
        const day = date.slice(0, 10); const found = db.factoryOutputs.find(f => f.factoryId === factoryId && f.date === day);
        if (found) { found.pieces = pieces; found.note = note; found.by = who(); found.at = now(); }
        else db.factoryOutputs.unshift({ id:`fo-${Date.now().toString(36)}`, factoryId, date: day, pieces, note, by: who(), at: now() });
      }, `Output logged — ${pieces} piece${pieces === 1 ? '' : 's'} for ${date.slice(0, 10)}. The production unit sees it against the scans.`);
    },
    markFactoryRead(orderIds) { touch(db => orderIds.forEach(id => { const o = (db.customerOrders ?? []).find(x => x.id === id); if (o) o.changeFactorySeenOn = now(); }), 'Marked read — the change is with the floor.'); },
    toast: (text, tone = 'ok', undo = false) => { const id = ++seq; const undoAt = get().undoStack.length;
      set(s => ({ toasts: [...s.toasts, { id, text, tone, undo, undoAt }] }));
      setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), undo ? 7000 : 3800); },
    saveView: (name, href) => { set(s => ({ views: [...s.views, { id:`v-${Date.now().toString(36)}`, name, href }] })); get().toast(`Saved \u201C${name}\u201D \u2014 it is in the sidebar now.`); },
    deleteView: id => set(s => ({ views: s.views.filter(v => v.id !== id) })),
    /* undo the change a specific toast is attached to — refuses once something
       else has landed on top, so two toasts can never revert the same thing */
    undoTo: depth => { if (get().undoStack.length !== depth) { get().toast('Something else changed since — undo from the record instead.', 'warn'); return; } get().undo(); },
    undo: () => { const stack = get().undoStack; const last = stack[stack.length - 1]; if (!last) return;
      set({ db: last.db, undoStack: stack.slice(0, -1), toasts: [] });
      const id = ++seq; set(s => ({ toasts: [...s.toasts, { id, text: `Undone — ${last.label.replace(/\.$/, '')}`, tone: 'ok' as const }] }));
      setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), 3000); },
    /* the blobs go with it, so nothing on the stack could be restored intact */
    reset: () => { void clearFiles(); set({ db: structuredClone(SEED), undoStack: [] }); get().toast('Workspace reset to seed.'); },

    /* ---------- planning & design ---------- */
    createRequirement(input) {
      const id = `ord-${Date.now().toString(36)}`;
      touch(db => db.orders.unshift({
        ...input, id, poNo: null, fabricQuotes: [], fabricVendorId: null, fabricMetres: null, vendorId: null, poDate: null, finalFob: null,
        costingClosure: { revised: null, plan: iso(addDays(TODAY, 10)), actual: null },
        bom: (input as { bom?: BomLine[] }).bom?.length ? (input as { bom?: BomLine[] }).bom! : defaultBom(input.category as GarmentCategory, input.styleName, input.fabricNominated), costing: defaultCosting(input.category as GarmentCategory),
        sampleVendorId: null, samples: [], materials: [], qcAudits: [],
        merchant: null, jobCardNo: null, fabricReady: false, trimsReady: false, milestones: [],
        shipheroName: input.styleName, vendorFabricCode: null, enigmaCode: null, fabricBlocked: null,
        sourcing: { stage: 'vendors', submittedOn: null, extension: null, fabricPo: null },
        cutQty: null, deliveredQty: null, rejectedQty: null, receipts: [], split: null, status: 'Requirement',
        activity: [{ at: now(), who: who(), what: 'Requirement created' }],
      }), 'Requirement created. It is now sourcing\'s turn.');
      return id;
    },
    updateRequirement(id, patch) { touch(db => { const o = db.orders.find(x => x.id === id); if (!o) return; Object.assign(o, patch); log(o, `Requirement updated · ${Object.keys(patch).join(', ')}`); }, 'Saved.'); },
    handToSourcing(id) { touch(db => { const o = db.orders.find(x => x.id === id); if (!o) return; o.status = 'Quoting'; o.sourcing = { stage:'vendors', submittedOn: null, extension: null, fabricPo: null }; log(o, `Sent to production · ${o.fabricBrief ? `${o.fabricBrief.look}${o.fabricBrief.composition ? ` · ${o.fabricBrief.composition}` : ''}${o.fabricBrief.colour ? ` · ${o.fabricBrief.colour}` : ''}` : 'no fabric brief'}`); }, 'Sent — production proposes a factory, and sourcing puts a vendor against the cloth, at the same time.'); },
    logProto(orderId, standIn) {
      touch(db => { const o = db.orders.find(x => x.id === orderId); if (!o) return; o.proto = o.proto ?? { standIn: null, rounds: [], skipped: null };
        if (standIn.trim()) o.proto.standIn = standIn.trim(); o.proto.skipped = null;
        o.proto.rounds.push({ round: o.proto.rounds.length + 1, submittedOn: now(), reviewedOn: null, reviewedBy: null, comments: [], decision: 'pending' });
        log(o, `Prototype round ${o.proto.rounds.length} back from the unit${o.proto.standIn ? ` · on ${o.proto.standIn}` : ''}`); },
        'Prototype logged — it is on design\'s desk.');
    },
    reviewProto(orderId, round, comments, decision) {
      touch(db => { const o = db.orders.find(x => x.id === orderId); const r = o?.proto?.rounds.find(x => x.round === round); if (!o || !r) return;
        r.comments = comments; r.decision = decision; r.reviewedOn = now(); r.reviewedBy = who();
        log(o, decision === 'approved' ? `Prototype approved on round ${round}` : `Prototype round ${round} sent back — ${comments.filter(c => c.major).length} major comment(s)`); },
        decision === 'approved' ? 'Prototype approved. Fill the BOM, attach the tech pack, then send it to sourcing.' : 'Sent back — the unit owes another prototype.', decision === 'approved' ? 'ok' : 'warn');
    },
    skipProto(orderId, reason) {
      touch(db => { const o = db.orders.find(x => x.id === orderId); if (!o) return; o.proto = { standIn: o.proto?.standIn ?? null, rounds: o.proto?.rounds ?? [], skipped: { by: who(), on: now(), reason } };
        log(o, `No prototype needed — ${reason}`); }, 'Recorded — no prototype for this style, with the reason.');
    },
    updateShortlist(orderId, list) {
      touch(db => { const o = db.orders.find(x => x.id === orderId); if (!o) return; o.fabricShortlist = list; if (o.fabricPick && !list.some(l => l.id === o.fabricPick!.shortlistId)) o.fabricPick = null;
        if (list.length && !o.fabricBrief) o.fabricBrief = { look: list[0].look, composition: list[0].composition, colour: list[0].colour, weightGsm: null, referenceFabricId: list[0].referenceFabricId, notes: list[0].note };
        log(o, `Fabric shortlist · ${list.length} candidate${list.length === 1 ? '' : 's'}`); }, list.length > 1 ? `${list.length} candidates — sourcing picks one.` : 'Saved.');
    },
    pickFromShortlist(orderId, shortlistId, why) {
      touch(db => { const o = db.orders.find(x => x.id === orderId); const c = o?.fabricShortlist?.find(x => x.id === shortlistId); if (!o || !c) return;
        o.fabricPick = { shortlistId, by: who(), on: now(), why };
        o.fabricBrief = { look: c.look, composition: c.composition, colour: c.colour, weightGsm: o.fabricBrief?.weightGsm ?? null, referenceFabricId: c.referenceFabricId, notes: [c.note, why].filter(Boolean).join(' · ') };
        const fl = o.bom.find(l => l.kind === 'fabric'); if (fl) { fl.item = c.look; fl.spec = [c.composition, c.colour].filter(Boolean).join(' · ') || fl.spec; }
        log(o, `Sourcing picked "${c.look}" from the shortlist — ${why}`); }, 'Cloth picked from the shortlist. Now add the vendor for it.');
    },
    markMaterialsCovered(orderId) {
      touch(db => { const o = db.orders.find(x => x.id === orderId); if (!o) return; o.materialsCovered = { on: now(), by: who() }; o.trimsReady = true;
        log(o, 'Trims and packaging covered — on the shelf or on a dated bulk order'); }, 'Materials covered. Allocation and the job card can go ahead.');
    },
    updateBom(id, bom) { touch(db => { const o = db.orders.find(x => x.id === id); if (!o) return; o.bom = bom; log(o, `BOM updated · ${bom.length} lines`); }, 'BOM saved.'); },
    decideOption(optionId, decision, note, qty) {
      touch(db => { const o = db.options.find(x => x.id === optionId); if (!o) return;
        if (decision === 'promote-to-core') o.core = true;
        if (decision === 'reorder') o.incomingQty += qty ?? 150;
        /* reintroduce = make it active again; the PO is the same reorder step,
           taken in the same click when there is nothing left on the shelf */
        if (decision === 'reintroduce') { o.inactive = null; if (qty) o.incomingQty += qty; }
        if (decision === 'make-inactive' || decision === 'liquidate') o.inactive = { on: now(), by: who(), reason: note.trim() || (decision === 'liquidate' ? 'liquidated — pulled from displays' : 'taken off the shelf') };
        void note;
      }, decision === 'reorder' ? `Reorder for ${qty ?? 150} pcs raised — it now shows as incoming.`
        : decision === 'promote-to-core' ? 'Promoted to core. It will now be replenished.'
        : decision === 'reintroduce' ? (qty ? `Active again, and ${qty} pcs on order.` : 'Active again — it is back in the option count.')
        : decision === 'make-inactive' ? 'Taken off the shelf. It keeps its history and stops being counted as a live option.'
        : 'Marked for liquidation, pulled from displays, and taken off the shelf.');
    },

    /* ---------- RTW planning review ---------- */
    startPlanningReview(input) {
      const id = `pr-${Date.now().toString(36)}`;
      touch(db => { db.planningReviews = db.planningReviews ?? []; db.planningReviews.unshift({ ...input, id, on: now(), by: who(), status: 'draft', approvedQty: null, approvedRatio: null, approvedOn: null, approvedBy: null, requirementId: null, constraintNote: '', displayExtra: null, moq: null }); },
        'Planning review started. The rate, the projection and the draft are saved as they stand today.');
      return id;
    },
    updatePlanningReview(id, patch) { touch(db => { const r = (db.planningReviews ?? []).find(x => x.id === id); if (!r || r.status === 'sent') return; Object.assign(r, patch); }, 'Saved.'); },
    approvePlanningReview(id, approvedQty, approvedRatio, constraintNote) {
      touch(db => { const r = (db.planningReviews ?? []).find(x => x.id === id); if (!r) return;
        r.approvedQty = approvedQty; r.approvedRatio = approvedRatio; r.constraintNote = constraintNote; r.status = 'approved'; r.approvedOn = now(); r.approvedBy = who(); },
        `Plan approved · ${approvedQty} pcs. Send it to design to raise the requirement.`);
    },
    sendPlanningReviewToDesign(id, category, subCategory, targetCost) {
      const r = (get().db.planningReviews ?? []).find(x => x.id === id);
      if (!r || r.status !== 'approved' || !r.approvedRatio || r.approvedQty == null) return null;
      const o = get().db.options.find(x => x.id === r.optionId);
      const reqId = get().createRequirement({
        category, subCategory, styleName: r.styleName, program: o?.core ? 'Core' : null, launchMonth: null, fit: null,
        orderQty: r.approvedQty, sizeBreakup: r.approvedRatio, targetInhouse: iso(addDays(TODAY, r.leadWeeks * 7)), targetCost,
        styleHandover: now(), fabricNominated: true, sourcingMode: 'bsc-buys', remarks: '',
        fabricBrief: { look: o?.fabricCode ? `Same cloth as before · ${o.fabricCode}` : 'Same cloth as the last run', composition: null, colour: null, weightGsm: null, referenceFabricId: null, notes: `Planning review · ${r.kind} · plan rate ${r.planRos.toFixed(1)}/wk (observed ${r.observedRos.toFixed(1)}) · ${r.coverWeeksTarget} wk cover after arrival${r.constraintNote ? ` · ${r.constraintNote}` : ''}` },
        proto: { standIn: null, rounds: [], skipped: { by: who(), on: now(), reason: r.kind === 'new' ? 'repeat of a new option — proto was on the first run' : 'repeat order — no prototype needed' } },
      } as Parameters<AppState['createRequirement']>[0]);
      touch(db => { const x = (db.planningReviews ?? []).find(y => y.id === id); if (x) { x.status = 'sent'; x.requirementId = reqId; } }, 'Sent to design as an RTW requirement. When design sends it on, it shows on the tracker as "no PO yet".');
      return reqId;
    },

    /* ---------- launches ---------- */
    createLaunch(input) {
      const id = `ln-${Date.now().toString(36)}`;
      touch(db => { db.launches = db.launches ?? []; db.launches.unshift({ ...input, id, receivedAtHo: null, pieces: [], marketingName: null, marketingBriefOn: null, launchedOn: null }); }, 'Added to the drop. Gates start ticking from here.');
      return id;
    },
    mintLaunchDesignCode(id) {
      touch(db => { const l = (db.launches ?? []).find(x => x.id === id); if (!l || l.designCode || !l.receivedAtHo) return;
        const o = db.orders.find(x => x.id === l.orderId);
        const cat = (o?.category ?? l.styleName).toLowerCase();
        const fam = cat.includes('knit') && cat.includes('t-shirt') ? 'TEE' : cat.includes('jean') ? 'JEA' : cat.includes('kurta') ? 'KUR' : cat.includes('bottom') ? 'BOT' : 'SHI';
        const seq = 5600 + (db.launches ?? []).filter(x => x.designCode).length;
        l.designCode = `BOM-${fam}-RW-${seq}`; l.designCodeOn = now(); l.designCodeBy = who();
        if (o) log(o, `Design code ${l.designCode} minted`);
      }, 'Design code minted — the style can be set up to sell.');
    },
    updateLaunch(id, patch) { touch(db => { const l = (db.launches ?? []).find(x => x.id === id); if (!l) return;
        if (patch.marketingName !== undefined && l.marketingName && patch.marketingName && patch.marketingName !== l.marketingName) l.nameHistory = [...(l.nameHistory ?? []), { name: l.marketingName, until: now(), by: who(), note: 'renamed' }];
        Object.assign(l, patch); }, patch.launchedOn ? 'Launched. It is live in stores and the option book now counts it.' : 'Saved.'); },
    allocateLaunch(id, pieces) {
      touch(db => { const l = (db.launches ?? []).find(x => x.id === id); if (!l) return;
        l.pieces = pieces === 'default' ? defaultLaunchPieces(l.styleName, STORES.filter(s => s.holdsRtwStock).map(s => s.id)) : pieces;
      }, 'Display & fit plan set — issued at COGS, kept out of sellable stock.');
    },
    dispatchLaunch(id, storeId) { touch(db => { const l = (db.launches ?? []).find(x => x.id === id); if (!l) return; l.pieces.forEach(p => { if ((storeId === 'all' || p.storeId === storeId) && !p.dispatchedOn) p.dispatchedOn = now(); }); }, storeId === 'all' ? 'Dispatched to every store. Each one now has a receipt to confirm.' : 'Dispatched.'); },
    receiveLaunch(id, storeId) { touch(db => { const l = (db.launches ?? []).find(x => x.id === id); if (!l) return; l.pieces.forEach(p => { if (p.storeId === storeId && p.dispatchedOn && !p.receivedOn) p.receivedOn = now(); }); }, 'Confirmed. Planning can see your displays are up.'); },

    /* ---------- option requests ---------- */
    createOptionRequest(i) {
      const id = `orq-${Date.now().toString(36)}`;
      touch(db => { db.optionRequests = db.optionRequests ?? [];
        const n = db.optionRequests.length + 1;
        db.optionRequests.unshift({ id, reqNo: `REQ-${String(n).padStart(3, '0')}`, category: i.category, brief: i.brief, raisedBy: who(), raisedOn: now(),
          liveBy: i.liveBy, targetCost: i.targetCost, optionCount: i.optionCount,
          options: Array.from({ length: i.optionCount }, (_, k) => ({ id:`${id}-o${k + 1}`, index: k + 1, note: i.notes[k] ?? '', status:'open' as const, offers: [], sentOn: null, extension: null, closed: null, fabricId: null, fabricPoId: null })),
          bom: i.bom }); },
        `Request raised — ${i.optionCount} option${i.optionCount === 1 ? '' : 's'} for sourcing to fill.`);
      return id;
    },
    updateOptionAsk(requestId, optionId, ask, note) { touch(db => { const r = (db.optionRequests ?? []).find(x => x.id === requestId); const o = r?.options.find(x => x.id === optionId); if (!o) return; o.ask = ask; if (note.trim()) o.note = note.trim(); }, 'Ask saved — sourcing shops against it.'); },
    updateRequestBom(id, bom) { touch(db => { const r = (db.optionRequests ?? []).find(x => x.id === id); if (r) r.bom = bom; }, 'Bill of materials saved.'); },
    /* One vendor per slot. A second "add" while one is live replaces it — the
       old one stays on the record as withdrawn, so the history is not lost. */
    addRequestOffer(id, optionId, o) {
      touch(db => { const opt = (db.optionRequests ?? []).find(x => x.id === id)?.options.find(x => x.id === optionId); if (!opt || opt.status === 'closed' || opt.status === 'po-raised') return;
        opt.offers.filter(x => !x.rejected && !x.selected).forEach(x => (x.rejected = { by: who(), on: now(), reason:'replaced by sourcing' }));
        opt.offers.push({ ...o, id:`off-${Date.now().toString(36)}-${opt.offers.length}`, selected: false, chosenBy: null, chosenOn: null, rationale:'', rejected: null, extensionAsked: null }); },
        'Vendor put against the option.');
    },
    updateRequestOffer(id, optionId, offerId, patch) {
      touch(db => { const o = (db.optionRequests ?? []).find(x => x.id === id)?.options.find(x => x.id === optionId)?.offers.find(x => x.id === offerId); if (!o || o.selected) return;
        Object.assign(o, patch); }, 'Vendor updated.');
    },
    /* the mill will not hold, or sourcing wants a different vendor: the current
       one is withdrawn (kept as history) and the option goes back to "add vendors" */
    removeRequestOffer(id, optionId, offerId) {
      touch(db => { const opt = (db.optionRequests ?? []).find(x => x.id === id)?.options.find(x => x.id === optionId); if (!opt) return;
        const o = opt.offers.find(x => x.id === offerId); if (!o || o.selected) return;
        o.rejected = { by: who(), on: now(), reason:'withdrawn by sourcing — the mill would not hold' }; o.extensionAsked = null;
        if (opt.extension) opt.extension.resolvedOn = now();
        opt.status = 'open'; opt.sentOn = null; }, 'Vendor withdrawn — the option is back with you to fill.', 'warn');
    },
    sendOptionToDesign(id, optionId) {
      touch(db => { const opt = (db.optionRequests ?? []).find(x => x.id === id)?.options.find(x => x.id === optionId); if (!opt || !opt.offers.length) return;
        opt.status = 'with-design'; opt.sentOn = now(); }, 'Sent to design — their call on this option.');
    },
    /* Design decides a slot is not happening. Kept, with the reason, because
       "we asked for ten and went with seven" is a fact the next meeting wants. */
    closeOption(id, optionId, reason) {
      touch(db => { const opt = (db.optionRequests ?? []).find(x => x.id === id)?.options.find(x => x.id === optionId); if (!opt || opt.status === 'po-raised') return;
        opt.status = 'closed'; opt.closed = { by: who(), on: now(), reason }; if (opt.extension) opt.extension.resolvedOn = now(); }, 'Option closed — not going ahead with this one.', 'warn');
    },
    reopenOption(id, optionId) {
      touch(db => { const opt = (db.optionRequests ?? []).find(x => x.id === id)?.options.find(x => x.id === optionId); if (!opt || opt.status !== 'closed') return;
        opt.closed = null; const live = opt.offers.some(x => !x.rejected); opt.status = live ? 'with-design' : 'open'; opt.sentOn = live ? now() : null; }, 'Option reopened.');
    },
    rejectRequestOffer(id, optionId, offerId, reason) {
      touch(db => { const opt = (db.optionRequests ?? []).find(x => x.id === id)?.options.find(x => x.id === optionId); const o = opt?.offers.find(x => x.id === offerId); if (!opt || !o || o.selected || opt.status === 'closed' || opt.status === 'po-raised') return;
        o.rejected = { by: who(), on: now(), reason }; o.extensionAsked = null;
        if (opt.offers.every(x => x.rejected)) { opt.status = 'open'; opt.sentOn = null; if (opt.extension) opt.extension.resolvedOn = now(); } },   // nothing left — back to sourcing for more
        'Rejected — the reason is on the record for sourcing.', 'warn');
    },
    askOptionExtension(id, optionId, offerId, note) {
      touch(db => { const opt = (db.optionRequests ?? []).find(x => x.id === id)?.options.find(x => x.id === optionId); if (!opt) return;
        opt.status = 'extension'; opt.extension = { askedOn: now(), by: who(), note, resolvedOn: null };
        const o = offerId ? opt.offers.find(x => x.id === offerId) : null; if (o) o.extensionAsked = { by: who(), on: now() }; },
        'Extension asked. Sourcing will go back to the mill.', 'warn');
    },
    extendRequestOffer(id, optionId, offerId, until) {
      touch(db => { const o = (db.optionRequests ?? []).find(x => x.id === id)?.options.find(x => x.id === optionId)?.offers.find(x => x.id === offerId); if (!o) return;
        o.holdUntil = until; o.extensionAsked = null; }, 'Hold extended.');
    },
    sendOptionBack(id, optionId) {
      touch(db => { const opt = (db.optionRequests ?? []).find(x => x.id === id)?.options.find(x => x.id === optionId); if (!opt) return;
        if (opt.extension) opt.extension.resolvedOn = now(); opt.offers.forEach(x => (x.extensionAsked = null)); opt.status = 'with-design'; opt.sentOn = now(); }, 'Back with design.');
    },
    /* Design's yes is one click: the mill is chosen, the cloth joins the fabric
       master with every detail off the sample, and the PO is raised against it
       so sourcing can chase it and the warehouse can receive it. */
    acceptOfferAndRaisePo(id, optionId, offerId, metres, rationale) {
      touch(db => { const r = (db.optionRequests ?? []).find(x => x.id === id); const opt = r?.options.find(x => x.id === optionId); const o = opt?.offers.find(x => x.id === offerId); if (!r || !opt || !o || o.rejected || opt.status === 'closed' || opt.status === 'po-raised' || opt.fabricPoId) return;
        opt.offers.forEach(x => (x.selected = x.id === offerId)); o.chosenBy = who(); o.chosenOn = now(); o.rationale = rationale;
        const v = db.vendors.find(x => x.id === o.vendorId);
        let f = o.fabricId ? db.fabrics.find(x => x.id === o.fabricId) : undefined;
        if (!f) {
          f = { id:`fab-${Date.now().toString(36)}`, code:`NO${(v?.name ?? 'XX').slice(0, 2).toUpperCase()}${o.name.replace(/[^A-Za-z]/g, '').slice(0, 6).toUpperCase().padEnd(6, 'X')}-${1600 + db.fabrics.length}`,
            name: o.name, bucket:'NON_CORE', family: /linen/i.test(o.composition) ? 'Linen' : /oxford/i.test(o.name) ? 'Oxford' : /twill|herringbone/i.test(o.name) ? 'Twill' : /check/i.test(o.name) ? 'Checks' : 'Poplin',
            vendorId: o.vendorId, international: v?.kind === 'International mill',
            stockMetres: 0, reservedMetres: 0, thresholdMetres: v?.kind === 'International mill' ? 3 : 7, incomingMetres: 0,
            millAvailable: null, millStockMetres: null, millReportedAt: null, onHold: true, paused: null, weeklySalesShirts: Array(12).fill(0),
            vendorCode: o.vendorCode, composition: o.composition, widthIn: o.widthIn, cpm: o.cpm, mrp: null, swatchBook: o.book };
          db.fabrics.push(f);
        }
        f.cpm = f.cpm ?? o.cpm; f.incomingMetres = (f.incomingMetres ?? 0) + metres; o.fabricId = f.id;
        db.fabricPos = db.fabricPos ?? [];
        const poId = `fpo-${Date.now().toString(36)}`;
        db.fabricPos.unshift({ id: poId, poNo:`FPO-${7100 + db.fabricPos.length}`, fabricId: f.id, vendorId: o.vendorId, metres, raisedOn: now(), source:'manual',
          expectedOn: iso(addDays(TODAY, o.leadDays)), vendorConfirmedOn: null, vendorConfirmedBy: null,
          remark: `${r.reqNo} option ${opt.index} · ${r.category} · chosen by ${who()} at ₹${o.cpm}/m · article ${o.vendorCode || '—'}`, receivedOn: null });
        opt.fabricId = f.id; opt.fabricPoId = poId; opt.status = 'po-raised';
        /* the cloth now has a life after the PO — swatches, designs, stores, online —
           and that life is a concept record. One per fabric, made here so the
           request's option and the swatch desk are the same thing, not two. */
        if (!db.concepts.some(c => c.fabricId === f.id)) db.concepts.push({
          id:`cn-${r.reqNo.toLowerCase()}-o${opt.index}`, name: o.name, kind:'new-fabric',
          brief:`${r.reqNo} · option ${opt.index}${opt.note ? ` — ${opt.note}` : ''}. ${r.brief}`, raisedBy: r.raisedBy, raisedOn: r.raisedOn,
          spec: null, baseFabricId: null, book: o.book ?? null, targetMonth: r.liveBy ?? null, fabricOptions: [], optionsSentOn: null, optionsExtension: null,
          fabricId: f.id, blockId: null, fabricPo: { on: now(), metres }, factoryId: null, patSentOn: null, rounds: [],
          approvalSentOn: now(), approvalBy: who(),   // a request's cloth is approved by the request itself — no sample gate on this path
          enigma: { template: null, consumptionBase: null, consumptionBuffer: null, options: [], configuredOn: null, by: null },
          naming: { oldName: o.name, newName: null, mrp: null, setOn: null }, marketing: null, liveOn: null, designs: [], swatch: null, online: null }); },
        'Chosen and the PO is raised — it is on the fabric master for sourcing to chase.');
    },
    /* ---------- sourcing ---------- */
    addFabricQuote(orderId, q) {
      touch(db => { const o = db.orders.find(x => x.id === orderId); if (!o) return; ensureSourcing(o);
        /* ONE vendor against a style — the same rule as an option. A second add
           replaces the one not yet chosen; the swap is on the activity log. */
        const prev = o.fabricQuotes.find(x => !x.selected); if (prev) log(o, `Vendor replaced · ${db.vendors.find(v => v.id === prev.vendorId)?.name} withdrawn by sourcing`);
        o.fabricQuotes = o.fabricQuotes.filter(x => x.selected);
        o.fabricQuotes.push({ ...q, id: `fq-${Date.now().toString(36)}`, selected: false, extendedOn: null, extensionAskedOn: null });
        if (o.status === 'Requirement') o.status = 'Quoting';
        if (!o.sourcing) o.sourcing = { stage:'vendors', submittedOn: null, extension: null, fabricPo: null };
        log(o, `Vendor added · ${db.vendors.find(v => v.id === q.vendorId)?.name} · ₹${q.cpm}/m · ${q.leadDays}d lead${q.blockValidUntil ? ` · holds until ${q.blockValidUntil.slice(0, 10)}` : ''}`); }, 'Vendor added with its terms.');
    },
    /* Dropping the last vendor is not "no options", it is "start again" — the
       stage goes back to sourcing, or nobody can act on the row again. */
    removeFabricQuote(orderId, quoteId) {
      touch(db => { const o = db.orders.find(x => x.id === orderId); if (!o) return; ensureSourcing(o);
        const q = o.fabricQuotes.find(x => x.id === quoteId); if (!q || q.selected) return;
        o.fabricQuotes = o.fabricQuotes.filter(x => x.id !== quoteId);
        if (o.fabricQuotes.length === 0) { o.sourcing.stage = 'vendors'; o.sourcing.submittedOn = null; o.sourcing.extension = null; }
        log(o, `Vendor removed · ${db.vendors.find(v => v.id === q.vendorId)?.name}${o.fabricQuotes.length === 0 ? ' — no options left, back to sourcing' : ''}`); }, 'Vendor removed.');
    },
    submitToDesign(orderId) {
      touch(db => { const o = db.orders.find(x => x.id === orderId); if (!o || !o.fabricQuotes.length) return; ensureSourcing(o);
        o.sourcing = { ...(o.sourcing ?? { extension: null, fabricPo: null }), stage:'design-choice', submittedOn: now() };
        log(o, `${o.fabricQuotes.length} vendor option${o.fabricQuotes.length === 1 ? '' : 's'} sent to design to choose`); }, 'Sent to design. It is their turn to choose.');
    },
    askExtension(orderId, note, quoteId) {
      touch(db => { const o = db.orders.find(x => x.id === orderId); if (!o) return; ensureSourcing(o);
        o.sourcing = { ...o.sourcing, stage:'extension', extension: { askedOn: now(), by: who(), note, resolvedOn: null } };
        const q = quoteId ? o.fabricQuotes.find(x => x.id === quoteId) : null;
        if (q) q.extensionAskedOn = now();
        /* planning can ask too — record the team that actually clicked */
        const team = PEOPLE.find(pp => pp.id === get().personId)?.role ?? 'design';
        log(o, `${team[0].toUpperCase()}${team.slice(1)} asked sourcing for an extension · ${note || 'no reason given'}`); }, 'Extension asked. Sourcing will go back to the mills.', 'warn');
    },
    extendQuote(orderId, quoteId, until) {
      touch(db => { const o = db.orders.find(x => x.id === orderId); const q = o?.fabricQuotes.find(x => x.id === quoteId); if (!o || !q) return;
        q.blockValidUntil = until; q.extendedOn = now(); q.extensionAskedOn = null;
        log(o, `${db.vendors.find(v => v.id === q.vendorId)?.name} extended the hold to ${until.slice(0, 10)}`); }, 'Hold extended.');
    },
    sendBackToDesign(orderId) {
      touch(db => { const o = db.orders.find(x => x.id === orderId); if (!o) return; ensureSourcing(o);
        if (o.sourcing.extension) o.sourcing.extension.resolvedOn = now();
        o.sourcing.stage = 'design-choice'; o.sourcing.submittedOn = now();
        log(o, 'Holds extended — back with design to choose'); }, 'Back with design.');
    },
    /* Design can throw a mill out — the shade is wrong, the hand is wrong, the
       date is wrong. The reason stays on the option so sourcing is not guessing
       what to go back with; the last one out sends the whole thing back to them. */
    rejectFabricQuote(orderId, quoteId, reason) {
      touch(db => { const o = db.orders.find(x => x.id === orderId); if (!o) return; ensureSourcing(o);
        const q = o.fabricQuotes.find(x => x.id === quoteId); if (!q || q.selected) return;
        o.fabricQuotes = o.fabricQuotes.filter(x => x.id !== quoteId);
        const name = db.vendors.find(v => v.id === q.vendorId)?.name;
        if (o.fabricQuotes.length === 0) { o.sourcing.stage = 'vendors'; o.sourcing.submittedOn = null; o.sourcing.extension = null; }
        log(o, `Design rejected ${name} · ${reason || 'no reason given'}${o.fabricQuotes.length === 0 ? ' — nothing left, back to sourcing for more mills' : ''}`); },
        'Rejected. The reason is on the record for sourcing.', 'warn');
    },
    chooseFabricVendor(orderId, quoteId, rationale) {
      touch(db => { const o = db.orders.find(x => x.id === orderId); const q = o?.fabricQuotes.find(x => x.id === quoteId); if (!o || !q) return;
        o.fabricQuotes.forEach(x => (x.selected = x.id === quoteId));
        o.fabricVendorId = q.vendorId;
        const metres = o.costing.consumption != null ? Math.ceil(o.costing.consumption * o.orderQty) : null;
        o.fabricMetres = metres != null ? Math.max(metres, q.moq) : null;
        o.costing.cpm = q.cpm;                                  // the COGS sheet's CPM is the quote we accepted
        o.status = 'Allocated';                                 // fabric settled; a factory still has to have the capacity
        o.sourcing = { ...(o.sourcing ?? { submittedOn: null, extension: null, fabricPo: null }), stage:'chosen' };
        log(o, `Design chose ${db.vendors.find(v => v.id === q.vendorId)?.name} at ₹${q.cpm}/m · ${o.fabricMetres} m${q.moq > (metres ?? 0) ? ` (MOQ ${q.moq} m)` : ''} · ${rationale || 'no rationale given'}`);
      }, 'Chosen. Sourcing raises the fabric PO next.');
    },
    /* the same undo on a requirement — only before the fabric PO goes out */
    unchooseFabricVendor(orderId) {
      touch(db => { const o = db.orders.find(x => x.id === orderId); if (!o) return; ensureSourcing(o);
        if (o.sourcing.fabricPo) return;
        o.fabricQuotes.forEach(q => (q.selected = false));
        o.fabricVendorId = null; o.fabricMetres = null; o.fabricBlocked = null;
        o.status = 'Quoting'; o.sourcing.stage = 'design-choice'; o.sourcing.submittedOn = o.sourcing.submittedOn ?? now();
        log(o, 'Design unchose the mill — the options are back on the table'); },
        'Unchosen — the options are back on the table.', 'warn');
    },
    raiseOrderFabricPo(orderId, metres) {
      touch(db => { const o = db.orders.find(x => x.id === orderId); const q = o?.fabricQuotes.find(x => x.selected); if (!o || !q) return;
        ensureSourcing(o); if (o.sourcing.fabricPo) return;
        if (metres != null && metres > 0) { if (metres !== o.fabricMetres) log(o, `Design set the PO at ${metres} m (computed ${o.fabricMetres ?? '—'} m)`); o.fabricMetres = metres; }
        mintFabricPo(db, o, q);
      }, 'Fabric PO raised. Sourcing now gets the cloth in; a factory still needs the capacity.');
    },
    /* Design's yes on a bulk style is one click: this vendor, and the PO against it. */
    acceptQuoteAndRaisePo(orderId, quoteId, rationale, metresTyped) {
      touch(db => { const o = db.orders.find(x => x.id === orderId); const q = o?.fabricQuotes.find(x => x.id === quoteId); if (!o || !q) return;
        ensureSourcing(o); if (o.sourcing.fabricPo) return;
        o.fabricQuotes.forEach(x => (x.selected = x.id === quoteId));
        o.fabricVendorId = q.vendorId;
        const metres = o.costing.consumption != null ? Math.ceil(o.costing.consumption * o.orderQty) : null;
        o.fabricMetres = metresTyped != null && metresTyped > 0 ? metresTyped : metres != null ? Math.max(metres, q.moq) : null;
        o.costing.cpm = q.cpm; if (o.status === 'Quoting' || o.status === 'Requirement') o.status = 'Quoting';
        if (o.sourcing.extension) o.sourcing.extension.resolvedOn = now();
        log(o, `Design chose ${db.vendors.find(v => v.id === q.vendorId)?.name} at ₹${q.cpm}/m · ${rationale || 'no rationale given'}`);
        mintFabricPo(db, o, q);
      }, 'Fabric PO raised — sourcing gets the cloth in; the row is on the fabric master.');
    },
    updateFabricQuote(orderId, quoteId, patch) {
      touch(db => { const o = db.orders.find(x => x.id === orderId); const q = o?.fabricQuotes.find(x => x.id === quoteId); if (!o || !q || q.selected) return;
        Object.assign(q, patch); log(o, `Vendor terms updated · ${db.vendors.find(v => v.id === q.vendorId)?.name}`); }, 'Vendor updated.');
    },
    proposeFactory(orderId, vendorId, quotedCost, estimatedInhouse, note) {
      touch(db => { const o = db.orders.find(x => x.id === orderId); if (!o) return; o.factoryProposals = o.factoryProposals ?? [];
        o.factoryProposals.push({ id:`fp-${Date.now().toString(36)}`, vendorId, quotedCost, estimatedInhouse, note, proposedOn: now(), by: who(), decision: null });
        if (o.status === 'Requirement') o.status = 'Quoting';
        log(o, `Factory proposed to design · ${db.vendors.find(v => v.id === vendorId)?.name} at ₹${quotedCost}/pc, in-house by ${new Date(estimatedInhouse).toLocaleDateString('en-IN')}${note ? ` · ${note}` : ''}`); },
        'Proposal sent to design — they accept it, or send it back with a comment.');
    },
    decideFactory(orderId, proposalId, accepted, comment) {
      touch(db => { const o = db.orders.find(x => x.id === orderId); const p = o?.factoryProposals?.find(x => x.id === proposalId); if (!o || !p) return;
        p.decision = { by: who(), on: now(), accepted, comment };
        log(o, accepted ? `Design accepted ${db.vendors.find(v => v.id === p.vendorId)?.name} at ₹${p.quotedCost}/pc${comment ? ` · ${comment}` : ''} — PO to raise` : `Design sent the proposal back · ${comment || 'no comment'}`); },
        accepted ? 'Accepted. Raise the PO to the factory from the same card.' : 'Sent back to production with your comment.', accepted ? 'ok' : 'warn');
    },
    raiseFactoryPo(orderId) {
      touch(db => { const o = db.orders.find(x => x.id === orderId); if (!o) return;
        const p = [...(o.factoryProposals ?? [])].reverse().find(x => x.decision?.accepted); if (!p || o.poNo) return;
        const have = (label: string) => (db.attachments ?? []).some(a => a.kind === 'order' && a.subjectId === o.id && a.label === label);
        const docs = ['Tech pack', 'Job card', 'Trim card']; const sent = docs.filter(have); const missing = docs.filter(d => !have(d)); if (!o.bom.length) missing.push('BOM');
        o.vendorId = p.vendorId; o.poDate = now(); o.poNo = `PO #${15500 + db.orders.filter(x => x.poNo).length + 1}`; o.status = 'Open';
        o.finalFob = p.quotedCost; o.costingClosure.actual = now(); o.targetInhouse = o.targetInhouse; 
        o.merchant = o.merchant ?? MERCHANDISERS[db.orders.filter(x => x.status === 'Open').length % 3];
        o.milestones = buildMilestones(o.category as GarmentCategory, o.poDate);
        if (!o.materials?.length) o.materials = defaultMaterials(o);
        if (!o.sampleVendorId) o.sampleVendorId = p.vendorId;
        o.factoryPo = { raisedOn: now(), by: who(), docsSent: sent.concat(o.bom.length ? ['BOM'] : []), docsMissing: missing };
        o.fabricSupply = o.fabricSupply ?? { boughtOn: null, sentToFactoryOn: null, metresSent: null, receipt: null };
        log(o, `PO raised to ${db.vendors.find(v => v.id === p.vendorId)?.name} · ₹${p.quotedCost}/pc · TNA generated (${o.milestones.length} steps) · sent with ${sent.concat(o.bom.length ? ['BOM'] : []).join(', ') || 'no documents'}${missing.length ? ` · still owed: ${missing.join(', ')}` : ''}`); },
        'PO raised. The factory has it, with whatever documents were on the record; sourcing sees the fabric to buy.');
    },
    saveFabricDetails(orderId, d) {
      touch(db => { const o = db.orders.find(x => x.id === orderId); if (!o) return;
        o.fabricVendorId = d.fabricVendorId; o.vendorFabricCode = d.vendorFabricCode; o.enigmaCode = d.enigmaCode; o.costing.cpm = d.cpm; o.fabricBlocked = d.fabricBlocked; o.costing.consumption = d.consumption;
        if (d.consumption != null) o.fabricMetres = Math.ceil(d.consumption * o.orderQty);
        o.fabricSupply = o.fabricSupply ?? { boughtOn: null, sentToFactoryOn: null, metresSent: null, receipt: null };
        log(o, `Fabric details · ${db.vendors.find(v => v.id === d.fabricVendorId)?.name ?? 'mill to decide'}${d.enigmaCode ? ` · ${d.enigmaCode}` : ''}${d.cpm != null ? ` · ₹${d.cpm}/m` : ''}`); }, 'Fabric details saved.');
    },
    markFabricBought(orderId) { touch(db => { const o = db.orders.find(x => x.id === orderId); if (!o) return; o.fabricSupply = { ...(o.fabricSupply ?? { sentToFactoryOn: null, metresSent: null, receipt: null }), boughtOn: now() }; o.fabricReady = true; log(o, 'Fabric bought — on its way from the mill'); }, 'Fabric marked bought. Next: send it to the factory.'); },
    markFabricSent(orderId, metres) { touch(db => { const o = db.orders.find(x => x.id === orderId); if (!o) return; o.fabricSupply = { ...(o.fabricSupply ?? { boughtOn: now(), receipt: null }), boughtOn: o.fabricSupply?.boughtOn ?? now(), sentToFactoryOn: now(), metresSent: metres ?? o.fabricMetres ?? null, receipt: o.fabricSupply?.receipt ?? null }; log(o, `Fabric sent to the factory · ${metres ?? o.fabricMetres ?? '—'} m`); }, 'Sent. The factory confirms what lands.'); },
    confirmFabricReceipt(orderId, metresOk, metresDamaged, note) {
      touch(db => { const o = db.orders.find(x => x.id === orderId); if (!o) return; o.fabricSupply = { ...(o.fabricSupply ?? { boughtOn: now(), sentToFactoryOn: now(), metresSent: null }), receipt: { on: now(), by: who(), metresOk, metresDamaged, note } };
        const fab = (o.materials ?? []).find(m => o.bom[m.bomIndex]?.kind === 'fabric'); if (fab) { fab.receivedOn = now(); fab.checked = 'ok'; }
        const ms = o.milestones.find(x => x.key === 'Fabric ETA'); if (ms && !ms.actual) ms.actual = now();
        const need = o.fabricMetres ?? 0; const short = need - metresOk;
        log(o, `Factory confirmed fabric · ${metresOk} m usable${metresDamaged ? `, ${metresDamaged} m damaged` : ''}${need && short > 0 ? ` · ${short} m short of the ${need} m needed` : ''}${note ? ` · ${note}` : ''}`); },
        'Receipt recorded on the order.');
    },
    askCutRatio(orderId, reason, kind = 'ratio', proposedBreakup = null) {
      const role = get().role === 'merchandiser' ? 'merchandiser' : 'production';
      touch(db => { const o = db.orders.find(x => x.id === orderId); if (!o) return; o.cutRatios = o.cutRatios ?? [];
        o.cutRatios.push({ askedOn: now(), by: who(), askedByRole: role, kind, reason, originalBreakup: o.sizeBreakup.map(x => ({ ...x })), proposedBreakup, given: null, sentToFactoryOn: null });
        log(o, kind === 'cut-short' ? `${role === 'merchandiser' ? 'Factory' : 'Production'} proposed to cut short · ${proposedBreakup?.reduce((a, x) => a + x.qty, 0) ?? '—'} pcs instead of ${o.sizeBreakup.reduce((a, x) => a + x.qty, 0)} · ${reason}` : `${role === 'merchandiser' ? 'Factory' : 'Production'} asked design for a modified ratio · ${reason}`); },
        kind === 'cut-short' ? 'Cut-short proposed. Design approves it, or changes the sizes.' : 'Design has the ask on their Today.');
    },
    giveCutRatio(orderId, breakup) {
      touch(db => { const o = db.orders.find(x => x.id === orderId); const cr = [...(o?.cutRatios ?? [])].reverse().find(x => !x.given); if (!o || !cr) return;
        cr.given = { on: now(), by: who(), breakup }; o.sizeBreakup = breakup.map(x => ({ ...x })); o.cutQty = breakup.reduce((a, x) => a + x.qty, 0);
        /* the factory raised it, so the factory already knows — nothing to send on */
        if (cr.askedByRole === 'merchandiser') cr.sentToFactoryOn = now();
        log(o, `${cr.kind === 'cut-short' ? 'Cut-short' : 'Cut ratio'} ${cr.proposedBreakup && JSON.stringify(cr.proposedBreakup) === JSON.stringify(breakup) ? 'approved' : 'given'} by design · ${o.cutQty} pcs · ${breakup.filter(x => x.qty).map(x => `${x.size}:${x.qty}`).join(' ')}`); },
        'New cut ratio on the order.' + (get().db.orders.find(x => x.id === orderId)?.cutRatios?.slice(-1)[0]?.askedByRole === 'merchandiser' ? ' The factory raised it, so it already has it.' : ' Production sends it to the factory.'));
    },
    sendCutRatio(orderId) { touch(db => { const o = db.orders.find(x => x.id === orderId); const cr = [...(o?.cutRatios ?? [])].reverse().find(x => x.given && !x.sentToFactoryOn); if (!o || !cr) return; cr.sentToFactoryOn = now(); log(o, 'Cut ratio sent to the factory'); }, 'The factory has the new ratio.'); },
    allocateFactory(orderId, factoryId, rationale) {
      touch(db => { const o = db.orders.find(x => x.id === orderId); if (!o) return;
        /* a nominated fabric must be on order first: allocating earlier gave the
           factory a date nothing backs, and left the fabric PO unreachable */
        if (o.fabricNominated && o.sourcing?.stage !== 'po-raised') return;
        /* PO numbers come off the count of orders that already have one — the
           order count does not change on allocation, so it minted duplicates */
        o.vendorId = factoryId; o.poDate = now(); o.poNo = `PO #${15500 + db.orders.filter(x => x.poNo).length + 1}`; o.status = 'Open';
        o.merchant = MERCHANDISERS[db.orders.filter(x => x.status === 'Open').length % 3];
        o.milestones = buildMilestones(o.category as GarmentCategory, o.poDate);
        if (!o.materials?.length) o.materials = defaultMaterials(o);
        if (!o.sampleVendorId) o.sampleVendorId = factoryId;
        log(o, `Allocated to ${db.vendors.find(v => v.id === factoryId)?.name} on capacity · ${rationale || 'no rationale given'} · TNA generated (${o.milestones.length} steps)`);
      }, 'Factory allocated on capacity. PO raised and the TNA generated from the category template.');
    },
    convertBlock(id) { touch(db => { const b = db.blocks.find(x => x.id === id); if (b) b.status = 'converted'; }, 'Block converted to a PO.'); },
    releaseBlock(id) { touch(db => { const b = db.blocks.find(x => x.id === id); if (b) b.status = 'released'; }, 'Block released — the mill is told it is free.', 'warn'); },
    reviewCoreStock(fabricId, status, note, backOn) {
      touch(db => { const f = db.fabrics.find(x => x.id === fabricId); if (!f) return; f.supply = { status, reviewedOn: now(), by: who(), note, backOn }; },
        status === 'ok' ? (get().db.fabrics.find(x => x.id === fabricId)?.onHold ? 'Reviewed — back in stock. Design can switch it back on for the stores.' : 'Reviewed — in stock, nothing to do.')
        : status === 'delayed' ? 'Reviewed — delayed past the committed date. Escalated to planning and design on the fabric record.' : 'Reviewed — run out at the supplier. Escalated to planning and design on the fabric record.', status === 'ok' ? 'ok' : 'warn');
    },
    renameFabric(fabricId, newName, note) {
      touch(db => { const f = db.fabrics.find(x => x.id === fabricId); if (!f || !newName.trim() || newName.trim() === f.name) return;
        f.nameHistory = [...(f.nameHistory ?? []), { name: f.name, until: now(), by: who(), note }];
        f.name = newName.trim(); },
        'Renamed. The code is the same fabric; the old name stays on the record, so the numbers stay one line.');
    },
    pauseFabric(fabricId, note) { touch(db => { const f = db.fabrics.find(x => x.id === fabricId); if (f) f.paused = { at: now(), by: who(), note }; },
      'Paused — no store or the website can offer it until design resumes it. The reason is on the record.', 'warn'); },
    resumeFabric(fabricId) { touch(db => { const f = db.fabrics.find(x => x.id === fabricId); if (f) f.paused = null; }, 'Resumed — back in the book and orderable again.'); },
    setFabricHold(fabricId, hold) { touch(db => { const f = db.fabrics.find(x => x.id === fabricId); if (f) f.onHold = hold; }, hold ? 'Switched off on Shopify and in stores.' : 'Restored to sale.'); },
    raiseFabricPo(fabricId, metres) { touch(db => { const f = db.fabrics.find(x => x.id === fabricId); if (!f) return; f.incomingMetres = (f.incomingMetres ?? 0) + metres;
        const v = db.vendors.find(x => x.id === f.vendorId); db.fabricPos = db.fabricPos ?? [];
        db.fabricPos.unshift({ id:`fpo-${Date.now().toString(36)}`, poNo:`FPO-${7100 + db.fabricPos.length}`, fabricId, vendorId: f.vendorId, metres, raisedOn: now(), source: f.international ? 'manual' : 'auto', expectedOn: iso(addDays(TODAY, v?.leadDays ?? 14)), vendorConfirmedOn: null, vendorConfirmedBy: null, remark: '', receivedOn: null }); }, `PO for ${metres} m raised — now counting as incoming cover until the GRN lands.`); },

    /* The accepted quote is the price of record. Costing may still refine the
       consumption — which re-derives the metres while no PO is out — but it may
       not overwrite a rate a mill gave us, or two screens quote different prices. */
    updateCosting(orderId, patch) { touch(db => { const o = db.orders.find(x => x.id === orderId); if (!o) return;
      const q = o.fabricQuotes.find(x => x.selected);
      const p = q ? { ...patch, cpm: q.cpm } : patch;
      Object.assign(o.costing, p);
      if (q && o.sourcing?.stage !== 'po-raised' && p.consumption != null) o.fabricMetres = Math.max(Math.ceil(p.consumption * o.orderQty), q.moq);
      log(o, `Costing updated · ${Object.keys(p).join(', ')}${q && patch.cpm != null && patch.cpm !== q.cpm ? ` · rate held at the quoted ₹${q.cpm}/m` : ''}`); },
      'Costing saved.'); },

    /* ---------- everyone ---------- */
    addConcept(i) {
      const id = i.id ?? `cn-${Date.now().toString(36)}`;
      touch(db => { db.concepts = db.concepts ?? []; db.concepts.unshift({ id, name: i.name, kind: i.kind, brief: i.brief, raisedBy: who(), raisedOn: now(), spec: i.spec, baseFabricId: i.baseFabricId, book: i.book ?? null, targetMonth: i.targetMonth ?? null, fabricId: null, blockId: null, fabricPo: null, factoryId: null, patSentOn: null, rounds: [], approvalSentOn: null, approvalBy: null,
        enigma: { template: null, consumptionBase: null, consumptionBuffer: null, options: [], configuredOn: null, by: null }, naming: { oldName: i.name, newName: null, mrp: null, setOn: null }, liveOn: null }); }, 'Concept logged — with the why, for once.');
      return id;
    },
    conceptChooseFabric(id, pick) {
      touch(db => { const c = db.concepts.find(x => x.id === id); if (!c) return;
        let f = 'fabricId' in pick ? db.fabrics.find(x => x.id === pick.fabricId) : undefined;
        if (!f && !('fabricId' in pick)) {
          const v = db.vendors.find(x => x.id === pick.vendorId);
          f = { id:`fab-${Date.now().toString(36)}`, code:`NO${(v?.name ?? 'XX').slice(0, 2).toUpperCase()}${pick.name.replace(/[^A-Za-z]/g, '').slice(0, 6).toUpperCase().padEnd(6, 'X')}-${1600 + db.fabrics.length}`, name: pick.name, bucket:'NON_CORE', family: /linen/i.test(pick.composition) ? 'Linen' : 'Poplin', vendorId: pick.vendorId, international: v?.kind === 'International mill',
            stockMetres: 0, reservedMetres: 0, thresholdMetres: v?.kind === 'International mill' ? 3 : 7, incomingMetres: 0, millAvailable: null, millStockMetres: null, millReportedAt: null, onHold: true, paused: null, weeklySalesShirts: Array(12).fill(0),
            vendorCode: pick.vendorCode, composition: pick.composition, widthIn: pick.widthIn, cpm: pick.cpm, mrp: null, swatchBook: pick.book };
          db.fabrics.push(f);
        }
        if (!f) return; f.onHold = true; c.fabricId = f.id; },
        'Fabric on the concept — hidden from stores until it goes live. Next: block it at the vendor.');
    },
    /* ONE vendor against a concept — the same rule as a request's option. A
       second "add" while one is live replaces it; the old one stays on the
       record as withdrawn, so the history is not lost. */
    conceptAddFabricOption(id, o) {
      touch(db => { const c = db.concepts.find(x => x.id === id); if (!c || c.fabricPo) return;
        (c.fabricOptions ?? []).filter(x => !x.rejected && !x.selected).forEach(x => (x.rejected = { by: who(), on: now(), reason:'replaced by sourcing' }));
        c.fabricOptions = [...(c.fabricOptions ?? []), { ...o, id:`cfo-${Date.now().toString(36)}-${(c.fabricOptions ?? []).length}`, selected: false, chosenBy: null, chosenOn: null, rationale:'', rejected: null, extensionAsked: null }]; },
        'Vendor put against the concept.');
    },
    conceptUpdateFabricOption(id, optionId, patch) {
      touch(db => { const o = (db.concepts.find(x => x.id === id)?.fabricOptions ?? []).find(x => x.id === optionId); if (!o || o.selected) return;
        Object.assign(o, patch); }, 'Vendor updated.');
    },
    /* design's third answer on a concept: not this mill, and here is why */
    conceptRejectFabricOption(id, optionId, reason) {
      touch(db => { const c = db.concepts.find(x => x.id === id); if (!c) return;
        const o = (c.fabricOptions ?? []).find(x => x.id === optionId); if (!o || o.selected) return;
        o.rejected = { by: who(), on: now(), reason }; o.extensionAsked = null;
        const live = (c.fabricOptions ?? []).filter(x => !x.rejected);
        if (live.length === 0) { c.optionsSentOn = null; if (c.optionsExtension) c.optionsExtension.resolvedOn = now(); } },   // nothing left — back to sourcing for another
        'Rejected — the reason is on the record for sourcing.', 'warn');
    },
    /* the mill will not hold, or sourcing wants a different vendor: the current
       one is withdrawn (kept as history) and the concept goes back to "add vendor" */
    conceptRemoveFabricOption(id, optionId) {
      touch(db => { const c = db.concepts.find(x => x.id === id); if (!c) return;
        const o = (c.fabricOptions ?? []).find(x => x.id === optionId); if (!o || o.selected) return;
        o.rejected = { by: who(), on: now(), reason:'withdrawn by sourcing — the mill would not hold' }; o.extensionAsked = null;
        if (c.optionsExtension) c.optionsExtension.resolvedOn = now();
        c.optionsSentOn = null; }, 'Vendor withdrawn — the concept is back with you to fill.', 'warn');
    },
    conceptSendOptionsToDesign(id) {
      touch(db => { const c = db.concepts.find(x => x.id === id); if (!c || !(c.fabricOptions ?? []).length) return;
        c.optionsSentOn = now(); },
        'Sent to design — the shade and the price are their call.');
    },
    /* Design's pick becomes the concept's fabric: an existing master row, or a
       new one minted from the mill's swatch with its price already on it. */
    conceptChooseFabricOption(id, optionId, rationale) {
      touch(db => { const c = db.concepts.find(x => x.id === id); if (!c) return;
        const opt = (c.fabricOptions ?? []).find(x => x.id === optionId); if (!opt) return;
        (c.fabricOptions ?? []).forEach(x => (x.selected = x.id === optionId));
        let f = opt.fabricId ? db.fabrics.find(x => x.id === opt.fabricId) : undefined;
        if (!f) {
          const v = db.vendors.find(x => x.id === opt.vendorId);
          f = { id:`fab-${Date.now().toString(36)}`, code:`NO${(v?.name ?? 'XX').slice(0, 2).toUpperCase()}${opt.name.replace(/[^A-Za-z]/g, '').slice(0, 6).toUpperCase().padEnd(6, 'X')}-${1600 + db.fabrics.length}`, name: opt.name, bucket:'NON_CORE', family: /linen/i.test(opt.composition) ? 'Linen' : 'Poplin', vendorId: opt.vendorId, international: v?.kind === 'International mill',
            stockMetres: 0, reservedMetres: 0, thresholdMetres: v?.kind === 'International mill' ? 3 : 7, incomingMetres: 0, millAvailable: null, millStockMetres: null, millReportedAt: null, onHold: true, paused: null, weeklySalesShirts: Array(12).fill(0),
            vendorCode: opt.vendorCode, composition: opt.composition, widthIn: opt.widthIn, cpm: opt.cpm, mrp: null, swatchBook: opt.book };
          db.fabrics.push(f);
        }
        f.onHold = true; f.cpm = f.cpm ?? opt.cpm; c.fabricId = f.id;
        opt.chosenBy = who(); opt.chosenOn = now(); opt.rationale = rationale; },
        'Chosen. Sourcing blocks the metres at that mill next.');
    },
    /* Design changes its mind — allowed right up to the moment metres are
       committed. After a block or a PO there is money on the table, so the
       record says no and the conversation happens with sourcing instead. */
    conceptUnchooseFabric(id) {
      touch(db => { const c = db.concepts.find(x => x.id === id); if (!c) return;
        if (c.fabricPo || c.blockId) return;
        (c.fabricOptions ?? []).forEach(o => { o.selected = false; o.chosenBy = null; o.chosenOn = null; o.rationale = ''; });
        c.fabricId = null; if (!c.optionsSentOn) c.optionsSentOn = now(); },
        'Unchosen — the offers are back on the table.', 'warn');
    },
    conceptAskOptionExtension(id, note, optionId) {
      touch(db => { const c = db.concepts.find(x => x.id === id); if (!c) return;
        c.optionsExtension = { askedOn: now(), by: who(), note, resolvedOn: null };
        const o = optionId ? (c.fabricOptions ?? []).find(x => x.id === optionId) : null;
        if (o) o.extensionAsked = { by: who(), on: now() }; },
        'Extension asked. Sourcing will go back to the mills.', 'warn');
    },
    conceptExtendOption(id, optionId, until) {
      touch(db => { const c = db.concepts.find(x => x.id === id); const o = (c?.fabricOptions ?? []).find(x => x.id === optionId); if (!c || !o) return;
        o.holdUntil = until; o.extensionAsked = null; }, 'Hold extended.');
    },
    conceptSendOptionsBack(id) {
      touch(db => { const c = db.concepts.find(x => x.id === id); if (!c) return;
        if (c.optionsExtension) c.optionsExtension.resolvedOn = now();
        (c.fabricOptions ?? []).forEach(x => (x.extensionAsked = null));
        c.optionsSentOn = now(); }, 'Back with design.');
    },
    priceFabric(fabricId, cpm, vendorCode) { touch(db => { const f = db.fabrics.find(x => x.id === fabricId); if (f) { f.cpm = cpm; if (vendorCode) f.vendorCode = vendorCode; } }, 'Priced — the Fabric Ordering sheet\'s empty price column, filled where the fabric lives.'); },
    conceptBlockFabric(id, metres, via) {
      touch(db => { const c = db.concepts.find(x => x.id === id); const f = c?.fabricId ? db.fabrics.find(x => x.id === c.fabricId) : null; if (!c || !f) return;
        const v = db.vendors.find(x => x.id === f.vendorId); const agreed = now();
        const b = { id:`blk-${Date.now().toString(36)}`, fabricName: `${f.name}${f.vendorCode ? ` · ${f.vendorCode}` : ''}`, vendorId: f.vendorId, metres, agreedOn: agreed, expiresOn: new Date(new Date(agreed).getTime() + (v?.blockWindowDays ?? 60) * 864e5).toISOString(), via, status:'held' as const };
        db.blocks.unshift(b); c.blockId = b.id; },
        'Blocked — one record, with a countdown, instead of three copies of the block sheet.');
    },
    /* Design raises it, and it lands everywhere it has to land: on the concept,
       on the fabric master as a real PO row sourcing can chase and the warehouse
       can receive, and as incoming metres on the fabric itself. One click, no
       re-typing the vendor, the article, the rate or the date into a second sheet. */
    conceptRaiseFabricPo(id, metres) {
      touch(db => { const c = db.concepts.find(x => x.id === id); const f = c?.fabricId ? db.fabrics.find(x => x.id === c.fabricId) : null; if (!c || !f) return;
        if (c.fabricPo) return;
        db.fabricPos = db.fabricPos ?? [];
        const v = db.vendors.find(x => x.id === f.vendorId);
        const chosen = (c.fabricOptions ?? []).find(o => o.selected);
        const poNo = `FPO-${7100 + db.fabricPos.length}`;
        db.fabricPos.unshift({ id:`fpo-${Date.now().toString(36)}`, poNo, fabricId: f.id, vendorId: f.vendorId, metres,
          raisedOn: now(), source:'manual',                       // a person decided this one, not the Enigma threshold
          expectedOn: iso(addDays(TODAY, chosen?.leadDays ?? v?.leadDays ?? 14)),
          vendorConfirmedOn: null, vendorConfirmedBy: null,
          remark: `New fabric · concept "${c.name}" · chosen by ${chosen?.chosenBy ?? 'design'}${f.cpm ? ` at ₹${f.cpm}/m` : ''}${f.vendorCode ? ` · article ${f.vendorCode}` : ''}`,
          receivedOn: null });
        c.fabricPo = { on: now(), metres }; f.incomingMetres = (f.incomingMetres ?? 0) + metres;
        const b = c.blockId ? db.blocks.find(x => x.id === c.blockId) : null; if (b && b.status === 'held') b.status = 'converted'; },
        `Fabric PO raised — it is on the fabric master for sourcing to chase, and the metres count as incoming.`);
    },
    /* Design's yes on a concept is one click: this vendor, and the PO against it.
       The fabric joins the master with the mill's terms; the PO lands there too. */
    conceptAcceptAndRaisePo(id, optionId, metres, rationale) {
      touch(db => { const c = db.concepts.find(x => x.id === id); if (!c || c.fabricPo) return;
        const opt = (c.fabricOptions ?? []).find(x => x.id === optionId); if (!opt || opt.rejected) return;
        (c.fabricOptions ?? []).forEach(x => (x.selected = x.id === optionId));
        const v = db.vendors.find(x => x.id === opt.vendorId);
        let f = opt.fabricId ? db.fabrics.find(x => x.id === opt.fabricId) : undefined;
        if (!f) {
          f = { id:`fab-${Date.now().toString(36)}`, code:`NO${(v?.name ?? 'XX').slice(0, 2).toUpperCase()}${opt.name.replace(/[^A-Za-z]/g, '').slice(0, 6).toUpperCase().padEnd(6, 'X')}-${1600 + db.fabrics.length}`,
            name: opt.name, bucket:'NON_CORE', family: /linen/i.test(opt.composition) ? 'Linen' : /oxford/i.test(opt.name) ? 'Oxford' : /twill|herringbone/i.test(opt.name) ? 'Twill' : /check/i.test(opt.name) ? 'Checks' : 'Poplin',
            vendorId: opt.vendorId, international: v?.kind === 'International mill',
            stockMetres: 0, reservedMetres: 0, thresholdMetres: v?.kind === 'International mill' ? 3 : 7, incomingMetres: 0,
            millAvailable: null, millStockMetres: null, millReportedAt: null, onHold: true, paused: null, weeklySalesShirts: Array(12).fill(0),
            vendorCode: opt.vendorCode, composition: opt.composition, widthIn: opt.widthIn, cpm: opt.cpm, mrp: null, swatchBook: opt.book };
          db.fabrics.push(f);
        }
        f.cpm = f.cpm ?? opt.cpm; c.fabricId = f.id; opt.fabricId = f.id;
        opt.chosenBy = who(); opt.chosenOn = now(); opt.rationale = rationale;
        db.fabricPos = db.fabricPos ?? [];
        const poNo = `FPO-${7100 + db.fabricPos.length}`;
        db.fabricPos.unshift({ id:`fpo-${Date.now().toString(36)}`, poNo, fabricId: f.id, vendorId: f.vendorId, metres, raisedOn: now(), source:'manual',
          expectedOn: iso(addDays(TODAY, opt.leadDays ?? v?.leadDays ?? 14)), vendorConfirmedOn: null, vendorConfirmedBy: null,
          remark: `New fabric · concept "${c.name}" · chosen by ${who()} at ₹${opt.cpm}/m${opt.vendorCode ? ` · article ${opt.vendorCode}` : ''}`, receivedOn: null });
        c.fabricPo = { on: now(), metres }; f.incomingMetres = (f.incomingMetres ?? 0) + metres;
        if (c.optionsExtension) c.optionsExtension.resolvedOn = now(); },
        `Fabric PO ${'raised'} — on the fabric master for sourcing to chase; the metres count as incoming.`);
    },
    /* One fabric, several designs. Each gets the PRODUCT CODE the master carries
       (BOM-SHI-xx-nnnn), and all of them hang off the one fabric code. */
    conceptAddDesign(id, d) {
      touch(db => { const c = db.concepts.find(x => x.id === id); if (!c) return;
        const seq = 4200 + db.concepts.reduce((a, x) => a + (x.designs?.length ?? 0), 0);
        c.designs = [...(c.designs ?? []), { id:`dsn-${Date.now().toString(36)}-${seq}`, code:`BOM-SHI-${d.category === 'Formal' ? 'FM' : 'CS'}-${seq}`, name: d.name.trim(), finalName: null, style: d.style ?? null, category: d.category, mrp: d.mrp, cost: d.cost ?? null, productType: d.productType ?? 'CUSTOM_DESIGN', weightGrams: d.weightGrams ?? null, region: d.region ?? 'IND', stockMode: d.stockMode ?? 'track-quantity', status: d.status ?? 'ACTIVE', salesChannel: d.salesChannel ?? null, discountedPrice: d.discountedPrice ?? null, media: d.media ?? [], sizes: d.sizes ?? ['36', '38', '40', '42', '44', '46'], variants: d.variants ?? (d.sizes ?? ['36', '38', '40', '42', '44', '46']).map(sz => ({ size: sz, price: d.mrp, discountedPrice: d.discountedPrice ?? null, sku: `BOM-SHI-${d.category === 'Formal' ? 'FM' : 'CS'}-${seq}-${sz}` })), description: d.description ?? null, buzzwords: d.buzzwords ?? null, enigmaOn: null, liveOn: null, setOn: now(), by: who() }]; },
        'Design added — its product code is minted; the sticker sheet gets one more label.');
    },
    conceptUpdateDesign(id, designId, patch) {
      touch(db => { const d = (db.concepts.find(x => x.id === id)?.designs ?? []).find(x => x.id === designId); if (!d) return;
        /* a later rename keeps the old final name on the record, the way the fabric master does */
        if (patch.finalName !== undefined && d.finalName && patch.finalName !== d.finalName) d.nameHistory = [...(d.nameHistory ?? []), { name: d.finalName, until: now(), by: who(), note: 'renamed' }];
        Object.assign(d, patch); }, 'Design updated.');
    },
    pushDesignToEnigma(id, designId) {
      const d0 = (get().db.concepts.find(x => x.id === id)?.designs ?? []).find(x => x.id === designId);
      touch(db => { const d = (db.concepts.find(x => x.id === id)?.designs ?? []).find(x => x.id === designId); if (!d || d.enigmaOn) return; d.enigmaOn = now(); d.enigmaBy = who(); },
        d0 ? `Pushed to Enigma — ${d0.code} is now a design row there, with its name, MRP and attributes.` : 'Pushed to Enigma.');
    },
    conceptDesignFlag(id, designId, flag, on) {
      touch(db => { const d = (db.concepts.find(x => x.id === id)?.designs ?? []).find(x => x.id === designId); if (!d) return;
        if (flag === 'enigma') d.enigmaOn = on ? now() : null; else d.liveOn = on ? now() : null; },
        flag === 'enigma' ? (on ? 'Set up in Enigma — recorded on the design.' : 'Enigma flag cleared.') : (on ? 'Design live in POS.' : 'Design taken down.'));
    },
    conceptRemoveDesign(id, designId) {
      touch(db => { const c = db.concepts.find(x => x.id === id); if (!c) return; c.designs = (c.designs ?? []).filter(x => x.id !== designId); }, 'Design removed.', 'warn');
    },
    conceptSetEnigmaFlags(id, f) {
      touch(db => { const c = db.concepts.find(x => x.id === id); if (!c) return; c.enigma.largeCheck = f.largeCheck; c.enigma.compositionFamily = f.compositionFamily; },
        'Saved. A large check raises consumption in the BOM; the family is what the website filters by.');
    },
    conceptSwatch(id, step) {
      touch(db => { const c = db.concepts.find(x => x.id === id); if (!c) return;
        c.swatch = c.swatch ?? { inwardOn: null, handoverOn: null, priority: false, cutOn: null, stickerOn: null, dispatchedOn: null, photosOn: null, storesToldOn: null };
        const k = ({ inward:'inwardOn', handover:'handoverOn', cut:'cutOn', sticker:'stickerOn', dispatched:'dispatchedOn', photos:'photosOn', storesTold:'storesToldOn' } as const)[step];
        if (!c.swatch[k]) { c.swatch[k] = now(); c.swatch.by = { ...(c.swatch.by ?? {}), [step]: who() }; }
        /* the tracker's per-store columns: one dispatch row a store, received when the store taps it */
        if (step === 'dispatched' && c.fabricId && !db.swatchDispatches.some(x => x.fabricId === c.fabricId)) STORES.forEach(st => db.swatchDispatches.push({ id:`sw-${Date.now().toString(36)}-${st.id}`, fabricId: c.fabricId!, storeId: st.id, dispatchedOn: now(), confirmedOn: null })); },
        ({ inward:'Bulk inwarded at the warehouse.', handover:'Handed to the swatch team.', cut:'Swatches cut — 25 × 25, ready for dispatch.', sticker:'Sticker page printed — the tracker\u2019s empty column, filled.', dispatched:'Swatches with shipping — one dispatch row per store.', photos:'Photos shared — design can see they have gone.', storesTold:'Stores told to display it.' } as const)[step]);
    },
    conceptSwatchPriority(id, priority) {
      touch(db => { const c = db.concepts.find(x => x.id === id); if (!c) return;
        c.swatch = c.swatch ?? { inwardOn: null, handoverOn: null, priority: false, cutOn: null, stickerOn: null, dispatchedOn: null, photosOn: null, storesToldOn: null }; c.swatch.priority = priority; },
        priority ? 'Marked priority — cut this one first.' : 'Priority cleared.');
    },
    conceptOnline(id, step) {
      touch(db => { const c = db.concepts.find(x => x.id === id); if (!c) return;
        c.online = c.online ?? { photosOn: null, videoOn: null, postOn: null, liveOn: null };
        const k = ({ photos:'photosOn', video:'videoOn', post:'postOn', live:'liveOn' } as const)[step]; if (!c.online[k]) c.online[k] = now(); },
        ({ photos:'Swatch photography done.', video:'Video done.', post:'Post-production done — the PDP is ready.', live:'Live online.' } as const)[step]);
    },
    setSourcingMode(orderId, mode, supplierVendorId, note) {
      touch(db => { const o = db.orders.find(x => x.id === orderId); if (!o) return;
        o.sourcingMode = mode; o.fabricNominated = mode === 'bsc-buys';
        o.fobNomination = mode === 'fob-nominated' ? { supplierVendorId: supplierVendorId ?? o.fobNomination?.supplierVendorId ?? '', emailedOn: o.fobNomination?.emailedOn ?? null, by: o.fobNomination?.by ?? null, note: note ?? o.fobNomination?.note ?? '' } : null;
        log(o, `Sourcing mode · ${mode === 'bsc-buys' ? 'BSC buys the cloth' : mode === 'fob-nominated' ? `FOB — vendor buys from ${db.vendors.find(v => v.id === supplierVendorId)?.name ?? 'the nominated supplier'}` : 'vendor sources its own cloth'}`); },
        'Saved.');
    },
    markFobEmailed(orderId) {
      touch(db => { const o = db.orders.find(x => x.id === orderId); if (!o || !o.fobNomination) return;
        o.fobNomination.emailedOn = now(); o.fobNomination.by = who();
        log(o, `Supplier nomination emailed to the vendor · buy from ${db.vendors.find(v => v.id === o.fobNomination!.supplierVendorId)?.name ?? 'the named supplier'}`); },
        'Nomination emailed — the vendor buys from that supplier; it is on the record.');
    },
    conceptSendPat(id, factoryId) { touch(db => { const c = db.concepts.find(x => x.id === id); if (c) { c.factoryId = factoryId; c.patSentOn = now(); } }, 'Sample and PAT file handed to the factory — logged.'); },
    conceptSubmitSample(id, gate) { touch(db => { const c = db.concepts.find(x => x.id === id); if (!c) return; const n = c.rounds.filter(r => r.gate === gate).length + 1; c.rounds.push({ gate, round: n, submittedOn: now(), reviewedOn: null, reviewedBy: null, comments: [], decision: 'pending' }); }, 'Sample received at the unit — on the desk for review.'); },
    conceptReviewSample(id, round, comments, decision) {
      touch(db => { const c = db.concepts.find(x => x.id === id); if (!c) return;
        const pending = c.rounds.filter(r => r.decision === 'pending'); const r = pending.find(x => x.round === round) ?? pending[pending.length - 1]; if (!r) return;
        r.comments = comments; r.decision = decision; r.reviewedOn = now(); r.reviewedBy = who(); },
        decision === 'approved' ? 'Approved — comments stay on the record with the round.' : 'Sent back — a new round against the same concept, not a restart.', decision === 'approved' ? 'ok' : 'warn');
    },
    conceptSendApproval(id, text) {
      const me = PEOPLE.find(p => p.id === get().personId)!;
      touch(db => { const c = db.concepts.find(x => x.id === id); if (!c) return; c.approvalSentOn = now(); c.approvalBy = me.name;
        const body = `${text} @planning @production @warehouse @store — approved for production. ${c.spec ? `Construction: ${c.spec}. ` : ''}Trainer: this post is the knowledge-repository entry; nothing to retype.`;
        let t = db.threads.find(x => x.kind === 'concept' && x.subjectId === id); if (!t) { t = { id: `t-${Date.now().toString(36)}`, kind: 'concept', subjectId: id, comments: [] }; db.threads.push(t); }
        t.comments.push({ id: `c-${Date.now().toString(36)}`, at: now(), who: me.name, role: me.role, text: body, step: 'Approval', mentions: parseMentions(body) }); },
        'Approval posted once on this record — every role reads the same line; no email, no second copy.');
    },
    conceptConfigureEnigma(id, e) { touch(db => { const c = db.concepts.find(x => x.id === id); if (c) c.enigma = { ...e, configuredOn: now(), by: who() }; }, 'Configured — the option exists in Enigma. Still hidden until it is made live.'); },
    conceptSetName(id, newName, mrp) { touch(db => { const c = db.concepts.find(x => x.id === id); if (!c) return; c.naming = { ...c.naming, newName, mrp, setOn: now() };
        /* the first design takes marketing's name; the others keep theirs */
        const d0 = (c.designs ?? [])[0]; if (d0) { if (d0.finalName && d0.finalName !== newName) d0.nameHistory = [...(d0.nameHistory ?? []), { name: d0.finalName, until: now(), by: who(), note: 'renamed with the fabric' }]; d0.finalName = newName; } }, 'Name and price set — website, sticker and system read the same thing.'); },
    conceptSetMarketing(id, blurb, channels) { touch(db => { const c = db.concepts.find(x => x.id === id); if (c) c.marketing = { blurb, channels, setOn: now() }; }, 'Marketing story saved — the store and the website will say the same thing.'); },
    conceptGoLive(id) { touch(db => { const c = db.concepts.find(x => x.id === id); if (!c) return; c.liveOn = now(); const f = c.fabricId ? db.fabrics.find(x => x.id === c.fabricId) : null; if (f) f.onHold = false; }, 'Live — orderable in every store and on the website from this moment.'); },
    async attachFiles(kind, subjectId, label, step, files) {
      const metas: Attachment[] = [];
      for (const f of files) { const id = `att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`; await putFile(id, f); metas.push({ id, kind, subjectId, label, step, name: f.name, size: f.size, mime: f.type || 'application/octet-stream', by: who(), at: now(), stored: true }); }
      touch(db => { db.attachments = db.attachments ?? []; db.attachments.unshift(...metas); }, `${metas.length === 1 ? metas[0].name : `${metas.length} files`} on the record — no Slack needed.`);
    },
    /* the row goes now, the bytes go when the change can no longer be undone —
       deleting the blob first made Undo restore a file that could not be opened */
    removeAttachment(id) { touch(db => { db.attachments = (db.attachments ?? []).filter(a => a.id !== id); }, 'Removed.');
      setTimeout(() => { if (!get().undoStack.some(u => u.db.attachments?.some(a => a.id === id))) void deleteFile(id); }, 8000); },
    resolveMention(commentId, resolved) {
      const me = get().personId;
      touch(db => { (db.threads ?? []).forEach(t => t.comments.forEach(c => { if (c.id !== commentId) return;
        c.resolved = (c.resolved ?? []).filter(r => r.by !== me);
        if (resolved) c.resolved.push({ by: me, at: now() });
      })); }, resolved ? 'Marked resolved — it stays on the record, and whoever asked can see you dealt with it.' : 'Put back on your list.');
    },
    postComment(kind, subjectId, text, step, files) {
      const me = PEOPLE.find(p => p.id === get().personId)!;
      const mentions = parseMentions(text);
      const cid = `c-${Date.now().toString(36)}`;
      if (files?.length) void get().attachFiles('comment', cid, 'Attachment', null, files);
      /* a store writing on a customer order is asking whoever holds the piece: MTM in PP or at a factory → planning; RTW → the hub */
      if (kind === 'order' && subjectId.startsWith('co-') && me.role === 'store') { const co = (get().db.customerOrders ?? []).find(x => x.id === subjectId); const holder: RoleId = co?.kind === 'MTM' ? 'production' : 'warehouse'; if (!mentions.includes(holder)) mentions.push(holder); }
      touch(db => {
        db.threads = db.threads ?? [];
        let t = db.threads.find(x => x.kind === kind && x.subjectId === subjectId);
        if (!t) { t = { id: `t-${Date.now().toString(36)}`, kind, subjectId, comments: [] }; db.threads.push(t); }
        t.comments.push({ id: cid, at: now(), who: me.name, role: me.role, text, step, mentions });
      }, mentions.length ? `Posted. Everyone mentioned sees it on this record until someone replies.` : 'Posted.');
    },

    /* ---------- production unit — RTW gates ---------- */
    submitSample(orderId, vendorId) {
      touch(db => { const o = db.orders.find(x => x.id === orderId); if (!o) return; o.samples = o.samples ?? []; if (vendorId) o.sampleVendorId = vendorId;
        o.samples.push({ round: o.samples.length + 1, submittedOn: now(), reviewedOn: null, reviewedBy: null, comments: [], decision: 'pending' });
        const m = o.milestones.find(x => x.key === 'PPS Submission'); if (m && !m.actual) m.actual = now();
        log(o, `Sample round ${o.samples.length} reached the production unit`); }, 'Sample logged — it is on the production unit\'s desk.');
    },
    reviewSample(orderId, round, comments, decision) {
      touch(db => { const o = db.orders.find(x => x.id === orderId); const r = o?.samples.find(x => x.round === round); if (!o || !r) return;
        r.comments = comments; r.decision = decision; r.reviewedOn = now(); r.reviewedBy = who();
        if (decision === 'approved') { const m = o.milestones.find(x => x.key === 'PPS Approval'); if (m && !m.actual) m.actual = now(); }
        log(o, decision === 'approved' ? `PP go-ahead on sample round ${round}${comments.length ? ` · ${comments.length} comment(s) to carry into bulk` : ''}` : `Sample round ${round} sent back — ${comments.filter(c => c.major).length} major comment(s) on the green slip`);
      }, decision === 'approved' ? 'PP go-ahead given. Bulk can be planned.' : 'Sent back with the green slip. The factory owes another round.', decision === 'approved' ? 'ok' : 'warn');
    },
    receiveMaterial(orderId, bomIndex, checked) {
      touch(db => { const o = db.orders.find(x => x.id === orderId); if (!o) return; if (!o.materials?.length) o.materials = defaultMaterials(o);
        const m = o.materials.find(x => x.bomIndex === bomIndex); if (!m) return; m.receivedOn = m.receivedOn ?? now(); m.checked = checked;
        const line = o.bom[bomIndex]; if (line?.kind === 'fabric') { const ms = o.milestones.find(x => x.key === 'Fabric ETA'); if (ms && !ms.actual && checked === 'ok') ms.actual = now(); }
        /* the sheet's Trims Readiness flips to Yes when every trim and packaging line has landed at the factory */
        const trimLines = o.materials.filter(x => o.bom[x.bomIndex]?.kind !== 'fabric'); if (trimLines.length && trimLines.every(x => x.receivedOn && x.checked === 'ok')) { o.trimsReady = true; const te = o.milestones.find(x => x.key === 'Trims ETA'); if (te && !te.actual) te.actual = now(); }
        log(o, `${line?.item ?? 'material'} received and checked · ${checked}`); }, checked === 'ok' ? 'Received and checked. Ready to issue.' : 'Received — failed the check. Not going to the factory.', checked === 'ok' ? 'ok' : 'warn');
    },
    orderTrims(trimId, qty) { touch(db => { const t = (db.trims ?? []).find(x => x.id === trimId); if (!t) return; t.incoming += qty; t.lastOrderedOn = now(); },
      'Bulk order raised. It counts as cover until the delivery lands — head office buys these against the forecast, nothing auto-fires.'); },
    financeSeenGrn(grnId) { touch(db => { const g = (db.grns ?? []).find(x => x.id === grnId); if (g) g.financeSeenOn = now(); }, 'Picked up by finance — GST filing and stock reconciliation can run off it.'); },
    setGrnInvoice(grnId, invoiceNo) { touch(db => { const g = (db.grns ?? []).find(x => x.id === grnId); if (g) g.invoiceNo = invoiceNo.trim() || null; }, invoiceNo.trim() ? 'Invoice matched to the GRN — PO, receipt and invoice now agree on the record.' : 'Invoice cleared.'); },
    receiveTrims(trimId) { touch(db => { const t = (db.trims ?? []).find(x => x.id === trimId); if (!t) return; grn(db, { kind:'trims', ref: t.name, refLabel: `${t.incoming} ${t.unit} ${t.name}`, vendorId: t.vendorId, qty: t.incoming, unit:'pc', rejected: 0, remarks: '' }); t.stock += t.incoming; t.incoming = 0; }, 'Received into the unit. The shelf number just moved.'); },
    issueMaterials(orderId) {
      touch(db => { const o = db.orders.find(x => x.id === orderId); if (!o) return;
        /* fabric is checked in against this order; trims are drawn down off the unit's bulk stock */
        o.materials.forEach(m => { const line = o.bom[m.bomIndex]; const isFabric = line?.kind === 'fabric';
          if (isFabric) { if (m.checked === 'ok' && !m.issuedOn) m.issuedOn = now(); return; }
          if (m.issuedOn) return;
          const t = (db.trims ?? []).find(x => x.name === line?.item);
          if (!t || t.stock < m.requiredQty) return;                 // short — cannot issue what is not on the shelf
          t.stock -= m.requiredQty; m.checked = 'ok'; m.issuedOn = now();
        });
        const fabricDone = o.materials.filter(m => o.bom[m.bomIndex]?.kind === 'fabric').every(m => m.issuedOn); const trimsDone = o.materials.filter(m => o.bom[m.bomIndex]?.kind !== 'fabric').every(m => m.issuedOn);
        o.fabricReady = fabricDone; o.trimsReady = trimsDone;
        const tm = o.milestones.find(x => x.key === 'Trims ETA'); if (tm && !tm.actual && trimsDone) tm.actual = now();
        log(o, 'Checked materials issued to the factory with the approved sample, tech pack and job card'); }, 'Issued. The factory has everything it needs to start.');
    },
    recordQcAudit(orderId, input) {
      touch(db => { const o = db.orders.find(x => x.id === orderId); if (!o) return; o.qcAudits = o.qcAudits ?? []; o.qcAudits.push({ ...input, at: now(), by: who() });
        if (input.released) { const m = o.milestones.find(x => x.key === 'FI'); if (m && !m.actual) m.actual = now(); }
        log(o, input.released ? `QC audit · ${input.passed}/${input.checked} passed · released` : `QC audit · ${input.passed}/${input.checked} passed · HELD — ${input.issues}`); },
        input.released ? 'Audit recorded — goods released.' : 'Audit recorded — goods held at the factory until corrected.', input.released ? 'ok' : 'warn');
    },

    /* ---------- production ---------- */
    updateExecution(orderId, patch) { touch(db => { const o = db.orders.find(x => x.id === orderId); if (!o) return; Object.assign(o, patch); if (patch.finalFob != null && !o.costingClosure.actual) o.costingClosure.actual = now(); log(o, `Execution updated · ${Object.keys(patch).join(', ')}`); }, 'Saved.'); },

    /** Plan | Revised | Actual, written in one go. An actual that lands late
        pushes every open step behind it by the same number of days. */
    splitDispatch(orderId, lots, reason) {
      touch(db => { const o = db.orders.find(x => x.id === orderId); if (!o) return;
        const sorted = [...lots].sort((a, b) => a.dispatchOn.localeCompare(b.dispatchOn));
        o.split = { at: now(), by: who(), reason, lots: sorted.map(l => ({ ...l, dispatched: false })) };
        const last = sorted[sorted.length - 1];
        const inh = o.milestones[o.milestones.length - 1];
        if (inh && !inh.actual && last && new Date(last.dispatchOn) > new Date(inh.revised ?? inh.plan)) { inh.revised = last.dispatchOn; inh.delayReason = `Split dispatch — ${last.qty} pcs balance by ${new Date(last.dispatchOn).toLocaleDateString('en-IN')}`; }
        log(o, `Split dispatch agreed with factory · ${sorted.map(l => `${l.qty} by ${new Date(l.dispatchOn).toLocaleDateString('en-IN')}`).join(', ')} · ${reason || 'no reason given'}`);
      }, 'Split recorded. The PO stays one row — the balance date now drives its risk.');
    },
    dispatchSplitLot(orderId, index) {
      touch(db => { const o = db.orders.find(x => x.id === orderId); const l = o?.split?.lots[index]; if (!o || !l) return; l.dispatched = true;
        const d = o.milestones.find(m => m.key === 'Dispatch'); if (d && !d.actual) d.actual = now();
        log(o, `Lot ${index + 1} of the split dispatched · ${l.qty} pcs`); }, 'Lot dispatched — the warehouse will receive it as a lot.');
    },
    clearSplit(orderId) { touch(db => { const o = db.orders.find(x => x.id === orderId); if (!o) return; o.split = null; log(o, 'Split cancelled — whole order ships together'); }, 'Split removed.'); },
    setMilestone(orderId, key, patch) {
      touch(db => {
        const o = db.orders.find(x => x.id === orderId); if (!o) return;
        const idx = o.milestones.findIndex(m => m.key === key); if (idx < 0) return;
        const m = o.milestones[idx];
        Object.assign(m, patch);
        if (m.actual) {
          const slip = Math.max(0, daysBetween(m.plan, m.actual));
          m.revised = null;
          if (slip > 0) o.milestones.slice(idx + 1).forEach(d => {
            if (d.actual) return;
            const cur = d.revised ? Math.max(0, daysBetween(d.plan, d.revised)) : 0;
            if (slip > cur) { d.revised = iso(addDays(d.plan, slip)); d.delayReason = d.delayReason ?? `Pushed by "${m.key}" landing ${slip}d late`; }
          });
          log(o, slip > 0 ? `"${m.key}" done ${slip}d late — ${o.milestones.length - idx - 1} downstream steps moved` : `"${m.key}" done on time`);
        } else if (patch.revised) log(o, `"${m.key}" revised to ${new Date(patch.revised).toLocaleDateString('en-IN')} · ${m.delayReason ?? 'no reason'}`);
      });
      get().toast('Saved.');
    },
    setTrackerConfig(cfg, replan) {
      let n = 0;
      touch(db => { db.trackerConfig = { ...cfg, updatedOn: now(), updatedBy: who() }; applyTrackerConfig(db.trackerConfig);
        if (replan) db.orders.filter(o => o.status === 'Open' && o.poDate).forEach(o => { const fresh = buildMilestones(o.category as GarmentCategory, o.poDate!); let changed = false;
          o.milestones.forEach(m => { if (m.actual) return; const f = fresh.find(x => x.key === m.key); if (f && f.plan !== m.plan) { m.plan = f.plan; changed = true; } });
          if (changed) { n++; log(o, 'Planned dates re-plotted from the lead-time config'); } }); });
      get().toast(replan ? `Config saved · ${n} open PO${n === 1 ? '' : 's'} re-planned (actual dates untouched).` : 'Config saved — applies to the next PO raised.', 'ok', true);
    },
    notifyMerchant(orderId, milestoneKey, kind) {
      touch(db => { const o = db.orders.find(x => x.id === orderId); if (!o) return; log(o, `Alert sent to ${o.merchant ?? 'the merchandiser'} · ${milestoneKey} ${kind === 'overdue' ? 'overdue' : 'due'}`); }, 'Alert sent to the merchandiser — it is on the order\'s log.');
    },
    updateEscalation(id, patch) {
      touch(db => { const e = db.escalations.find(x => x.id === id); if (!e) return; Object.assign(e, patch); if (patch.status === 'Resolved' || patch.status === 'Accepted delay') e.closedAt = now(); }, 'Escalation updated.');
    },

    /* ---------- warehouse ---------- */
    receiveLot(orderId, input) {
      touch(db => { const o = db.orders.find(x => x.id === orderId); if (!o) return;
        o.receipts = o.receipts ?? [];
        if (input.cutQty != null) o.cutQty = input.cutQty; if (o.cutQty == null) o.cutQty = o.orderQty;
        o.receipts.push({ at: now(), qty: input.qty, rejected: input.rejected, by: who(), note: input.note, balanceExpectedOn: input.balanceExpectedOn });
        grn(db, { kind:'rtw-po', ref: o.poNo ?? o.id, refLabel: o.styleName, vendorId: o.vendorId, qty: input.qty, unit:'pc', rejected: input.rejected, remarks: input.note });
        o.deliveredQty = o.receipts.reduce((a, l) => a + l.qty, 0); o.rejectedQty = o.receipts.reduce((a, l) => a + l.rejected, 0);
        const disp = o.milestones.find(m => m.key === 'Dispatch'); if (disp && !disp.actual) disp.actual = now();
        const balance = Math.max(0, o.cutQty - o.deliveredQty - o.rejectedQty);
        if (balance === 0 || input.closeShort) { const last = o.milestones[o.milestones.length - 1]; if (last && !last.actual) last.actual = now(); o.status = 'Closed'; log(o, `Lot ${o.receipts.length}: ${input.qty} received · ${input.rejected} rejected · PO closed${balance ? ` short by ${balance}` : ''}`); }
        else log(o, `Lot ${o.receipts.length}: ${input.qty} received · ${input.rejected} rejected · balance ${balance}${input.balanceExpectedOn ? ` expected ${new Date(input.balanceExpectedOn).toLocaleDateString('en-IN')}` : ''} — PO stays open`);
      }, input.closeShort ? 'Lot recorded — PO closed short.' : 'Lot recorded.');
    },
    receive(orderId, input) {
      touch(db => { const o = db.orders.find(x => x.id === orderId); if (!o) return;
        Object.assign(o, input);
        const last = o.milestones[o.milestones.length - 1]; if (last && !last.actual) last.actual = now();
        o.status = 'Closed'; log(o, `Received ${input.deliveredQty}/${input.cutQty} · ${input.rejectedQty} rejected · PO closed`);
      }, 'Receipt recorded. PO closed.');
    },
    storeInward(kind, id, receivedQty, note) {
      const storeId = get().storeId; const item = storeInboundOf(get().db, storeId).find(x => x.kind === kind && x.id === id); if (!item) return;
      const got = receivedQty != null ? Math.max(0, Math.min(item.qty, receivedQty)) : item.qty;
      const short = item.qty - got;
      touch(db => {
        const st = db.stores.find(x => x.id === storeId);
        if (kind === 'sto') { const t = db.transfers.find(x => x.id === id); if (t) { if (!t.arrivedOn) t.arrivedOn = now(); t.closedOn = now(); if (short > 0) t.shortfall = { sentQty: item.qty, receivedQty: got, note: note ?? '', on: now(), by: st?.name ?? 'store', resolvedOn: null, resolution: null }; } }
        if (kind === 'mtm' || kind === 'rtw') { const o = (db.customerOrders ?? []).find(x => x.id === id); if (o) { o.stage = 'delivered'; o.scans.push({ stage:'delivered', at: now(), by: `${st?.name ?? 'store'} · received` }); } }
        if (kind === 'launch') { const l = (db.launches ?? []).find(x => x.id === id); l?.pieces.forEach(p => { if (p.storeId === storeId && p.dispatchedOn && !p.receivedOn) p.receivedOn = now(); }); }
        if (kind === 'book') { const b = (db.swatchBooks ?? []).find(x => x.id === id); if (b) b.receivedOn = now(); }
        if (kind === 'swatch') { const sw = db.swatchDispatches.find(x => x.id === id); if (sw) sw.confirmedOn = now(); }
        if (kind === 'request') { const r = (db.stockRequests ?? []).find(x => x.id === id); if (r) r.status = 'received'; }
        if (kind === 'fit') { const f = (db.fitSamples ?? []).find(x => x.id === id); if (f) { f.receivedOn = now(); f.state = 'ok'; } }
        if (kind === 'return') { const r = db.returns.find(x => x.id === id); if (r?.factoryLeg) { r.factoryLeg.backAtStoreOn = now(); r.stage = 'back-at-store'; } }
        grn(db, { kind:'store-inward', ref: item.what.split(' · ')[0], refLabel: `${item.what} → ${st?.name ?? storeId}`, vendorId: null, storeId, qty: got, unit:'pc', rejected: 0, remarks: short > 0 ? `SHORT · ${got} of ${item.qty} received${note ? ` · ${note}` : ''}` : item.detail });
      }, short > 0 ? `Counted in ${got} of ${item.qty} — the warehouse is told about the ${short} missing.` : kind === 'sto' ? 'Counted in — the STO is closed and your stock now matches the box.' : kind === 'mtm' || kind === 'rtw' ? 'Received at the store — ready for the customer.' : 'Counted in.');
    },
    dispatchFitSample(storeId, fit, size) { touch(db => { db.fitSamples = db.fitSamples ?? []; db.fitSamples.unshift({ id:`fit-${Date.now().toString(36)}`, storeId, fit, size, dispatchedOn: now(), receivedOn: null, state:'ok' }); }, `${fit} ${size} fit sample on its way — the store counts it in on arrival.`); },
    markFitSample(id, state) { touch(db => { const f = (db.fitSamples ?? []).find(x => x.id === id); if (f) f.state = state; }, state === 'ok' ? 'Marked fine.' : state === 'worn' ? 'Marked worn — the unit sees a replacement is due.' : 'Marked missing — the unit sees a replacement is due.', state === 'ok' ? 'ok' : 'warn'); },
    resolveShortfall(transferId, resolution, note) {
      touch(db => { const t = db.transfers.find(x => x.id === transferId); if (t?.shortfall && !t.shortfall.resolvedOn) { t.shortfall.resolvedOn = now(); t.shortfall.resolution = resolution; t.shortfall.resolutionNote = note; } },
        resolution === 'balance-sent' ? 'Balance sent — the store will see it under Received from the unit.' : 'Written off — the gap is closed with a reason on the STO.');
    },
    closeTransfer(id) { touch(db => { const t = db.transfers.find(x => x.id === id); if (t) t.closedOn = now(); }, 'STO closed on receipt.'); },

    /* ---------- store ---------- */
    confirmSwatch(id) { touch(db => { const s = db.swatchDispatches.find(x => x.id === id); if (s) s.confirmedOn = now(); }, 'Confirmed. Head office can see it landed.'); },
    raiseReturn(input) {
      const id = `ret-${Date.now().toString(36)}`;
      touch(db => { const o = input.orderId ? (db.customerOrders ?? []).find(x => x.id === input.orderId) : null;
        db.returns.unshift({ styleName: input.styleName, reason: input.reason, wants: input.wants, remarks: input.remarks, id, caseNo: `RET-${4100 + db.returns.length + 1}`, storeId: get().storeId, kind: input.kind ?? (o?.kind === 'MTM' ? 'MTM' : 'RTW'), orderId: input.orderId ?? null, openedOn: now(), stage: 'raised', slaDays: 10, attempts: [], factoryLeg: null, refund: null, closedOn: null }); }, 'Return raised. First rung is alteration or refit — the ladder is on the record.');
      if (input.wants === 'Credit note') get().startResolution(id, 'store-credit', 'piece taken back · credit note generated');
      return id;
    },
    startResolution(id, step, note, where, extra) {
      const toFactory = step === 'remake' || (step === 'alteration' && where === 'factory');
      const toUnit = step === 'alteration' && where === 'hemming-unit';
      touch(db => { const r = db.returns.find(x => x.id === id); if (!r || r.closedOn) return;
        const o = r.orderId ? (db.customerOrders ?? []).find(x => x.id === r.orderId) : null; const f = o?.fabricId ? db.fabrics.find(x => x.id === o.fabricId) : null; const opt = o?.optionId ? db.options.find(x => x.id === o.optionId) : null; const amount = f?.mrp ?? opt?.mrp ?? 2990;
        r.attempts.push({ step, startedOn: now(), by: who(), outcome: 'pending', note, decidedOn: null, where: step === 'alteration' ? (where ?? 'store') : step === 'remake' ? 'factory' : undefined });
        if (step === 'store-credit') { const a = r.attempts[r.attempts.length - 1]; a.outcome = 'accepted'; a.decidedOn = now(); r.refund = { kind:'store-credit', amount, requestedOn: now(), movedOn: now(), by: who() }; r.stage = 'refunded'; r.closedOn = now();
          const cust = o?.customer ?? null; if (cust) { db.creditLedger = db.creditLedger ?? []; db.creditLedger.unshift({ id:`cr-${Date.now().toString(36)}`, creditNoteNo: `CN-${r.caseNo.replace('RET-', '')}`, customer: cust, at: now(), amount, note: `credit note CN-${r.caseNo.replace('RET-', '')} · ${r.styleName} returned`, by: who(), storeId: r.storeId, caseId: r.id, orderId: o?.id ?? null }); } }
        else if (step === 'exchange') { const a = r.attempts[r.attempts.length - 1]; a.outcome = 'accepted'; a.decidedOn = now(); a.note = `${extra?.size ? `swapped for size ${extra.size}` : 'swapped'}${note ? ` · ${note}` : ''}`; r.stage = 'closed'; r.closedOn = now();
          /* the new size leaves the shelf; the returned piece goes back on it only when nothing is wrong with the piece itself */
          if (opt && extra?.size) { opt.stockBySize[extra.size] = Math.max(0, (opt.stockBySize[extra.size] ?? 0) - 1); if (o?.size && ['Fit', 'Changed mind', 'Wrong size sent'].includes(r.reason)) opt.stockBySize[o.size] = (opt.stockBySize[o.size] ?? 0) + 1; } }   // the store gives it on the spot
        else if (step === 'refund') { r.refund = { kind:'refund', amount, requestedOn: now(), movedOn: null, by: null }; r.stage = 'back-at-store'; }
        else if (toFactory && r.kind === 'MTM') { r.factoryLeg = { factoryId: r.factoryLeg?.factoryId ?? null, sentOn: null, receivedAtFactoryOn: null, backAtStoreOn: null }; }
        else if (toUnit) { r.hemLeg = { destination: 'store', handedOn: null, inwardAtWarehouseOn: null, atUnitOn: null, hemmedOn: null, backAtWarehouseOn: null, dispatchedOn: null, deliveredOn: null }; }
      }, step === 'exchange' ? 'Swapped from the shelf — case closed, stock moved.' : step === 'store-credit' ? 'Piece taken back — credit note generated on the customer\'s account, good for a year. Case closed.' : step === 'refund' ? 'Refund requested — finance sees it on Today; the store sees the moment it moves.' : step === 'alteration' && where !== 'factory' ? 'Alteration by the store\'s own tailor — nothing travels; the customer tries it here.' : `${step[0].toUpperCase()}${step.slice(1)} started — the piece goes to the factory.`);
    },
    decideResolution(id, outcome, note) {
      touch(db => { const r = db.returns.find(x => x.id === id); const a = r?.attempts[r.attempts.length - 1]; if (!r || !a || a.outcome !== 'pending') return;
        a.outcome = outcome; a.decidedOn = now(); if (note) a.note = a.note ? `${a.note} · ${note}` : note;
        if (outcome === 'accepted') { r.closedOn = now(); r.stage = 'closed'; } },
        outcome === 'accepted' ? 'Customer happy — case closed on the record.' : 'Not enough — the next rung of the ladder is open.', outcome === 'accepted' ? 'ok' : 'warn');
    },
    sendReturnToFactory(id, factoryId) { touch(db => { const r = db.returns.find(x => x.id === id); if (!r) return; r.factoryLeg = { factoryId, sentOn: now(), receivedAtFactoryOn: null, backAtStoreOn: null }; r.stage = 'at-factory'; }, 'Piece handed to the vehicle — the factory scans it in; no need to ask on Slack whether it reached.'); },
    redeemCredit(customer, amount, orderId, note) {
      touch(db => { db.creditLedger = db.creditLedger ?? []; const bal = db.creditLedger.filter(e => e.customer === customer).reduce((a, e) => a + e.amount, 0); const amt = Math.min(amount, bal); if (amt <= 0) return;
        db.creditLedger.unshift({ id:`cr-${Date.now().toString(36)}`, customer, at: now(), amount: -amt, note: note || 'spent on a bill', by: who(), storeId: get().storeId, caseId: null, orderId }); },
      `₹${amount.toLocaleString('en-IN')} of store credit applied.`);
    },
    sendReturnToHemming(id, destination) { touch(db => { const r = db.returns.find(x => x.id === id); if (!r) return;
      r.hemLeg = { destination, handedOn: now(), inwardAtWarehouseOn: null, atUnitOn: null, hemmedOn: null, backAtWarehouseOn: null, dispatchedOn: null, deliveredOn: null }; r.stage = 'at-factory'; },
      'Handed to the vehicle for the warehouse. The warehouse inwards it, sends it to the hemming unit, and every hop from here is a scan.'); },
    hemLegStep(id, step) {
      const msg: Record<HemLegStep, string> = { inwardAtWarehouse: 'Inwarded at the warehouse — next stop the hemming unit.', atUnit: 'Scanned in at the hemming unit.', hemmed: 'Hemmed — on its way back to the warehouse.', backAtWarehouse: 'Back at the warehouse — to dispatch.', dispatched: 'Dispatched.', delivered: 'Delivered — the store confirms with the customer.' };
      touch(db => { const r = db.returns.find(x => x.id === id); const h = r?.hemLeg; if (!r || !h) return;
        const key = (`${step}On`) as keyof NonNullable<ReturnCase['hemLeg']>; (h as unknown as Record<string, string | null>)[key] = now();
        if (step === 'dispatched') r.stage = 'back-at-store';
      }, msg[step]);
    },
    factoryReceivedReturn(id) { touch(db => { const r = db.returns.find(x => x.id === id); if (r?.factoryLeg) r.factoryLeg.receivedAtFactoryOn = now(); }, 'Scanned in at the factory. The store can see it arrived.'); },
    returnDoneAtFactory(id) { touch(db => { const r = db.returns.find(x => x.id === id); if (r?.factoryLeg) { r.stage = 'back-at-store'; } }, 'Work done — the piece is on its way back to the store to count in.'); },
    approveRefund(id) { touch(db => { const r = db.returns.find(x => x.id === id); if (!r?.refund || r.refund.kind !== 'refund') return; r.refund.approvedOn = now(); r.refund.approvedBy = who(); }, 'Refund approved — finance can move the money.'); },
    moveRefund(id) { touch(db => { const r = db.returns.find(x => x.id === id); if (!r?.refund) return; r.refund.movedOn = now(); r.refund.by = who(); r.stage = 'refunded'; const a = r.attempts[r.attempts.length - 1]; if (a && a.outcome === 'pending') { a.outcome = 'accepted'; a.decidedOn = now(); } r.closedOn = now(); }, 'Moved — the store sees it, and can tell the customer.'); },
    writeOffStock(input) {
      touch(db => { const opt = db.options.find(x => x.id === input.optionId); if (!opt) return; const q = Math.min(input.qty, opt.stockBySize[input.size] ?? 0); opt.stockBySize[input.size] = Math.max(0, (opt.stockBySize[input.size] ?? 0) - q);
        db.writeOffs = db.writeOffs ?? []; db.writeOffs.unshift({ id:`wo-${Date.now().toString(36)}`, storeId: get().storeId, optionId: opt.id, styleName: opt.styleName, size: input.size, qty: q, reason: input.reason, disposition: input.disposition, at: now(), by: who(), backAtUnitOn: null }); },
        'Written off — the system stock dropped the moment you decided, so it cannot be sold twice or counted as cover.', 'warn');
    },
    updateReturn(id, patch) { touch(db => { const r = db.returns.find(x => x.id === id); if (r) Object.assign(r, patch); }, 'Saved.'); },
    /* One number for a reservation, used by every path that touches it: punch,
       edit, scan out, cancel. It used to be reserved per piece × qty and
       released per piece, so a 3-piece order leaked two shirts' cloth forever. */
    punchBill(inputs) {
      const billNo = `BILL-${Date.now().toString(36).toUpperCase().slice(-5)}`;
      return inputs.map((i, k) => get().punchOrder({ ...i, billNo, _idSuffix: String(k) }));
    },
    punchOrder(input) {
      const { _idSuffix, ...rest } = input; input = rest;
      const id = `co-${Date.now().toString(36)}${_idSuffix ?? ''}`;
      touch(db => {
        db.customerOrders = db.customerOrders ?? [];
        const f = input.fabricId ? db.fabrics.find(x => x.id === input.fabricId) : null;
        db.customerOrders.unshift({ ...input, billNo: input.billNo ?? null, id, orderNo: `BSC-${73100 + db.customerOrders.length + 1}`, storeId: get().storeId, punchedOn: now(), stage: 'punched', tag: input.tag ?? (input.express ? 'urgent' : 'normal'), planId: null, factoryId: null, changeSeenOn: null, changeToldFactoryOn: null, changeFactorySeenOn: null, consumptionM: input.kind === 'MTM' ? consumptionFor(f?.family === 'Linen' ? 1.85 : 1.6) : null, scans: [], revisions: [],
          spec: input.kind === 'MTM' ? (input.spec ?? defaultSpec()) : null, measurements: input.kind === 'MTM' ? (input.measurements ?? defaultMeasurements()) : null, pattern: input.kind === 'MTM' ? (input.pattern ?? defaultPattern()) : null,
          bespoke: f?.bucket === 'BESPOKE' ? { code: mintBespokeCode(f.vendorId, db.customerOrders.length + 1), requestedOn: now(), inwardOn: null } : null });
        if (input.kind === 'MTM' && input.fabricId) { const o = db.customerOrders[0]; const f = db.fabrics.find(x => x.id === input.fabricId);
          if (f) f.reservedMetres = round2(f.reservedMetres + orderMetres(o)); }   // Enigma reserves on punch; so do we
        /* the display piece is not shelf stock — selling it leaves the window at −1, not the shelf */
        if (input.kind === 'RTW' && input.optionId && input.size && !input.soldDisplay) { const o = db.options.find(x => x.id === input.optionId); if (o) o.stockBySize[input.size] = Math.max(0, (o.stockBySize[input.size] ?? 0) - input.qty); }
      }, input.kind === 'MTM' ? `Punched. ${round2(consumptionFor(1.6) * input.qty)} m reserved — every store's saleable number just moved.` : input.soldDisplay ? 'Punched from the window. This store now owes itself a display piece — it is on the asks list.' : 'Punched. Stock for that size is off the shelf count.');
      return id;
    },
    /* ---------- MTM production ---------- */
    setOrderTag(id, tag) { touch(db => { const o = (db.customerOrders ?? []).find(x => x.id === id); if (o) { o.tag = tag; if (tag === 'urgent') o.promisedOn = iso(addDays(new Date(o.punchedOn), 2)); } }, 'Tag set.'); },
    editOrderSheet(id, patch, note, who = 'unit') {
      const me = PEOPLE.find(p => p.id === get().personId)!;
      touch(db => {
        const o = (db.customerOrders ?? []).find(x => x.id === id); if (!o) return;
        const mode = sheetEditMode(o, who);
        if (mode === 'closed') return;
        /* once a factory is allocated the store may add a remark and nothing else */
        if (mode === 'remarks') patch = { remarks: patch.remarks };
        const changes: { field: string; from: string; to: string }[] = [];
        const note2 = (field: string, from: unknown, to: unknown) => { if (to != null && String(to) !== String(from)) changes.push({ field, from: String(from ?? '—'), to: String(to) }); };
        /* the cloth already taken off the shelf for this order, before any edit —
           whatever moves below, the reservation has to follow it */
        const heldBefore = o.kind === 'MTM' ? orderMetres(o) : 0;
        const fabricBefore = o.fabricId;
        if (patch.fabricId && patch.fabricId !== o.fabricId) { const f = db.fabrics.find(x => x.id === patch.fabricId);
          note2('Fabric', o.styleName, f?.name); if (f) { o.fabricId = f.id; o.styleName = f.name; o.consumptionM = consumptionFor(f.family === 'Linen' ? 1.85 : 1.6); } }
        note2('Fit', o.fit, patch.fit); if (patch.fit) o.fit = patch.fit;
        note2('Quantity', o.qty, patch.qty); if (patch.qty) o.qty = patch.qty;
        if (o.kind === 'MTM' && o.stage !== 'in-transit' && !MTM_SPENT.includes(o.stage)) {
          const held = orderMetres(o);
          if (fabricBefore !== o.fabricId || held !== heldBefore) {
            const oldF = db.fabrics.find(x => x.id === fabricBefore); if (oldF) oldF.reservedMetres = Math.max(0, round2(oldF.reservedMetres - heldBefore));
            const newF = db.fabrics.find(x => x.id === o.fabricId); if (newF) newF.reservedMetres = round2(newF.reservedMetres + held);
          }
        }
        note2('Tag', o.tag, patch.tag); if (patch.tag) { o.tag = patch.tag; if (patch.tag === 'urgent') o.promisedOn = iso(addDays(new Date(o.punchedOn), 2)); }
        note2('Remarks', o.remarks, patch.remarks); if (patch.remarks != null) o.remarks = patch.remarks;
        if (patch.spec && o.spec) (Object.keys(patch.spec) as SheetOptionKey[]).forEach(k => { note2(SHEET_LABEL[k] ?? k, o.spec![k], patch.spec![k]); if (patch.spec![k]) o.spec![k] = patch.spec![k]!; });
        if (patch.measurements && o.measurements) (Object.keys(patch.measurements) as MeasureKey[]).forEach(k => { const v = patch.measurements![k]; if (v != null && v !== o.measurements![k]) { note2(SHEET_LABEL[k] ?? k, o.measurements![k], v); o.measurements![k] = v; } });
        if (patch.pattern && o.pattern) (Object.keys(patch.pattern) as (keyof PatternFlags)[]).forEach(k => { const v = patch.pattern![k]; if (v != null && v !== o.pattern![k]) { note2(SHEET_LABEL[k] ?? k, o.pattern![k] ? 'Yes' : 'No', v ? 'Yes' : 'No'); o.pattern![k] = v; } });
        if (changes.length === 0) return;
        o.revisions = o.revisions ?? [];
        o.revisions.push({ rev: o.revisions.length + 1, at: now(), by: me.name, role: me.role, note, changes, reprint: mode === 'amend' });
      }, 'Order sheet updated — the change is on the record with your name and the time.');
    },
    markChangeSeen(orderIds) { touch(db => orderIds.forEach(id => { const o = (db.customerOrders ?? []).find(x => x.id === id); if (o) o.changeSeenOn = now(); }), `Marked read — ${orderIds.length} change${orderIds.length === 1 ? '' : 's'} taken into the plan.`); },
    markFactoryTold(orderIds) { touch(db => orderIds.forEach(id => { const o = (db.customerOrders ?? []).find(x => x.id === id); if (o) { o.changeToldFactoryOn = now(); o.changeSeenOn = now(); } }), `Logged — the factory has been told. It is on the record, not only on the call.`); },

    unplanOrders(orderIds, note) {
      touch(db => orderIds.forEach(id => { const o = (db.customerOrders ?? []).find(x => x.id === id); if (!o || o.stage !== 'planned') return;
        const pl = (db.plans ?? []).find(p => p.id === o.planId); if (pl) pl.orderIds = pl.orderIds.filter(x => x !== id);
        o.planId = null; o.factoryId = null; o.stage = 'pp'; o.scans = o.scans.filter(sc => sc.stage !== 'planned');
        o.revisions = o.revisions ?? []; o.revisions.push({ rev: o.revisions.length + 1, at: now(), by: who(), role: get().role, note: note || 'Pulled back to PP', changes: [{ field:'Plan', from:'planned', to:'back in PP' }], reprint: false });
      }), `Pulled back to PP. The factory's headroom is free again and the store can edit the sheet.`);
    },
    reissueSheet(orderIds) { touch(db => orderIds.forEach(id => { const o = (db.customerOrders ?? []).find(x => x.id === id); if (o) o.revisions.forEach(r => (r.reprint = false)); }), 'Amended sheet re-issued — the factory is working to the new revision.'); },
    submitPlan(factoryId, orderIds, force = false) {
      const id = `${factoryId}-${Date.now().toString(36)}`;
      const room = factoryLoadOf(get().db, factoryId).headroom;
      if (orderIds.length > room && !force) { get().toast(`${orderIds.length} pieces is past ${get().db.vendors.find(v => v.id === factoryId)?.name}'s capacity — room for ${room} today. Send ${room}, or force the rest through on the record.`, 'warn'); return ''; }
      const over = Math.max(0, orderIds.length - room);
      touch(db => {
        db.plans = db.plans ?? [];
        const planNo = `#${41300 + db.plans.length}`;
        db.plans.unshift({ id, planNo, factoryId, category: 'Shirts', createdOn: now(), closedOn: null, orderIds, forcedOver: over || null, forcedBy: over ? who() : null });
        orderIds.forEach(oid => { const o = (db.customerOrders ?? []).find(x => x.id === oid); if (!o) return; o.stage = 'planned'; o.planId = id; o.factoryId = factoryId; o.scans.push({ stage:'planned', at: now(), by: who() }); });
      }, over ? `Forced: ${orderIds.length} sent to ${get().db.vendors.find(v => v.id === factoryId)?.name} — ${over} past today's capacity, and it is on the plan with your name.` : `Plan submitted to ${get().db.vendors.find(v => v.id === factoryId)?.name} — ${orderIds.length} order sheet${orderIds.length === 1 ? '' : 's'} to print and cut.`, over ? 'warn' : 'ok');
      return id;
    },
    receiveRound(factoryId, round) {
      const fname = get().db.vendors.find(v => v.id === factoryId)?.name ?? 'factory';
      if (round.received.length) get().scanOrders(round.received, 'rts');
      touch(db => {
        round.short.forEach(id => { const o = (db.customerOrders ?? []).find(x => x.id === id); if (!o) return;
          o.receiving = { shortOn: now(), rejected: o.receiving?.rejected ?? [] }; });
        round.rejected.forEach(({ id, reason }) => { const o = (db.customerOrders ?? []).find(x => x.id === id); if (!o) return;
          o.stage = 'in-factory'; o.scans.push({ stage: 'in-factory', at: now(), by: who() });
          o.receiving = { shortOn: null, rejected: [...(o.receiving?.rejected ?? []), { on: now(), reason, by: who() }] };
          o.remarks = `${o.remarks ? o.remarks + ' · ' : ''}turned back at the unit: ${reason}`; });
        round.received.forEach(id => { const o = (db.customerOrders ?? []).find(x => x.id === id); if (o?.receiving?.shortOn) o.receiving = { ...o.receiving, shortOn: null }; });
        if (round.vehicle || round.note) { const g = (db.grns ?? []).find(x => x.kind === 'mtm-round' && x.ref.includes(fname) && x.receivedOn.slice(0, 10) === now().slice(0, 10)); if (g) g.remarks = [g.remarks, round.vehicle && `vehicle ${round.vehicle}`, round.note].filter(Boolean).join(' · '); }
      }, `${fname}: ${round.received.length} received${round.short.length ? ` · ${round.short.length} not on the vehicle` : ''}${round.rejected.length ? ` · ${round.rejected.length} turned back` : ''}.`);
    },
    scanOrders(orderIds, stage) {
      touch(db => { if (stage === 'rts') { const os = orderIds.map(oid => (db.customerOrders ?? []).find(x => x.id === oid)).filter((x): x is CustomerOrder => !!x);
          const byF = new Map<string | null, CustomerOrder[]>(); os.forEach(o => byF.set(o.factoryId, [...(byF.get(o.factoryId) ?? []), o]));
          byF.forEach((list, fid) => grn(db, { kind:'mtm-round', ref: `round · ${db.vendors.find(v => v.id === fid)?.name ?? 'factory'}`, refLabel: `${list.length} finished MTM piece${list.length === 1 ? '' : 's'} · ${list.slice(0, 3).map(o => o.orderNo).join(', ')}${list.length > 3 ? '…' : ''}`, vendorId: fid, qty: list.length, unit:'pc', rejected: 0, remarks: '' })); }
        orderIds.forEach(oid => { const o = (db.customerOrders ?? []).find(x => x.id === oid); if (!o) return;
        o.stage = stage; o.scans.push({ stage, at: now(), by: who() });
        /* Enigma deducts the order sheet's metres at the in-production scan; so do we */
        if (stage === 'in-transit' && o.fabricId && o.consumptionM) { const m = orderMetres(o); const f = db.fabrics.find(x => x.id === o.fabricId);
          if (f) { f.stockMetres = Math.max(0, round2(f.stockMetres - m)); f.reservedMetres = Math.max(0, round2(f.reservedMetres - m)); } }
      }); }, stage === 'in-transit' ? `Scanned out. ${orderIds.length} piece${orderIds.length === 1 ? '' : 's'} in transit — fabric deducted from inventory.` : stage === 'in-factory' ? 'Scanned in at the factory.' : stage === 'out-factory' ? 'Marked ready.' : stage === 'rts' ? 'Back at the production unit.' : stage === 'dispatched' ? 'Dispatched — the shipping table just moved.' : 'Saved.');
    },
    closePlan(planId) { touch(db => { const pl = (db.plans ?? []).find(x => x.id === planId); if (pl) pl.closedOn = now(); }, 'Plan closed.'); },
    updateVendor(id, patch) {
      touch(db => { const v = db.vendors.find(x => x.id === id); if (!v) return;
        if (patch.corporate) db.vendors.forEach(x => { if (x.id !== id) x.corporate = false; });
        if (patch.urgentReserve) db.vendors.forEach(x => { if (x.id !== id) x.urgentReserve = false; });
        Object.assign(v, patch); }, 'Factory master saved — the allocation rules use it from the next draft.');
    },
    raiseExtraFabric(input) {
      touch(db => { const o = (db.customerOrders ?? []).find(x => x.id === input.orderId); if (!o || !o.fabricId || !o.factoryId) return;
        db.extraFabric = db.extraFabric ?? [];
        db.extraFabric.unshift({ ...input, id:`xf-${Date.now().toString(36)}`, fabricId: o.fabricId, factoryId: o.factoryId, planId: o.planId ?? null, raisedBy: who(), raisedOn: now(), status:'requested', decidedOn: null });
      }, 'Asked. It is on the production unit\'s queue here — no email, no phone call.');
    },
    decideExtraFabric(id, status) {
      touch(db => { const r = (db.extraFabric ?? []).find(x => x.id === id); if (!r) return;
        const wasLive = r.status === 'requested';
        r.status = status; r.decidedOn = r.decidedOn ?? now();
        /* approval is the inventory event — the metres leave the shelf the moment the production unit says yes */
        if (status === 'approved' && wasLive) { const f = db.fabrics.find(x => x.id === r.fabricId); if (f) f.stockMetres = Math.max(0, Math.round((f.stockMetres - r.metres) * 100) / 100); }
      }, status === 'approved' ? 'Approved — inventory deducted, fabric team gets the cut list.' : status === 'declined' ? 'Declined.' : 'Marked sent to the factory.', status === 'declined' ? 'warn' : 'ok');
    },

    reportMillStock(fabricId, available, metres) { touch(db => { const f = db.fabrics.find(x => x.id === fabricId); if (f) { f.millAvailable = available; if (metres != null) f.millStockMetres = metres; else if (!available) f.millStockMetres = 0; f.millReportedAt = now(); if (!available) f.onHold = true; if (available && f.onHold) f.onHold = false; } }, available ? `Mill stock updated${metres != null ? ` — ${metres} m` : ''} — orderable.` : 'Reported sold out at the mill — switched off on Shopify and in stores.', available ? 'ok' : 'warn'); },
    inwardBespoke(code) {
      const c = code.trim().toUpperCase();
      const o = (get().db.customerOrders ?? []).find(x => x.bespoke && x.bespoke.code.toUpperCase() === c && !x.bespoke.inwardOn);
      if (!o) { get().toast(`No open bespoke order carries code ${c}.`, 'warn'); return { ok: false }; }
      touch(db => { const x = (db.customerOrders ?? []).find(y => y.id === o.id)!; x.bespoke!.inwardOn = now(); if (x.stage === 'punched') x.stage = 'pp'; x.scans.push({ stage:'pp', at: now(), by: who() }); const fb = db.fabrics.find(f => f.id === x.fabricId); grn(db, { kind:'bespoke-parcel', ref: c, refLabel: `${fb?.name ?? 'bespoke fabric'} · ${x.orderNo}`, vendorId: fb?.vendorId ?? null, qty: x.consumptionM ?? 0, unit:'m', rejected: 0, remarks: '' }); }, `${c} → ${o.orderNo}. Inwarded — planning can see it now.`);
      return { ok: true, orderNo: o.orderNo };
    },
    callBespokeFabric(orderIds) { touch(db => orderIds.forEach(id => { const o = (db.customerOrders ?? []).find(x => x.id === id); if (o?.bespoke && !o.bespoke.requestedOn) o.bespoke.requestedOn = now(); }), `Request sent to the mill${orderIds.length > 1 ? 's' : ''} with ${orderIds.length} code${orderIds.length === 1 ? '' : 's'} — the parcels will match themselves.`); },
    setFabricBucket(fabricId, bucket, note) {
      touch(db => { const f = db.fabrics.find(x => x.id === fabricId); if (!f) return; f.bucket = bucket;
        if (bucket === 'CORE') { if (f.thresholdMetres < 20) f.thresholdMetres = 40; f.promotedOn = now(); f.coreBlock = null; }   // core needs a floor Enigma can fire on — and a mill that keeps weaving it
        else { f.promotedOn = null; }
        void note; },
        bucket === 'CORE' ? 'Promoted to core — Enigma\'s auto-PO now applies. Sourcing still has to agree a supply block with the mill.' : 'Moved back to non-core — sells out once, the slot is refilled with a new fabric.');
    },
    agreeCoreBlock(fabricId, until, metresPerMonth, via, note) {
      touch(db => { const f = db.fabrics.find(x => x.id === fabricId); if (!f) return; f.coreBlock = { agreedOn: now(), until, metresPerMonth, via, by: who(), note }; },
        `Supply block agreed with the mill until ${new Date(until).toLocaleDateString('en-IN', { month:'short', year:'2-digit' })} — the auto-PO has something to draw on.`);
    },
    endCoreBlock(fabricId) { touch(db => { const f = db.fabrics.find(x => x.id === fabricId); if (f) f.coreBlock = null; }, 'Supply block ended — the mill is free to drop the article.', 'warn'); },
    confirmFabricPo(id, expectedOn, remark) { touch(db => { const p = (db.fabricPos ?? []).find(x => x.id === id); if (!p) return; p.vendorConfirmedOn = now(); p.vendorConfirmedBy = who(); if (expectedOn) p.expectedOn = expectedOn; if (remark) p.remark = remark; }, 'Mill confirmed — the incoming metres are real cover now.'); },
    remarkFabricPo(id, expectedOn, remark) { touch(db => { const p = (db.fabricPos ?? []).find(x => x.id === id); if (!p) return; if (expectedOn) p.expectedOn = expectedOn; p.remark = remark; }, expectedOn ? 'New date and remark saved.' : 'Remark saved.'); },
    receiveFabricPo(id) { touch(db => { const p = (db.fabricPos ?? []).find(x => x.id === id); if (!p || p.receivedOn) return; p.receivedOn = now(); const fb = db.fabrics.find(x => x.id === p.fabricId); grn(db, { kind:'fabric', ref: p.poNo, refLabel: fb?.name ?? p.fabricId, vendorId: p.vendorId, qty: p.metres, unit:'m', rejected: 0, remarks: p.remark }); const f = db.fabrics.find(x => x.id === p.fabricId); if (f) { f.stockMetres = Math.round((f.stockMetres + p.metres) * 100) / 100; f.incomingMetres = Math.max(0, Math.round(((f.incomingMetres ?? 0) - p.metres) * 100) / 100); } }, 'GRN done — the metres moved from incoming to the shelf.'); },
    updateFabricPoReceiving(id, metres, close) {
      touch(db => { const p = (db.fabricPos ?? []).find(x => x.id === id); if (!p || p.closedOn) return;
        const m = Math.max(0, Math.min(metres, p.metres - (p.receivedMetres ?? 0)));
        const f = db.fabrics.find(x => x.id === p.fabricId);
        if (m > 0) { p.receivedMetres = Math.round(((p.receivedMetres ?? 0) + m) * 100) / 100; p.receipts = [...(p.receipts ?? []), { on: now(), metres: m, by: who() }];
          grn(db, { kind:'fabric', ref: p.poNo, refLabel: f?.name ?? p.fabricId, vendorId: p.vendorId, qty: m, unit:'m', rejected: 0, remarks: p.remark });
          if (f) { f.stockMetres = Math.round((f.stockMetres + m) * 100) / 100; f.incomingMetres = Math.max(0, Math.round(((f.incomingMetres ?? 0) - m) * 100) / 100); } }
        const pending = p.metres - (p.receivedMetres ?? 0);
        if (pending <= 0 || close) { p.closedOn = now(); p.receivedOn = p.receivedOn ?? now(); p.closedShort = pending > 0; if (close && pending > 0 && f) f.incomingMetres = Math.max(0, Math.round(((f.incomingMetres ?? 0) - pending) * 100) / 100); }
      }, close ? 'Receiving line closed.' : metres > 0 ? `${metres} m received — the metres moved from incoming to the shelf.` : 'Nothing received.');
    },
    receiveFabricGrn(fabricId, metres) {
      touch(db => { const f = db.fabrics.find(x => x.id === fabricId); if (!f) return; const m = metres ?? f.incomingMetres ?? 0; grn(db, { kind:'fabric', ref: f.code, refLabel: f.name, vendorId: f.vendorId, qty: m, unit:'m', rejected: 0, remarks: '' }); f.stockMetres = Math.round((f.stockMetres + m) * 100) / 100; f.incomingMetres = Math.max(0, Math.round(((f.incomingMetres ?? 0) - m) * 100) / 100); },
        'GRN done — the metres moved from incoming to the shelf. Saleable just went up in every store.');
    },
    saveMillStock(updates, millId) {
      touch(db => {
        updates.forEach(u => { const f = db.fabrics.find(x => x.id === u.fabricId); if (!f) return; f.millStockMetres = u.metres; f.millAvailable = u.metres > 0; f.millReportedAt = now(); if (u.metres <= 0) f.onHold = true; else if (f.onHold) f.onHold = false; });
        /* everything else from this mill counts as reported unchanged today */
        db.fabrics.filter(f => f.bucket === 'BESPOKE' && f.vendorId === millId).forEach(f => { f.millReportedAt = now(); });
      }, `${updates.length} fabric${updates.length === 1 ? '' : 's'} changed · ${get().db.vendors.find(v => v.id === millId)?.name} reported for today.`);
    },
    importMillSheet(millId, text) {
      /* one line per fabric: "<code or name> ... <qty | in stock | out | 0 | OOS>" — whatever the mill's sheet says, pasted */
      let n = 0;
      touch(db => {
        const mine = db.fabrics.filter(f => f.bucket === 'BESPOKE' && f.vendorId === millId);
        text.split(/\r?\n/).forEach(line => {
          const l = line.trim(); if (!l) return;
          const f = mine.find(x => l.toUpperCase().includes(x.code.toUpperCase()) || l.toLowerCase().includes(x.name.toLowerCase()));
          if (!f) return;
          const tail = l.replace(new RegExp(f.code, 'i'), '').replace(new RegExp(f.name, 'i'), '');
          const num = tail.match(/(\d+(?:\.\d+)?)\s*(m|mtr|mtrs|metres|meters)?\b/i);
          const metres = num ? Number(num[1]) : null;
          const out = /\b(out|oos|sold\s*out|nil|no)\b/i.test(tail) || metres === 0;
          f.millAvailable = !out; f.millStockMetres = out ? 0 : (metres ?? f.millStockMetres); f.millReportedAt = now(); if (out) f.onHold = true; else if (f.onHold) f.onHold = false; n++;
        });
      }, n ? `${n} fabric${n === 1 ? '' : 's'} updated from the mill's sheet.` : 'Nothing matched — the sheet needs the fabric code or name on each line.', n ? 'ok' : 'warn');
      return n;
    },
    fulfilOrder(id) {
      touch(db => { const o = (db.customerOrders ?? []).find(x => x.id === id); if (!o) return;
        const nextStage = o.stage === 'punched' ? 'dispatched' : 'delivered';
        o.stage = nextStage; o.scans.push({ stage: nextStage, at: now(), by: who() });
      }, 'Moved.');
    },
    askSwatchBooks(kind, copies, reason) {
      const storeId = get().storeId;
      touch(db => { db.bookRequests = db.bookRequests ?? []; db.bookRequests.unshift({ id:`bkr-${Date.now().toString(36)}`, storeId, kind, copies, reason, status:'requested', askedOn: now(), by: who(), decidedOn: null, note:'', bookId: null }); },
        `Asked the unit for ${copies} ${kind} book${copies > 1 ? 's' : ''}. Shravani sees it on her list.`);
    },
    answerBookRequest(id, decision, note) {
      touch(db => { const r = (db.bookRequests ?? []).find(x => x.id === id); if (!r || r.status !== 'requested') return;
        r.status = decision; r.decidedOn = now(); r.note = note ?? '';
        if (decision === 'shipped') { db.swatchBooks = db.swatchBooks ?? []; const bid = `bk-${Date.now().toString(36)}`; db.swatchBooks.unshift({ id: bid, storeId: r.storeId, kind: r.kind, edition:'AW26', copies: r.copies, from: r.kind === 'BESPOKE' ? (db.vendors.find(v => v.kind.endsWith('mill'))?.id ?? 'unit') : 'unit', dispatchedOn: now(), receivedOn: null, trackingNo: null }); r.bookId = bid; }
      }, decision === 'shipped' ? 'Books dispatched — the store will confirm when they land.' : 'Declined — the store sees why.');
    },
    dispatchSwatchBook(storeId, kind, copies, from) {
      touch(db => { db.swatchBooks = db.swatchBooks ?? []; db.swatchBooks.unshift({ id:`bk-${Date.now().toString(36)}`, storeId, kind, edition: 'AW26', copies, from, dispatchedOn: now(), receivedOn: null, trackingNo: null }); }, `${kind} book${copies > 1 ? 's' : ''} dispatched — the store has a receipt to confirm.`);
    },
    receiveSwatchBook(id) { touch(db => { const b = (db.swatchBooks ?? []).find(x => x.id === id); if (b) b.receivedOn = now(); }, 'Confirmed — head office can see the book is on your floor.'); },
    reviseShipBy(moves, reason) {
      const to = new Map(moves.map(m => [m.id, m.to]));
      const n = (get().db.customerOrders ?? []).filter(o => to.has(o.id) && o.promisedOn !== to.get(o.id)).length;
      touch(db => { (db.customerOrders ?? []).forEach(o => { const d = to.get(o.id); if (!d || o.promisedOn === d) return;
        o.promiseRevisions = [...(o.promiseRevisions ?? []), { at: now(), by: who(), from: o.promisedOn, to: d, reason }]; o.promisedOn = d; }); },
        `Ship-by moved on ${n} piece${n === 1 ? '' : 's'} · the store${n === 1 ? '' : 's'} can see the new date and why.`);
    },
    advanceOrder(id) { touch(db => { const o = (db.customerOrders ?? []).find(x => x.id === id); if (!o) return; if (o.stage === 'ready' && o.hemLength != null && o.kind === 'RTW') o.stage = 'hemming'; else o.stage = ORDER_STAGE_NEXT[o.stage] as CustomerOrder['stage']; }, 'Moved.'); },
    cancelOrder(id) { touch(db => { const o = (db.customerOrders ?? []).find(x => x.id === id); if (!o) return; o.stage = 'cancelled';
      /* cloth already cut and gone (scanned out) is spent, not reserved — releasing it again would invent metres */
      if (o.kind === 'MTM' && o.fabricId && !MTM_SPENT.includes(o.stage)) { const f = db.fabrics.find(x => x.id === o.fabricId); if (f) f.reservedMetres = Math.max(0, round2(f.reservedMetres - orderMetres(o))); } }, 'Cancelled — reservation released.', 'warn'); },
    requestStock(input) { touch(db => { db.stockRequests = db.stockRequests ?? []; db.stockRequests.unshift({ ...input, id: `sr-${Date.now().toString(36)}`, toStoreId: get().storeId, requestedOn: now(), status: 'requested' }); }, 'Asked. It is on their Today until they answer.'); },
    respondStockRequest(id, status) {
      touch(db => { const q = (db.stockRequests ?? []).find(x => x.id === id); if (!q) return; q.status = status; }, status === 'declined' ? 'Declined — they will see it and ask elsewhere.' : status === 'shipped' ? 'Marked shipped.' : status === 'received' ? 'Received. Both counts moved.' : 'Accepted — ship it when packed.', status === 'declined' ? 'warn' : 'ok');
    },
    advanceReturn(id) {
      const NEXT: Record<string, typeof SEED.returns[number]['stage']> = { raised:'at-factory', 'at-factory':'back-at-store', 'back-at-store':'refunded', refunded:'closed', closed:'closed' };
      touch(db => { const r = db.returns.find(x => x.id === id); if (r) r.stage = NEXT[r.stage]; }, 'Return moved to the next stage.');
    },
  };
}, {
  name: 'bsc-plm-v1',
  version: 111,
  /* A record shape change resets the demo data rather than rendering half-formed rows. */
  migrate: (persisted, version) => {
    const p = persisted as Partial<AppState>;
    /* the store list changed to the sheets' own — a remembered store or person that no longer exists falls back */
    const storeId = STORES.some(s => s.id === p.storeId) ? p.storeId : 'plh';
    /* role and person are one fact in two fields — a fallback that changes the
       person has to change the role with it, or comments are signed by the wrong team */
    const person = PEOPLE.find(x => x.id === p.personId) ?? PEOPLE.find(x => x.role === p.role) ?? PEOPLE[0];
    /* v100: the plain, quiet view is the default — explainers and example strips are opt-in from Demo settings */
    const settings = { ppFreezeHours: 2, ...(p.settings ?? {}), ...(version < 100 ? { quiet: true } : {}) };
    return { ...p, settings, storeId, personId: person.id, role: person.role,
      ...(version < 111 ? { db: structuredClone(SEED) } : {}) } as AppState;
  },
  onRehydrateStorage: () => (state) => { applyTrackerConfig(state?.db?.trackerConfig); },
  partialize: s => ({ db: s.db, role: s.role, personId: s.personId, storeId: s.storeId, factoryId: s.factoryId, settings: s.settings, demoAll: s.demoAll, views: s.views }),
}));

/* Screens read the role through this, never off the raw store. `role` is what
   you may act as — everything, while walkthrough mode is on. `myRole` is who
   you actually are, which is what every "whose step is this" line is written
   from. Turn walkthrough mode off and the two are the same again. */
export function useApp(): AppState & { myRole: RoleId } {
  const s = useAppStore();
  return { ...s, myRole: s.role, role: s.demoAll ? 'owner' : s.role };
}

export type { RtwOption };
