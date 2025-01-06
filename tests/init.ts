var admin = require("firebase-admin");

var serviceAccount = require("./serviceKey.test.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
