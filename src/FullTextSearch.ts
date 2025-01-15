import { DocumentReference, Firestore, QueryDocumentSnapshot } from '@google-cloud/firestore';
import { Bucket } from '@google-cloud/storage';
import { Index } from 'flexsearch';

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

async function batchQueryProcess(
  query: FirebaseFirestore.Query,
  limit: number,
  processor: (doc: FirebaseFirestore.QueryDocumentSnapshot) => Promise<void>,
  options?: { logProgress?: boolean }
): Promise<void> {
  options = Object.assign(
    {
      logProgress: false,
    },
    options || {}
  );
  const { logProgress } = options;

  let total = -1;
  if (logProgress) {
    let countResult = await query.count().get();
    total = countResult.data().count;
  }

  let result = await query.limit(limit).get();
  let i = 0;
  while (result.docs.length > 0) {
    if (logProgress) {
      console.debug(`${i}/${total} - ${Math.round((i / total) * 100)}%`);
    }
    i += limit;
    await Promise.all(result.docs.map(processor));
    let last = result.docs[result.docs.length - 1];
    result = await query.limit(limit).startAfter(last).get();
  }
}

// create cron job that will updateFullTextIndex for each collection I need full text searching on
// implement below, define how I will configure things, which fields to include for full text and also indexing
const UPDATES_COLLECTION = 'firescan__full_text_updates';

export interface FullTextIndexConfig {
  fields: string[];
}

function _recordDataToSearchableString(recordData: any, config: FullTextIndexConfig): string {
  const searchableStringParts = [];
  for(let field of config.fields) {
    if(recordData[field]) {
      searchableStringParts.push(recordData[field]);
    }
  }
  return searchableStringParts.join(' ');
}

async function _saveIndexToStorage(bucketRef: Bucket, index: Index, collection: string): Promise<void> {
  // save index to storage
  const indexData: (string | number)[][] = [];
  await index.export((key, data) => {
    indexData.push([key, data]);
  });
  const indexDataString = JSON.stringify(indexData);

  await bucketRef.file(`firescan__full_text_indexes/${collection}.json`).save(indexDataString);
}


async function _loadIndexFromStorage(bucketRef: Bucket, collection: string): Promise<Index|null> {
  // load index from storage
  let index: null|Index = null;
  try {
    const indexJSONFileBuffer = await bucketRef.file(`firescan__full_text_indexes/${collection}.json`).download();
    if(indexJSONFileBuffer) {
      index = new Index();
      const indexData = JSON.parse(indexJSONFileBuffer.toString());
      for(let i = 0; i < indexData.length; i++) {
        index.import(indexData[i][0], indexData[i][1]);
      }
    }
  } catch(err) {
    index = null;
  }
  return index;
}

export async function loadFullTextIndex(bucketRef: Bucket, collection: string): Promise<Index> {
  // load index from storage
  let index = await _loadIndexFromStorage(bucketRef, collection);
  if(!index) {
    throw new Error('Full text index for "' + collection + '" not found');
  }
  
  return index;
}

export async function buildFullTextIndex(dbRef: Firestore, bucketRef: Bucket, collection: string, config: FullTextIndexConfig): Promise<Index> {
  // read all records from collection (in batches)
  const index = new Index();
  await batchQueryProcess(dbRef.collection(collection), 100, async (doc) => {
    index.add(doc.id, _recordDataToSearchableString(doc.data(), config));
  });
  await _saveIndexToStorage(bucketRef, index, collection);
  return index;
}

async function _applyIndexUpdates(dbRef: Firestore, index: Index, recordCollection: string, config: FullTextIndexConfig): Promise<QueryDocumentSnapshot[]> {
  // fetch updates from collection and apply to index
  const updates = await dbRef.collection(UPDATES_COLLECTION).where('recordCollection', '==', recordCollection).get();
  for(let update of updates.docs) {
    const { recordId, recordData } = update.data();
    if(recordData === null) {
      // delete from index
      index.remove(recordId);
    } else {
      // update index
      if(index.contain(recordId)) {
        index.update(recordId, _recordDataToSearchableString(recordData, config));
      } else {
        index.add(recordId, _recordDataToSearchableString(recordData, config));
      }
    }
  }
  return updates.docs;
}

export async function updateFullTextIndex(dbRef: Firestore, bucketRef: Bucket, recordCollection: string, config: FullTextIndexConfig): Promise<Index> {
  // load full text index
  const index = await loadFullTextIndex(bucketRef, recordCollection);

  // fetch updates from collection and apply to index
  const updates = await _applyIndexUpdates(dbRef, index, recordCollection, config);

  // store index in storage
  await _saveIndexToStorage(bucketRef, index, recordCollection);

  // delete applied updates from collection
  await parallelExecution(updates, 100, async (update) => {
    await update.ref.delete();
  });
  
  return index;
}


export async function updateFullTextIndexRecord(dbRef: Firestore, recordCollection: string, recordId: string, recordData: any): Promise<DocumentReference> {
  const documentRef = dbRef.collection(UPDATES_COLLECTION).doc(`${recordCollection}_${recordId}`);
  await documentRef.set({ recordId: recordId, recordData: recordData, recordCollection, timestamp: new Date() });
  return documentRef;
}