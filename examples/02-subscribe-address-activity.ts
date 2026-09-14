// Watch an address over the WebSocket feed and stream new blocks. Ctrl-C to stop.
import { JanzeerRpcWs } from '@janzeer/sdk';

const ws = await JanzeerRpcWs.connect(process.env.JANZEER_WS_URL ?? 'ws://localhost:7019/rpc/ws', { onEvent: (e) => console.log('[ws]', e.type) });
const watch = process.env.JANZEER_E2E_RECIPIENT ?? '0x598b1301acef3baba6ce25e38dd17b723f7b98b1';

const tip = await ws.getTip();
await ws.subscribeNewBlocks({ fromHeight: Math.max(1, tip.height - 2) }, (b) => console.log('block', b.height, b.hash.slice(0, 12), 'txs', b.transactionsCount));
await ws.subscribeAddressActivity([watch], (ev) => console.log('activity for', watch, '→', ev.transaction.type, ev.transaction.hash.slice(0, 12), ev.transaction.amount, 'in block', ev.blockHeight));
console.log(`listening… (this example exits after ${process.env.EXAMPLE_SECONDS ?? 40} s)`);
setTimeout(() => { ws.close(); process.exit(0); }, Number(process.env.EXAMPLE_SECONDS ?? 40) * 1000);
