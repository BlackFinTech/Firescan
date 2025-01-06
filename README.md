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



## Roadmap

- [x] firestore index generator utility
- [ ] queries with indexes present on firestore
- [ ] queries with indexes not present on firestore
- [ ] queries with indexes partially present on firestore
- [ ] full text search