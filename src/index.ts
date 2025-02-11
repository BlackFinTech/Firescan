import { analyzeQueryIndexes, IndexDefinition, isMultipleInequalityFilters } from './SmartQuery/QueryAnalyzer';
import { Query, DocumentSnapshot, Firestore } from '@google-cloud/firestore';
import { Bucket } from '@google-cloud/storage';
import { QueryOptions } from '@google-cloud/firestore/build/src/reference/query-options';
import { buildFullTextIndex, 
  updateFullTextIndexRecord,
  updateFullTextIndex,
  loadFullTextIndex, FullTextIndex, FullTextIndexConfig, IndexSearchResult } from './FullTextSearch';
import { parallelExecution } from './util';

interface QueryWithQueryOptions extends Query {
  _queryOptions: QueryOptions<any, any>;
}

const OP_CONST_TO_OP: { [key: string]: FirebaseFirestore.WhereFilterOp } = {
  'EQUAL': '==',
  'GREATER_THAN': '>',
  'GREATER_THAN_OR_EQUAL': '>=',
  'LESS_THAN': '<',
  'LESS_THAN_OR_EQUAL': '<=',
  'ARRAY_CONTAINS': 'array-contains',
  'IN': 'in',
  'ARRAY_CONTAINS_ANY': 'array-contains-any'
}

// when deciding how to run a query, use information from here: https://firebase.google.com/docs/firestore/query-data/queries

function getPresentIndexes(indexes: IndexDefinition[], requiredIndexes: IndexDefinition[]) {
  let presentIndexes: IndexDefinition[] = [];
  presentIndexes = requiredIndexes.filter(requiredIndex => {
    const isSameIndexPresent = indexes.some(index => {
      const everyFieldPresent = index.fields.length === requiredIndex.fields.length && index.fields.every(field => {
        const isFieldPresentInRequiredIndex = requiredIndex.fields.some(requiredField => requiredField.fieldPath === field.fieldPath && requiredField.order === field.order);
        return isFieldPresentInRequiredIndex;
      })
      return everyFieldPresent;
    });
    return isSameIndexPresent;
  });
  return presentIndexes;
}

function _queryToCollectionRef(query: QueryWithQueryOptions): FirebaseFirestore.CollectionReference {
  const colParent = query._queryOptions.parentPath.relativeName;
  const col = colParent? colParent + '/' + query._queryOptions.collectionId : query._queryOptions.collectionId;
  return query.firestore.collection(col);
}

interface QueryFilterField {
  formattedName: string;
  fieldPath: string;
}

interface QueryFilter {
  field: QueryFilterField;
  op: string;
  value: any;
}

