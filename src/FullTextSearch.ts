// use https://github.com/nextapps-de/flexsearch for full text search

// create cron job that will updateFullTextIndex for each collection I need full text searching on
// implement below, define how I will configure things, which fields to include for full text and also indexing

async function loadFullTextIndex(collection) {
  // check if in memory, return index;
  // load index from storage, if not there, buildFullTextIndex
  // load updates that happened since last index build from database
  // store in memory for X minutes
  // return index
}

async function buildFullTextIndex(collection, config) {
  // read all records from collection (in batches)
  // timestamp the read
  // build the index based on config
  // store index in storage + wipe updates records since last read (fetching all records), note that this may still result in a data loss (writes that happened while batched reads took place)
}

async function updateFullTextIndex(collection, config) {
  // load full text index
  // fetch updates from collection
  // apply updates to index
  // store index in storage
  // delete applied updates from collection
}


async function updateFullTextIndexRecord(collection, recordId, recordData) {
  // store in the updates collection
}

async function doFullTextSearch(collection, keywords, options) {
  // load index in memory
  // search index for keywords
  // return document ids
}