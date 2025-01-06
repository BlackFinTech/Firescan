import { analyzeQueryIndexes, IndexDefinition } from './../../src/SmartQuery/QueryAnalyzer';

describe('analyzeQueryIndexes', () => {
  describe('basic queries', () => {
    it('should return empty array for simple queries without compound indexes', () => {
      const query = `db.collection('users').where('name', '==', 'John')`;
      const result = analyzeQueryIndexes(query);
      expect(result).toEqual([]);
    });

    it('should return empty array for single orderBy', () => {
      const query = `db.collection('users').orderBy('name', 'asc')`;
      const result = analyzeQueryIndexes(query);
      expect(result).toEqual([]);
    });
  });

  describe('compound indexes with where clauses', () => {
    it('should create compound index for multiple where clauses on different fields', () => {
      const query = `db.collection('users')
        .where('age', '>=', 21)
        .where('city', '==', 'NYC')`;
      
      const expected: IndexDefinition[] = [{
        fields: [
          { fieldPath: 'age', order: 'ASCENDING' },
          { fieldPath: 'city', order: 'ASCENDING' }
        ]
      }];

      const result = analyzeQueryIndexes(query);
      expect(result).toEqual(expected);
    });

    it('should not create compound index for multiple where clauses on same field', () => {
      const query = `db.collection('users')
        .where('age', '>=', 21)
        .where('age', '<=', 65)`;
      
      const result = analyzeQueryIndexes(query);
      expect(result).toEqual([]);
    });
  });

  describe('compound indexes with orderBy', () => {
    it('should create compound index for where + orderBy on different fields', () => {
      const query = `db.collection('users')
        .where('age', '>=', 21)
        .orderBy('name', 'asc')`;
      
      const expected: IndexDefinition[] = [{
        fields: [
          { fieldPath: 'age', order: 'ASCENDING' },
          { fieldPath: 'name', order: 'ASCENDING' }
        ]
      }];

      const result = analyzeQueryIndexes(query);
      expect(result).toEqual(expected);
    });

    it('should not create compound index for where + orderBy on same field', () => {
      const query = `db.collection('users')
        .where('age', '>=', 21)
        .orderBy('age', 'asc')`;
      
      const result = analyzeQueryIndexes(query);
      expect(result).toEqual([]);
    });
  });

  describe('complex queries', () => {
    it('should create multiple compound indexes for complex queries', () => {
      const query = `db.collection('users')
        .where('age', '>=', 21)
        .where('city', '==', 'NYC')
        .orderBy('lastName', 'asc')`;
      
      const expected: IndexDefinition[] = [
        {
          fields: [
            { fieldPath: 'age', order: 'ASCENDING' },
            { fieldPath: 'city', order: 'ASCENDING' }
          ]
        },
        {
          fields: [
            { fieldPath: 'age', order: 'ASCENDING' },
            { fieldPath: 'lastName', order: 'ASCENDING' }
          ]
        },
        {
          fields: [
            { fieldPath: 'city', order: 'ASCENDING' },
            { fieldPath: 'lastName', order: 'ASCENDING' }
          ]
        }
      ];

      const result = analyzeQueryIndexes(query);
      expect(result).toEqual(expected);
    });
  });

  describe('error cases', () => {
    it('should throw error for inequality filters on different fields', () => {
      const query = `db.collection('users')
        .where('age', '>=', 21)
        .where('score', '>', 90)`;
      
      expect(() => analyzeQueryIndexes(query)).toThrow(
        'Cannot have inequality filters on different fields: age and score'
      );
    });

    it('should throw error when first orderBy does not match inequality filter', () => {
      const query = `db.collection('users')
        .where('age', '>=', 21)
        .orderBy('name', 'asc')`;
      
      expect(() => analyzeQueryIndexes(query)).toThrow(
        'First orderBy must be on the inequality filter field: age'
      );
    });
  });

  describe('edge cases', () => {
    it('should handle empty query string', () => {
      const query = '';
      expect(() => analyzeQueryIndexes(query)).not.toThrow();
    });

    it('should handle malformed where clauses', () => {
      const query = `db.collection('users').where('age' >= 21)`;  // Missing comma
      expect(() => analyzeQueryIndexes(query)).not.toThrow();
    });

    it('should handle malformed orderBy clauses', () => {
      const query = `db.collection('users').orderBy('name' asc)`;  // Missing comma
      expect(() => analyzeQueryIndexes(query)).not.toThrow();
    });

    it('should handle queries with whitespace and newlines', () => {
      const query = `
        db.collection('users')
          .where('age', '>=', 21)
          .where('city', '==', 'NYC')
      `;
      
      const expected: IndexDefinition[] = [{
        fields: [
          { fieldPath: 'age', order: 'ASCENDING' },
          { fieldPath: 'city', order: 'ASCENDING' }
        ]
      }];

      const result = analyzeQueryIndexes(query);
      expect(result).toEqual(expected);
    });
  });

  describe('inequality operators', () => {
    const inequalityOperators = ['<', '<=', '>', '>=', '!=', 'not-in', 'array-contains-any', 'in'];
    
    inequalityOperators.forEach(operator => {
      it(`should handle ${operator} operator correctly`, () => {
        const query = `db.collection('users')
          .where('age', '${operator}', 21)
          .orderBy('age', 'asc')`;
        
        expect(() => analyzeQueryIndexes(query)).not.toThrow();
      });
    });
  });
});