function splitQuery(query: QueryWithQueryOptions, presentIndexes: IndexDefinition[]): { dbQuery: Query, offDbQuery: Query } {
  // split query into two parts: one that can be run on the database, and one that needs to be run on the client
  const dbCollection = _queryToCollectionRef(query);
  const offDbCollection = _queryToCollectionRef(query);
  let dbQuery : Query = dbCollection;
  let offDbQuery : Query = offDbCollection;

  const allFilters = (query._queryOptions.filters as unknown) as QueryFilter[];
  const qFilters: QueryFilter[] = [];
  const unsupportedDBFilters: QueryFilter[] = [];
  for(let filter of allFilters) {
    // only a single IN filter can be done on database
    if(filter.op === 'IN' && qFilters.find((f: any) => f.op === 'IN')) {
      unsupportedDBFilters.push(filter);
    } else {
      qFilters.push(filter);
    }
  }

  // find present compound index that supports the most filters (count) in query and apply those filters to dbQuery
  let maxCount = 0;
  let maxIndex: IndexDefinition | null = null;
  presentIndexes.forEach(index => {
    const count = qFilters.filter((qf: any) => index.fields.some((field => field.fieldPath === qf.field.formattedName))).length;
    if(count === qFilters.length && count > maxCount) {
      // best index has the most fields of query covered
      maxCount = count;
      maxIndex = index;
    }
  });

  if(!maxIndex) {
    // no compound indexes available, add all equality filters to dbQuery
    const qfs: any[] = qFilters.filter((qf: any) => qf.op === 'EQUAL' || qf.op === 'IN' || qf.op === 'ARRAY_CONTAINS' || qf.op === 'ARRAY_CONTAINS_ANY');
    for(const qf of qfs) {
      dbQuery = dbQuery.where(qf.field.formattedName, OP_CONST_TO_OP[qf.op], qf.value);
    }
  } else {
    // compound available, apply filters from maxIndex to dbQuery
    qFilters.forEach((qf: any) => {
      if(maxIndex && maxIndex.fields.some(field => field.fieldPath === qf.field.formattedName)) {
        dbQuery = dbQuery.where(qf.field.formattedName, OP_CONST_TO_OP[qf.op], qf.value);
      }
    });
  }

  // add filters to offDb query that are not supported by indexes
  qFilters.forEach((qf: any) => {
    if(!maxIndex || !maxIndex.fields.some(field => field.fieldPath === qf.field.formattedName)) {
      offDbQuery = offDbQuery.where(qf.field.formattedName, OP_CONST_TO_OP[qf.op], qf.value);
    }
  });

  // add filters to offDb that are unsupported by database
  unsupportedDBFilters.forEach((qf) => {
    offDbQuery = offDbQuery.where(qf.field.formattedName, OP_CONST_TO_OP[qf.op], qf.value);
  });

  // apply sorting to offDbQuery
  query._queryOptions.fieldOrders.forEach(order => {
    offDbQuery = offDbQuery.orderBy(order.field.formattedName, order.direction === 'ASCENDING' ? 'asc' : 'desc');
  });

  // apply startAt to offDbQuery
  if(query._queryOptions.startAt) {
    offDbQuery = offDbQuery.startAt(query._queryOptions.startAt);
  }

  // apply endAt to offDbQuery
  if(query._queryOptions.endAt) {
    offDbQuery = offDbQuery.endAt(query._queryOptions.endAt);
  }

  // apply offset to offDbQuery
  if(query._queryOptions.offset) {
    offDbQuery = offDbQuery.offset(query._queryOptions.offset);
  }

  // apply limit to offDbQuery
  if(query._queryOptions.limit) {
    offDbQuery = offDbQuery.limit(query._queryOptions.limit);
  }

  // return both queries
  return { dbQuery, offDbQuery };
}


async function batchQueryProcess(query: Query, limit: number, processor: (doc: any) => Promise<void>) {
  let result = await query.limit(limit).get();
  let i = 0;
  while (result.docs.length > 0) {
    i += limit;
    await processor(result.docs);
    let last = result.docs[result.docs.length - 1];
    result = await query.limit(limit).startAfter(last).get();
  }
};

interface FirescanOptions {
  fullTextIndex: FullTextIndex | null;
  fullTextSuggest?: boolean;
  batchSizeServerSideProcessing?: number;
  maxServerSideResults?: number;
}
interface FirescanOptionsRequired {
  fullTextIndex: FullTextIndex | null;
  fullTextSuggest: boolean;
  batchSizeServerSideProcessing: number;
  maxServerSideResults: number;
}

// apply query filters client side
function applyFilters(query: QueryWithQueryOptions, docs: DocumentSnapshot[]) {
  // read filters from query
  const filters = query._queryOptions.filters;
  // apply filters to docs
  return docs.filter(doc => filters.every((filter: any) => {
    const field = filter.field.formattedName;
    const value = filter.value;
    switch(filter.op) {
      case 'EQUAL':
        return doc.get(field) === value;
      case 'LESS_THAN':
        return doc.get(field) < value;
      case 'LESS_THAN_OR_EQUAL':
        return doc.get(field) <= value;
      case 'GREATER_THAN':
        return doc.get(field) > value;
      case 'GREATER_THAN_OR_EQUAL':
        return doc.get(field) >= value;
      case 'ARRAY_CONTAINS':
        return doc.get(field).includes(value);
      case 'IN':
        return value.includes(doc.get(field));
      case 'ARRAY_CONTAINS_ANY':
        return doc.get(field).some((val: any) => value.includes(val));
      default:
        throw new Error('Unsupported filter operator: ' + filter.op);
    }
  }));
}

