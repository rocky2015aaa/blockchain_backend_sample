// Blockchain initialization logic omitted for brevity

/**
 * Initializes the blockchain by setting up the session key signer using the primary private key.
 * This is used for signing blockchain transactions during recurring payments.
 * If initialization fails, it logs the error.
 */
const initializeBlockchain = async () => {
  try {
    if (!process.env.PRIVATE_KEY_PRIMARY) {
      console.error(
        'Encrypted private key is missing from environment variables!'
      );
      throw new Error(
        'Encrypted private key is missing from environment variables!'
      );
    }

    if (!process.env.PASSPHRASE) {
      console.error('Passphrase is missing from environment variables!');
      throw new Error('Passphrase is missing from environment variables!');
    }

    // Decrypt the private key and store it securely
    const privateKey = decryptPrivateKey(
      process.env.PRIVATE_KEY_PRIMARY,
      process.env.PASSPHRASE
    );

    process.env.PRIVATE_KEY_PRIMARY = privateKey;

    wallet = new ethers.Wallet(process.env.PRIVATE_KEY_PRIMARY, provider);
    tokenContract = new ethers.Contract(
      process.env.CONTRACT_ADDRESS_TOKEN,
      ERC20_CONTRACT_ABI,
      wallet
    );
    paymentContract = new ethers.Contract(
      process.env.CONTRACT_ADDRESS_PAYMENT,
      PAYMENTS_CONTRACT_ABI,
      wallet
    );

    const signer = privateKeyToAccount(`0x${process.env.PRIVATE_KEY_PRIMARY}`);
    sessionKeySigner = await createWalletClient({
      account: signer,
      chain: CHAIN,
      transport: http(),
    });

    const account = await toCoinbaseSmartAccount({
      client: publicClient,
      owners: [signer],
    });
    bundlerClient = createBundlerClient({
      client: publicClient,
      account,
      paymaster: paymasterClient,
      transport: http(BUNDLER_RPC),
    });
    
    // For mainnet test only
    const mainnetSigner = privateKeyToAccount(`0x${process.env.PRIVATE_KEY_PRIMARY}`);
    const mainnetAccount = await toCoinbaseSmartAccount({
      client: mainnetPublicClient,
      owners: [mainnetSigner],
    });
    mainnetClient = createBundlerClient({
      client: createPublicClient({
        chain: base,
        transport: http(),
      }),
      mainnetAccount,
      paymaster: createPaymasterClient({
        transport: http(process.env.MAINNET_PAYMASTER_URL),
      }),
      transport: http(process.env.MAINNET_BUNDLER_URL),
    });
    console.log(
      sessionKeySigner.account.address,
      bundlerClient.account.address
    );

    // Initialize testnet clients for token distribution
    await initializeTestnetClients(privateKey);

    // Check the current smartOwner
    const currentSmartOwner = await paymentContract.smartOwner();
    console.log("Current smartOwner:", currentSmartOwner);

    // Update smartOwner if it is different
    if (currentSmartOwner.toLowerCase() !== account.address.toLowerCase()) {
      const tx = await paymentContract.updateSmartOwner(account.address);
      await tx.wait();
      const updatedSmartOwner = await paymentContract.smartOwner();
      console.log("✅ smartOwner updated to:", updatedSmartOwner);
    } else {
      console.log("smartOwner is already up-to-date.");
    }

    startJob();
  } catch (err) {
    throw new Error(err.message);
  }
};

/**
 * Checks for any recurring payments that are due by querying the database for
 * successful memberships that have expired. If a membership has an approval and
 * its expiration time has passed, a payment is triggered to the creator.
 * It logs any errors encountered during the database query or payment process.
 */
const checkForRecurringPayments = async () => {
  try {
    const currentTime = Math.floor(Date.now() / 1000);

    const { data, error } = await supabase
      .from('membership_subscriptions')
      .select(
        `
    *,
    memberships(*)
  `
      )
      .eq('status', 'success')
      .lt('expires_at', currentTime);

    if (error) {
      console.error('Error querying database:', error);
    } else {
      if (!data || data.length === 0) {
        console.log('No expired membership_subscriptions found.');
        return;
      }

      const promises = data.map(async (membership) => {
        try {
          const { membership_id, contract_id, member_address, amount } = membership;
          const { creator_address } = membership.memberships;

          const { handleBuyMembership } = require('../utils/coinbaseHelper');
          const { success, txHash } = await handleBuyMembership(
            member_address,
            amount,
            creator_address,
            membership.id,
            membership_id,
            contract_id
          );

          if (!success) {
            console.error(
              'Error triggering payment for subscription Id:',
              membership.id,
              txHash
            );
          }
        } catch (error) {
          console.error(
            'Error triggering payment for subscription Id:',
            membership.id,
            error
          );
        }
      });

      // Wait for all promises to finish (like WaitGroup in Go)
      const results = await Promise.allSettled(promises);
      const failed = results.filter(r => r.status === 'rejected');
      if (failed.length) {
        console.error(`❌ ${failed.length} membership_subscriptions(s) failed to process`);
      }
    }
  } catch (err) {
    console.error(
      `Error ocurred while checking for recurring payments: ${err}`
    );
  }
};

