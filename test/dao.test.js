const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DAO Fonds Etudiant", function () {
  async function deployDAO() {
    const [owner, member, recipient] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("GovernanceToken");
    const token = await Token.deploy(owner.address);
    const Timelock = await ethers.getContractFactory("TimelockController");
    const timelock = await Timelock.deploy(2, [], [], owner.address);
    const Governor = await ethers.getContractFactory("StudentGovernor");
    const governor = await Governor.deploy(token.target, timelock.target);
    await timelock.grantRole(await timelock.PROPOSER_ROLE(), governor.target);
    await timelock.grantRole(await timelock.EXECUTOR_ROLE(), ethers.ZeroAddress);
    await timelock.grantRole(await timelock.CANCELLER_ROLE(), governor.target);
    await timelock.renounceRole(await timelock.DEFAULT_ADMIN_ROLE(), owner.address);
    return { owner, member, recipient, token, timelock, governor };
  }

  it("distribue les jetons et active la délégation", async function () {
    const { owner, member, token } = await deployDAO();
    await token.mintMember(member.address, ethers.parseEther("100"));
    await token.connect(member).delegate(member.address);
    expect(await token.getVotes(member.address)).to.equal(ethers.parseEther("100"));
    expect(await token.totalSupply()).to.equal(ethers.parseEther("100"));
  });

  it("permet à chaque portefeuille de réclamer une fois 100 FEG et active ses voix", async function () {
    const { member, token } = await deployDAO();
    await token.connect(member).claimTestTokens();
    expect(await token.balanceOf(member.address)).to.equal(ethers.parseEther("100"));
    expect(await token.getVotes(member.address)).to.equal(ethers.parseEther("100"));
    expect(await token.hasClaimedTestTokens(member.address)).to.equal(true);
    await expect(token.connect(member).claimTestTokens()).to.be.revertedWith("Already claimed");
  });

  it("refuse la création de jetons par un non-administrateur", async function () {
    const { member, token } = await deployDAO();
    await expect(token.connect(member).mintMember(member.address, 1)).to.be.reverted;
  });
});
