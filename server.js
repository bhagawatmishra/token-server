const express = require("express");
const { v4: uuidv4 } = require("uuid");
const Redis = require("ioredis");

const app = express();
app.use(express.json());

// Create a Redis client
const redisClient = new Redis({
  host: "localhost",
  port: 6379,
});

// Initialize keys for Redis data structures
const tokenPoolKey = "tokenPool"; // Redis hash to store token data
const freeTokensSet = "freeTokensSet"; // Redis set to track free tokens
const expiredTokensZSet = "expiredTokensZSet"; // Redis sorted set to track token expirations
redisClient.del(tokenPoolKey, freeTokensSet, expiredTokensZSet);

const TOKEN_LIFETIME = 60000; // 60 seconds
const KEEP_ALIVE_THRESHOLD = 300000; // 5 minutes

// Middleware to clean up expired tokens using ZSET
setInterval(() => {
  const now = Date.now();
  redisClient.zrangebyscore(expiredTokensZSet, 0, now, (err, expiredTokens) => {
    if (err) {
      console.error(err);
      return;
    }

    // Remove expired tokens from the token pool and the free tokens set
    expiredTokens.forEach((token) => {
      redisClient.multi()
        .hdel(tokenPoolKey, token)
        .srem(freeTokensSet, token)
        .zrem(expiredTokensZSet, token)
        .exec((err) => {
          if (err) {
            console.error("Error removing expired token:", token, err);
          }
        });
    });
  });
}, 60000); // Run every minute

// 1. Endpoint to generate unique tokens in the pool
app.post("/generate", (req, res) => {
  const { count = 1 } = req.body; // Optional parameter for generating multiple tokens
  const tokens = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const token = uuidv4();
    const tokenData = { status: "free", lastAlive: now };
    redisClient.multi()
      .hset(tokenPoolKey, token, JSON.stringify(tokenData)) // Store token in the pool
      .sadd(freeTokensSet, token) // Add token to free token set
      .exec(); // Execute Redis multi-command

    tokens.push(token);
  }

  res.json({ tokens });
});

// 2. Endpoint to assign a unique token
app.get("/assign", (req, res) => {
  redisClient.srandmember(freeTokensSet, (err, token) => {
    if (err || !token) {
      return res.status(404).json({ message: "No free tokens available" });
    }

    // Block the token and update its status
    const tokenData = { status: "blocked", lastAlive: Date.now() };
    redisClient.multi()
      .hset(tokenPoolKey, token, JSON.stringify(tokenData)) // Block token in the pool
      .srem(freeTokensSet, token) // Remove token from free set
      .setex(`token:${token}:ttl`, TOKEN_LIFETIME, "") // Set TTL for automatic release
      .exec((err) => {
        if (err) {
          return res.status(500).json({ message: "Error assigning token" });
        }
        res.json({ token });
      });
  });
});

// 3. Endpoint to unblock a token
app.post("/unblock", (req, res) => {
  const { token } = req.body;

  redisClient.hget(tokenPoolKey, token, (err, tokenDataJson) => {
    if (err || !tokenDataJson) {
      return res.status(404).json({ message: "Token not found" });
    }
    const tokenData = JSON.parse(tokenDataJson);
    if (tokenData.status === "blocked") {
      tokenData.status = "free";
      tokenData.lastAlive = Date.now();

      redisClient.multi()
        .hset(tokenPoolKey, token, JSON.stringify(tokenData)) // Unblock the token
        .sadd(freeTokensSet, token) // Add token back to the free set
        .exec((err) => {
          if (err) {
            return res.status(500).json({ message: "Error unblocking token" });
          }
          res.json({ message: "Token unblocked" });
        });
    } else {
      res.status(400).json({ message: "Token is not blocked" });
    }
  });
});

/// 4. Endpoint to delete a token from the pool
app.delete("/delete", (req, res) => {
  const { token } = req.body;

  // Check if the token exists in the token pool (O(1) check)
  redisClient.hexists(tokenPoolKey, token, (err, exists) => {
    if (err) {
      return res.status(500).json({ message: "Error checking token existence" });
    }

    if (exists === 0) {
      // If the token does not exist in the pool (O(1))
      return res.status(404).json({ message: "Token not found" });
    }

    // If the token exists, delete it from tokenPool and freeTokensSet (both O(1))
    redisClient.multi()
      .hdel(tokenPoolKey, token)  // Remove from the token pool (O(1))
      .srem(freeTokensSet, token) // Remove from the free tokens set (O(1))
      .exec((err, replies) => {
        if (err) {
          return res.status(500).json({ message: "Error deleting token" });
        }
        res.json({ message: "Token deleted" });
      });
  });
});

