// -----------------------------
// SHARING VERSION - SENSITIVE INFO REMOVED
// - Private keys, RPC URLs, and API keys are omitted
// - CORS origins replaced with safe dummy values
// - Blockchain initialization simplified
// - Swap event listener configured with placeholder
// -----------------------------

// Global BigInt JSON serialization fix
BigInt.prototype.toJSON = function () {
  return this.toString();
};

const cors = require("cors");
const morgan = require("morgan");
const express = require("express");
const dotenv = require("dotenv");
const readline = require("readline");

// Blockchain initialization placeholder
const { initializeBlockchain } = require("./config/blockchain");

// Load env vars
dotenv.config({ path: "./.env" });

// -----------------------------
// Secure passphrase input
// -----------------------------
async function getPassphrase() {
  if (process.env.PASSPHRASE) {
    return process.env.PASSPHRASE;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  return new Promise((resolve) => {
    rl.question("Enter passphrase for private key: ", (passphrase) => {
      rl.close();
      resolve(passphrase);
    });
  });
}

// -----------------------------
// Start the server
// -----------------------------
(async () => {
  process.env.PASSPHRASE = await getPassphrase();

  // IMPORTANT: Blockchain initialization with private keys removed for sharing
  initializeBlockchain();

  const app = express();

  // Express setup
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  // Allowed Origin list (dummy placeholders for sharing)
  const allowedOrigins = [
    // IMPORTANT: Real origins removed for sharing. Replace with your domains.
    "https://example.com",
    "http://localhost:3000"
  ];

  // CORS options with logging
  const corsOptions = {
    origin: function (origin, callback) {
      console.log('Incoming request Origin:', origin);

      if (!origin) {
        console.log('No origin, allowing request');
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        console.log('Origin allowed:', origin);
        callback(null, true);
      } else {
        console.log('Origin rejected:', origin);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization']
  };

  app.use(cors(corsOptions));

  // OPTIONS request logging (preflight)
  app.options('*', cors(corsOptions), (req, res) => {
    console.log('Handling OPTIONS preflight for', req.headers.origin);
    res.sendStatus(204);
  });

  // Dev middleware Morgan
  app.use(morgan("dev"));

  // Route files
  const walletRouter = require("./routes/walletRouter.js");
  const adminRouter = require("./routes/adminRouter.js");

  // Mount routers
  app.use("/api/v1/wallet", walletRouter);
  app.use("/api/v1/admin", adminRouter);

  // Handling other routes
  app.get("*", (req, res) => {
    res.send("Server is running!");
  });

  // Access env vars
  const PORT = process.env.PORT || 8080;

  const server = app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });

  // -----------------------------
  // Swap Event Listener Placeholder
  // -----------------------------
  // IMPORTANT: RPC URL and poolContract initialization removed for security
  // This is where swap event listener would be set up
  // poolContract.on("Swap", async (sender, recipient, amount0, amount1, sqrtPriceX96, liquidity, tick, event) => {
  //   try {
  //     console.log("Swap detected:", { sender, recipient, amount0, amount1 });
  //     // Logic omitted for sharing
  //   } catch (err) {
  //     console.error("Swap listener error:", err);
  //   }
  // });

  // -----------------------------
  // Error handling
  // -----------------------------
  app.use((err, req, res, next) => {
    console.log("Async error handler");

    if (err.name === "ValidationError") {
      return res.status(400).json(err.errors);
    }
    if (err.name === "CastError") {
      return res.status(404).json(err.errors);
    } else {
      console.log(err);
    }

    return res.status(500).json(err);
  });

  // Handle unhandled promise rejections
  process.on("unhandledRejection", (err, promise) => {
    console.log(`Unhandled Error: ${err}`);
  });
})();