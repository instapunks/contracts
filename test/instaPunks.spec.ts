import { expect } from "chai";
import { ethers } from "hardhat";
import { InstaPunks } from "../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { amountOf, Context, deployContext, MAX_SUPPLY, MINT_PRICE, OFFSET } from "./suit/context";

const Errors = {
  MAX_TOKEN_SUPPLY_REACHED: "InstaPunks: max token supply reached",
  LOW_MINT_PRICE: "InstaPunks: insufficient value",
  NOT_ALLOWED: "Ownable: caller is not the owner"
} as const;

describe("InstaPunks", function() {
  let owner: SignerWithAddress;
  let account: SignerWithAddress;
  let account2: SignerWithAddress;
  let account3: SignerWithAddress;
  let treasuser: SignerWithAddress;
  let context: Context;
  let instaPunks: InstaPunks;
  let mint: typeof Context.prototype.mint;
  let waitBlocks: typeof Context.prototype.waitBlocks;

  let sendFee: typeof Context.prototype.sendFee;
  let transferToken: typeof Context.prototype.transferToken;
  let withdrawFeeShare: typeof Context.prototype.withdrawFeeShare;

  before(async () => {
    [owner, account, account2, account3, treasuser] = await ethers.getSigners();
  });

  beforeEach(async () => {
    context = await deployContext(ethers);

    instaPunks = context.instaPunks;
    mint = context.mint;
    waitBlocks = context.waitBlocks;
    sendFee = context.sendFee;
    transferToken = context.transferToken;
    withdrawFeeShare = context.withdrawFeeShare;

    await waitBlocks(10);
  });

  describe("Mint", () => {
    it("Should mint NFT", async () => {
      await context.mint(account);
      expect(await instaPunks.ownerOf(1)).to.equal(account.address);
    });

    it("Should not allow to mint having low mint price", async () => {
      await expect(mint(account, MINT_PRICE.sub(1))).to.be.revertedWith(Errors.LOW_MINT_PRICE);
    });

    it("Should allow to mint having high gas price", async () => {
      await mint(account, MINT_PRICE.mul(2));
    });

    it("Should not exceed MAX_SUPPLY", async () => {
      for (let i = 0; i < MAX_SUPPLY; i++) {
        await mint(account);
      }
      expect(await instaPunks.balanceOf(account.address)).to.equal(MAX_SUPPLY);
      expect(await instaPunks.totalSupply()).to.equal(MAX_SUPPLY);
      await expect(instaPunks.connect(account2).mint()).to.be.revertedWith(Errors.MAX_TOKEN_SUPPLY_REACHED);
    });

    it("Should mint tokens with offset", async () => {
      for (let i = 0; i < MAX_SUPPLY; i++) {
        await mint(account);
        const expectedTokenId = (OFFSET + i) % MAX_SUPPLY;
        expect(await instaPunks.ownerOf(expectedTokenId)).to.equal(account.address);
        expect(await instaPunks.balanceOf(account.address)).to.equal(i + 1);
      }
    });
  });

  describe("Fee", () => {
    it("Should calculate fee", async () => {
      await mint(account);
      await mint(account);
      await mint(account2);
      await mint(account3);

      await sendFee(1);

      expect(await instaPunks.connect(account).calcFeeShare()).to.equal(amountOf(0.5).div(2));
      expect(await instaPunks.connect(account2).calcFeeShare()).to.equal(amountOf(0.25).div(2));
      expect(await instaPunks.connect(account3).calcFeeShare()).to.equal(amountOf(0.25).div(2));

      expect(await ethers.provider.getBalance(instaPunks.address)).to.equal(amountOf(1).add(MINT_PRICE.mul(4)));
    });

    it("Should distribute fee after transfer", async () => {
      await mint(account);
      await mint(account2);

      await sendFee(1);

      await transferToken(account2, account, 2);

      await sendFee(1);

      expect(await instaPunks.connect(account).calcFeeShare()).to.equal(amountOf(1.5).div(2));
      expect(await instaPunks.connect(account2).calcFeeShare()).to.equal(amountOf(0.5).div(2));
    });

    it("Should withdraw fee share", async () => {
      await mint(account);
      await mint(account2);

      await sendFee(1);

      expect(await withdrawFeeShare(account)).to.equal(amountOf(0.5).div(2));
    });

    it("Should withdraw nothing for non-holder", async () => {
      await mint(account);
      await mint(account2);

      await sendFee(1);

      expect(await withdrawFeeShare(account3)).to.equal(amountOf(0));
    });

    it("Should withdraw share after token transfer", async () => {
      await mint(account);
      await mint(account2);

      await sendFee(1);
      await transferToken(account, account2, 1);

      expect(await withdrawFeeShare(account)).to.equal(amountOf(0.5).div(2));
    });

    it("Should share secondary fee among holders", async () => {
      await mint(account);
      await mint(account2);

      await sendFee(1);
      await transferToken(account, account2, 1);
      await sendFee(1);

      expect(await withdrawFeeShare(account)).to.equal(amountOf(0.5).div(2));
      expect(await withdrawFeeShare(account2)).to.equal(amountOf(1.5).div(2));
    });

    it("Should withdraw nothing for secondary withdrawal", async () => {
      await mint(account);
      await sendFee(1);
      expect(await withdrawFeeShare(account)).to.equal(amountOf(1).div(2));
      expect(await withdrawFeeShare(account)).to.equal(amountOf(0));
    });
  });

  describe("Dev Fund", () => {
    it("Should allow owner to withdraw dev fund", async () => {
      await instaPunks.connect(owner).withdrawDevFund(treasuser.address);
    });

    it("Should not allow non-owner to withdraw dev fund", async () => {
      await expect(instaPunks.connect(account).withdrawDevFund(treasuser.address)).to.be.revertedWith(Errors.NOT_ALLOWED);
    });

    it("Should withdraw dev fund without fee distribution", async () => {
      await mint(account);
      await mint(account2);
      await mint(account3);

      const balanceBefore = await treasuser.getBalance();
      await instaPunks.withdrawDevFund(treasuser.address);
      const balanceAfter = await treasuser.getBalance();
      expect(balanceAfter.sub(balanceBefore)).to.equal(MINT_PRICE.mul(3));
    });

    it("Should withdraw dev fund after fee distribution", async () => {
      await mint(account);
      await sendFee(2);

      const balanceBefore = await treasuser.getBalance();
      await instaPunks.withdrawDevFund(treasuser.address);
      const balanceAfter = await treasuser.getBalance();

      expect(balanceAfter.sub(balanceBefore)).to.equal(amountOf(2).div(2).add(MINT_PRICE));
    });

    it("Should withdraw dev fund multiple times", async () => {
      await mint(account);
      await sendFee(2);

      const balanceBefore = await treasuser.getBalance();
      await instaPunks.withdrawDevFund(treasuser.address);
      await mint(account);
      await instaPunks.withdrawDevFund(treasuser.address);
      await sendFee(1);
      await instaPunks.withdrawDevFund(treasuser.address);
      const balanceAfter = await treasuser.getBalance();

      expect(balanceAfter.sub(balanceBefore)).to.equal(amountOf(2 + 1).div(2).add(MINT_PRICE.mul(2)));
    });


    it("Should withdraw nothing when dev fund is empty", async () => {
      await mint(account);
      await sendFee(2);

      await instaPunks.withdrawDevFund(treasuser.address);

      const balanceBefore = await treasuser.getBalance();
      await instaPunks.withdrawDevFund(treasuser.address);
      const balanceAfter = await treasuser.getBalance();

      expect(balanceAfter.sub(balanceBefore)).to.equal(0);
    });
  });
});