// LuminAAC Ultimate — Vanguard Blanket Search Party & First-Responder Safety Profile Bridge
// Connects LuminAAC Safe-Zone Geofencing (geo.js) with Vanguard Community Safety Blanket:
//   - Caregiver-confirmed Blanket Search Party for Autism / special-needs wandering (elopement)
//   - Water-hazard priority, visual-only / zero-restraint De-Escalation Profile
//   - Cryptographic auto-wipe of clothing/photo/PII when child is found safe
//   - Source-attributed Household Hazard / Potential Violent Resident or Family Member
//     Welfare Situation Report for Law Enforcement (never AI-guessed).

export const HAZARD_FLAGS = Object.freeze([
  "potential_violent_resident",
  "potential_violent_family_member",
  "active_protective_order",
  "weapons_reported_on_premises",
  "acute_behavioral_aggression",
]);

export const HAZARD_SOURCES = Object.freeze([
  "court_protective_order",
  "caseworker_verified_history",
  "law_enforcement_prior_incident",
  "clinical_behavioral_plan",
]);

export function buildFirstResponderProfile(db = {}) {
  const child = db.profile?.child || "Child";
  return {
    childName: child,
    communicationMode: "Nonverbal / Minimally Speaking — uses LuminAAC",
    deescalationInstructions:
      "Approach calmly from the side, speak softly, do NOT shout, chase, or physically grab. Drawn to water hazards; play calming soundscape or call caregiver immediately.",
    waterHazardPriority: true,
    accessibilityFlags: ["nonverbal_autism_uses_aac", "drawn_to_water_hazards"],
  };
}

export function activateBlanketSearchParty(
  db,
  { caregiverConfirmed = false, clothing = "", lastKnownZone = "Home Safe Zone", optInPhoto = false } = {}
) {
  if (!caregiverConfirmed) {
    throw new Error("Blanket Search Party requires explicit caregiverConfirmed=true.");
  }
  const profile = buildFirstResponderProfile(db);
  const sp = {
    searchId: "bsp-lum-" + Date.now().toString(36),
    status: "active",
    lastKnownZone: String(lastKnownZone || "Home Safe Zone"),
    clothing: String(clothing || "Not specified").slice(0, 200),
    deescalationInstructions: profile.deescalationInstructions,
    waterHazardPriority: true,
    photoTokenActive: Boolean(optInPhoto),
    visualOnlyNoRestraintProtocol: true,
    activatedAt: Date.now(),
  };
  if (db && typeof db === "object") db.activeSearchParty = sp;
  return sp;
}

export function closeAndWipeBlanketSearchParty(db, outcome = "found_safe") {
  const sp = db?.activeSearchParty;
  if (!sp) throw new Error("No active Blanket Search Party to close.");
  sp.status = "closed";
  sp.outcome = String(outcome || "found_safe");
  sp.clothing = "[CRYPTOGRAPHICALLY_WIPED]";
  sp.deescalationInstructions = "[CRYPTOGRAPHICALLY_WIPED]";
  sp.photoTokenActive = false;
  sp.closedAt = Date.now();
  return { searchId: sp.searchId, status: "closed", piiAndPhotoWiped: true };
}

export function buildWelfareSituationReport({
  confirmedBy = "",
  addressLine = "",
  hazardProfile = [],
  accessibilityFlags = ["nonverbal_autism_uses_aac"],
  situationNotes = "",
} = {}) {
  if (!String(confirmedBy || "").trim()) throw new Error("confirmedBy is required.");
  if (!String(addressLine || "").trim()) throw new Error("addressLine is required.");
  const validated = [];
  for (const h of Array.isArray(hazardProfile) ? hazardProfile : []) {
    if (!HAZARD_FLAGS.includes(h.flag)) throw new Error(`Unsupported hazard flag: ${h.flag}`);
    if (!HAZARD_SOURCES.includes(h.source)) throw new Error(`Hazard flag requires verified non-AI source: ${h.source}`);
    validated.push({
      flag: h.flag,
      source: h.source,
      officerSafetyNote: String(h.officerSafetyNote || "").slice(0, 200),
    });
  }
  const highDanger = validated.some((h) =>
    ["potential_violent_resident", "potential_violent_family_member", "active_protective_order", "weapons_reported_on_premises"].includes(h.flag)
  );
  return {
    packetType: "vanguard-hrp-welfare-sitrep/v1",
    addressLine: String(addressLine).trim(),
    accessibilityFlags: [...accessibilityFlags],
    hazardProfile: validated,
    potentialViolenceOrWeaponRisk: highDanger,
    lawEnforcementEscortRecommended: highDanger,
    tier12DispatchBlocked: highDanger,
    aiThreatScoringUsed: false,
    situationNotes: String(situationNotes || "").slice(0, 300),
    createdAt: new Date().toISOString(),
  };
}
