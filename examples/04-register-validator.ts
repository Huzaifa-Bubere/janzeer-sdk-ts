// Register (and later exit) a validator node. The 2000 JNZ deposit is NON-refundable — this example only builds
// and prints the transactions unless RUN_FOR_REAL=1.
import { Account, JanzeerClient, TxBuilder, VALIDATOR_DEPOSIT, VALIDATOR_FEE } from '@janzeer/sdk';

const client = new JanzeerClient(process.env.JANZEER_NODE_URL ?? 'http://localhost:7019');
const wallet = Account.fromMnemonic(process.env.JANZEER_E2E_MNEMONIC ?? 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
const validatorKey = process.env.VALIDATOR_KEY ?? (await client.info()).nodeKey; // the node's public key from GET info

const nonce = await client.nonce(wallet.address);
const register = wallet.signTx(TxBuilder.registerValidator({ from: wallet.address, validatorKey, nonce }));
console.log(`register ${validatorKey.slice(0, 12)}… fee ${VALIDATOR_FEE} deposit ${VALIDATOR_DEPOSIT}`, register.toRestBody());
const exit = wallet.signTx(TxBuilder.exitValidator({ from: wallet.address, validatorKey, nonce: nonce + 1 }));
console.log('exit (pipelined nonce)', exit.toRestBody());

if (process.env.RUN_FOR_REAL === '1') {
  console.log('submitted', (await client.submit(register)).hash);
} else console.log('dry run — set RUN_FOR_REAL=1 to submit the registration');
