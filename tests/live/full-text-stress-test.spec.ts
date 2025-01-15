require('./../init');
import { updateFullTextIndexRecord, updateFullTextIndex, buildFullTextIndex, loadFullTextIndex } from './../../src/FullTextSearch';
import { faker } from '@faker-js/faker';

import * as admin from "firebase-admin";

const db = admin.firestore();
const bucket = admin.storage().bucket('firescan-test.firebasestorage.app');

async function parallelExecution<T>(items: T[], limit: number, operations: (item: T) => Promise<void>): Promise<void> {
  const BATCH_SIZE = limit;
  const batched: T[][] = [];
  let bi = 0;
  // batch by BATCH_SIZE
  for (let j = 0; j < items.length; j += BATCH_SIZE) {
    batched.push(items.slice(j, j + BATCH_SIZE));
  }
  for (const batch of batched) {
    console.log(new Date().toISOString(), BATCH_SIZE * bi, BATCH_SIZE * (bi + 1));
    await Promise.all(batch.map(operations));
    bi++;
  }
}

describe('full text on live (test) environment', () => {
  let index: any;
  // beforeAll(async function setup10kContactsInDB() {
  //   // generate 10000 records of contacts, using faker library and parallelExecution
  //   const contacts = Array.from({ length: 10000 }, () => ({
  //     name: faker.person.firstName(),
  //     city: faker.location.city(),
  //     email: faker.internet.email(),
  //   }));

  //   await parallelExecution(contacts, 1000, async (contact) => {
  //     await db.collection('contacts').add(contact);
  //   });
  // }, 60000)
  // describe('buildFullTextIndex', () => {
  //   it('builds full text index', async () => {
  //     index = await buildFullTextIndex(db, bucket, 'contacts', {
  //       fields: ['name', 'city', 'email']
  //     });
  //   }, 60000);
  // });
  // afterAll(async () => {
  //   // delete the index file in storage
  //   await bucket.file('firescan__full_text_indexes/contacts.json').delete();
  // });
  describe('loadFullTextIndex', () => {
    it('loads full text index from storage', async () => {
      index = await loadFullTextIndex(bucket, 'contacts');
    }, 60000);
  });
  describe('search', () => {
    it('searches the full text index', async () => {
      const results = index.search('Anna');
      expect(results.length).toBeGreaterThan(0);
    });
  })
});