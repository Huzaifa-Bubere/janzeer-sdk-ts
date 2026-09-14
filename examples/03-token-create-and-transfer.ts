// Create a JZT-1 token, then move some units. Token amounts are integer base units (bigint or string).
import { Account, JanzeerClient, JanzeerRpc, TxBuilder, sendAndWait } from '@janzeer/sdk';

const client = new JanzeerClient(process.env.JANZEER_NODE_URL ?? 'http://localhost:7019');
const rpc = new JanzeerRpc(process.env.JANZEER_RPC_URL ?? 'http://localhost:7019');
// Only a VALIDATOR's wallet may create tokens (anti-spam); on the dev net node-up.sh exports the first anchor's wallet.
if (!process.env.JANZEER_E2E_VALIDATOR_MNEMONIC) { console.log('JANZEER_E2E_VALIDATOR_MNEMONIC not set — token CREATE needs a validator wallet; skipping'); process.exit(0); }
const issuer = Account.fromMnemonic(process.env.JANZEER_E2E_VALIDATOR_MNEMONIC);
const holder = process.env.JANZEER_E2E_RECIPIENT ?? '0x598b1301acef3baba6ce25e38dd17b723f7b98b1';

const create = issuer.signTx(TxBuilder.token.create({ from: issuer.address, symbol: 'DEMO', name: 'Demo Token', decimals: 2, cap: 1_000_000n, amount: 500_000n, nonce: await client.nonce(issuer.address) }));
const created = await sendAndWait(rpc, create, { submitVia: client });
const tokenId = created.tokenId!; // for CREATE the tokenId is the transaction hash
console.log('token', tokenId, 'created in block', created.blockHeight);
console.log('definition', await client.tokens.get(tokenId));

const move = issuer.signTx(TxBuilder.token.transfer({ from: issuer.address, tokenId, amount: 12_345n, recipient: holder, nonce: await client.nonce(issuer.address) }));
await sendAndWait(rpc, move, { submitVia: client });
console.log('holders', (await client.tokens.holders(tokenId)).list);
