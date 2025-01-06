import { analyzeQueryIndexes, IndexDefinition } from './SmartQuery/QueryAnalyzer';
import { Query, DocumentSnapshot } from '@google-cloud/firestore';
import { QueryOptions } from '@google-cloud/firestore/build/src/reference/query-options';

interface QueryWithQueryOptions extends Query {
  _queryOptions: QueryOptions<any, any>;
}

// when deciding how to run a query, use information from here: https://firebase.google.com/docs/firestore/query-data/queries

function getPresentIndexes(indexes: IndexDefinition[], requiredIndexes: IndexDefinition[]) {
  return requiredIndexes.filter(requiredIndex => indexes.some(index => index.fields.every(field => requiredIndex.fields.some(requiredField => requiredField.fieldPath === field.fieldPath && requiredField.order === field.order))));
}

function splitQuery(query: QueryWithQueryOptions, presentIndexes: IndexDefinition[]): { dbQuery: Query, offDbQuery: Query } {
  const db = query.firestore;
  // split query into two parts: one that can be run on the database, and one that needs to be run on the client
  const colParent = query._queryOptions.parentPath.relativeName;
  const col = colParent? colParent + '/' + query._queryOptions.collectionId : query._queryOptions.collectionId;
  const dbQuery = db.collection(col);
  const offDbQuery = db.collection(col);

  // find present compound index that supports the most filters (count) in query and apply those filters to dbQuery
  let maxCount = 0;
  let maxIndex: IndexDefinition;
  presentIndexes.forEach(index => {
    const count = query._queryOptions.filters.filter((qf: any) => index.fields.some((field => field.fieldPath === qf.field.formattedName))).length;
    if(count > maxCount) {
      maxCount = count;
      maxIndex = index;
    }
  });

  // apply filters from maxIndex to dbQuery
  query._queryOptions.filters.forEach((qf: any) => {
    if(maxIndex.fields.some(field => field.fieldPath === qf.field.formattedName)) {
      dbQuery.where(qf.field.formattedName, qf.op, qf.value);
    }
  });

  // add filters to offDb query that are not supported by indexes
  query._queryOptions.filters.forEach((qf: any) => {
    if(!maxIndex.fields.some(field => field.fieldPath === qf.field.formattedName)) {
      offDbQuery.where(qf.field.formattedName, qf.op, qf.value);
    }
  });

  // apply sorting to offDbQuery
  query._queryOptions.fieldOrders.forEach(order => {
    offDbQuery.orderBy(order.field.formattedName, order.direction === 'ASCENDING' ? 'asc' : 'desc');
  });

  // apply startAt to offDbQuery
  if(query._queryOptions.startAt) {
    offDbQuery.startAt(query._queryOptions.startAt);
  }

  // apply endAt to offDbQuery
  if(query._queryOptions.endAt) {
    offDbQuery.endAt(query._queryOptions.endAt);
  }

  // apply offset to offDbQuery
  if(query._queryOptions.offset) {
    offDbQuery.offset(query._queryOptions.offset);
  }

  // apply limit to offDbQuery
  if(query._queryOptions.limit) {
    offDbQuery.limit(query._queryOptions.limit);
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
      case '==':
        return doc.get(field) === value;
      case '<':
        return doc.get(field) < value;
      case '<=':
        return doc.get(field) <= value;
      case '>':
        return doc.get(field) > value;
      case '>=':
        return doc.get(field) >= value;
      case 'array-contains':
        return doc.get(field).includes(value);
      case 'in':
        return value.includes(doc.get(field));
      case 'array-contains-any':
        return doc.get(field).some((val: any) => value.includes(val));
      default:
        return false;
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

export async function firescan(indexes: IndexDefinition[], query: Query, keywords: string, options: FirescanOptions) {
  // get required indexes from query
  const requiredIndexes = analyzeQueryIndexes(query);
  // compare required indexes with available indexes
  const presentIndexes = getPresentIndexes(indexes, requiredIndexes);

  if(keywords) {
    throw new Error('Full text search is not supported yet');
    // if keywords are provided, use full text search (doFullTextSearch) and get document ids to include in result set after filtering is applied
  }

  let resultDocs: DocumentSnapshot[] = [];
  if(presentIndexes.length === requiredIndexes.length) {
    // all required indexes are present
    // run query
    const result = await query.get();
    resultDocs = result.docs;
  } else {
    // some or all indexes are missing, voodoo serverside processing required
    const { dbQuery, offDbQuery } = splitQuery(query as QueryWithQueryOptions, presentIndexes);

    const dbQueryCountResult = await dbQuery.count().get();
    const dbQueryDocCount = dbQueryCountResult.data().count;
    if(dbQueryDocCount >= options.maxServerSideResults) {
      throw new Error('Query exceeds server side result limit');
    }

    // run in batches
    await batchQueryProcess(dbQuery, options.batchSizeServerSideProcessing, async (batchResult) => {
      // apply filters specified in offDbQuery
      resultDocs = resultDocs.concat(applyFilters(offDbQuery as QueryWithQueryOptions, batchResult.docs));
    });

    // apply sorting
    resultDocs = applySorting(offDbQuery as QueryWithQueryOptions, resultDocs);

    // apply pagination
    resultDocs = applyPagination(offDbQuery as QueryWithQueryOptions, resultDocs);

  }

  return resultDocs;
}