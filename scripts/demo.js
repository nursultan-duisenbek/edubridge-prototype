// Demo for the 3-minute video: runs on the local Hardhat network with test accounts only.
// Use case: operator approves a university, the university records a credit, the host
// university verifies it, the university revokes it after a mistake, verification shows "revoked".
const { ethers } = require("hardhat");

const STATUS = ["Unknown", "Valid", "Revoked"];
const h = (t) => ethers.keccak256(ethers.toUtf8Bytes(t));

async function show(registry, label, hash) {
  const r = await registry.verify(hash);
  console.log(`  ${label}: status=${STATUS[Number(r.status)]}, issuerActive=${r.issuerActive}`);
}

async function main() {
  const [operator, university, hostUniversity] = await ethers.getSigners(); // local test accounts
  console.log("1. Deploy CredentialRegistry on the local Hardhat network");
  const registry = await (await ethers.getContractFactory("CredentialRegistry")).deploy(operator.address);
  await registry.waitForDeployment();
  console.log("  deployed at", await registry.getAddress(), "(local network, not a public chain)");

  console.log("2. Operator approves the home university (an invented institution)");
  await (await registry.registerIssuer(university.address, h("Example University A"))).wait();

  console.log("3. University records a credit. Only a salted hash goes on-chain, no personal data");
  const record = "student-id-INVENTED|course-FIN101|credits-5|grade-A|salt-4c1e9a"; // invented test data
  const hash = h(record);
  await (await registry.connect(university).issue(hash, 1)).wait();

  console.log("4. Host university verifies the QR-code hash (read-only call, no transaction)");
  await show(registry.connect(hostUniversity), "result", hash);

  console.log("5. University finds a mistake and revokes the record");
  await (await registry.connect(university).revoke(hash, h("ENTERED_BY_MISTAKE"))).wait();
  await show(registry.connect(hostUniversity), "result after revoke", hash);

  console.log("6. Unknown hash");
  await show(registry, "result", h("never-recorded"));
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
