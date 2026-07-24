type JsonStringSchema = {
  type: 'string';
  enum?: string[];
};

type JsonNumberSchema = {
  type: 'number';
  minimum?: number;
  maximum?: number;
};

type JsonArraySchema = {
  type: 'array';
  items: AIResultJsonSchema;
};

type JsonObjectSchema = {
  type: 'object';
  properties: Record<string, AIResultJsonSchema>;
  required: string[];
  additionalProperties: false;
};

export type AIResultJsonSchema =
  | JsonStringSchema
  | JsonNumberSchema
  | JsonArraySchema
  | JsonObjectSchema;

function objectSchema(properties: Record<string, AIResultJsonSchema>): JsonObjectSchema {
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

function stringSchema(values?: string[]): JsonStringSchema {
  return values ? { type: 'string', enum: values } : { type: 'string' };
}

function stringArraySchema(): JsonArraySchema {
  return { type: 'array', items: stringSchema() };
}

function scoreSchema(): JsonNumberSchema {
  return { type: 'number', minimum: 0, maximum: 100 };
}

/** Closed JSON Schema for structured AI profile responses. */
export const AI_ANALYSIS_RESULT_JSON_SCHEMA: AIResultJsonSchema = objectSchema({
  summary: stringSchema(),
  professional: objectSchema({
    tech_stack: stringArraySchema(),
    career_path: stringSchema(),
    level: stringSchema(),
    focus_coherence: stringSchema(),
    evolution: objectSchema({
      summary: stringSchema(),
      timeline: {
        type: 'array',
        items: objectSchema({
          period: stringSchema(),
          focus: stringSchema(),
        }),
      },
    }),
  }),
  personal: objectSchema({
    hobbies: stringArraySchema(),
    life_stage: stringSchema(),
    values: stringArraySchema(),
  }),
  psychological: objectSchema({
    scores: objectSchema({
      openness: scoreSchema(),
      conscientiousness: scoreSchema(),
      extraversion: scoreSchema(),
      agreeableness: scoreSchema(),
      neuroticism: scoreSchema(),
    }),
    keywords: stringArraySchema(),
  }),
  behavioral: objectSchema({
    role: stringSchema(),
    interaction_style: stringSchema(),
    active_pattern: stringSchema(),
    heat_sensitivity: stringSchema(),
  }),
  social: objectSchema({
    content_appeal: stringSchema(),
    discussion_depth: stringSchema(),
  }),
  risk: objectSchema({
    level: stringSchema(['safe', 'suspicious', 'high_risk']),
    reason: stringSchema(),
  }),
});
