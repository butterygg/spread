const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("GovernanceToken", function () {
  it("Should return the new greeting once it's changed", async function () {
    const GovernanceToken = await ethers.getContractFactory("GovernanceToken");
    const governanceToken = await GovernanceToken.deploy();
    await governanceToken.deployed();

    expect(await governanceToken.symbol()).to.equal("GNT");
  });
});
