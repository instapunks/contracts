import { expect } from "chai";
import { ethers } from "hardhat";
import { InstaPunks } from "../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { amountOf, Context, deployContext, MAX_MINT_COUNT, MAX_SUPPLY, MINT_PRICE } from "./suit/context";

const Errors = {
  MAX_TOKEN_SUPPLY_REACHED: "InstaPunks: max token supply reached",
  LOW_MINT_PRICE: "InstaPunks: insufficient value",
  NOT_ALLOWED: "Ownable: caller is not the owner",
  ZERO_TOKENS: "InstaPunks: unable to mint 0 tokens",
  MINT_COUNT_EXCEEDED: "InstaPunks: max mint count exceeded"
} as const;

describe("InstaPunks", function() {
  let owner: SignerWithAddress;
  let account: SignerWithAddress;
  let account2: SignerWithAddress;
  let account3: SignerWithAddress;
  let treasurer: SignerWithAddress;
  let context: Context;
  let instaPunks: InstaPunks;
  let mint: typeof Context.prototype.mint;
  let waitBlocks: typeof Context.prototype.waitBlocks;
  let waitDays: typeof Context.prototype.waitDays;

  let sendFee: typeof Context.prototype.sendFee;
  let sendAndDistributeFee: typeof Context.prototype.sendAndDistributeFee;
  let transferToken: typeof Context.prototype.transferToken;
  let claimFee: typeof Context.prototype.claimFee;

  before(async () => {
    [owner, account, account2, account3, treasurer] = await ethers.getSigners();
  });

  beforeEach(async () => {
    context = await deployContext(ethers);

    instaPunks = context.instaPunks;
    mint = context.mint;
    waitBlocks = context.waitBlocks;
    sendAndDistributeFee = context.sendAndDistributeFee;
    sendFee = context.sendFee;
    transferToken = context.transferToken;
    claimFee = context.claimFee;
    waitDays = context.waitDays;

    await waitBlocks(10);
  });

  describe("Mint", () => {
    it("Should mint NFT", async () => {
      await mint(account);
      expect(await instaPunks.ownerOf(0)).to.equal(account.address);
    });

    it("Should not allow to mint having low mint price", async () => {
      await expect(mint(account, 1, MINT_PRICE.sub(1))).to.be.revertedWith(Errors.LOW_MINT_PRICE);
    });

    it("Should allow to mint having high gas price", async () => {
      await mint(account, 1, MINT_PRICE.mul(2));
    });

    it("Should not exceed MAX_SUPPLY", async () => {
      for (let i = 0; i < MAX_SUPPLY; i++) {
        await mint(account);
      }
      expect(await instaPunks.balanceOf(account.address)).to.equal(MAX_SUPPLY);
      expect(await instaPunks.totalSupply()).to.equal(MAX_SUPPLY);
      await expect(mint(account2)).to.be.revertedWith(Errors.MAX_TOKEN_SUPPLY_REACHED);
    });

    it("Should allow to mint multiple tokens per transaction", async () => {
      await mint(account, 2);
      expect(await instaPunks.totalSupply()).to.equal(2);
      expect(await instaPunks.balanceOf(account.address)).to.equal(2);
    });

    it("Should not allow to mint 0 tokens", async () => {
      await expect(mint(account, 0)).to.be.revertedWith(Errors.ZERO_TOKENS);
    });

    it("Should not allow to mint more than MAX_MINT_COUNT tokens per transaction", async () => {
      await expect(mint(account, MAX_MINT_COUNT + 1)).to.be.revertedWith(Errors.MINT_COUNT_EXCEEDED);
    });

  });

  describe("Fee", () => {
    describe("Calc", () => {
      it("Should fully distribute fee after 31 days", async () => {
        await mint(account);
        await sendFee(1);
        await waitDays(32);
        expect(await instaPunks.connect(account).calcFee()).to.equal(amountOf(0.5));
      });

      it("Should distribute fee partially during distribution period", async () => {
        await mint(account);
        await sendFee(31);
        await waitDays(10);
        expect(await instaPunks.connect(account).calcFee()).to.equal(amountOf(5));
      });

      it("Should distribute fee partially among multiple holders", async () => {
        await mint(account);
        await mint(account2);
        await sendFee(31);
        await waitDays(10);
        expect(await instaPunks.connect(account).calcFee()).to.equal(amountOf(2.5));
        expect(await instaPunks.connect(account2).calcFee()).to.equal(amountOf(2.5));
      });

      it("Should distribute fee among new holders", async () => {
        await mint(account);
        await sendFee(31);
        await waitDays(22);
        await mint(account2);
        await mint(account3);
        await waitDays(10);
        expect(await instaPunks.connect(account).calcFee()).to.equal(amountOf(11 + 1.5));
        expect(await instaPunks.connect(account2).calcFee()).to.equal(amountOf(1.5));
        expect(await instaPunks.connect(account3).calcFee()).to.equal(amountOf(1.5));
      });

      it("Should calculate fee", async () => {
        await mint(account);
        await mint(account);
        await mint(account2);
        await mint(account3);

        await sendAndDistributeFee(1);

        expect(await instaPunks.connect(account).calcFee()).to.equal(amountOf(0.5).div(2));
        expect(await instaPunks.connect(account2).calcFee()).to.equal(amountOf(0.25).div(2));
        expect(await instaPunks.connect(account3).calcFee()).to.equal(amountOf(0.25).div(2));

        expect(await ethers.provider.getBalance(instaPunks.address)).to.equal(amountOf(1).add(MINT_PRICE.mul(4)));
      });

      it("Should distribute fee after transfer", async () => {
        await mint(account);
        await mint(account2);

        await sendAndDistributeFee(1);

        await transferToken(account2, account, 1);

        await sendAndDistributeFee(1);

        expect(await instaPunks.connect(account).calcFee()).to.equal(amountOf(1.5).div(2));
        expect(await instaPunks.connect(account2).calcFee()).to.equal(amountOf(0.5).div(2));
      });
    });

    describe("Claim", () => {
      it("Should claim partially distributed fee", async () => {
        await mint(account);
        await sendFee(31);
        await waitDays(10);
        expect(await claimFee(account)).to.equal(amountOf(5));
      });

      it("Multiple holders should claim partially distributed fee", async () => {
        await mint(account);
        await mint(account2);
        await sendFee(31);
        await waitDays(10);
        expect(await claimFee(account)).to.equal(amountOf(2.5));
        expect(await claimFee(account2)).to.equal(amountOf(2.5));
      });

      it("New holders should claim partially distributed fee", async () => {
        await mint(account);
        await sendFee(31);
        await waitDays(22);
        expect(await claimFee(account)).to.equal(amountOf(11));
        await mint(account2);
        await mint(account3);
        await waitDays(10);
        expect(await claimFee(account)).to.equal(amountOf(1.5));
        expect(await claimFee(account2)).to.equal(amountOf(1.5));
        expect(await claimFee(account3)).to.equal(amountOf(1.5));
      });

      it("New holders should claim partially distributed fee after transfer", async () => {
        await mint(account);
        await sendFee(31);
        await waitDays(22);
        await transferToken(account, account2, 0)
        await mint(account2);
        await mint(account3);
        await waitDays(10);
        expect(await claimFee(account)).to.equal(amountOf(11));
        expect(await claimFee(account2)).to.equal(amountOf(3));
        expect(await claimFee(account3)).to.equal(amountOf(1.5));
      });

      it("Should claim fee", async () => {
        await mint(account);
        await mint(account2);

        await sendAndDistributeFee(1);

        expect(await claimFee(account)).to.equal(amountOf(0.5).div(2));
      });

      it("Should claim nothing for non-holder", async () => {
        await mint(account);
        await mint(account2);

        await sendAndDistributeFee(1);

        expect(await claimFee(account3)).to.equal(amountOf(0));
      });

      it("Should claim share after token transfer", async () => {
        await mint(account);
        await mint(account2);

        await sendAndDistributeFee(1);

        await transferToken(account, account2, 0);

        expect(await claimFee(account)).to.equal(amountOf(0.5).div(2));
      });

      it("Should share secondary fee among holders", async () => {
        await mint(account);
        await mint(account2);

        await sendAndDistributeFee(1);

        await transferToken(account, account2, 0);
        await sendAndDistributeFee(1);

        expect(await claimFee(account)).to.equal(amountOf(0.5).div(2));
        expect(await claimFee(account2)).to.equal(amountOf(1.5).div(2));
      });

      it("Should claim nothing for secondary claim", async () => {
        await mint(account);
        await sendAndDistributeFee(1);
        expect(await claimFee(account)).to.equal(amountOf(1).div(2));
        expect(await claimFee(account)).to.equal(amountOf(0));
      });

      it("Should distribute secondary fee having not fully distributed initial fee", async () => {
        await mint(account);
        await sendFee(31);
        await waitDays(28);
        await sendFee(28)
        await waitDays(12);
        expect(await claimFee(account)).to.equal(amountOf(20));
      });

      it("Should distribute multiple fees sent on the same day", async () => {
        await mint(account);
        await sendFee(31);
        await sendFee(11);
        await sendFee(15);
        await sendFee(5);
        await waitDays(28);
        expect(await claimFee(account)).to.equal(amountOf(28));
      });
    });
  });

  describe("Dev Fund", () => {
    it("Should allow owner to withdraw dev fund", async () => {
      await instaPunks.connect(owner).withdrawDevFund(treasurer.address);
    });

    it("Should not allow non-owner to withdraw dev fund", async () => {
      await expect(instaPunks.connect(account).withdrawDevFund(treasurer.address)).to.be.revertedWith(Errors.NOT_ALLOWED);
    });

    it("Should withdraw dev fund without fee distribution", async () => {
      await mint(account);
      await mint(account2);
      await mint(account3);

      const balanceBefore = await treasurer.getBalance();
      await instaPunks.withdrawDevFund(treasurer.address);
      const balanceAfter = await treasurer.getBalance();
      expect(balanceAfter.sub(balanceBefore)).to.equal(MINT_PRICE.mul(3));
    });

    it("Should withdraw dev fund after fee distribution", async () => {
      await mint(account);
      await sendAndDistributeFee(2);

      const balanceBefore = await treasurer.getBalance();
      await instaPunks.withdrawDevFund(treasurer.address);
      const balanceAfter = await treasurer.getBalance();

      expect(balanceAfter.sub(balanceBefore)).to.equal(amountOf(2).div(2).add(MINT_PRICE));
    });

    it("Should withdraw dev fund multiple times", async () => {
      await mint(account);
      await sendAndDistributeFee(2);

      const balanceBefore = await treasurer.getBalance();
      await instaPunks.withdrawDevFund(treasurer.address);
      await mint(account);
      await instaPunks.withdrawDevFund(treasurer.address);
      await sendAndDistributeFee(1);
      await instaPunks.withdrawDevFund(treasurer.address);
      const balanceAfter = await treasurer.getBalance();

      expect(balanceAfter.sub(balanceBefore)).to.equal(amountOf(2 + 1).div(2).add(MINT_PRICE.mul(2)));
    });


    it("Should withdraw nothing when dev fund is empty", async () => {
      await mint(account);
      await sendAndDistributeFee(2);

      await instaPunks.withdrawDevFund(treasurer.address);

      const balanceBefore = await treasurer.getBalance();
      await instaPunks.withdrawDevFund(treasurer.address);
      const balanceAfter = await treasurer.getBalance();

      expect(balanceAfter.sub(balanceBefore)).to.equal(0);
    });
  });

  describe("Token URI", () => {
    const BASE_URI = "https://instapunks.io/nft/";
    beforeEach(async () => {
      await instaPunks.setBaseURI(BASE_URI);
    });

    it("Should not allow stranger to set base URI", async () => {
      await expect(instaPunks.connect(account).setBaseURI("https://not-instapunks.io/nft/")).to.be.revertedWith(Errors.NOT_ALLOWED);
    });

    it("Should return token URI", async () => {
      await mint(account);
      expect(await instaPunks.tokenURI(0)).to.equal(BASE_URI + 1);
    });

    it("Should allow to change token URI", async () => {
      await mint(account);
      expect(await instaPunks.tokenURI(0)).to.equal(BASE_URI + 1);
      await instaPunks.setBaseURI("https://instapunks.io/new/nft/");
      expect(await instaPunks.tokenURI(0)).to.equal("https://instapunks.io/new/nft/1");
    });
  });
});
