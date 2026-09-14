// Send 1.25 JNZ and wait until it is final. Needs a node with a funded wallet (sdk_conformance/e2e/node-up.sh).
import { Account, JanzeerClient, JanzeerRpc, TxBuilder, formatJnz, waitForFinality } from '@janzeer/sdk';

const client = new JanzeerClient(process.env.JANZEER_NODE_URL ?? 'http://localhost:7019');
const rpc = new JanzeerRpc(process.env.JANZEER_RPC_URL ?? 'http://localhost:7019');
const account = Account.fromMnemonic(process.env.JANZEER_E2E_MNEMONIC ?? 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
const to = process.env.JANZEER_E2E_RECIPIENT ?? '0x598b1301acef3baba6ce25e38dd17b723f7b98b1';

console.log('wallet', account.checksumAddress, 'balance', formatJnz(await client.balance(account.address)));

const tx = account.signTx(TxBuilder.transfer({ from: account.address, to, amount: '1.25', data: 'hello from @janzeer/sdk', nonce: await client.nonce(account.address) }));
await client.submit(tx);
console.log('submitted', tx.hash);

const final = await waitForFinality(rpc, tx.hash);
console.log('FINAL in block', final.blockHeight, 'receipt ok:', final.receipt?.successful);
console.log('balance now', formatJnz(await client.balance(account.address)));
