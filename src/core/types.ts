/** Core domain types. Pure data; no DOM, no React. */

export const RESOURCE_IDS = ['finances', 'support', 'coalition', 'prestige'] as const;
export type ResourceId = (typeof RESOURCE_IDS)[number];

/** Fixed order; also the iteration order for every roll (determinism). */
export const GROUP_IDS = ['oligarchs', 'pensioners', 'media', 'eu', 'activists'] as const;
export type GroupId = (typeof GROUP_IDS)[number];

export const LEANING_IDS = [
  'libertarianism',
  'conservatism',
  'populism',
  'socialism',
  'progressivism',
  'fascism',
  'communism',
] as const;
export type LeaningId = (typeof LEANING_IDS)[number];

export type LeaderId = string;
export type DifficultyId = 'easy' | 'normal' | 'hard';
export const DIFFICULTY_IDS: DifficultyId[] = ['easy', 'normal', 'hard'];

export interface Range {
  min: number;
  max: number;
}

/** Keys allowed in an `effects` block. `finances` is accepted as an alias of `financesExtra`. */
export type EffectKey = ResourceId | 'financesExtra';

export interface OngoingDef {
  /** A resource id (`support`) or an anger meter (`anger.media`). */
  target: string;
  perDay: number;
  days: number;
  label?: string;
}

export interface BudgetChange {
  /** Chapter code from data/budget.json, or `*` for every chapter. */
  chapter: string;
  type: 'revenue' | 'expenditure';
  changePct: number;
}

export interface EffectBundle {
  effects?: Partial<Record<EffectKey, Range>>;
  anger?: Partial<Record<GroupId, Range>>;
  ongoing?: OngoingDef[];
  budgetChanges?: BudgetChange[];
  pc?: number;
  /** Regional support shifts per kraj code (added to national support for that region only). */
  regions?: Partial<Record<string, Range>>;
}

export type ModifierSource =
  | 'policy'
  | 'chaos'
  | 'response'
  | 'opportunity'
  | 'budget_vote'
  | 'ongoing'
  | 'drift'
  | 'penalty'
  | 'ability'
  | 'compromise'
  | 'any';

/** Where a value change comes from (a modifier `source` other than `any`). */
export type ChangeSource = Exclude<ModifierSource, 'any'>;

export interface ModifierDef {
  type: 'add' | 'multiplier';
  /** Grammar in spec §4.8, e.g. `support.loss`, `anger.media.gain`, `finances.negative`, `pc.perQuarter`. */
  target: string;
  value: number;
  source?: ModifierSource;
  days?: number;
}

export interface Modifier extends ModifierDef {
  /** e.g. `upgrade:sup_press_office`, `ability:austerity_freeze` (shown in the panel). */
  origin: string;
  /** Remaining days for a timed modifier; undefined = permanent. */
  daysLeft?: number;
}

// ---------------------------------------------------------------- content data

export interface PolicyCard extends EffectBundle {
  id: string;
  leaning: LeaningId;
  availableFor: LeaderId[];
  title: string;
  description: string;
  drivenBy: string;
  chaosEvents: string[];
  devOnly: boolean;
}

/**
 * Regional compromise ("ucinit kompromis"): offered in its own decision, two compromises against each
 * other (never mixed with policy cards); no leaning.
 * Usually raises support in some kraje and lowers it in others, or trades regional support for
 * oligarchs' favour or Finances.
 */
export interface CompromiseCard extends EffectBundle {
  id: string;
  availableFor: LeaderId[];
  title: string;
  description: string;
  drivenBy: string;
  chaosEvents: string[];
  devOnly: boolean;
}

export interface ResponseOption extends EffectBundle {
  id: string;
  label: string;
  cost: { pc: number };
}

export interface ChaosEventDef extends EffectBundle {
  id: string;
  chance: number;
  quarterOffset: number;
  window: { fromDay: number; toDay: number };
  text: string;
  responses: { default: string; options: ResponseOption[] } | null;
  devOnly?: boolean;
}

export interface OpportunityDef {
  id: string;
  weight: number;
  text: string;
  reward: EffectBundle;
}

