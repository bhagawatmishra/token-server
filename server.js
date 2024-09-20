const express = require("express");
const { v4: uuidv4 } = require("uuid");
const Redis = require("ioredis");

const app = express();
app.use(express.json());

// Create a Redis client using environment variables for host and port
const redisClient = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: process.env.REDIS_PORT || 6379,
});

// Initialize the token pool in Redis
const tokenPoolKey = "tokenPool";
redisClient.del(tokenPoolKey);

const TOKEN_LIFETIME = 60000; // 60 seconds
const KEEP_ALIVE_THRESHOLD = 300000; // 5 minutes

// Middleware to clean up expired tokens
setInterval(() => {
  const now = Date.now();
  redisClient.hkeys(tokenPoolKey, (err, tokens) => {
    if (err) {
      console.error(err);
      return;
    }
    tokens.forEach((token) => {
      redisClient.hget(tokenPoolKey, token, (err, tokenData) => {
        if (err) {
          console.error(err);
          return;
        }
        const tokenDataJson = JSON.parse(tokenData);
        if (now - tokenDataJson.lastAlive > KEEP_ALIVE_THRESHOLD) {
          redisClient.hdel(tokenPoolKey, token);
        }
      });
    });
  });
}, 60000); // Run every minute

// 1. Endpoint to generate unique tokens in the pool
app.post("/generate", (req, res) => {
  const { count = 1 } = req.body; // Optional parameter for generating multiple tokens
  const tokens = [];

  for (let i = 0; i < count; i++) {
    const token = uuidv4();
    const tokenData = { status: "free", lastAlive: Date.now() };
    redisClient.hset(tokenPoolKey, token, JSON.stringify(tokenData));
    tokens.push(token);
  }

  res.json({ tokens });
});

// 2. Endpoint to assign a unique token
app.get("/assign", (req, res) => {
  redisClient.hkeys(tokenPoolKey, (err, tokens) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: "Error assigning token" });
    }
    const availableTokens = tokens.filter(async (token) => {
      const tokenDataJson = await redisClient.hget(tokenPoolKey, token);
      const tokenData = JSON.parse(tokenDataJson);
      return tokenData.status === "free";
    });

    if (availableTokens.length === 0) {
      return res.status(404).json({ message: "No free tokens available" });
    }

    // Randomly assign one of the available tokens
    const token =
      availableTokens[Math.floor(Math.random() * availableTokens.length)];
    const tokenData = { status: "blocked", lastAlive: Date.now() };
    redisClient.eval(
      `
    local tokenPool = "${tokenPoolKey}"
    local tokenId = "${token}"
    local tokenData = cjson.decode(ARGV[1])
    redis.call("HSET", tokenPool, tokenId, cjson.encode(tokenData))
    `,
      0,
      JSON.stringify(tokenData),
      (err, reply) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ message: "Error assigning token" });
        }
      }
    );

    // Set TTL for automatic token release
    redisClient.setex(`token:${token}:ttl`, TOKEN_LIFETIME, "");

    res.json({ token });
  });
});

// 3. Endpoint to unblock a token
app.post("/unblock", (req, res) => {
  const { token } = req.body;

  redisClient.hget(tokenPoolKey, token, (err, tokenDataJson) => {
    if (err) {
      console.error(err);
      return res.status(404).json({ message: "Token not found" });
    }
    if (tokenDataJson === null) {
      return res.status(404).json({ message: "Token not found" });
    }
    const tokenData = JSON.parse(tokenDataJson);
    if (tokenData.status === "blocked") {
      tokenData.status = "free";
      tokenData.lastAlive = Date.now(); // Set lastAlive to current timestamp
      redisClient.hset(tokenPoolKey, token, JSON.stringify(tokenData));
      return res.json({ message: "Token unblocked" });
    }

    res.status(400).json({ message: "Token is not blocked" });
  });
});

// 4. Endpoint to delete a token from the pool
app.delete("/delete", (req, res) => {
  const { token } = req.body;

  redisClient.hdel(tokenPoolKey, token, (err, count) => {
    if (err) {
      console.error(err);
      return res.status(404).json({ message: "Token not found" });
    }
    if (count === 1) {
      return res.json({ message: "Token deleted" });
    } else {
      return res.status(404).json({ message: "Token not found" });
    }
  });
});

// 5. Endpoint to keep tokens alive
app.post("/keep-alive", (req, res) => {
  const { token } = req.body;

  redisClient.hget(tokenPoolKey, token, (err, tokenDataJson) => {
    if (err) {
      console.error(err);
      return res.status(404).json({ message: "Token not found" });
    }
    const tokenData = JSON.parse(tokenDataJson);
    tokenData.lastAlive = Date.now();
    redisClient.hset(tokenPoolKey, token, JSON.stringify(tokenData));

    res.json({ message: "Token keep-alive received" });
  });
});

// List of all tokens and their current status.
app.get("/status", (req, res) => {
  redisClient.hkeys(tokenPoolKey, (err, tokens) => {
    if (err) {
      console.error(err);
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
              assignedAt: tokenData.assignedAt,
              lastAlive: tokenData.lastAlive,
            });
          }
        });
      });
    });

    // Wait for all promises to resolve before sending the response
    Promise.all(promises)
      .then((results) => {
        res.json(results);
      })
      .catch((err) => {
        console.error(err);
        res.status(500).json({ message: "Error fetching token status" });
      });
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
