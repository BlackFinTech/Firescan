# Firescan

Firescan is a powerful collection of workarounds for querying Firestore, including full-text search capabilities. It leverages the [FlexSearch](https://github.com/nextapps-de/flexsearch) library for efficient full-text search indexing and querying.

Goal of the library is to not feel constrained when querying and get the job done with minimal moving parts. This is not an ElasticSearch or Algolia replacement. Best suited for smaller projects to get things going without having to deal with complex search solutions, reinvent the wheel or rely on third parties.

It consists of three main parts:
- Compound indexes generator script (handy tool for generating compound indexes config file out of different field combinations)
- Smart firestore querying utility that uses indexes available and falls back to offline filtering
- Full text search capability

## Installation

To install Firescan, use npm:

```sh
npm install https://github.com/BlackFinTech/Firescan
```

## Compound indexes generator

### Usage

Generating compound index combinations is possible via a CLI tool:

```

npx firescan generate-compound-indexes COLLECTION_NAME FIELD1:ASC,FIELD2:DESC,FIELD3:ASC

```

Which will output JSON data ready for insertion into firestore.indexes.json file.

If you are only interested in the number of indexes, you can run:

```

npx firescan generate-compound-indexes -c COLLECTION_NAME FIELD1:ASC,FIELD2:DESC,FIELD3:ASC

```

To get the total count of indexes required for those compound fields.

## Smart Firestore Querying

To use the smart Firestore querying utility, you can use the `firescan` function. Here is an example:

```javascript
import { firescan } from 'firescan';
import * as admin from 'firebase-admin';

const db = admin.firestore();

async function queryUsers() {
  const users = await firescan([], db.collection('users').where('city', '==', 'NYC'));
  console.log(users);
}

queryUsers();
```

## Full-Text Search

Full text search is implemented using [Flexsearch](https://github.com/nextapps-de/flexsearch). Library exposes methods for:
- **building full text index** - This generates a search index based on database data and then stores the index with its conifguration in a dedicated `firescan__full_text_indexes` folder inside the bucket you choose.
- **updating full text index** - Two methods are there, one is to queue updates that should be applied next time full text index is updated and another to do the full text index update
- **loading full text index** - This loads the index from storage and prepares it for searching

Generally, the setup should be:
1. Pick a collection to enable full text search on
2. Define fields you would like to search and `tokenize` parameter value, [see this](https://github.com/nextapps-de/flexsearch?tab=readme-ov-file#tokenizer-prefix-search) for more info.
3. Deploy a hook that queues updates by calling `updateFullTextIndexRecord`, this will queue updates while you build index in next step
4. Build index using `buildFullTextIndex`
5. Deploy a cron based script that calls `updateFullTextIndex` interval is up to you, running it every 5 minutes means that the full text search index will be out of date at most 5 minutes
6. Use full text search

### Building a Full-Text Index

To build a full-text index, you can use the `buildFullTextIndex` function. Use tokenize parameter to specify how you want the search/index to behave [see this](https://github.com/nextapps-de/flexsearch?tab=readme-ov-file#tokenizer-prefix-search) for more info.

Here is an example:

```ts
import { buildFullTextIndex } from 'firescan';
import * as admin from 'firebase-admin';

const db = admin.firestore();
const bucket = admin.storage().bucket('your-bucket-name');

async function buildIndex() {
  const index = await buildFullTextIndex(db, bucket, 'users', { fields: ['name', 'city'], tokenize: 'strict' });
  console.log('Index built successfully');
}

buildIndex();
```

### Loading a Full-Text Index

To load a full-text index from storage, you can use the `loadFullTextIndex` function. Normally you would use this in a cloud function before running full text search. A good way to optimize this is to store the index in memory and reload it every X minutes.

Here is an example how to load the index:

```ts
import { loadFullTextIndex } from 'firescan';
import * as admin from 'firebase-admin';

const bucket = admin.storage().bucket('your-bucket-name');

async function loadIndex() {
  const index = await loadFullTextIndex(bucket, 'users');
  console.log('Index loaded successfully');
}

loadIndex();
```

### Updating a Full-Text Index

To update a full-text index with new or modified records, you can use the `updateFullTextIndex` function. This will take the built index and apply queueed updates you've sent via `updateFullTextIndexRecord` Here is an example:

```ts
import { updateFullTextIndex } from 'firescan';
import * as admin from 'firebase-admin';

const db = admin.firestore();
const bucket = admin.storage().bucket('your-bucket-name');

async function updateIndex() {
  const index = await updateFullTextIndex(db, bucket, 'users');
  console.log('Index updated successfully');
}

updateIndex();
```

### Updating a Single Record in the Full-Text Index

To update a single record in the full-text index, you can use the `updateFullTextIndexRecord` function. Note that this function doesn't affect the currently loaded index or even the built index, all it does is queue the update for later processing when `updateFullTextIndex` is called.

When you would like a record in full text index deleted (i.e. document has been deleted), then specify `recordData` as `null`.

Here is an example:

```ts
import { updateFullTextIndexRecord } from 'firescan';
import * as admin from 'firebase-admin';

const db = admin.firestore();

async function updateRecord() {
  const recordId = 'record-id';
  const recordData = { name: 'John Doe', city: 'NYC' };
  await updateFullTextIndexRecord(db, 'users', recordId, recordData);
  console.log('Record updated successfully');
}

updateRecord();
```

### Performing a Full-Text Search

To perform a full-text search, you need to use the `firescan` function with the `fullTextIndex` option. Here is an example:

```ts
import { buildFullTextIndex, firescan } from 'firescan';
import * as admin from 'firebase-admin';

const db = admin.firestore();
const bucket = admin.storage().bucket('your-bucket-name');

async function fullTextSearch() {
  const index = await buildFullTextIndex(db, bucket, 'users', { fields: ['name', 'city'], tokenize: 'strict' });
  const users = await firescan([], db.collection('users'), 'John', { fullTextIndex: index });
  console.log(users);
}

fullTextSearch();
```

## Roadmap

- [x] firestore index generator utility
- [x] queries with indexes present on firestore
- [x] queries with indexes not present OR partially present on firestore
- [x] testing queries with partial indexes
- [x] full text search
- [ ] able to apply updates from temporary updates collection on index load so an always up to date full text search would be possible
- [ ] improve partial querying when compound index supports filters but doesn't support orderby, in that case, the filters should run entirely on db and ordering, pagination on serverside
- [ ] support for skipping query count check
- [ ] support for optimizing dbQuery on partial index queries so that you can specify which fields to filter by first
- [ ] support for startAt and endAt on partial index queries