export interface BudgetVoteOption extends EffectBundle {
  id: string;
  label: string;
  description: string;
  passChanceMod: number;
  /** Preset slider positions (steps per budget category) set when the player picks this preset. */
  sliders: Record<string, number>;
}

/** Player-facing budget category with a slider. Maps to hidden chapters; its name is a locale key. */
export interface BudgetItem {
  id: string;
  label: string;
  /** Hidden mapping: one step of stepPct % adds stepPct * weight to each chapter's changePct. */
  chapters: { chapter: string; type: 'revenue' | 'expenditure'; weight: number }[];
  /** Anger change per +1 step (a cut is a negative step, so it inverts the sign). */
  angerPerStep: Partial<Record<GroupId, number>>;
  supportPerStep: number;
  /** Pass-chance change per +1 step (e.g. partners like more spending on this). */
  passPerStep: number;
  canBeRedLine: boolean;
}

export interface RedLine {
  item: string;
  /** Cutting by more than this many steps violates the red line. */
  maxCutSteps: number;
}

export interface UpgradeNode {
  id: string;
  cost: number;
  requires: string[];
  modifiers: ModifierDef[];
  name: string;
  description: string;
  /** Layout hint for the tree UI, in grid units. */
  pos: { col: number; row: number };
}

export interface UpgradeTree {
  id: string;
  name: string;
  nodes: UpgradeNode[];
}

export interface EndingDef {
  id: string;
  group: GroupId;
  threshold: number;
  /** Built endings end the run. Unbuilt ones apply the stand-in penalty while the meter is at the threshold. */
  built: boolean;
  title: string;
  text: string;
  art: string;
  standInPenalty: { target: string; perDay: number };
}

export interface AbilityDef {
  id: string;
  name: string;
  description: string;
  modifiers: ModifierDef[];
  bundle: EffectBundle;
}

export interface LeaderDef {
  id: LeaderId;
  name: string;
  party: string;
  profile: string;
  color: string;
  colorLight: string;
  start: Record<ResourceId, number>;
  startAnger: Record<GroupId, number>;
  leaningWeights: Record<LeaningId, number>;
  ability: AbilityDef;
  sprite: string;
}

export interface BudgetChapter {
  code: string;
  name: string;
  revenue: number;
  expenditure: number;
}

export interface BudgetData {
  source: string;
  year: number;
  currency: string;
  chapters: BudgetChapter[];
}

export interface RegionDef {
  code: string;
  name: string;
  seats: number;
  offsets: Record<LeaderId, number>;
}

export interface RegionsData {
  seatsSource: string;
  regions: RegionDef[];
  revealOrder: string[];
}

export interface GameData {
  budget: BudgetData;
  regions: RegionsData;
  leaders: LeaderDef[];
  policies: PolicyCard[];
  compromises: CompromiseCard[];
  events: ChaosEventDef[];
  opportunities: OpportunityDef[];
  budgetVote: BudgetVoteOption[];
  budgetItems: BudgetItem[];
  upgrades: UpgradeTree[];
  endings: EndingDef[];
  /** File path -> short content hash, logged in run_started. */
  fileHashes: Record<string, string>;
}

// ---------------------------------------------------------------- runtime state

export type Phase = 'running' | 'draft' | 'budgetVote' | 'compromise' | 'ending' | 'election' | 'finished';

export type Input =
  | { kind: 'pickPolicy'; cardId: string }
  | { kind: 'reroll' }
  | { kind: 'respond'; eventInstanceId: string; responseId: string; timedOut: boolean }
  | { kind: 'collectOpportunity'; pinId: string }
  | { kind: 'voteBudget'; sliders: Record<string, number>; presetId: string | null }
  | { kind: 'makeCompromise'; cardId: string }
  | { kind: 'buyUpgrade'; nodeId: string }
  | { kind: 'useAbility' };

export interface RecordedInput {
  /** Number of effective ticks executed before this input (replay anchor). */
  tick: number;
  quarter: number;
  day: number;
  input: Input;
}

