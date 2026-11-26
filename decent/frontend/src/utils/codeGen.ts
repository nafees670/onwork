/**
 * Auto-generates short registry codes from a human-entered name, so forms
 * never require someone to invent a code by hand. Codes stay short (backend
 * length limits: dept_code <= 6 chars, position_code <= 4 chars) and are
 * derived deterministically from the name plus a small disambiguator to
 * reduce collisions; the backend still validates real uniqueness and
 * surfaces a field error if a collision happens, same as before.
 */

function initials(name: string, maxLen: number): string {
  const clean = name.trim().toUpperCase().replace(/[^A-Z0-9\s]/g, "");
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, maxLen);
  return words.map((w) => w[0]).join("").slice(0, maxLen);
}

/** Institution code: initials of the name + a sequence number within the organization. */
export function generateInstitutionCode(name: string, existingCountInOrg: number): string {
  const base = initials(name, 4) || "INST";
  const seq = String(existingCountInOrg + 1).padStart(2, "0");
  return `${base}${seq}`;
}

/** Branch code: parent institution code + a sequence number within that institution. */
export function generateBranchCode(institutionCode: string, existingCountInInstitution: number): string {
  const seq = String(existingCountInInstitution + 1).padStart(2, "0");
  return `${institutionCode}-${seq}`;
}

/** Department code: initials of the name + a random 2-digit disambiguator (dept_code is tenant-wide unique). */
export function generateDepartmentCode(name: string): string {
  const base = initials(name, 4) || "DPT";
  const suffix = String(Math.floor(Math.random() * 90) + 10);
  return `${base}${suffix}`.slice(0, 6);
}

/** Position code: initials of the name + a random single digit (position_code is scoped, but tight on length). */
export function generatePositionCode(name: string): string {
  const base = initials(name, 3) || "POS";
  const suffix = String(Math.floor(Math.random() * 10));
  return `${base}${suffix}`.slice(0, 4);
}
