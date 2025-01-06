import { generateCompoundIndexCombinations, FieldConfig } from '../src/CompoundIndexGenerator';

describe('generateCompoundIndexCombinations', () => {

  it('throws an error if input is an empty array', () => {
    expect(() => generateCompoundIndexCombinations([])).toThrow();
  });

  it('generates combinations of different lengths', () => {
    const fields = ['field1', 'field2', 'field3'].map(field => ({ fieldPath: field, order: 'ASCENDING' })) as FieldConfig[];
    const combinations = generateCompoundIndexCombinations(fields);

    expect(combinations).toEqual([
      {
        collectionGroup: '${COLLECTION_NAME}',
        queryScope: 'COLLECTION',
        fields: [
          { fieldPath: 'field1', order: 'ASCENDING' },
          { fieldPath: 'field2', order: 'ASCENDING' }
        ]
      },
      {
        collectionGroup: '${COLLECTION_NAME}',
        queryScope: 'COLLECTION',
        fields: [
          { fieldPath: 'field1', order: 'ASCENDING' },
          { fieldPath: 'field3', order: 'ASCENDING' }
        ]
      },
      {
        collectionGroup: '${COLLECTION_NAME}',
        queryScope: 'COLLECTION',
        fields: [
          { fieldPath: 'field2', order: 'ASCENDING' },
          { fieldPath: 'field3', order: 'ASCENDING' }
        ]
      },
      {
        collectionGroup: '${COLLECTION_NAME}',
        queryScope: 'COLLECTION',
        fields: [
          { fieldPath: 'field1', order: 'ASCENDING' },
          { fieldPath: 'field2', order: 'ASCENDING' },
          { fieldPath: 'field3', order: 'ASCENDING' }
        ]
      }
    ]);
  });
});