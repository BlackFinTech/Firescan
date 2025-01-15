export async function parallelExecution<T>(items: T[], limit: number, operations: (item: T) => Promise<void>): Promise<void> {
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

export async function batchQueryProcess(
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