import { analyzeQueryIndexes, IndexDefinition } from './SmartQuery/QueryAnalyzer';
import { Query, QuerySnapshot } from '@google-cloud/firestore';

// when deciding how to run a query, use information from here: https://firebase.google.com/docs/firestore/query-data/queries



export async function firescan(indexes: IndexDefinition[], query: Query, keywords: string, options) {
  // get required indexes from query
  const requiredIndexes = analyzeQueryIndexes(query);
  // compare required indexes with available indexes
  const presentIndexes: IndexDefinition[] = [];
  requiredIndexes.forEach(requiredIndex => {
    // check fieldPath and ascending/descending order
    if(indexes.some(index => index.fields.every(field => requiredIndex.fields.some(requiredField => requiredField.fieldPath === field.fieldPath && requiredField.order === field.order)))) {
      presentIndexes.push(requiredIndex);
    }
  });

  if(keywords) {
    throw new Error('Full text search is not supported yet');
    // if keywords are provided, use full text search (doFullTextSearch) and get document ids to include in result set after filtering is applied
  }

  let result: QuerySnapshot;
  if(presentIndexes.length === requiredIndexes.length) {
    // all required indexes are present
    // run query
    result = await query.get();
  } else {
    // some indexes are missing, voodoo magic required
    // apply filtering, sorting and pagination on database level on best effort basis
    // get number of results
    // verify number of results doesnt exceed the limit to process serverside.
    //          Exception if keywords are provided: 
    //                            if number of results from keyword search exceeds the db filter result count and both exceed the max limit, return error, 
    //                            otherwise, if keyword search result set is less than the max limit, then retrieve results from database and apply filtering afterwards serverside
  // batch query results
  // apply filter & sort & pagination serverside until you get all results required

  }

}