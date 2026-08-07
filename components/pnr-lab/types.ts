import type {
  PlayerId,
  PlanningRecord,
  RoleAssignment,
  TeamPlan,
  Vec2,
  WorldEvent,
  WorldState,
} from "@/lib/pnr-core";
import type { TeamStrategyProfile } from "@/lib/pnr-strategy";

export interface UiSnapshot {
  world: WorldState;
  offensePlan: TeamPlan;
  defensePlan: TeamPlan;
  roles: RoleAssignment[];
  events: WorldEvent[];
  planning: PlanningRecord[];
  strategies: {
    offense: TeamStrategyProfile;
    defense: TeamStrategyProfile;
  };
}

export type PositionMap = Record<PlayerId, Vec2>;
export type TrailMap = Record<PlayerId, Vec2[]>;
export type LabMode = "scenarios" | "g01" | "g02" | "g03" | "g05" | "g06" | "g07" | "g08" | "p00" | "p01" | "p03" | "f00" | "formation";
