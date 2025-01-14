import * as admin from "firebase-admin";

const serviceAccount = require("./serviceKey.test.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
