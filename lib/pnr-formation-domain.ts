export interface FormationDomainPoint {
  x: number;
  y: number;
}

export interface FormationDomainPositions {
  O1: FormationDomainPoint;
  O5: FormationDomainPoint;
  D1: FormationDomainPoint;
  D5: FormationDomainPoint;
}

export interface FormationInputParameters {
  handlerOriginX: number;
  handlerOriginY: number;
  screenerApproachDistance: number;
  screenerApproachAngle: number;
  d1GoalSideDepth: number;
  d1LateralShade: number;
  d5GoalSideDepth: number;
  d5LateralShade: number;
}

export type FormationParameterName = keyof FormationInputParameters;

export interface F01CanonicalStart {
  id: string;
  label: string;
  focus:
    | "baseline"
    | "long_screener_route"
    | "approach_angle"
    | "handler_variation"
    | "d1_depth"
    | "d5_follow_distance"
    | "formation_translation"
    | "tight_legal_geometry";
  tacticalPositions: FormationDomainPositions;
}

const DOMAIN_HOOP = Object.freeze({ x: 5, y: 0.68 });
const DOMAIN_LANDMARK_OFFSETS = Object.freeze({
  screenAnchor: Object.freeze({ x: 1.27, y: -0.96 }),
  handlerWaitingPoint: Object.freeze({ x: 0.27, y: -0.6 }),
  useGate: Object.freeze({ x: 2.03, y: -1.86 }),
  rejectGate: Object.freeze({ x: -1.17, y: -1.76 }),
});

const PARAMETER_NAMES = Object.freeze([
  "handlerOriginX",
  "handlerOriginY",
  "screenerApproachDistance",
  "screenerApproachAngle",
  "d1GoalSideDepth",
  "d1LateralShade",
  "d5GoalSideDepth",
  "d5LateralShade",
] as const satisfies readonly FormationParameterName[]);

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function point(x: number, y: number): FormationDomainPoint {
  return Object.freeze({ x, y });
}

function positions(input: FormationDomainPositions): FormationDomainPositions {
  return Object.freeze({
    O1: point(input.O1.x, input.O1.y),
    O5: point(input.O5.x, input.O5.y),
    D1: point(input.D1.x, input.D1.y),
    D5: point(input.D5.x, input.D5.y),
  });
}

function vectorLength(vector: FormationDomainPoint): number {
  return Math.hypot(vector.x, vector.y);
}

function normalized(vector: FormationDomainPoint): FormationDomainPoint {
  const magnitude = vectorLength(vector);
  if (magnitude <= 1e-12) {
    throw new Error("Formation goal-side frame requires a non-zero hoop direction");
  }
  return { x: vector.x / magnitude, y: vector.y / magnitude };
}

function goalFrameComponents(
  subject: FormationDomainPoint,
  target: FormationDomainPoint,
): { depth: number; shade: number } {
  const goalDirection = normalized({
    x: DOMAIN_HOOP.x - subject.x,
    y: DOMAIN_HOOP.y - subject.y,
  });
  const lateral = { x: goalDirection.y, y: -goalDirection.x };
  const delta = { x: target.x - subject.x, y: target.y - subject.y };
  return {
    depth: delta.x * goalDirection.x + delta.y * goalDirection.y,
    shade: delta.x * lateral.x + delta.y * lateral.y,
  };
}

function goalFramePoint(
  subject: FormationDomainPoint,
  depth: number,
  shade: number,
): FormationDomainPoint {
  const goalDirection = normalized({
    x: DOMAIN_HOOP.x - subject.x,
    y: DOMAIN_HOOP.y - subject.y,
  });
  const lateral = { x: goalDirection.y, y: -goalDirection.x };
  return {
    x: round6(subject.x + goalDirection.x * depth + lateral.x * shade),
    y: round6(subject.y + goalDirection.y * depth + lateral.y * shade),
  };
}

export function measureFormationInputParameters(
  input: FormationDomainPositions,
): FormationInputParameters {
  const screenAnchor = {
    x: input.O1.x + DOMAIN_LANDMARK_OFFSETS.screenAnchor.x,
    y: input.O1.y + DOMAIN_LANDMARK_OFFSETS.screenAnchor.y,
  };
  const approach = {
    x: input.O5.x - screenAnchor.x,
    y: input.O5.y - screenAnchor.y,
  };
  const d1 = goalFrameComponents(input.O1, input.D1);
  const d5 = goalFrameComponents(input.O5, input.D5);
  return {
    handlerOriginX: input.O1.x,
    handlerOriginY: input.O1.y,
    screenerApproachDistance: vectorLength(approach),
    screenerApproachAngle: Math.atan2(approach.y, approach.x),
    d1GoalSideDepth: d1.depth,
    d1LateralShade: d1.shade,
    d5GoalSideDepth: d5.depth,
    d5LateralShade: d5.shade,
  };
}

export function makeFormationTacticalPositions(
  input: FormationInputParameters,
): FormationDomainPositions {
  const O1 = {
    x: round6(input.handlerOriginX),
    y: round6(input.handlerOriginY),
  };
  const screenAnchor = {
    x: O1.x + DOMAIN_LANDMARK_OFFSETS.screenAnchor.x,
    y: O1.y + DOMAIN_LANDMARK_OFFSETS.screenAnchor.y,
  };
  const O5 = {
    x: round6(
      screenAnchor.x +
        Math.cos(input.screenerApproachAngle) * input.screenerApproachDistance,
    ),
    y: round6(
      screenAnchor.y +
        Math.sin(input.screenerApproachAngle) * input.screenerApproachDistance,
    ),
  };
  return {
    O1,
    O5,
    D1: goalFramePoint(O1, input.d1GoalSideDepth, input.d1LateralShade),
    D5: goalFramePoint(O5, input.d5GoalSideDepth, input.d5LateralShade),
  };
}