// apply sorting client side
function applySorting(query: QueryWithQueryOptions, docs: DocumentSnapshot[]) {
  // read sorting from query
  const sorting = query._queryOptions.fieldOrders;
  // apply sorting to docs
  return docs.sort((a, b) => {
    for(const order of sorting) {
      const field = order.field.formattedName;
      if(a.get(field) < b.get(field)) {
        return order.direction === 'ASCENDING' ? -1 : 1;
      } else if(a.get(field) > b.get(field)) {
        return order.direction === 'ASCENDING' ? 1 : -1;
      }
    }
    return 0;
  });
}

// apply pagination client side
function applyPagination(query: QueryWithQueryOptions, docs: DocumentSnapshot[]) {
  // read pagination from query
  const offset = query._queryOptions.offset;
  const limit = query._queryOptions.limit;
  // apply pagination to docs
  if(offset) {
    docs = docs.slice(offset);
  }
  if(limit) {
    docs = docs.slice(0, limit);
  }
  return docs;
}

export async function firescan(indexes: IndexDefinition[], query: Query, keywords?: string, opt?: FirescanOptions) {
  const options = Object.assign({ batchSizeServerSideProcessing: 1000, maxServerSideResults: 50000, fullTextIndex: null, fullTextSuggest: false }, opt) as FirescanOptionsRequired;
  let totalCount = 0;
  
  const isMultiInequality = isMultipleInequalityFilters(query);
  // get required indexes from query
  const requiredIndexes = analyzeQueryIndexes(query);
  // compare required indexes with available indexes
  const presentIndexes = getPresentIndexes(indexes, requiredIndexes);

  let keywordSearchResults: IndexSearchResult|null = null;
  if(keywords) {
    const { fullTextIndex } = options;
    if(!fullTextIndex) {
      throw new Error('Full text search index is required to perform keyword search');
    }
    keywordSearchResults = fullTextIndex.search(keywords, { suggest: options.fullTextSuggest });
  }

  let resultDocs: DocumentSnapshot[] = [];
  if(!isMultiInequality && presentIndexes.length === requiredIndexes.length) {
    
    // all required indexes are present
    if(keywordSearchResults) {
      const limitlessQuery = query.limit(0);
      const dbQueryCountResult = await limitlessQuery.count().get();
      const dbQueryDocCount = dbQueryCountResult.data().count;
      if(keywordSearchResults.length < dbQueryDocCount && keywordSearchResults.length < options.maxServerSideResults) {
        // instead of running db query, get all keyword search results one by one because there are fewer of them
        const dbCol = _queryToCollectionRef(limitlessQuery as QueryWithQueryOptions);
        await parallelExecution(keywordSearchResults, options.batchSizeServerSideProcessing, async (documentId) => {
          const doc = await dbCol.doc(documentId as string).get();
          if(doc.exists) {
            resultDocs.push(doc);
          }
        });
      } else {
        // run db query
        const result = await limitlessQuery.get();
        resultDocs = result.docs;
        // limit results to those matching full text search
        resultDocs = resultDocs.filter(doc => keywordSearchResults.includes(doc.id));
      }
      totalCount = resultDocs.length
      // apply pagination
      resultDocs = applyPagination(query as QueryWithQueryOptions, resultDocs);
    } else {
      // get total count (remove limit from query)
      const countQuery = query.limit(0).count();
      const dbQueryCountResult = await countQuery.get();
      totalCount = dbQueryCountResult.data().count;
      // run db query
      const result = await query.get();
      resultDocs = result.docs;
    }
  } else {
    // some or all indexes are missing, voodoo serverside processing required
    const { dbQuery, offDbQuery } = splitQuery(query as QueryWithQueryOptions, presentIndexes);

    const dbQueryCountResult = await dbQuery.count().get();
    const dbQueryDocCount = dbQueryCountResult.data().count;
    if(keywordSearchResults && keywordSearchResults.length < dbQueryDocCount && keywordSearchResults.length < options.maxServerSideResults) {
      // instead of running db query, get all keyword search results one by one because there are fewer of them
      const dbCol = _queryToCollectionRef(query as QueryWithQueryOptions);
      await parallelExecution(keywordSearchResults, options.batchSizeServerSideProcessing, async (documentId) => {
        const doc = await dbCol.doc(documentId as string).get();
        if(doc.exists) {
          resultDocs.push(doc);
        }
      });
    } else if(dbQueryDocCount < options.maxServerSideResults) {
      // run in batches
      await batchQueryProcess(dbQuery, options.batchSizeServerSideProcessing, async (batchResult) => {
        // apply filters specified in offDbQuery
        resultDocs = resultDocs.concat(applyFilters(offDbQuery as QueryWithQueryOptions, batchResult));
      });
    } else {
      throw new Error('Query exceeds server side result limit');
    }

    // apply full text search
    if(keywordSearchResults) {
      resultDocs = resultDocs.filter(doc => keywordSearchResults.includes(doc.id));
    }

    // apply sorting
    resultDocs = applySorting(offDbQuery as QueryWithQueryOptions, resultDocs);

    totalCount = resultDocs.length;

    // apply pagination
    resultDocs = applyPagination(offDbQuery as QueryWithQueryOptions, resultDocs);
  }

  return {
    results: resultDocs,
    totalCount: totalCount
  };
}

