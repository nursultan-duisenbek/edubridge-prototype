const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

// All accounts below are the local test accounts created by Hardhat Network. No real keys or funds.
const h = (text) => ethers.keccak256(ethers.toUtf8Bytes(text)); // invented, salted-hash-like values
const STATUS = { Unknown: 0n, Valid: 1n, Revoked: 2n };

describe("CredentialRegistry (EduBridge prototype)", function () {
  async function deploy() {
    const [admin, operator, uniA, uniB, outsider, verifier] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory("CredentialRegistry");
    const registry = await Registry.deploy(admin.address);
    await registry.grantRole(await registry.OPERATOR_ROLE(), operator.address);
    await registry.connect(operator).registerIssuer(uniA.address, h("Example University A"));
    await registry.connect(operator).registerIssuer(uniB.address, h("Example College B"));
    return { registry, admin, operator, uniA, uniB, outsider, verifier };
  }

  it("1. only an operator can register an issuer", async function () {
    const { registry, outsider } = await loadFixture(deploy);
    await expect(registry.connect(outsider).registerIssuer(outsider.address, h("Fake")))
      .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
  });

  it("2. an approved issuer records a credit and a verifier sees it as valid", async function () {
    const { registry, uniA, verifier } = await loadFixture(deploy);
    const hash = h("credit-001|salt-9f3a");
    await expect(registry.connect(uniA).issue(hash, 1)).to.emit(registry, "CredentialIssued");
    const [status, issuer, nameCode, issuedAt, active] = await registry.connect(verifier).verify(hash);
    expect(status).to.equal(STATUS.Valid);
    expect(issuer).to.equal(uniA.address);
    expect(nameCode).to.equal(h("Example University A"));
    expect(issuedAt).to.be.gt(0n);
    expect(active).to.equal(true);
  });

  it("3. an address that is not an approved issuer cannot record credits", async function () {
    const { registry, outsider } = await loadFixture(deploy);
    await expect(registry.connect(outsider).issue(h("x"), 1)).to.be.revertedWithCustomError(registry, "NotAnActiveIssuer");
  });

  it("4. the same hash cannot be recorded twice, and an empty hash is rejected", async function () {
    const { registry, uniA, uniB } = await loadFixture(deploy);
    const hash = h("credit-002|salt-1b7c");
    await registry.connect(uniA).issue(hash, 1);
    await expect(registry.connect(uniB).issue(hash, 1)).to.be.revertedWithCustomError(registry, "AlreadyRecorded");
    await expect(registry.connect(uniA).issue(ethers.ZeroHash, 1)).to.be.revertedWithCustomError(registry, "EmptyHash");
  });

  it("5. only the issuing institution can revoke, and the status becomes revoked", async function () {
    const { registry, uniA, uniB } = await loadFixture(deploy);
    const hash = h("credit-003|salt-77aa");
    await registry.connect(uniA).issue(hash, 2);
    await expect(registry.connect(uniB).revoke(hash, h("ENTERED_BY_MISTAKE")))
      .to.be.revertedWithCustomError(registry, "NotCredentialIssuer");
    await registry.connect(uniA).revoke(hash, h("ENTERED_BY_MISTAKE"));
    const [status] = await registry.verify(hash);
    expect(status).to.equal(STATUS.Revoked);
    await expect(registry.connect(uniA).revoke(hash, h("AGAIN"))).to.be.revertedWithCustomError(registry, "AlreadyRevoked");
    await expect(registry.connect(uniA).revoke(h("never-issued"), h("X"))).to.be.revertedWithCustomError(registry, "UnknownCredential");
  });

  it("6. a suspended issuer cannot issue, its old records are flagged, and reinstating clears the flag", async function () {
    const { registry, operator, uniA } = await loadFixture(deploy);
    const hash = h("credit-004|salt-5d21");
    await registry.connect(uniA).issue(hash, 1);
    await registry.connect(operator).suspendIssuer(uniA.address);
    await expect(registry.connect(uniA).issue(h("credit-005"), 1)).to.be.revertedWithCustomError(registry, "NotAnActiveIssuer");
    let result = await registry.verify(hash);
    expect(result.status).to.equal(STATUS.Valid);
    expect(result.issuerActive).to.equal(false); // warning flag for the verifier
    await registry.connect(operator).reinstateIssuer(uniA.address);
    result = await registry.verify(hash);
    expect(result.issuerActive).to.equal(true);
  });

  it("7. issueBatch records every hash in one transaction and enforces the batch limit", async function () {
    const { registry, uniA } = await loadFixture(deploy);
    const hashes = Array.from({ length: 5 }, (_, i) => h(`batch-credit-${i}`));
    await registry.connect(uniA).issueBatch(hashes, 1);
    for (const hash of hashes) {
      const [status] = await registry.verify(hash);
      expect(status).to.equal(STATUS.Valid);
    }
    const tooMany = Array.from({ length: 201 }, (_, i) => h(`too-many-${i}`));
    await expect(registry.connect(uniA).issueBatch(tooMany, 1)).to.be.revertedWithCustomError(registry, "BatchTooLarge");
    await expect(registry.connect(uniA).issueBatch([], 1)).to.be.revertedWithCustomError(registry, "EmptyBatch");
  });

  it("8. the operator can pause the contract; issuing and revoking stop until it is unpaused", async function () {
    const { registry, operator, outsider, uniA } = await loadFixture(deploy);
    await registry.connect(uniA).issue(h("before-pause"), 1);
    await expect(registry.connect(outsider).pause()).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    await registry.connect(operator).pause();
    await expect(registry.connect(uniA).issue(h("paused"), 1)).to.be.revertedWithCustomError(registry, "EnforcedPause");
    await expect(registry.connect(uniA).revoke(h("before-pause"), h("X"))).to.be.revertedWithCustomError(registry, "EnforcedPause");
    await registry.connect(operator).unpause();
    await registry.connect(uniA).issue(h("paused"), 1);
  });

  it("9. verify returns Unknown for a hash that was never recorded, and verification sends no transaction", async function () {
    const { registry } = await loadFixture(deploy);
    const [status, issuer, , , active] = await registry.verify(h("never-recorded"));
    expect(status).to.equal(STATUS.Unknown);
    expect(issuer).to.equal(ethers.ZeroAddress);
    expect(active).to.equal(false);
  });

  it("10. a registered issuer cannot be registered twice, and an unknown issuer cannot be suspended", async function () {
    const { registry, operator, uniA, outsider } = await loadFixture(deploy);
    await expect(registry.connect(operator).registerIssuer(uniA.address, h("Again")))
      .to.be.revertedWithCustomError(registry, "IssuerAlreadyRegistered");
    await expect(registry.connect(operator).suspendIssuer(outsider.address))
      .to.be.revertedWithCustomError(registry, "IssuerNotRegistered");
  });
});
