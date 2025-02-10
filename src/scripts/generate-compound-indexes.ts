#!/usr/bin/env ts-node

// see indexes docs: https://firebase.google.com/docs/firestore/query-data/index-overview#single-field-indexes


interface FieldCombination {
  collectionGroup: string;
  queryScope: string;
  fields: { fieldPath: string; order: 'ASCENDING' | 'DESCENDING' }[];
}

export interface FieldConfig {
  fieldPath: string;
  order: 'ASCENDING' | 'DESCENDING';
}

export function generateCompoundIndexCombinations(fields: (string | FieldConfig)[]): FieldCombination[] {
  // Validate input
  if (!Array.isArray(fields) || fields.length === 0) {
    throw new Error('Input must be a non-empty array of field names or field configs');
  }

  // Normalize the input to FieldConfig format
  const normalizedFields: FieldConfig[] = fields.map(field => 
    typeof field === 'string' 
      ? { fieldPath: field, order: 'ASCENDING' } 
      : field
  );

  const combinations: FieldConfig[][] = [];

  // Generate combinations of different lengths (2 or more fields)
  for (let size = 2; size <= normalizedFields.length; size++) {
    const generateCombination = (start: number, current: FieldConfig[]) => {
      if (current.length === size) {
        combinations.push([...current]);
        return;
      }

      for (let i = start; i < normalizedFields.length; i++) {
        current.push(normalizedFields[i]);
        generateCombination(i + 1, current);
        current.pop();
      }
    };

    generateCombination(0, []);
  }

  // Format the output
  const formattedCombinations: FieldCombination[] = combinations.map(combo => ({
    collectionGroup: '${COLLECTION_NAME}',
    queryScope: 'COLLECTION',
    fields: combo.map(({ fieldPath, order }) => ({
      fieldPath,
      order
    }))
  }));

  return formattedCombinations;
};

const parseArgs = (args: string[]): { collectionName: string, fields: FieldConfig[], countOnly: boolean } => {
  if (args.length < 2) {
    throw new Error('Usage: generate-compound-indexes [-c] COLLECTION_NAME FIELD1:ORDER,FIELD2:ORDER,...');
  }

  const countOnly = args[0] === '-c';
  const collectionName = countOnly ? args[1] : args[0];
  const fieldsArg = countOnly ? args[2] : args[1];
  const fields = fieldsArg.split(',').map(field => {
    const [fieldPath, order] = field.split(':');
    if (!fieldPath || !order || (order !== 'ASC' && order !== 'DESC')) {
      throw new Error(`Invalid field format: ${field}`);
    }
    return { fieldPath, order: order === 'ASC' ? 'ASCENDING' : 'DESCENDING' };
  }) as FieldConfig[];

  return { collectionName, fields, countOnly };
};

const main = () => {
  const { collectionName, fields, countOnly } = parseArgs(process.argv.slice(2));
  const combinations = generateCompoundIndexCombinations(fields);
  if (countOnly) {
    console.log(combinations.length);
  } else {
    const formattedCombinations = combinations.map(combo => ({
      ...combo,
      collectionGroup: collectionName
    }));
    console.log(JSON.stringify(formattedCombinations, null, 2));
  }
};


// detect if run by CLI
if (require.main === module) {
  main();
}
