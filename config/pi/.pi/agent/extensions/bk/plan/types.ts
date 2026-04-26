export const PLAN_WIDGET_KEY = "superpowers-plan";
export const PLAN_STATUS_KEY = "superpowers-plan";
export const PLAN_WIDGET_WIDTH = 50;
export const PLAN_WIDGET_MIN_HEIGHT = 13;
export const PLAN_WIDGET_DEFAULT_VISIBLE_LINES = 13;
export const PLAN_OVERFLOW_TEMPLATE = "+N más";

export type PlanTaskState =
	| "pending"
	| "active"
	| "implemented"
	| "done"
	| "blocked";
export type PlanEvidenceSource =
	| "markdown"
	| "session"
	| "handoff"
	| "event"
	| "artifact";
export type PlanEvidenceConfidence = "low" | "medium" | "high";

export interface PlanTaskEvidence {
	source: PlanEvidenceSource;
	state: PlanTaskState;
	confidence: PlanEvidenceConfidence;
	summary: string;
	timestamp?: number;
	path?: string;
}

export interface PlanTask {
	id: string;
	planPath: string;
	line: number;
	depth: number;
	title: string;
	section?: string;
	state: PlanTaskState;
	evidence: PlanTaskEvidence[];
}

export interface ParsedPlan {
	path: string;
	tasks: PlanTask[];
	mtimeMs: number;
	referencedAt?: number;
}

export interface PlanWidgetState {
	activePlanPath?: string;
	tasks: PlanTask[];
	lastUpdatedAt: number;
	visibleHeight: number;
	total: number;
	pending: number;
	active: number;
	implemented: number;
	done: number;
	blocked: number;
}

export interface SessionSignal {
	text: string;
	timestamp: number;
	source: "session" | "handoff" | "event";
}

export interface ArtifactProbe {
	relativePath: string;
	exists: boolean;
	mtimeMs?: number;
}

export function emptyPlanWidgetState(now = Date.now()): PlanWidgetState {
	return {
		tasks: [],
		lastUpdatedAt: now,
		visibleHeight: PLAN_WIDGET_DEFAULT_VISIBLE_LINES,
		total: 0,
		pending: 0,
		active: 0,
		implemented: 0,
		done: 0,
		blocked: 0,
	};
}