// 5. Endpoint to keep tokens alive
app.post("/keep-alive", (req, res) => {
  const { token } = req.body;

  redisClient.hget(tokenPoolKey, token, (err, tokenDataJson) => {
    if (err || !tokenDataJson) {
      return res.status(404).json({ message: "Token not found" });
    }
    const tokenData = JSON.parse(tokenDataJson);
    tokenData.lastAlive = Date.now();

    redisClient.multi()
      .hset(tokenPoolKey, token, JSON.stringify(tokenData)) // Update lastAlive timestamp
      .zadd(expiredTokensZSet, tokenData.lastAlive + KEEP_ALIVE_THRESHOLD, token) // Reset expiration
      .exec((err) => {
        if (err) {
          return res.status(500).json({ message: "Error keeping token alive" });
        }
        res.json({ message: "Token keep-alive received" });
      });
  });
});

// 6. Endpoint to get the status of all tokens
app.get("/status", (req, res) => {
  redisClient.hkeys(tokenPoolKey, (err, tokens) => {
    if (err) {
      return res.status(500).json({ message: "Error fetching token status" });
    }

    const promises = tokens.map((token) => {
      return new Promise((resolve, reject) => {
        redisClient.hget(tokenPoolKey, token, (err, tokenDataJson) => {
          if (err) {
            reject(err);
          } else {
            const tokenData = JSON.parse(tokenDataJson);
            resolve({
              token,
              status: tokenData.status,
              lastAlive: tokenData.lastAlive,
            });
          }
        });
      });
    });

    Promise.all(promises)
      .then((results) => res.json(results))
      .catch((err) => res.status(500).json({ message: "Error fetching token status" }));
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// const express = require('express');
// const { v4: uuidv4 } = require('uuid');

// const app = express();
// app.use(express.json());

// const tokenPool = new Map(); // Store tokens with their status

// // Configurations
// const TOKEN_LIFETIME = 60000; // 60 seconds
// const KEEP_ALIVE_THRESHOLD = 300000; // 5 minutes

// // Middleware to clean up expired tokens
// setInterval(() => {
//   const now = Date.now();
//   for (const [token, tokenData] of tokenPool.entries()) {
//     // Remove tokens not kept alive within 5 minutes
//     if (now - tokenData.lastAlive > KEEP_ALIVE_THRESHOLD) {
//       tokenPool.delete(token);
//     }
//   }
// }, 60000); // Run every minute

// // 1. Endpoint to generate unique tokens in the pool
// app.post('/generate', (req, res) => {
//   const { count = 1 } = req.body; // Optional parameter for generating multiple tokens
//   const tokens = [];

//   for (let i = 0; i < count; i++) {
//     const token = uuidv4();
//     tokenPool.set(token, { status: 'free', lastAlive: Date.now() });
//     tokens.push(token);
//   }

//   res.json({ tokens });
// });

// // 2. Endpoint to assign a unique token
// app.get('/assign', (req, res) => {
//   const availableTokens = Array.from(tokenPool.entries())
//     .filter(([_, data]) => data.status === 'free');

//   if (availableTokens.length === 0) {
//     return res.status(404).json({ message: 'No free tokens available' });
//   }

//   // Randomly assign one of the available tokens
//   const [token, tokenData] = availableTokens[Math.floor(Math.random() * availableTokens.length)];
//   tokenData.status = 'blocked';
//   tokenData.assignedAt = Date.now();

//   // Automatically release after 60s
//   setTimeout(() => {
//     if (tokenPool.has(token) && tokenPool.get(token).status === 'blocked') {
//       tokenPool.set(token, { ...tokenData, status: 'free' });
//     }
//   }, TOKEN_LIFETIME);

//   res.json({ token });
// });

// // 3. Endpoint to unblock a token
// app.post('/unblock', (req, res) => {
//   const { token } = req.body;

//   if (!tokenPool.has(token)) {
//     return res.status(404).json({ message: 'Token not found' });
//   }

//   const tokenData = tokenPool.get(token);
//   if (tokenData.status === 'blocked') {
//     tokenData.status = 'free';
//     tokenData.assignedAt = null;
//     return res.json({ message: 'Token unblocked' });
//   }

//   res.status(400).json({ message: 'Token is not blocked' });
// });

// // 4. Endpoint to delete a token from the pool
// app.delete('/delete', (req, res) => {
//   const { token } = req.body;

//   if (tokenPool.delete(token)) {
//     return res.json({ message: 'Token deleted' });
//   }

//   res.status(404).json({ message: 'Token not found' });
// });

// // 5. Endpoint to keep tokens alive
// app.post('/keep-alive', (req, res) => {
//   const { token } = req.body;

//   if (!tokenPool.has(token)) {
//     return res.status(404).json({ message: 'Token not found' });
//   }

//   const tokenData = tokenPool.get(token);
//   tokenData.lastAlive = Date.now();

//   res.json({ message: 'Token keep-alive received' });
// });

// //  list of all tokens and their current status.
// app.get('/status', (req, res) => {
//     const tokenStatuses = [...tokenPool.entries()].map(([token, data]) => ({
//         token,
//         status: data.status,
//         lastAlive: data.lastAlive
//     }));

//     res.json(tokenStatuses);
// });

// // Start the server
// const PORT = process.env.PORT || 3000;
// app.listen(PORT, () => {
//   console.log(`Server running on port ${PORT}`);
// });
