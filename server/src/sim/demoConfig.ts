import type { DisruptionKind } from '@histereza/shared/simulation';
// Prawdopodobieństwa na minutę, niezależne losowanie każdej przyczyny.
export const SIMULATION_CONFIG = {
  cooldownMinutes: 25,
  maxSessions: 30,
  probabilities: {delay: .002, traffic: .003, overstay: .002, occupied: .001, break: .001, fuel: .0005} satisfies Record<DisruptionKind,number>,
  durationMinutes: {delay: [3,10], traffic: [3,12], overstay: [5,15], occupied: [5,15], break: [5,15], fuel: [5,10]} satisfies Record<DisruptionKind,number[]>,
};
