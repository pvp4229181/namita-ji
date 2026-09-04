const mongoose = require('mongoose');

// Cached across invocations so warm serverless instances reuse the connection
// instead of reconnecting on every request.
let connectionPromise = null;

function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI is not set — database calls will fail until it is configured.');
    return Promise.resolve();
  }

  if (!connectionPromise) {
    connectionPromise = mongoose
      .connect(uri)
      .then((conn) => {
        console.log('MongoDB connected:', conn.connection.host);
        return conn;
      })
      .catch((err) => {
        console.error('MongoDB connection error:', err.message);
        connectionPromise = null; // allow a retry on the next request/invocation
        throw err;
      });
  }

  return connectionPromise;
}

module.exports = connectDB;
