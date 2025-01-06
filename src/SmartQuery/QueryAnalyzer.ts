// Types for Firestore index definitions
type OrderDirection = 'ASCENDING' | 'DESCENDING';

interface IndexField {
  fieldPath: string;
  order: OrderDirection;
}

interface IndexDefinition {
  fields: IndexField[];
}

// Types for parsed query components
interface WhereClause {
  fieldPath: string;
  operator: string;
}

// Constants
const INEQUALITY_OPERATORS = [
  '<',
  '<=',
  '>',
  '>=',
  '!=',
  'not-in',
  'array-contains-any',
  'in'
] as const;

type InequalityOperator = typeof INEQUALITY_OPERATORS[number];

// Helper function to determine if a field/operator combination is an inequality
const isInequalityOperator = (operator: string): boolean => {
  return INEQUALITY_OPERATORS.includes(operator as InequalityOperator);
};

// Helper function to extract field path and operator from a where clause
const parseWhereClause = (whereClause: string): WhereClause | null => {
  const match = whereClause.match(/where\(['"](.*?)['"],\s*['"](.*?)['"],.*?\)/);
  if (!match) return null;
  
  return {
    fieldPath: match[1],
    operator: match[2]
  };
};

// Helper function to extract field path from orderBy clause
const parseOrderByClause = (orderByClause: string): string | null => {
  const match = orderByClause.match(/orderBy\(['"](.*?)['"].*?\)/);
  if (!match) return null;
  
  return match[1];
};

function analyzeQueryIndexes(queryString: string): IndexDefinition[] {
  // Split the query into individual method calls
  const methodCalls: string[] = queryString
    .split('.')
    .slice(2) // Skip db.collection part
    .map(call => call.trim());

  const whereClauses: (WhereClause | null)[] = [];
  const orderByClauses: (string | null)[] = [];

  // First pass: collect all where and orderBy clauses
  methodCalls.forEach(call => {
    if (call.startsWith('where')) {
      whereClauses.push(parseWhereClause(call));
    } else if (call.startsWith('orderBy')) {
      orderByClauses.push(parseOrderByClause(call));
    }
  });

  // Filter out null values
  const validWhereClauses = whereClauses.filter((clause): clause is WhereClause => clause !== null);
  const validOrderByClauses = orderByClauses.filter((clause): clause is string => clause !== null);

  // If we don't have any where clauses or only have one, no compound index needed
  if (validWhereClauses.length <= 1 && validOrderByClauses.length === 0) {
    return [];
  }

  // Separate equality and inequality filters
  const equalityFilters = validWhereClauses.filter(clause => !isInequalityOperator(clause.operator));
  const inequalityFilters = validWhereClauses.filter(clause => isInequalityOperator(clause.operator));

  // Check for inequality limitations
  if (inequalityFilters.length > 0) {
    const firstInequalityField = inequalityFilters[0].fieldPath;
    const differentFieldInequality = inequalityFilters.find(
      filter => filter.fieldPath !== firstInequalityField
    );

    if (differentFieldInequality) {
      throw new Error(`Cannot have inequality filters on different fields: ${
        firstInequalityField} and ${differentFieldInequality.fieldPath
      }`);
    }
  }

  // Build the compound index fields array
  let indexFields: IndexField[] = [];

  // 1. Start with equality filters
  equalityFilters.forEach(clause => {
    indexFields.push({
      fieldPath: clause.fieldPath,
      order: 'ASCENDING'
    });
  });

  // 2. Add inequality filter field if it exists
  if (inequalityFilters.length === 1) {
    const inequalityField = inequalityFilters[0];
    
    // Ensure the inequality field is not already added from equality filters
    if (!indexFields.some(field => field.fieldPath === inequalityField.fieldPath)) {
      indexFields.push({
        fieldPath: inequalityField.fieldPath,
        order: 'ASCENDING'
      });
    }
  }

  // 3. Add any remaining orderBy fields that aren't already included
  validOrderByClauses.forEach(orderByField => {
    if (!indexFields.some(field => field.fieldPath === orderByField)) {
      indexFields.push({
        fieldPath: orderByField,
        order: 'ASCENDING'
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
      fields: indexFields
    }];
  }

  return [];
}

// Export for use in other modules
export { analyzeQueryIndexes, type IndexDefinition, type IndexField };