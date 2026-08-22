import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ANSWER_VALUES, TIMING_KINDS, engine } from "./engine.mjs";

const Timing = z.object({
  kind: z.enum(TIMING_KINDS),
  year: z.number().int().min(1800).max(2200).nullable().optional()
}).strict();

const SurveyAnswer = z.object({
  value: z.enum(ANSWER_VALUES),
  timing: Timing.nullable().optional()
}).strict();

const SurveyRefinement = z.object({
  selected_options: z.array(z.string()).min(1),
  timings: z.record(Timing).default({})
}).strict();

const SurveyState = z.object({
  schema_version: z.literal("1.1"),
  contract_version: z.string(),
  locale: z.enum(["en-CA", "fr-CA"]),
  answers: z.record(SurveyAnswer),
  refinements: z.record(SurveyRefinement)
}).strict();

const AnswerUpdate = z.object({
  question_code: z.string(),
  value: z.enum(ANSWER_VALUES),
  timing: Timing.nullable().optional()
}).strict();

const RefinementUpdate = z.object({
  question_code: z.string(),
  selected_options: z.array(z.string()).min(1),
  timings: z.record(Timing).default({})
}).strict();

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
};

const output = (result) => ({
  content: [{ type: "text", text: JSON.stringify(result) }],
  structuredContent: result
});

const manifestOutput = {
  tool_api_version: z.string(),
  state_schema_version: z.string(),
  contract_schema_version: z.string(),
  contract_version: z.string(),
  generator_version: z.string(),
  data_snapshot: z.record(z.unknown()),
  supported_locales: z.array(z.string()),
  question_count: z.number().int(),
  adaptive_route_count: z.number().int(),
  adaptive_route_version: z.string(),
  pib_count: z.number().int(),
  answer_values: z.array(z.string()),
  timing_kinds: z.array(z.string()),
  tools: z.array(z.string()),
  privacy: z.record(z.unknown()),
  limitations: z.array(z.string())
};

const advanceOutput = {
  state: SurveyState,
  complete: z.boolean(),
  next_step: z.record(z.unknown()).nullable(),
  progress: z.object({
    answered_questions: z.number().int(),
    total_questions: z.number().int(),
    yes_answers_with_timing: z.number().int()
  }).strict()
};

const evaluationOutput = {
  assessment: z.record(z.unknown()),
  summary: z.record(z.unknown()),
  results: z.array(z.record(z.unknown())),
  versions: z.record(z.unknown())
};

const explanationOutput = {
  result: z.record(z.unknown()),
  question_triggers: z.array(z.record(z.unknown())),
  adaptive_route_triggers: z.array(z.record(z.unknown())),
  supporting_features: z.array(z.record(z.unknown())),
  retention_derivation: z.record(z.unknown()),
  category_derivation: z.record(z.unknown()),
  holding_inference: z.literal("candidate_only")
};

export function createServer() {
  return new McpServer({
    name: "my-info-canada",
    title: "My Info Canada",
    version: "0.2.0"
  }, {
    instructions: "Call my_info_get_manifest first. Keep survey state client-side, use only controlled answers and adaptive selections, never send identifying or narrative case details, and never claim that a candidate PIB proves a record exists."
  });
}

export function registerAll(server) {
  server.registerTool("my_info_get_manifest", {
    title: "Get My Info survey manifest",
    description: "Get current survey versions, capabilities, privacy constraints and limitations before starting.",
    inputSchema: {},
    outputSchema: manifestOutput,
    annotations: readOnly
  }, async () => output(engine.getManifest()));

  server.registerTool("my_info_advance", {
    title: "Advance the My Info survey",
    description: "Start or continue the survey using controlled answers, adaptive selections and client-owned state.",
    inputSchema: {
      state: SurveyState.nullable().optional(),
      answers: z.array(AnswerUpdate).nullable().optional(),
      refinements: z.array(RefinementUpdate).nullable().optional(),
      locale: z.enum(["en-CA", "fr-CA"]).default("en-CA")
    },
    outputSchema: advanceOutput,
    annotations: readOnly
  }, async ({ state = null, answers = [], refinements = [], locale = "en-CA" }) =>
    output(engine.advance(state, answers || [], refinements || [], locale))
  );

  server.registerTool("my_info_evaluate", {
    title: "Evaluate My Info survey answers",
    description: "Return ranked candidate PIBs and conservative retention estimates. Results never confirm that records exist.",
    inputSchema: {
      state: SurveyState,
      as_of_year: z.number().int().min(1900).max(2200).nullable().optional(),
      include_possible: z.boolean().default(false),
      max_results: z.number().int().min(1).max(500).default(50),
      offset: z.number().int().min(0).default(0)
    },
    outputSchema: evaluationOutput,
    annotations: readOnly
  }, async ({ state, as_of_year = null, include_possible = false, max_results = 50, offset = 0 }) =>
    output(engine.evaluate(state, {
      asOfYear: as_of_year,
      includePossible: include_possible,
      maxResults: max_results,
      offset
    }))
  );

  server.registerTool("my_info_explain_result", {
    title: "Explain one My Info result",
    description: "Explain why one candidate PIB matched, including adaptive routes, derivation evidence, categories and retention reasoning.",
    inputSchema: {
      state: SurveyState,
      record_id: z.string().min(1),
      as_of_year: z.number().int().min(1900).max(2200).nullable().optional()
    },
    outputSchema: explanationOutput,
    annotations: readOnly
  }, async ({ state, record_id, as_of_year = null }) =>
    output(engine.explainResult(state, record_id, as_of_year))
  );
}
