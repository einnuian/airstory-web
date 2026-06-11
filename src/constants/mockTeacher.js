/**
 * DEV ONLY - MOCK DATA - REMOVE BEFORE DEPLOY
 *
 * Mock data for the Manage Classes teacher console, consistent with the
 * mockMeasurements.js world: school LINCOLN, teacher Ms. Rivera, periods P3 & P5,
 * groups G1–G4. Deterministic (no Math.random), same style as the measurement mock.
 *
 * Accounts are SHARED group accounts (group members rotate through one login), so the
 * console's job is coverage: every group needs at least one working account. This mock
 * leaves ONE group (P5 · G4) with no account so the "no account" warning state shows.
 *
 * TODO(backend): roster / join-codes / class-structure come from the teacher endpoints
 * (getRoster, getJoinCodes, getClassStructure). This module stands in until the backend
 * is reachable in dev. Visibility enum is public | school | group (set at upload by the
 * app); 'class'/'me' reserved for a future researcher mode.
 */

export { MOCK_DATA_ENABLED } from './mockMeasurements';

export const MOCK_CLASS_STRUCTURE = {
  school: 'LINCOLN',
  teacher: 'Ms. Rivera',
  periods: ['P3', 'P5'],
  groupsPerPeriod: 4,
  groups: ['G1', 'G2', 'G3', 'G4'],
  defaultVisibility: 'group', // public | school | group
};

// Shared-account count per (period, group). 0 = coverage gap (no account → warning).
const ACCOUNT_COUNTS = {
  'P3 G1': 2, 'P3 G2': 1, 'P3 G3': 1, 'P3 G4': 1,
  'P5 G1': 1, 'P5 G2': 2, 'P5 G3': 1, 'P5 G4': 0,
};

const pad = (n) => String(n).padStart(2, '0');

function buildRoster() {
  const roster = [];
  let n = 0;
  MOCK_CLASS_STRUCTURE.periods.forEach((period) => {
    MOCK_CLASS_STRUCTURE.groups.forEach((group) => {
      const count = ACCOUNT_COUNTS[`${period} ${group}`] || 0;
      for (let i = 0; i < count; i++) {
        n += 1;
        const letter = String.fromCharCode(97 + i); // a, b, ...
        const username = `lincoln-${period.toLowerCase()}-${group.toLowerCase()}${letter}`;
        const day = 1 + ((n * 3) % 12); // deterministic join date in early June 2026
        roster.push({
          id: `acct-${period}-${group}-${letter}`,
          username,
          full_name: `${period} ${group} · Account ${letter.toUpperCase()}`,
          email: `${username}@lincoln.mock`,
          role: 'student',
          period,
          group_code: group,
          joined_at: `2026-06-${pad(day)}`,
        });
      }
    });
  });
  return roster;
}

export const MOCK_ROSTER = buildRoster();

export const MOCK_JOIN_CODES = [
  { id: 'jc-p3', code: 'RVP3K', period: 'P3', school_code: 'LINCOLN', instructor: 'Ms. Rivera', active: true, created_at: '2026-06-01' },
  { id: 'jc-p5', code: 'RVP5M', period: 'P5', school_code: 'LINCOLN', instructor: 'Ms. Rivera', active: false, created_at: '2026-06-02' },
];
