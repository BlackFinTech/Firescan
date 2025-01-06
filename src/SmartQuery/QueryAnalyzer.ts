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

// Helper function to determine if a field/operator combination requires an index
const requiresIndex = (fieldPath: string, operator: string): boolean => {
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

  const indexes: IndexDefinition[] = [];
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

  // Analyze where clauses
  let hasInequality = false;
  let inequalityField: string | null = null;

  whereClauses.forEach(clause => {
    if (!clause) return;
    
    if (requiresIndex(clause.fieldPath, clause.operator)) {
      if (hasInequality && inequalityField && clause.fieldPath !== inequalityField) {
        // Can't have inequality filters on different fields
        throw new Error(`Cannot have inequality filters on different fields: ${inequalityField} and ${clause.fieldPath}`);
      }
      
      hasInequality = true;
      inequalityField = clause.fieldPath;
    }
  });

  // If we have both where and orderBy clauses, we need compound indexes
  if (whereClauses.length > 0 && orderByClauses.length > 0) {
    // If we have an inequality, it must be the first orderBy
    if (hasInequality && inequalityField && orderByClauses[0] !== inequalityField) {
      throw new Error(`First orderBy must be on the inequality filter field: ${inequalityField}`);
    }

    // Create compound indexes for all combinations
    whereClauses.forEach(whereClause => {
      if (!whereClause) return;
      
      orderByClauses.forEach(orderByField => {
        if (!orderByField) return;
        
        if (whereClause.fieldPath !== orderByField) {
          indexes.push({
            fields: [
              { fieldPath: whereClause.fieldPath, order: 'ASCENDING' },
              { fieldPath: orderByField, order: 'ASCENDING' }
            ]
          });
        }
      });
    });
  }

  // If we have multiple where clauses with different fields, we need compound indexes
  if (whereClauses.length > 1) {
    const fields = whereClauses
      .filter((clause): clause is WhereClause => clause !== null)
      .map(clause => clause.fieldPath);
    
    if (new Set(fields).size > 1) {
      indexes.push({
        fields: fields.map(field => ({
          fieldPath: field,
          order: 'ASCENDING'
        }))
      });
    }
  }

  return indexes;
}

// Export for use in other modules
export { analyzeQueryIndexes, type IndexDefinition, type IndexField };