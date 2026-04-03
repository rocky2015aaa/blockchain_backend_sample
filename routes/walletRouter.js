// Backend routes
// routes/walletRouter.js
// NOTE: Some endpoints have been omitted for brevity / security purposes
const express = require("express");
const asyncHandler = require("express-async-handler");


const {
  distributeTokens,
  verifyTokensTransferredInATransaction,
} = require("../controllers/tokensController");
const {
  getPermissions,
  approveSpender,
  cancelPermission
} = require("../controllers/permissionsController");

const { authMiddleware } = require("../middleware/auth.js");

const walletRouter = express.Router();

walletRouter.get("/twap/price", asyncHandler(getTwapPrice));
walletRouter.get("/credits", asyncHandler(getUserCredits));

walletRouter.post(
  "/transfer/details",
  asyncHandler(verifyTokensTransferredInATransaction)
);

walletRouter.post("/sponsor", asyncHandler(sponsorTransaction));


walletRouter.post(
  "/membership/platform/subscribe",
  authMiddleware,
  asyncHandler(buyPlatformSubscription)
);
walletRouter.post(
  "/membership/platform/cancel",
  authMiddleware,
  asyncHandler(cancelPlatformSubscription)
);

module.exports = walletRouter;