const F01_STARTS: readonly F01CanonicalStart[] = [
  {
    id: "F01-C01",
    label: "F00 baseline",
    focus: "baseline",
    tacticalPositions: positions({
      O1: { x: 3.8, y: 6.85 },
      O5: { x: 6.85, y: 6.2 },
      D1: { x: 3.72, y: 5.95 },
      D5: { x: 6.55, y: 5.05 },
    }),
  },
  {
    id: "F01-C02",
    label: "O5 longer arrival",
    focus: "long_screener_route",
    tacticalPositions: positions({
      O1: { x: 3.8, y: 6.85 },
      O5: { x: 7.382033, y: 6.310719 },
      D1: { x: 3.72, y: 5.95 },
      D5: { x: 6.994649, y: 5.187139 },
    }),
  },
  {
    id: "F01-C03",
    label: "O5 diagonal approach",
    focus: "approach_angle",
    tacticalPositions: positions({
      O1: { x: 3.8, y: 6.85 },
      O5: { x: 6.408474, y: 7.017381 },
      D1: { x: 3.72, y: 5.95 },
      D5: { x: 6.354212, y: 5.851381 },
    }),
  },
  {
    id: "F01-C04",
    label: "O1 local start variation",
    focus: "handler_variation",
    tacticalPositions: positions({
      O1: { x: 4.05, y: 6.7 },
      O5: { x: 6.85, y: 6.2 },
      D1: { x: 3.72, y: 5.95 },
      D5: { x: 6.55, y: 5.05 },
    }),
  },
  {
    id: "F01-C05",
    label: "D1 deeper goal-side start",
    focus: "d1_depth",
    tacticalPositions: positions({
      O1: { x: 3.8, y: 6.85 },
      O5: { x: 6.85, y: 6.2 },
      D1: { x: 3.950025, y: 5.55482 },
      D5: { x: 6.55, y: 5.05 },
    }),
  },
  {
    id: "F01-C06",
    label: "D5 longer follow distance",
    focus: "d5_follow_distance",
    tacticalPositions: positions({
      O1: { x: 3.8, y: 6.85 },
      O5: { x: 6.85, y: 6.2 },
      D1: { x: 3.72, y: 5.95 },
      D5: { x: 6.433305, y: 4.70492 },
    }),
  },
  {
    id: "F01-C07",
    label: "small whole-formation translation",
    focus: "formation_translation",
    tacticalPositions: positions({
      O1: { x: 4.15, y: 6.65 },
      O5: { x: 7.2, y: 6 },
      D1: { x: 4.07, y: 5.75 },
      D5: { x: 6.9, y: 4.85 },
    }),
  },
  {
    id: "F01-C08",
    label: "tight but legal initial clearance",
    focus: "tight_legal_geometry",
    tacticalPositions: positions({
      O1: { x: 3.8, y: 6.85 },
      O5: { x: 6.85, y: 6.2 },
      D1: { x: 3.937457, y: 6.143243 },
      D5: { x: 6.55, y: 5.05 },
    }),
  },
].map((item) => Object.freeze(item));

export const F01_CANONICAL_STARTS = Object.freeze(F01_STARTS);

const canonicalParameters = F01_CANONICAL_STARTS.map((item) =>
  measureFormationInputParameters(item.tacticalPositions)
);

const parameterRanges = Object.fromEntries(
  PARAMETER_NAMES.map((name) => [
    name,
    Object.freeze([
      Math.min(...canonicalParameters.map((parameters) => parameters[name])),
      Math.max(...canonicalParameters.map((parameters) => parameters[name])),
    ] as const),
  ]),
) as Record<FormationParameterName, readonly [number, number]>;

export const F01_FORMATION_INPUT_DOMAIN = Object.freeze({
  version: "F01-v1" as const,
  tacticalFrame: "right-canonical" as const,
  sourceCaseIds: Object.freeze(F01_CANONICAL_STARTS.map((item) => item.id)),
  landmarkOffsets: DOMAIN_LANDMARK_OFFSETS,
  parameters: Object.freeze(parameterRanges),
});

export function formationParameterFailures(
  input: FormationInputParameters,
  tolerance = 1e-6,
): string[] {
  const failures: string[] = [];
  for (const name of PARAMETER_NAMES) {
    const value = input[name];
    const range = F01_FORMATION_INPUT_DOMAIN.parameters[name];
    if (!Number.isFinite(value)) {
      failures.push(`${name} must be finite`);
    } else if (value < range[0] - tolerance || value > range[1] + tolerance) {
      failures.push(
        `${name} ${value.toFixed(6)} is outside frozen F01 range ` +
          `[${range[0].toFixed(6)}, ${range[1].toFixed(6)}]`,
      );
    }
  }
  return failures;
}

export function assertFormationInputInF01Domain(
  input: FormationDomainPositions,
): FormationInputParameters {
  const parameters = measureFormationInputParameters(input);
  const failures = formationParameterFailures(parameters);
  if (failures.length > 0) {
    throw new Error(`form_pnr input is outside the frozen F01 Formation domain: ${failures[0]}`);
  }
  return parameters;
}

export function copyFormationDomainPositions(
  input: FormationDomainPositions,
): FormationDomainPositions {
  return {
    O1: { ...input.O1 },
    O5: { ...input.O5 },
    D1: { ...input.D1 },
    D5: { ...input.D5 },
  };
}
