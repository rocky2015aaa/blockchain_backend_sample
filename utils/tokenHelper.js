const Decimal = require("decimal.js");
const ethers = require("ethers");
const dotenv = require("dotenv");

const { provider } = require("../config/blockchain");

// load env vars
dotenv.config({ path: "./.env" });

/**
 * Utility function to fix the number of decimal places for a given value.
 * This function ensures that a number is represented with the correct amount of precision.
 *
 * @param {number|string} value - The value to be fixed to a specific number of decimal places.
 * @param {number} decimals - The number of decimal places to keep.
 * @returns {string} - A string representing the number with the specified number of decimals.
 */
const ToFixed = (value, decimals) => {
  const tokenAmount = new Decimal(`${value}`);
  const preciseAmount = tokenAmount.toFixed(decimals);

  return preciseAmount;
};

const ParseUnits = (amount, decimals) => {
  return ethers.parseUnits(ToFixed(Number(amount), 4), decimals);
};

/**
 * Function to verify if tokens were transferred correctly in a transaction.
 * It checks the transaction logs for a 'Transfer' event and compares the sender,
 * recipient, and amount transferred with the expected values.
 *
 * @param {string} txHash - The hash of the transaction to be verified.
 * @param {string} expectedFrom - The expected address of the sender.
 * @param {string} expectedTo - The expected address of the recipient.
 * @param {string|number} expectedAmount - The expected amount of tokens transferred.
 * @returns {boolean} - Returns true if the tokens were transferred correctly, false otherwise.
 */
const areTokensTransferredCorrectly = async (
  txHash,
  expectedFrom,
  expectedTo,
  expectedAmount
) => {
  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt) {
    console.warn(`Transaction receipt not found: ${txHash}`);
    return false;
  }

  if (receipt.status === 0) {
    console.warn(`Transaction failed (reverted): ${txHash}`);
    return false;
  }

  const transferEventSignature = ethers.id("Transfer(address,address,uint256)");
  const transferLogs = receipt.logs.filter(
    (log) => log.topics[0] === transferEventSignature
  );

  for (const log of transferLogs) {
    const from = ethers.getAddress("0x" + log.topics[1].slice(26));
    const to = ethers.getAddress("0x" + log.topics[2].slice(26));

    // Decode the amount from the data field
    let amount = ethers.getBigInt(log.data);
    amount = ethers.formatUnits(amount, 18); // token 18 decimals

    console.log(
      `From: ${from} ${from?.toLowerCase() === expectedFrom?.toLowerCase()}`
    );
    console.log(`To: ${to} ${to?.toLowerCase() === expectedTo?.toLowerCase()}`);
    console.log(
      `Amount Transferred: ${amount} ${
        parseFloat(amount) === parseFloat(expectedAmount)
      }`
    );
    console.log("---");

    if (
      from?.toLowerCase() === expectedFrom?.toLowerCase() &&
      to?.toLowerCase() === expectedTo?.toLowerCase() &&
      parseFloat(amount) === parseFloat(expectedAmount)
    ) {
      return true;
    }
  }

  return false;
};

module.exports = {
  ToFixed,
  areTokensTransferredCorrectly,
  ParseUnits,
};