interface ICollectionFirescanConfig {
  firestoreRef: Firestore;
  firestoreIndexes: IndexDefinition[];
  collectionPath: string;
  bucketRef?: Bucket;
  fullTextIndexConfig?: FullTextIndexConfig;
  fullTextSuggest?: boolean;
  maxServerSideResults?: number;
  batchSizeServerSideProcessing?: number;
}

export function getCollectionFirescan(config: ICollectionFirescanConfig) {
  let fullTextIndex: FullTextIndex | null = null;

  return {
    run: async function run(query: Query, keywords?: string) {
      return firescan(config.firestoreIndexes, query, keywords, {
        fullTextSuggest: config.fullTextSuggest || false,
        maxServerSideResults: config.maxServerSideResults || 50000,
        batchSizeServerSideProcessing: config.batchSizeServerSideProcessing || 1000,
        fullTextIndex: fullTextIndex
      });
    },
    isFullTextLoaded: function isFullTextLoaded(): boolean {
      return fullTextIndex !== null;
    },
    buildFullTextIndex: async function _buildFullTextIndex() {
      if(!config.bucketRef) {
        throw new Error('Bucket reference is required to build full text index');
      }
      if(!config.fullTextIndexConfig) {
        throw new Error('Full text index config is required to build full text index');
      }
      fullTextIndex = await buildFullTextIndex(config.firestoreRef, config.bucketRef, config.collectionPath, config.fullTextIndexConfig);
    },
    loadFullTextIndex: async function _loadFullTextIndex() {
      if(!config.bucketRef) {
        throw new Error('Bucket reference is required to load full text index');
      }
      fullTextIndex = await loadFullTextIndex(config.bucketRef, config.collectionPath);
    },
    updateFullTextIndex: async function _updateFullTextIndex() {
      if(!config.bucketRef) {
        throw new Error('Bucket reference is required to update full text index');
      }
      fullTextIndex = await updateFullTextIndex(config.firestoreRef, config.bucketRef, config.collectionPath);
    },
    updateFullTextIndexRecord: async function _updateFullTextIndexRecord(recordId: string, recordData: object | null) {
      await updateFullTextIndexRecord(config.firestoreRef, config.collectionPath, recordId, recordData);
    }
  }
}