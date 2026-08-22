import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
export function findDataDir(moduleDir = MODULE_DIR, cwd = process.cwd()) {
  return [
    path.join(moduleDir, "data"),
    path.resolve(moduleDir, "../../vendor/pibs-my-info/data"),
    path.resolve(cwd, "vendor/pibs-my-info/data")
  ].find((candidate) => fs.existsSync(path.join(candidate, "runtime.json")));
}

const DATA_DIR = findDataDir();
if (!DATA_DIR) {
  throw new Error("My Info runtime data bundle was not found");
}
const runtime = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "runtime.json"), "utf8"));

export const STATE_SCHEMA_VERSION = "1.1";
export const TOOL_API_VERSION = "0.2.0";
export const ANSWER_VALUES = ["yes", "no", "not_sure", "prefer_not_to_answer"];
export const TIMING_KINDS = [
  "current", "within_1_year", "1_to_3_years", "4_to_7_years",
  "8_to_15_years", "more_than_15_years", "approximate_year", "unknown"
];

const pipeSet = (value) => new Set(String(value || "").split("|").filter(Boolean));
const boolValue = (value) => String(value).toLowerCase() === "true";
const clone = (value) => structuredClone(value);
const onlyKeys = (value, allowed, label) => {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label}: unsupported field ${key}`);
  }
};

let evidenceCache;

export class SurveyToolEngine {
  constructor(contract = runtime.contract, features = runtime.features) {
    this.contract = contract;
    this.features = features;
    this.questions = Object.fromEntries(contract.questions.map((q) => [q.code, q]));
    this.questionOrder = contract.questions.map((q) => q.code);
    this.routes = Object.fromEntries((contract.adaptive_routes || []).map((r) => [r.parent_question_code, r]));
    this.routeOptions = Object.fromEntries(Object.entries(this.routes).map(([parent, route]) => [
      parent, Object.fromEntries(route.options.map((option) => [option.code, option]))
    ]));
    this.categories = Object.fromEntries(contract.personal_information_categories.map((c) => [c.PI_CAT_ID, c]));
  }

  createState(locale = "en-CA") {
    this.validateLocale(locale);
    return {
      schema_version: STATE_SCHEMA_VERSION,
      contract_version: this.contract.content_version,
      locale,
      answers: {},
      refinements: {}
    };
  }

  getManifest() {
    return {
      tool_api_version: TOOL_API_VERSION,
      state_schema_version: STATE_SCHEMA_VERSION,
      contract_schema_version: this.contract.schema_version,
      contract_version: this.contract.content_version,
      generator_version: this.contract.generator_version,
      data_snapshot: this.contract.data_snapshot,
      supported_locales: this.contract.supported_locales,
      question_count: this.questionOrder.length,
      adaptive_route_count: Object.keys(this.routes).length,
      adaptive_route_version: this.contract.adaptive_route_version || "",
      pib_count: this.features.length,
      answer_values: ANSWER_VALUES,
      timing_kinds: TIMING_KINDS,
      tools: ["my_info_get_manifest", "my_info_advance", "my_info_evaluate", "my_info_explain_result"],
      privacy: this.contract.privacy,
      limitations: [
        "Results are estimates, not confirmation that a record exists.",
        "Fallback route choices can still overmatch when a named program or institution is not known.",
        "The current local CRA extract has no defensible direct tax-return PIB record.",
        "A published retention rule may not reflect current operational holdings."
      ]
    };
  }

  advance(state = null, answers = [], refinements = [], locale = "en-CA") {
    const working = state === null ? this.createState(locale) : clone(state);
    this.validateState(working);
    for (const update of answers || []) this.applyAnswer(working, update);
    for (const update of refinements || []) this.applyRefinement(working, update);
    this.validateState(working);
    let nextStep = null;
    for (const code of this.questionOrder) {
      const answer = working.answers[code];
      if (!answer) {
        nextStep = this.questionView(code, working.locale);
        break;
      }
      if (answer.value !== "yes") continue;
      if (this.routes[code]) {
        const refinement = working.refinements[code];
        if (!refinement) {
          nextStep = this.refinementView(code, working.locale);
          break;
        }
        const untimed = refinement.selected_options.find((optionCode) =>
          this.routeOptions[code][optionCode].ask_timing !== false && !refinement.timings?.[optionCode]
        );
        if (untimed) {
          nextStep = this.timingView(code, working.locale, untimed);
          break;
        }
      } else if (!answer.timing) {
        nextStep = this.timingView(code, working.locale, null);
        break;
      }
    }
    const timedYes = Object.entries(working.answers).filter(([code, answer]) =>
      answer.value === "yes" && (
        (!this.routes[code] && Boolean(answer.timing)) ||
        (this.routes[code] && this.refinementComplete(code, working.refinements[code]))
      )
    ).length;
    return {
      state: working,
      complete: nextStep === null,
      next_step: nextStep,
      progress: {
        answered_questions: Object.keys(working.answers).length,
        total_questions: this.questionOrder.length,
        yes_answers_with_timing: timedYes
      }
    };
  }

  validateState(state) {
    if (!state || typeof state !== "object" || Array.isArray(state)) throw new Error("state must be an object");
    onlyKeys(state, new Set(["schema_version", "contract_version", "locale", "answers", "refinements"]), "state");
    if (state.schema_version !== STATE_SCHEMA_VERSION) throw new Error("Unsupported survey state schema_version");
    if (state.contract_version !== this.contract.content_version) throw new Error("Survey state contract_version does not match this data snapshot");
    this.validateLocale(state.locale);
    if (!state.answers || typeof state.answers !== "object" || Array.isArray(state.answers)) throw new Error("state.answers must be an object");
    if (!state.refinements || typeof state.refinements !== "object" || Array.isArray(state.refinements)) throw new Error("state.refinements must be an object");
    for (const [code, answer] of Object.entries(state.answers)) this.validateAnswer(code, answer);
    for (const [code, refinement] of Object.entries(state.refinements)) this.validateRefinement(code, refinement, state.answers);
    return clone(state);
  }

  validateLocale(locale) {
    if (!this.contract.supported_locales.includes(locale)) throw new Error(`Unsupported locale: ${locale}`);
  }

  validateTiming(code, timing) {
    if (!timing || typeof timing !== "object" || Array.isArray(timing)) throw new Error(`${code}: timing must be an object`);
    onlyKeys(timing, new Set(["kind", "year"]), code);
    if (!TIMING_KINDS.includes(timing.kind)) throw new Error(`${code}: unsupported timing kind`);
    if (timing.kind === "approximate_year") {
      if (!Number.isInteger(timing.year) || timing.year < 1800 || timing.year > 2200) throw new Error(`${code}: approximate_year requires a valid integer year`);
    } else if (timing.year !== undefined && timing.year !== null) {
      throw new Error(`${code}: year is allowed only with approximate_year`);
    }
  }

  validateAnswer(code, answer) {
    if (!this.questions[code]) throw new Error(`Unknown question_code: ${code}`);
    if (!answer || typeof answer !== "object" || Array.isArray(answer)) throw new Error(`${code}: answer must be an object`);
    onlyKeys(answer, new Set(["value", "timing"]), code);
    if (!ANSWER_VALUES.includes(answer.value)) throw new Error(`${code}: unsupported answer value`);
    if (answer.timing) {
      if (answer.value !== "yes") throw new Error(`${code}: timing is accepted only for a yes answer`);
      if (this.routes[code]) throw new Error(`${code}: timing belongs to each selected adaptive route`);
      this.validateTiming(code, answer.timing);
    }
  }

  validateRefinement(code, refinement, answers) {
    if (!this.routes[code]) throw new Error(`${code}: no adaptive route exists`);
    if (answers[code]?.value !== "yes") throw new Error(`${code}: a refinement requires a yes parent answer`);
    if (!refinement || typeof refinement !== "object" || Array.isArray(refinement)) throw new Error(`${code}: refinement must be an object`);
    onlyKeys(refinement, new Set(["selected_options", "timings"]), code);
    if (!Array.isArray(refinement.selected_options) || refinement.selected_options.length === 0) throw new Error(`${code}: selected_options must be a non-empty array`);
    if (new Set(refinement.selected_options).size !== refinement.selected_options.length) throw new Error(`${code}: selected_options cannot contain duplicates`);
    for (const option of refinement.selected_options) {
      if (!this.routeOptions[code][option]) throw new Error(`${code}: unsupported route option ${option}`);
    }
    const timings = refinement.timings || {};
    if (typeof timings !== "object" || Array.isArray(timings)) throw new Error(`${code}: timings must be an object`);
    for (const [option, timing] of Object.entries(timings)) {
      if (!refinement.selected_options.includes(option)) throw new Error(`${code}: timing supplied for unselected option ${option}`);
      this.validateTiming(`${code}.${option}`, timing);
    }
  }

  refinementComplete(code, refinement) {
    if (!refinement) return false;
    try { this.validateRefinement(code, refinement, { [code]: { value: "yes" } }); } catch { return false; }
    return refinement.selected_options.every((option) =>
      this.routeOptions[code][option].ask_timing === false || Boolean(refinement.timings?.[option])
    );
  }

  applyAnswer(state, update) {
    if (!update || typeof update !== "object" || Array.isArray(update)) throw new Error("Each answer update must be an object");
    onlyKeys(update, new Set(["question_code", "value", "timing"]), "answer update");
    const code = String(update.question_code || "");
    const answer = { value: update.value };
    if (update.timing !== undefined) answer.timing = clone(update.timing);
    this.validateAnswer(code, answer);
    state.answers[code] = answer;
    if (answer.value !== "yes") delete state.refinements[code];
  }

  applyRefinement(state, update) {
    if (!update || typeof update !== "object" || Array.isArray(update)) throw new Error("Each refinement update must be an object");
    onlyKeys(update, new Set(["question_code", "selected_options", "timings"]), "refinement update");
    const code = String(update.question_code || "");
    const refinement = { selected_options: clone(update.selected_options), timings: clone(update.timings || {}) };
    this.validateRefinement(code, refinement, state.answers);
    state.refinements[code] = refinement;
  }

  questionView(code, locale) {
    const question = this.questions[code];
    const french = locale === "fr-CA";
    return {
      step_type: "question",
      question_code: code,
      prompt: french ? question.question_fr : question.readability_en.candidate_question_en,
      source_prompt: french ? question.question_fr : question.question_en,
      wording_status: french ? "current" : "plain_language_candidate_for_testing",
      answer_values: ANSWER_VALUES,
      help: {
        familiarity: question.help.familiarity,
        agent_offer: question.help.agent_offer,
        examples: question.help.examples.map((item) => ({
          institution: french ? item.institution_fr : item.institution_en,
          activity: french ? item.activity_fr : item.activity_en,
          source_pib_keys: item.source_pib_keys,
          evidence_note: french ? item.evidence_note_fr : item.evidence_note_en
        })),
        split_recommendation: french ? question.help.split_recommendation_fr : question.help.split_recommendation_en
      }
    };
  }

  refinementView(code, locale) {
    const route = this.routes[code];
    const french = locale === "fr-CA";
    return {
      step_type: "refinement",
      question_code: code,
      prompt: french ? route.prompt_fr : route.prompt_en,
      selection_type: "multi_select",
      options: route.options.map((option) => ({
        code: option.code,
        label: french ? option.label_fr : option.label_en,
        institution: french ? option.institution_fr : option.institution_en,
        coverage: option.coverage
      })),
      privacy_note: french
        ? "Choisissez seulement les types d'interaction; ne fournissez aucun numéro ni détail de dossier."
        : "Choose interaction types only; do not provide identifiers or case details."
    };
  }

  timingView(code, locale, routeOptionCode = null) {
    const french = locale === "fr-CA";
    let prompt;
    if (routeOptionCode) {
      const option = this.routeOptions[code][routeOptionCode];
      const label = french ? option.label_fr : option.label_en;
      prompt = french ? `Vers quand cela s'est-il produit pour la dernière fois : ${label}?` : `About when did this last happen: ${label}?`;
    } else {
      prompt = french ? this.questions[code].timing.prompt_fr : this.questions[code].timing.prompt_en;
    }
    return {
      step_type: "timing",
      question_code: code,
      route_option_code: routeOptionCode,
      prompt,
      timing_kinds: TIMING_KINDS,
      year_required_for: "approximate_year",
      privacy_note: french ? "Une période approximative suffit; ne fournissez aucun détail de dossier." : "An approximate period is enough; do not provide case details."
    };
  }

  evaluate(state, { asOfYear = null, includePossible = false, maxResults = 50, offset = 0 } = {}) {
    const normalized = this.validateState(state);
    const assessmentYear = asOfYear ?? new Date().getUTCFullYear();
    if (!Number.isInteger(assessmentYear) || assessmentYear < 1900 || assessmentYear > 2200) throw new Error("as_of_year must be between 1900 and 2200");
    if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 500) throw new Error("max_results must be between 1 and 500");
    if (!Number.isInteger(offset) || offset < 0) throw new Error("offset cannot be negative");
    const results = this.results(normalized, assessmentYear, includePossible);
    const countBy = (key) => Object.fromEntries([...new Set(results.map((r) => r[key]))].sort().map((value) => [value, results.filter((r) => r[key] === value).length]));
    const institutionCounts = new Map();
    for (const result of results) institutionCounts.set(result.institution_name, (institutionCounts.get(result.institution_name) || 0) + 1);
    const unanswered = this.questionOrder.filter((code) => !normalized.answers[code]);
    const uncertain = Object.entries(normalized.answers).filter(([, answer]) => ["not_sure", "prefer_not_to_answer"].includes(answer.value)).map(([code]) => code);
    const incomplete = Object.entries(normalized.answers).filter(([code, answer]) => answer.value === "yes" && this.routes[code] && !this.refinementComplete(code, normalized.refinements[code])).map(([code]) => code);
    const inventoryGaps = Object.entries(normalized.refinements).flatMap(([code, refinement]) => refinement.selected_options.filter((option) => this.routeOptions[code][option].coverage === "inventory_gap").map((option) => ({
      question_code: code,
      route_option_code: option,
      message: "The current PIB inventory does not contain a defensible direct record for this interaction."
    })));
    const refinementNeeded = [...new Set(results.flatMap((result) => result.matched_question_codes).filter((code) => this.questions[code].help.split_recommendation_en && !normalized.refinements[code]))].sort();
    const returned = results.slice(offset, offset + maxResults);
    const nextOffset = offset + returned.length;
    return {
      assessment: {
        as_of_year: assessmentYear,
        complete_survey: unanswered.length === 0 && incomplete.length === 0,
        unanswered_question_codes: unanswered,
        uncertain_question_codes: uncertain,
        incomplete_refinement_question_codes: incomplete,
        inventory_gaps: inventoryGaps,
        refinement_needed_question_codes: refinementNeeded,
        caveat: "These are candidate PIBs, not confirmation that an institution holds information about this person."
      },
      summary: {
        total_matches: results.length,
        returned_matches: returned.length,
        truncated: returned.length < results.length,
        offset,
        next_offset: nextOffset < results.length ? nextOffset : null,
        holding_status_counts: countBy("holding_status"),
        match_band_counts: countBy("match_band"),
        top_institutions: [...institutionCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10).map(([institution_name, count]) => ({ institution_name, count }))
      },
      results: returned,
      versions: {
        tool_api_version: TOOL_API_VERSION,
        state_schema_version: STATE_SCHEMA_VERSION,
        contract_version: this.contract.content_version,
        data_snapshot: this.contract.data_snapshot
      }
    };
  }

  results(state, asOfYear, includePossible) {
    const yesCodes = new Set(Object.entries(state.answers).filter(([, answer]) => answer.value === "yes").map(([code]) => code));
    const uncertainCodes = new Set(Object.entries(state.answers).filter(([, answer]) => ["not_sure", "prefer_not_to_answer"].includes(answer.value)).map(([code]) => code));
    const broadYes = new Set(yesCodes);
    const routeMatches = new Map();
    for (const [parent, refinement] of Object.entries(state.refinements)) {
      if (!refinement.selected_options.some((option) => this.routeOptions[parent][option].fallback_to_parent)) broadYes.delete(parent);
      for (const optionCode of refinement.selected_options) {
        for (const bank of this.routeOptions[parent][optionCode].selectors?.bank_numbers || []) {
          if (!routeMatches.has(bank)) routeMatches.set(bank, []);
          routeMatches.get(bank).push([parent, optionCode]);
        }
      }
    }
    const output = [];
    for (const row of this.features) {
      const primary = pipeSet(row.question_codes);
      const candidates = pipeSet(row.candidate_question_codes);
      const directRoutes = routeMatches.get(row.bank_number_key) || [];
      const directCodes = new Set(directRoutes.map(([parent]) => parent));
      const strong = [...new Set([...primary].filter((code) => broadYes.has(code)).concat([...directCodes]))].sort();
      const possible = [...candidates].filter((code) => broadYes.has(code) && !strong.includes(code)).sort();
      const review = [...candidates].filter((code) => uncertainCodes.has(code)).sort();
      let band; let matched;
      if (strong.length) { band = "strong_match"; matched = strong; }
      else if (includePossible && possible.length) { band = "possible_match"; matched = possible; }
      else if (includePossible && review.length) { band = "review_if_relevant"; matched = review; }
      else continue;
      output.push(this.resultView(row, band, matched, state, asOfYear, directRoutes.map(([question_code, route_option_code]) => ({ question_code, route_option_code }))));
    }
    const statusOrder = { likely_held: 0, may_still_be_held: 1, retention_unknown: 2, likely_disposed: 3 };
    const bandOrder = { strong_match: 0, possible_match: 1, review_if_relevant: 2 };
    output.sort((a, b) => statusOrder[a.holding_status] - statusOrder[b.holding_status] || bandOrder[a.match_band] - bandOrder[b.match_band] || a.institution_name.localeCompare(b.institution_name) || a.title.localeCompare(b.title) || a.record_id.localeCompare(b.record_id));
    return output;
  }

  resultView(row, band, matchedCodes, state, asOfYear, matchedRoutes) {
    const french = state.locale === "fr-CA";
    const routeParents = new Set(matchedRoutes.map((item) => item.question_code));
    const statuses = matchedRoutes.map((item) => this.holdingStatus(row, state.refinements[item.question_code]?.timings?.[item.route_option_code], asOfYear));
    for (const code of matchedCodes) {
      if (state.answers[code].value !== "yes" || routeParents.has(code)) continue;
      let timing = state.answers[code].timing;
      if (this.routes[code] && state.refinements[code]) {
        const fallback = state.refinements[code].selected_options.find((option) => this.routeOptions[code][option].fallback_to_parent);
        timing = fallback ? state.refinements[code].timings?.[fallback] : null;
      }
      statuses.push(this.holdingStatus(row, timing, asOfYear));
    }
    const precedence = { likely_held: 0, may_still_be_held: 1, retention_unknown: 2, likely_disposed: 3 };
    const retention = statuses.length ? statuses.sort((a, b) => precedence[a.status] - precedence[b.status])[0] : {
      status: "retention_unknown", confidence: "low", rationale: "The interaction answer was uncertain, so no holding estimate was made.", timing: null
    };
    const retentionText = row[french ? "retention_text_fr" : "retention_text_en"] || "";
    return {
      record_id: row.record_id,
      bank_number: row.bank_number_key,
      scope: row.scope === "institution" ? "institution_specific" : "standard",
      institution_id: row.institution_id,
      institution_name: row[french ? "institution_name_fr" : "institution_name_en"],
      title: row[french ? "title_fr" : "title_en"],
      source_url: row[french ? "source_url_fr" : "source_url_en"],
      match_band: band,
      matched_question_codes: matchedCodes,
      matched_route_options: matchedRoutes,
      holding_status: retention.status,
      retention: {
        ...retention,
        rule_type: row.retention_rule_type,
        reference_events: [...pipeSet(row.retention_reference_events)].sort(),
        published_text_excerpt: retentionText.slice(0, 280),
        published_text_truncated: retentionText.length > 280
      },
      categories_of_personal_information: [...pipeSet(row.category_ids)].sort().filter((code) => this.categories[code]).map((code) => ({
        category_id: code,
        name: this.categories[code][french ? "name_fr" : "name_en"]
      })),
      privacy_caveat_codes: [...pipeSet(row.privacy_caveat_codes)].sort()
    };
  }

  holdingStatus(row, timing, asOfYear) {
    const unknown = (rationale) => ({ status: "retention_unknown", confidence: "low", rationale, timing: timing ? clone(timing) : null });
    if (!timing || timing.kind === "unknown") return unknown("No usable approximate interaction date was supplied.");
    const ruleType = row.retention_rule_type;
    if (ruleType === "indefinite" && !boolValue(row.retention_has_immediate_disposal)) return { status: "likely_held", confidence: row.retention_confidence, rationale: "The published rule says the records are retained indefinitely.", timing: clone(timing) };
    if (["unknown", "policy_pending", "institution_defined", "schedule_defined", "trigger_based"].includes(ruleType)) return unknown("The published rule does not provide a duration that can be applied to this answer.");
    if (boolValue(row.retention_has_immediate_disposal) || boolValue(row.retention_has_indefinite_component)) return unknown("Different published branches permit immediate disposal or indefinite retention.");
    const events = pipeSet(row.retention_reference_events);
    if ([...events].some((event) => !["unspecified_start", "record_creation_or_receipt", "date_of_issue"].includes(event))) return unknown("The retention clock starts at another event, such as file closure or departure.");
    const [elapsedMin, elapsedMax] = this.elapsedInterval(timing, asOfYear);
    if (elapsedMin === null) return unknown("The supplied timing could not be applied.");
    const minimum = row.retention_minimum_years ? Number(row.retention_minimum_years) : null;
    const maximum = row.retention_maximum_years ? Number(row.retention_maximum_years) : null;
    if (maximum !== null && elapsedMin > maximum && row.retention_disposition === "destroy") return { status: "likely_disposed", confidence: row.retention_confidence, rationale: "Even the most recent date in the supplied period is beyond the published maximum followed by destruction.", timing: clone(timing) };
    if (minimum !== null && elapsedMax !== null && elapsedMax <= minimum) return { status: "likely_held", confidence: row.retention_confidence, rationale: "The whole supplied period is within the published minimum retention period.", timing: clone(timing) };
    if (minimum !== null || maximum !== null) return { status: "may_still_be_held", confidence: row.retention_confidence, rationale: "The approximate period overlaps a boundary, or the published rule gives only a minimum, range, or conditional disposition.", timing: clone(timing) };
    return unknown("The published text has no applicable numeric period.");
  }

  elapsedInterval(timing, asOfYear) {
    const intervals = {
      current: [0, 0], within_1_year: [0, 1], "1_to_3_years": [1, 3],
      "4_to_7_years": [4, 7], "8_to_15_years": [8, 15], more_than_15_years: [16, null]
    };
    if (timing.kind === "approximate_year") {
      const elapsed = asOfYear - timing.year;
      if (elapsed < 0) throw new Error("An approximate interaction year cannot be after as_of_year");
      return [elapsed, elapsed];
    }
    return intervals[timing.kind] || [null, null];
  }

  explainResult(state, recordId, asOfYear = null) {
    const normalized = this.validateState(state);
    const year = asOfYear ?? new Date().getUTCFullYear();
    const result = this.results(normalized, year, true).find((item) => item.record_id === recordId);
    if (!result) throw new Error("record_id is not a candidate for the supplied survey state");
    if (!evidenceCache) evidenceCache = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "evidence.json"), "utf8"));
    const derivation = evidenceCache[recordId];
    const matched = new Set(result.matched_question_codes);
    const triggers = ["primary_question_triggers", "question_triggers"].flatMap((field) => derivation.interactions[field] || []).filter((trigger) => matched.has(trigger.code));
    const featureCodes = new Set(triggers.flatMap((trigger) => (trigger.trigger_basis || []).map((basis) => basis.feature_code)));
    const supporting = ["interaction_topics", "individual_roles", "service_actions"].flatMap((field) => derivation.interactions[field] || []).filter((feature) => featureCodes.has(feature.code));
    const adaptive = result.matched_route_options.map((item) => {
      const option = this.routeOptions[item.question_code][item.route_option_code];
      return { question_code: item.question_code, route_option_code: item.route_option_code, label_en: option.label_en, label_fr: option.label_fr, institution_en: option.institution_en, institution_fr: option.institution_fr, coverage: option.coverage };
    });
    return {
      result,
      question_triggers: triggers,
      adaptive_route_triggers: adaptive,
      supporting_features: supporting,
      retention_derivation: derivation.retention,
      category_derivation: derivation.categories,
      holding_inference: "candidate_only"
    };
  }
}

export const engine = new SurveyToolEngine();
