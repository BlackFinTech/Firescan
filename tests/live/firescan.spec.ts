require('./../init');
import { buildFullTextIndex } from '../../src/FullTextSearch';
import { firescan } from './../../src/index';

import * as admin from "firebase-admin";

const db = admin.firestore();

describe('firescan on live (test) environment', () => {
  describe('users collection', () => {
    it('queries users by city', async () => {
      const users = await firescan([], db.collection('users').where('city', '==', 'NYC'));
      expect(users.length).toBe(4);
    });
    it('queries users by age', async () => {
      const users = await firescan([], db.collection('users').where('age', '>', 30));
      expect(users.length).toBe(3);
    });
    it('queries users by city and age (serverside)', async () => {
      const users = await firescan([], db.collection('users').where('city', '==', 'NYC').where('age', '>', 30));
      expect(users.length).toBe(2);
    });
    it('queries users by city and age, with limit (serverside)', async () => {
      const users = await firescan([], db.collection('users').where('city', '==', 'NYC').where('age', '>', 30).limit(1));
      expect(users.length).toBe(1);
    });
    it('queries users by city and age, with offset and limit (serverside)', async () => {
      const users = await firescan([], db.collection('users').where('city', '==', 'NYC').where('age', '>', 30).offset(1).limit(1));
      expect(users.length).toBe(1);
      const noUsers = await firescan([], db.collection('users').where('city', '==', 'NYC').where('age', '>', 30).offset(2).limit(1));
      expect(noUsers.length).toBe(0);
    });
    it('queries users by city and sorts by city (on db)', async () => {
      const users = await firescan([], db.collection('users').where('city', '==', 'NYC').orderBy('city','asc'));
      expect(users.length).toBe(4);
    });
    it('queries users by city and sorts by name (serverside)', async () => {
      const users = await firescan([], db.collection('users').where('city', '==', 'NYC').orderBy('name','asc'));
      expect(users[0].get('name')).toBe('Alice');
      expect(users[1].get('name')).toBe('John');
      expect(users[2].get('name')).toBe('Mike');
      expect(users[3].get('name')).toBe('Tom');
      expect(users.length).toBe(4);
    });
    it('queries users by city, age and sorts by name (serverside)', async () => {
      const users = await firescan([], db.collection('users').where('city', '==', 'NYC').where('age','>',30).orderBy('name','asc'));
      expect(users[0].get('name')).toBe('Alice');
      expect(users[1].get('name')).toBe('Tom');
      expect(users.length).toBe(2);
    });
    it('queries users by city, age and sorts by name (serverside, because full required index is not present)', async () => {
      const users = await firescan([
        {
          "collectionGroup": "users",
          "queryScope": "COLLECTION",
          "fields": [
            {
              "fieldPath": "city",
              "order": "ASCENDING"
            },
            {
              "fieldPath": "age",
              "order": "ASCENDING"
            }
          ]
        }
      ], db.collection('users').where('city', '==', 'NYC').where('age','>',30).orderBy('name','asc'));
      expect(users[0].get('name')).toBe('Alice');
      expect(users[1].get('name')).toBe('Tom');
      expect(users.length).toBe(2);
    });
    it('queries users by city and sorts by age (on db, because full required index is present)', async () => {
      const users = await firescan([
        {
          "collectionGroup": "users",
          "queryScope": "COLLECTION",
          "fields": [
            {
              "fieldPath": "city",
              "order": "ASCENDING"
            },
            {
              "fieldPath": "age",
              "order": "ASCENDING"
            }
          ]
        }
      ], db.collection('users').where('city', '==', 'NYC').orderBy('age','asc'));
      expect(users[0].get('name')).toBe('Mike');
      expect(users[1].get('name')).toBe('John');
      expect(users[2].get('name')).toBe('Tom');
      expect(users[3].get('name')).toBe('Alice');
      expect(users.length).toBe(4);
    });
    it('queries users by city and sorts by age in DESCENDING order (on serverside, because required index is not present)', async () => {
      const users = await firescan([
        {
          "collectionGroup": "users",
          "queryScope": "COLLECTION",
          "fields": [
            {
              "fieldPath": "city",
              "order": "ASCENDING"
            },
            {
              "fieldPath": "age",
              "order": "ASCENDING"
            }
          ]
        }
      ], db.collection('users').where('city', '==', 'NYC').orderBy('age','desc'));
      expect(users[0].get('name')).toBe('Alice');
      expect(users[1].get('name')).toBe('Tom');
      expect(users[2].get('name')).toBe('John');
      expect(users[3].get('name')).toBe('Mike');
      expect(users.length).toBe(4);
    });
    it('performs full text search on users collection', async () => {
      const index = await buildFullTextIndex(db, admin.storage().bucket('firescan-test.firebasestorage.app'), 'users', { fields: ['name', 'city'] });
      const users = await firescan([], db.collection('users'), 'mike', { fullTextIndex: index });
      expect(users.length).toBe(1);
      expect(users[0].get('name')).toBe('Mike');
    });
  });
});