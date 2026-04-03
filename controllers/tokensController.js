// Blockchain initialization logic omitted for brevity

exports.distributeTokens = async (req, res) => {
  try {
    const { address, amount, txHash } = req.body;

    // Validate required parameters
    if (!address || !amount || !txHash) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: address, amount or transaction hash'
      });
    }

    // Validate address format
    if (!ethers.isAddress(address)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid wallet address format'
      });
    }

    // Validate amount
    const tokenAmount = parseFloat(amount);
    if (isNaN(tokenAmount) || tokenAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount. Must be a positive number'
      });
    }

    // Call the helper function to distribute tokens
    const result = await distributeTokens(address, tokenAmount, txHash);

    if (result.success) {
      return res.status(200).json({
        success: true,
        message: 'Tokens distributed successfully',
        txHash: result.txHash,
        amount: tokenAmount,
        recipient: address
      });
    } else {
      return res.status(500).json({
        success: false,
        message: result.message || 'Failed to distribute tokens',
        error: result.error
      });
    }
  } catch (error) {
    console.error('Error in distributeTokens:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

/**
 * Calculates the amount of tokens received from a swap transaction
 * @param {string} address - The user's wallet address
 * @param {string} tokenAddress - The address of the token being swapped to
 * @param {string} txHash - The transaction hash of the swap
 * @returns {Promise<number>} The amount of tokens received from the swap
 */
exports.getSwapAmountReceived = async (req, res) => {
  try {
    const { address, txHash, tokenAddress } = req.body;
    if (!address || !txHash || !tokenAddress) {
      return res.status(400).json({ success: false, message: 'Missing parameters' });
    }

    const amountReceived = await getSwapTokenAmount(address, tokenAddress, txHash);
    const distributionTxHash = await distributeTokens(address, amountReceived, txHash);

    return res.status(200).json({
      success: true,
      amountReceived: parseFloat(amountReceived),
      distributionTxHash,
    });
  } catch (error) {
    console.error('Error processing swap amount or distribution:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/*
{
  "txHash": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
  "from": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "to": "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "amount": 100
}
*/
exports.verifyTokensTransferredInATransaction = async (req, res) => {
  const { txHash, from, to, amount } = req.body;

  if (!txHash || !from || !to || !amount)
    return res.status(400).json("Please send all the parameters");

  const isCorrect = await areTokensTransferredCorrectly(
    txHash,
    from,
    to,
    amount
  );

  return res.status(200).json({ success: true, isCorrect });
};

exports.transferTokens = async (req, res) => {
  try {
    const timestamp = req.headers['x-timestamp'];
    const nonce = req.headers['x-nonce'];
    const signature = req.headers['x-signature'];

    if (!timestamp || !nonce || !signature) {
      return res.status(401).json({ error: 'Missing authentication headers' });
    }
    const payload = JSON.stringify(req.body);
    // Generate server-side signature
    const signingString = [payload, timestamp, nonce].join('|');
    const expectedSignature = crypto.createHmac('sha256', SECRET)
                                    .update(signingString)
                                    .digest('hex');

    // Compare signatures using constant-time comparison
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { wallet, tokenContract } = await getMethods(); // wallet contains private key
    const { data } = req.body; // Expecting format: [{address, amount}, ...]

    if (!Array.isArray(data) || data.length === 0) {
      return res.status(400).send({ success: false, error: "No transfer data provided" });
    }

    const decimals = await tokenContract.decimals(); // Get token decimals

    for (const item of data) {
      // Convert amount to token's smallest unit (wei) based on decimals
      const amountInWei = ethers.parseUnits(item.amount.toString(), decimals);
      const tx = await tokenContract.connect(wallet).transfer(item.address, amountInWei);
      console.log(`Sent ${item.amount} tokens to ${item.address}, txHash: ${tx.hash}`);
    }

    console.log("Token distribution finished at", new Date());
    res.status(200).send({ success: true });

  } catch (err) {
    console.error("Error during token distribution:", err);
    res.status(500).send({ success: false, error: err.message });
  }
};

exports.getAdminTokenBalance = async (req, res) => {
  try {
    const timestamp = req.headers['x-timestamp'];
    const nonce = req.headers['x-nonce'];
    const signature = req.headers['x-signature'];

    if (!timestamp || !nonce || !signature) {
      return res.status(401).json({ error: 'Missing authentication headers' });
    }
    const payload = ''; // Empty payload for GET request

    // Generate server-side signature
    const signingString = [payload, timestamp, nonce].join('|');
    const expectedSignature = crypto.createHmac('sha256', SECRET)
                                    .update(signingString)
                                    .digest('hex');

    // Compare signatures using constant-time comparison
    if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSignature, 'hex'))) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { wallet, tokenContract } = await getMethods(); // wallet contains private key

    // Get token balance
    const balanceRaw = await tokenContract.balanceOf(wallet.address);
    const decimals = await tokenContract.decimals();
    const balance = ethers.formatUnits(balanceRaw, decimals);

    res.status(200).json({
      success: true,
      address: wallet.address,
      balance
    });
  } catch (err) {
    console.error("Error fetching admin token balance:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};
