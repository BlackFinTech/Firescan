// Types for Firestore index definitions

interface IndexField {
  fieldPath: string;
  order?: string;
}

interface IndexDefinition {
  collectionGroup: string;
  queryScope: string;
  fields: IndexField[];
}

// Firestore internal types
interface FieldPath {
  segments: string[];
  formattedName: string;
}

interface FieldFilterInternal {
  field: FieldPath;
  op: string;
  value: unknown;
}

interface FieldOrderInternal {
  field: FieldPath;
  direction: string;
}

interface QueryOptions {
  collectionId: string;
  filters: FieldFilterInternal[];
  fieldOrders: FieldOrderInternal[];
}

// Map of Firestore internal operator names to our comparison operators
const INEQUALITY_OPERATORS = new Set([
  'LESS_THAN',
  'LESS_THAN_OR_EQUAL',
  'GREATER_THAN',
  'GREATER_THAN_OR_EQUAL',
  'NOT_EQUAL',
  'NOT_IN',
  'ARRAY_CONTAINS_ANY',
  'IN'
]);

// Helper function to determine if a field/operator combination is an inequality
const isInequalityOperator = (operator: string): boolean => {
  return INEQUALITY_OPERATORS.has(operator);
};

export function isMultipleInequalityFilters(query: any): boolean {
  const queryOptions: QueryOptions = query._queryOptions;
  if (!queryOptions) return false;

  const { filters } = queryOptions;
  const inequalityFilters = filters.filter(filter => isInequalityOperator(filter.op));
  return inequalityFilters.length > 1;
}

function analyzeQueryIndexes(query: any): IndexDefinition[] {
  // Extract query options from the Firestore query object
  const queryOptions: QueryOptions = query._queryOptions;
  if (!queryOptions) return [];

  const { filters, fieldOrders, collectionId } = queryOptions;
  
  // If we don't have any filters or only have one filter with no orders, no compound index needed
  if (filters.length <= 1 && fieldOrders.length === 0) {
    return [];
  }

  // Separate equality and inequality filters
  const equalityFilters = filters.filter(filter => !isInequalityOperator(filter.op));
  const inequalityFilters = filters.filter(filter => isInequalityOperator(filter.op));

  // Build the compound index fields array
  let indexFields: IndexField[] = [];

  // 1. Start with equality filters
  equalityFilters.forEach(filter => {
    indexFields.push({
      fieldPath: filter.field.formattedName,
      order: 'ASCENDING'
    });
  });

  // 2. Add inequality filter field if it exists
  if (inequalityFilters.length > 0) {
    const inequalityField = inequalityFilters[0].field.formattedName;
    
    // Ensure the inequality field is not already added from equality filters
    if (!indexFields.some(field => field.fieldPath === inequalityField)) {
      indexFields.push({
        fieldPath: inequalityField,
        order: 'ASCENDING'
      });
    }
  }

  // 3. Add any remaining orderBy fields that aren't already included
  fieldOrders.forEach(order => {
    const orderFieldPath = order.field.formattedName;
    if (!indexFields.some(field => field.fieldPath === orderFieldPath)) {
      indexFields.push({
        fieldPath: orderFieldPath,
        order: order.direction === 'DESCENDING' ? 'DESCENDING' : 'ASCENDING'
      });
    }
  });

  // Only create an index if we have multiple fields
  if (indexFields.length > 1) {
    // Remove any duplicate fields while maintaining order
    indexFields = Array.from(new Map(
      indexFields.map(field => [field.fieldPath, field])
    ).values());

    return [{
      collectionGroup: collectionId,
      queryScope: 'COLLECTION',
      fields: indexFields
    }];
  }

  return [];
}

// Export for use in other modules
export { analyzeQueryIndexes, type IndexDefinition, type IndexField };