import { getFieldValues } from '../../src/FullTextSearch';

describe('FullTextSearch', () => {
  describe('getFieldValues', () => {
    it('gets simple field value', () => {
      const data = { name: 'John' };
      expect(getFieldValues(data, 'name')).toEqual(['John']);
    });

    it('gets nested field value', () => {
      const data = { 
        contact: { 
          firstName: 'John',
          lastName: 'Doe'
        } 
      };
      expect(getFieldValues(data, 'contact.firstName')).toEqual(['John']);
    });

    it('gets values from array field', () => {
      const data = { 
        tags: ['one', 'two', 'three']
      };
      expect(getFieldValues(data, 'tags')).toEqual(['one', 'two', 'three']);
    });

    it('gets values from array of objects', () => {
      const data = { 
        contacts: [
          { firstName: 'John' },
          { firstName: 'Jane' }
        ]
      };
      expect(getFieldValues(data, 'contacts.firstName')).toEqual(['John', 'Jane']);
    });

    it('gets values from deeply nested array of objects', () => {
      const data = { 
        company: {
          departments: [
            { 
              employees: [
                { name: 'John' },
                { name: 'Jane' }
              ]
            },
            { 
              employees: [
                { name: 'Bob' }
              ]
            }
          ]
        }
      };
      expect(getFieldValues(data, 'company.departments.employees.name'))
        .toEqual(['John', 'Jane', 'Bob']);
    });

    it('returns empty array for non-existent field', () => {
      const data = { name: 'John' };
      expect(getFieldValues(data, 'age')).toEqual([]);
    });

    it('returns empty array for non-existent nested field', () => {
      const data = { contact: { firstName: 'John' } };
      expect(getFieldValues(data, 'contact.age')).toEqual([]);
    });

    it('handles null and undefined values', () => {
      const data = { 
        name: null,
        contact: undefined
      };
      expect(getFieldValues(data, 'name')).toEqual([]);
      expect(getFieldValues(data, 'contact')).toEqual([]);
      expect(getFieldValues(data, 'contact.firstName')).toEqual([]);
    });

    it('converts non-string values to strings', () => {
      const data = { 
        age: 42,
        active: true,
        score: 99.5
      };
      expect(getFieldValues(data, 'age')).toEqual(['42']);
      expect(getFieldValues(data, 'active')).toEqual(['true']);
      expect(getFieldValues(data, 'score')).toEqual(['99.5']);
    });
  });
});