export interface OngoingInstance {
  key: string;
  origin: string;
  source: ChangeSource;
  target: string;
  perDay: number;
  daysLeft: number;
  label?: string;
}

export type ScheduledKind = 'budgetVote' | 'compromise' | 'chaos' | 'pinSpawn' | 'pinExpire';

export interface ScheduledEntry {
  seq: number;
  kind: ScheduledKind;
  /** Absolute game day, 1..1456. */
  absDay: number;
  payload: Record<string, string | number>;
}

export interface Pin {
  id: string;
  region: string;
  opportunityId: string;
  spawnAbsDay: number;
  expireAbsDay: number;
}

export interface PendingResponse {
  instanceId: string;
  eventId: string;
  firedAbsDay: number;
}

export interface DraftState {
  hand: string[];
  shownThisQuarter: string[];
  rerolls: number;
}

export interface Projection {
  S: number;
  T: number;
  P: number;
  regionSupport: Record<string, number>;
}

export interface TrendPoint {
  absDay: number;
  resources: Record<ResourceId, number>;
  anger: Record<GroupId, number>;
  /** Election projection P (0..1) at that week. */
  P: number;
}

export type ZeroPenaltyId = 'finances' | 'support' | 'prestige';

export interface ElectionResult {
  S: number;
  T: number;
  P: number;
  u: number;
  epsilon: number;
  S_final: number;
  G: number;
  win: boolean;
  snap: boolean;
  regions: { code: string; s_final: number; seats: number; won: number }[];
}

export type Outcome = 'win' | 'loss' | 'ending';

export interface Deltas {
  resources: Partial<Record<ResourceId, number>>;
  anger: Partial<Record<GroupId, number>>;
  pc?: number;
  /** Regional support shift changes per kraj code. */
  regions?: Partial<Record<string, number>>;
}

export interface LogEntry {
  type: string;
  quarter: number;
  day: number;
  absDay: number;
  /** In-game calendar date (ISO). */
  date: string;
  /** Wall-clock ms injected by the host (0 in headless runs). Excluded from replay comparison. */
  wallTime: number;
  snapshot: { resources: Record<ResourceId, number>; anger: Record<GroupId, number>; pc: number };
  /** Applied deltas (resources incl. finances, anger) for entries that changed values. */
  deltas?: Deltas;
  [extra: string]: unknown;
}

export interface GameState {
  runId: string;
  seed: string;
  leader: LeaderId;
  difficulty: DifficultyId;
  phase: Phase;
  quarter: number;
  day: number;
  /** Effective ticks executed so far (replay anchor). */
  tickCount: number;
  resources: Record<ResourceId, number>;
  anger: Record<GroupId, number>;
  pc: number;
  budget: { revPct: Record<string, number>; expPct: Record<string, number> };
  financesExtra: number;
  /** Accumulated Isolation finance damage (<= 0, capped). */
  financeModAccum: number;
  /** Per-region support shift (seeded start jitter + regional effects); s_r = support + offset + shift. */
  regionShift: Record<string, number>;
  modifiers: Modifier[];
  ongoing: OngoingInstance[];
  zeroPenalties: Record<ZeroPenaltyId, boolean>;
  draft: DraftState | null;
  /** Open regional-compromise decision: the compromise card ids offered against each other. */
  compromiseOffer: string[] | null;
  /** Coalition red lines of the open budget vote (drawn at vote open). */
  budgetVoteRedLines: RedLine[] | null;
  picked: { cardId: string; quarter: number }[];
  schedule: ScheduledEntry[];
  scheduleSeq: number;
  pins: Pin[];
  pinSeq: number;
  pendingResponses: PendingResponse[];
  eventSeq: number;
  abilityCharges: number;
  ownedUpgrades: string[];
  projection: Projection;
  trend: TrendPoint[];
  endingId: string | null;
  election: ElectionResult | null;
  outcome: Outcome | null;
  score: number | null;
  quartersCompleted: number;
  log: LogEntry[];
  inputs: RecordedInput[];
  /** Bumped on every mutation; lets the UI cheaply detect change. */
  version: number;
}
