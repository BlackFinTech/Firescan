require('./../init');
import { updateFullTextIndexRecord, updateFullTextIndex, buildFullTextIndex, loadFullTextIndex } from './../../src/FullTextSearch';

import * as admin from "firebase-admin";

const db = admin.firestore();
const bucket = admin.storage().bucket('firescan-test.firebasestorage.app');

describe('full text on live (test) environment', () => {
  let index: any;
  describe('buildFullTextIndex', () => {
    it('builds full text index for a collection with data from record collection', async () => {
      index = await buildFullTextIndex(db, bucket, 'users', {
        fields: ['name', 'city']
      });

      expect(index.search('Anna')).toEqual(['EIv5LOLFuV4DKlycReQf']);

      // make sure the index is saved in storage
      const indexFile = await bucket.file('firescan__full_text_indexes/users.json').download();
      expect(indexFile.length).toBeGreaterThan(0);
    });
  });
  describe('updateFullTextIndexRecord', () => {
    it('adds temporary full text index update in special firestore collection', async () => {
      const UPDATES_COLLECTION = 'firescan__full_text_updates';
      const id = 'EIv5LOLFuV4DKlycReQf';
      await updateFullTextIndexRecord(db, 'users', id, { name: 'Michele', city: 'LA', age: 30});
      const snapshot = await db.collection(UPDATES_COLLECTION).doc(`users_${id}`).get();
      expect(snapshot.get('recordData')).toEqual({ name: 'Michele', city: 'LA', age: 30});
    });
  });
  describe('loadFullTextIndex', () => {
    it('loads full text index from storage, does not apply patches from pending updates', async () => {
      index = await loadFullTextIndex(bucket, 'users');
      expect(index.search('Anna')).toEqual(['EIv5LOLFuV4DKlycReQf']);
    });
  });
  describe('updateFullTextIndex', () => {
    it('builds full text index for a collection with data from record collection and patches with record data from updates collection', async () => {
      index = await updateFullTextIndex(db, bucket, 'users', {
        fields: ['name', 'city']
      });

      expect(index.search('Michele')).toEqual(['EIv5LOLFuV4DKlycReQf']);

      // make sure the updates are cleared
      const UPDATES_COLLECTION = 'firescan__full_text_updates';
      const id = 'EIv5LOLFuV4DKlycReQf';
      const snapshot = await db.collection(UPDATES_COLLECTION).doc(`users_${id}`).get();
      expect(snapshot.exists).toEqual(false);
    });
  });
  afterAll(async () => {
    // delete the index file in storage
    await bucket.file('firescan__full_text_indexes/users.json').delete();
  });
});