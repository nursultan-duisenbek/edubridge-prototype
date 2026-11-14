Educational project for the course Introduction to Finance. Not a real product, service or investment offer. Do not use with real funds.

# EduBridge prototype: CredentialRegistry

Prototype of the core smart contract of **EduBridge**, a hypothetical permissioned blockchain register of course credits for academic mobility in Kazakhstan. Team 05, Final Project, Introduction to Finance, Astana IT University, 2026–2027.

- Demo video (up to 3 minutes): `<paste the Google Drive link here, access for anyone with the link>`
- Testnet contract address: none. The prototype runs only on the local Hardhat network.

## What the prototype does

`contracts/CredentialRegistry.sol` records and verifies **course-credit records** without storing any personal data on the blockchain.

1. The **operator** approves an institution (issuer) with `registerIssuer`, and can suspend or reinstate it.
2. An approved **issuer** records the salted hash of a credit record with `issue` (or many at once with `issueBatch`, up to 200) and can `revoke` its own records.
3. A **verifier** (for example a host university) calls `verify(hash)`. It is a read-only call that returns `Unknown`, `Valid` or `Revoked`, the issuer, the date and whether the issuer is still active. A suspended issuer's records are flagged with `issuerActive = false`.
4. The operator can `pause` the contract in an emergency.

Roles: `DEFAULT_ADMIN_ROLE` (grants roles, in production a multisignature wallet), `OPERATOR_ROLE`, and approved issuers (a mapping, each issuer can act only on its own records). Built with OpenZeppelin `AccessControl` and `Pausable`. The contract holds no funds and makes no external calls, so reentrancy is not possible. There is no token.

## How to run (local network only)

Requires Node.js 18 or newer.

```bash
npm install
npm test          # compile and run the 10 unit tests with a gas report
npm run demo      # step-by-step demo of the main use case (used in the video)
```

Tests and the demo use the **Hardhat Network**, a blockchain that runs on your computer with test accounts created by the tool. No wallet, no real cryptocurrency, no public network and no private key is needed. Compilation uses the `solc` package from `node_modules`, so it also works offline.

## Safety rules for this repository

- Never deploy to a main network and never connect this code to real funds.
- Use only the test accounts of the tool, or a new wallet made only for the course. Never share a seed phrase or private key.
- Keep any keys in a `.env` file. It is listed in `.gitignore` and must never be committed. If a key is committed by mistake, stop using that wallet.
- All data in tests and the demo is invented. No personal data of real people is used.

## Measured gas (Hardhat Network, optimizer 200 runs)

| Function | Gas |
|---|---|
| Deployment | 938,511 |
| `registerIssuer` | about 70,900 |
| `issue` | about 53,500 |
| `issueBatch` (5 records) | about 165,600 (about 33,100 per record) |
| `revoke` | about 54,000 |
| `verify` | read-only, no transaction |

These numbers support the cost assumptions in the report. On a free-gas private network such as Hyperledger Besu, the cost of these operations is the cost of running the validator nodes.

## Credits and licence

- OpenZeppelin Contracts 5.x (MIT licence): https://github.com/OpenZeppelin/openzeppelin-contracts
- Hardhat (MIT licence) and the Hardhat Toolbox: https://hardhat.org
- This code is released under the MIT licence for educational use.
- AI assistance is described in the AI Disclosure Statement of the report.
