require('./../init');
import * as admin from "firebase-admin";

const db = admin.firestore();

async function createUser(name: string, age: number, city: string) {
  const userRef = db.collection('users').doc();
  await userRef.set({
    name: name,
    age: age,
    city: city,
  });
}


async function createUserAction(userId: string, label: string) {
  await db.collection('users').doc(userId).collection('actions').add({
    label: label,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function generateSampleData() {
  const sampleUsers = [
    { name: 'John', age: 25, city: 'NYC' },
    { name: 'Jane', age: 30, city: 'LA' },
    { name: 'Mike', age: 21, city: 'NYC' },
    { name: 'Sara', age: 40, city: 'Chicago' },
    { name: 'Tom', age: 35, city: 'NYC' },
    { name: 'Anna', age: 28, city: 'LA' },
    { name: 'Bob', age: 22, city: 'Chicago' },
    { name: 'Alice', age: 65, city: 'NYC' },
  ];

  for (const user of sampleUsers) {
    await createUser(user.name, user.age, user.city);
  }

  // get users
  const users = await db.collection('users').get();
  // loop through users and insert actions
  users.forEach(async user => {
    await createUserAction(user.id, 'login');
    await createUserAction(user.id, 'logout');
  });

  console.log('Sample data generated successfully!');
}

generateSampleData().catch(console.error);