import { DocumentReference, Firestore, QueryDocumentSnapshot } from '@google-cloud/firestore';
import { Bucket } from '@google-cloud/storage';
import { Index, IndexSearchResult, SearchOptions } from 'flexsearch';
import { batchQueryProcess, parallelExecution } from './util';

export { IndexSearchResult } from 'flexsearch';
export interface FullTextIndexConfig {
  fields: string[];
  tokenize: 'full' | 'forward' | 'reverse' | 'strict';
}
export interface FullTextIndex {
  _flexSearchIndex: Index;
  collection: string;
  config: FullTextIndexConfig;
  search: (query: string, options?: SearchOptions ) => IndexSearchResult;
}

async function _fullTextIndexToJSON(index: FullTextIndex): Promise<string> {
  const flexSearchIndexData: (string | number)[][] = [];
  await index._flexSearchIndex.export((key, data) => {
    flexSearchIndexData.push([key, data]);
  });
  const indexDataString = JSON.stringify({
    collection: index.collection,
    flexSearchIndexData: flexSearchIndexData,
    config: index.config,
    buildTime: (new Date()).toISOString(),
    version: '0.0.1'
  });
  return indexDataString;
}

async function _fullTextIndexFromJSON(indexDataString: string): Promise<FullTextIndex> {
  const indexData = JSON.parse(indexDataString);
  const index = new Index({
    tokenize: indexData.config.tokenize || 'strict'
  });
  for(let i = 0; i < indexData.flexSearchIndexData.length; i++) {
    index.import(indexData.flexSearchIndexData[i][0], indexData.flexSearchIndexData[i][1]);
  }
  return {
    _flexSearchIndex: index,
    collection: indexData.collection,
    config: indexData.config,
    search: (query: string, options?: SearchOptions) => index.search(query, options)
  };
}

// create cron job that will updateFullTextIndex for each collection I need full text searching on
// implement below, define how I will configure things, which fields to include for full text and also indexing
const UPDATES_COLLECTION = 'firescan__full_text_updates';

/**
 * Get field values of a record object
 * @param recordData object
 * @param field field, in dotted notation with support for arrays, so: contact.firstName will return ['John'] and contacts.firstName will return ['John','Jane']
 */
export function getFieldValues(recordData: any, field: string): string[] {
  let values: string[] = [];
  const fieldParts = field.split('.');
  let fieldData = recordData;
  for(let part of fieldParts) {
    if(fieldData && fieldData[part]) {
      if(Array.isArray(fieldData[part])) {
        for(let item of fieldData[part]) {
          if(typeof item === 'object') {
            // object
            let itemField = fieldParts.slice(fieldParts.indexOf(part) + 1).join('.');
            values = values.concat(getFieldValues(item, itemField));
          } else {
            values.push(String(item));
          }
        }
      } else {
        fieldData = fieldData[part];
        if(fieldParts.indexOf(part) === fieldParts.length - 1) {
          values.push(String(fieldData));
        }
      }
    } else {
      break;
    }
  }

  return values.filter((value) => value);
}

function _recordDataToSearchableString(recordData: any, config: FullTextIndexConfig): string {
  let searchableStringParts: string[] = [];
  for(let field of config.fields) {
    searchableStringParts = searchableStringParts.concat(getFieldValues(recordData, field));
  }
  return searchableStringParts.join(' ');
}

async function _saveIndexToStorage(bucketRef: Bucket, index: FullTextIndex, collection: string): Promise<void> {
  // save index to storage
  const indexDataString = await _fullTextIndexToJSON(index);
  await bucketRef.file(`firescan__full_text_indexes/${collection.split('/').join('__')}.json`).save(indexDataString);
}


async function _loadIndexFromStorage(bucketRef: Bucket, collection: string): Promise<FullTextIndex|null> {
  // load index from storage
  let index: null|FullTextIndex = null;
  try {
    const indexJSONFileBuffer = await bucketRef.file(`firescan__full_text_indexes/${collection.split('/').join('__')}.json`).download();
    if(indexJSONFileBuffer) {
      index = await _fullTextIndexFromJSON(indexJSONFileBuffer.toString());
    }
  } catch(err) {
    index = null;
  }
  return index;
}

export async function loadFullTextIndex(bucketRef: Bucket, collection: string): Promise<FullTextIndex> {
  // load index from storage
  let index = await _loadIndexFromStorage(bucketRef, collection);
  if(!index) {
    throw new Error('Full text index for "' + collection + '" not found');
  }
  
  return index;
}

export async function buildFullTextIndex(dbRef: Firestore, bucketRef: Bucket, collection: string, config: FullTextIndexConfig): Promise<FullTextIndex> {
  // read all records from collection (in batches)
  const index: FullTextIndex = {
    _flexSearchIndex: new Index({
      tokenize: config.tokenize || 'strict'
    }),
    collection,
    config,
    search: (query: string, options?: SearchOptions) => index._flexSearchIndex.search(query, options)
  };
  await batchQueryProcess(dbRef.collection(collection), 100, async (doc) => {
    index._flexSearchIndex.add(doc.id, _recordDataToSearchableString(doc.data(), config));
  });
  await _saveIndexToStorage(bucketRef, index, collection);
  return index;
}

async function _applyIndexUpdates(dbRef: Firestore, index: FullTextIndex, recordCollection: string, config: FullTextIndexConfig): Promise<QueryDocumentSnapshot[]> {
  // fetch updates from collection and apply to index
  const updates = await dbRef.collection(UPDATES_COLLECTION).where('recordCollection', '==', recordCollection).get();
  for(let update of updates.docs) {
    const { recordId, recordData } = update.data();
    if(recordData === null) {
      // delete from index
      index._flexSearchIndex.remove(recordId);
    } else {
      // update index
      if(index._flexSearchIndex.contain(recordId)) {
        index._flexSearchIndex.update(recordId, _recordDataToSearchableString(recordData, config));
      } else {
        index._flexSearchIndex.add(recordId, _recordDataToSearchableString(recordData, config));
      }
    }
  }
  return updates.docs;
}

export async function updateFullTextIndex(dbRef: Firestore, bucketRef: Bucket, recordCollection: string): Promise<FullTextIndex> {
  // load full text index
  const index = await loadFullTextIndex(bucketRef, recordCollection);

  // fetch updates from collection and apply to index
  const updates = await _applyIndexUpdates(dbRef, index, recordCollection, index.config);

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