// Keep a mnemonic at rest encrypted under a password (what the explorer wallet and the Flutter wallet store).
import { Mnemonic, Account } from '@janzeer/sdk';
import { encryptVault, decryptVault } from '@janzeer/sdk/vault';

const mnemonic = Mnemonic.generate();
const blob = encryptVault(mnemonic, 'correct horse battery staple');
console.log('stored blob', JSON.stringify(blob));
const restored = decryptVault(blob, 'correct horse battery staple');
console.log('same wallet:', Account.fromMnemonic(restored).address === Account.fromMnemonic(mnemonic).address);
try { decryptVault(blob, 'wrong'); } catch (e) { console.log('wrong password →', (e as Error).name); }
