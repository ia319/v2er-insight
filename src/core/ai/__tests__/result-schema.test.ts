import { describe, expect, it } from 'vitest';
import type { AIResultJsonSchema } from '../result-schema';
import { AI_ANALYSIS_RESULT_JSON_SCHEMA } from '../result-schema';

function expectClosedObjectSchemas(schema: AIResultJsonSchema): void {
  if (schema.type === 'array') {
    expectClosedObjectSchemas(schema.items);
    return;
  }
  if (schema.type !== 'object') return;

  expect(schema.additionalProperties).toBe(false);
  expect(schema.required).toEqual(Object.keys(schema.properties));
  for (const property of Object.values(schema.properties)) {
    expectClosedObjectSchemas(property);
  }
}

function requireObjectSchema(
  schema: AIResultJsonSchema,
): Extract<AIResultJsonSchema, { type: 'object' }> {
  if (schema.type !== 'object') throw new Error('Expected object schema');
  return schema;
}

function requireProperty(
  schema: Extract<AIResultJsonSchema, { type: 'object' }>,
  name: string,
): AIResultJsonSchema {
  const property = schema.properties[name];
  if (!property) throw new Error(`Expected schema property "${name}"`);
  return property;
}

describe('AI analysis result JSON Schema', () => {
  it('defines every top-level result field', () => {
    const root = requireObjectSchema(AI_ANALYSIS_RESULT_JSON_SCHEMA);
    expect(Object.keys(root.properties)).toEqual([
      'summary',
      'professional',
      'personal',
      'psychological',
      'behavioral',
      'social',
      'risk',
    ]);
  });

  it('requires every property and rejects additional properties recursively', () => {
    expectClosedObjectSchemas(AI_ANALYSIS_RESULT_JSON_SCHEMA);
  });

  it('preserves score ranges and risk levels from the persisted contract', () => {
    const root = requireObjectSchema(AI_ANALYSIS_RESULT_JSON_SCHEMA);
    const psychological = requireObjectSchema(requireProperty(root, 'psychological'));
    const scores = requireObjectSchema(requireProperty(psychological, 'scores'));
    expect(scores.properties.openness).toEqual({ type: 'number', minimum: 0, maximum: 100 });

    const risk = requireObjectSchema(requireProperty(root, 'risk'));
    expect(risk.properties.level).toEqual({
      type: 'string',
      enum: ['safe', 'suspicious', 'high_risk'],
    });
  });
});
