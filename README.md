# Firescan

Firescan is a powerful utility library for querying Firestore, including full-text search capabilities. It leverages the [FlexSearch](https://github.com/nextapps-de/flexsearch) library for efficient full-text search indexing and querying. It is a collection of workarounds to firestore querying limitations.

Goal of the library is to not feel contstrained when querying and get the job done with minimal moving parts. This is not an ElasticSearch or Algolia replacement. Best suited for smaller projects to get things going without having to deal with complex search solutions, reinvent the wheel or rely on third parties.

## Installation

To install Firescan, use npm:

```sh
npm install firescan
```

## Usage

### Generate compound index combinations

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

## Roadmap

- [x] firestore index generator utility
- [ ] queries with indexes present on firestore
- [ ] queries with indexes not present on firestore
- [ ] queries with indexes partially present on firestore
- [ ] full text search