const checkForRecurringPlatformPayments = async () => {
  try {
    const currentTime = Math.floor(Date.now() / 1000);

    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('status', 'success')
      .lt('expires_at', currentTime);

    if (error) {
      console.error('Error querying database:', error);
    } else {
      if (!data || data.length === 0) {
        console.log('No expired subscriptions found.');
        return;
      }

      const creator_address = sessionKeySigner.account.address;
      const promises = data.map(async (membership) => {
        try {
          const {
            membership_id,
            contract_id,
            member_address,
            amount,
            is_yearly,
          } = membership;

          const { handleBuyPlatformMembership } = require('../utils/coinbaseHelper');
          const { success, txHash } = await handleBuyPlatformMembership(
            member_address,
            amount,
            creator_address,
            membership.id,
            membership_id,
            contract_id,
            is_yearly
          );

          if (!success) {
            console.error(
              'Error triggering payment for subscription Id:',
              membership.id,
              txHash
            );
          }
        } catch (error) {
          console.error(
            'Error triggering payment for subscription Id:',
            membership.id,
            error
          );
        }
      });

      const results = await Promise.allSettled(promises);
      const failed = results.filter(r => r.status === 'rejected');
      if (failed.length) {
        console.error(`❌ ${failed.length} subscription(s) failed to process`);
      }
    }
  } catch (err) {
    console.error(
      `Error ocurred while checking for recurring payments: ${err}`
    );
  }
};

const checkForSuspendedMemberships = async () => {
  try {
    const currentTime = Math.floor(Date.now() / 1000);
    const threeDaysAgo = currentTime - 3 * 24 * 60 * 60;

    const { data, error } = await supabase
      .from('membership_subscriptions')
      .update({ status: 'failed' })
      .eq('status', 'suspended')
      .lt('expires_at', threeDaysAgo);

    if (error) {
      console.error('Error updating suspended memberships:', error);
    }
  } catch (err) {
    console.error(
      `Error ocurred while checking for suspended memberships: ${err}`
    );
  }
};

const checkForSuspendedPlatformMemberships = async () => {
  try {
    const currentTime = Math.floor(Date.now() / 1000);
    const threeDaysAgo = currentTime - 3 * 24 * 60 * 60;

    const { data, error } = await supabase
      .from('subscriptions')
      .update({ status: 'failed' })
      .eq('status', 'suspended')
      .lt('expires_at', threeDaysAgo);

    if (error) {
      console.error('Error updating suspended platform memberships:', error);
    }
  } catch (err) {
    console.error(
      `Error ocurred while checking for suspended platform memberships: ${err}`
    );
  }
};

// Runs every minute for testing
// cron.schedule("* * * * *", () => {

// Runs thrice in a day at 8 AM, 4 PM, and 12 AM UTC
// cron.schedule("0 8,16,0 * * *", () => {

/**
 * Schedules a cron job to check for recurring payments every hour.
 * The job is executed at the start of each hour (0 minutes).
 */
const startJob = async () => {
  // Schedule to run every hour
  cron.schedule('* * * * *', async () => {
    console.log('Payment check scheduled');
    await checkForRecurringPayments();
    await checkForRecurringPlatformPayments();
    await checkForSuspendedMemberships();
    await checkForSuspendedPlatformMemberships();
  });

  /**
   *1. Schedules a cron job to update trending sscore of contests thrice a day.
   *   The job is executed at 8 AM, 4 PM, and 12 AM UTC.
   *
   *2. Schedules a cron job to Auto Award contest's entires thrice a day.
   *   The job is executed at 8 AM, 4 PM, and 12 AM UTC.
   **/

  // cron.schedule('0 0,8,16 * * *', () => {
  cron.schedule('*/1 * * * *', () => {
    console.log(
      '🔔 Cron job | Contest Traction & Auto Award | started at',
      new Date().toLocaleString()
    );
    // calculateTrendingScores();
    contestJobs();
  });
};

const getMethods = async () => {
  return {
    sessionKeySigner,
    bundlerClient,
    paymentContract,
    tokenContract,
    wallet,
    mainnetClient // For mainnet test only
  };
};

module.exports = {
  initializeBlockchain,
  provider,
  publicClient,
  mainnetPublicClient, // For mainnet test only
  paymasterClient,
  paymasterMainnetClient,
  CHAIN,
  BUNDLER_RPC,
  PAYMASTER_RPC,
  entryPoint,
  kernelVersion,
  getMethods,
};
