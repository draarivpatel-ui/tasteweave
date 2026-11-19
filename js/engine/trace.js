// Decision trace: an append only log the planner writes while it thinks.
// The agent log panel renders these steps one by one.

export const PHASES = ['read', 'mood', 'budget', 'search', 'select', 'review', 'done'];

export function createTrace() {
  const steps = [];

  function step(phase, message, data = null) {
    const entry = { id: steps.length + 1, phase, message, data };
    steps.push(entry);
    return entry;
  }

  return {
    steps,
    step,
    get size() {
      return steps.length;
    },
    toJSON() {
      return JSON.parse(JSON.stringify(steps));
    },
  };
}
