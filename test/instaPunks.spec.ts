import { expect } from "chai";
import { ethers } from "hardhat";
import { InstaPunks, InstaPunks__factory} from "../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

const amountOf = (value: number) =>
    ethers.utils.parseEther(String(value));

const MINT_PRICE = amountOf(0.05);
const MINT_BLOCK_LIMIT = 3;
const MAX_SUPPLY = 10;

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
  let treasuser: SignerWithAddress
  let instaPunks: InstaPunks;

  before(async () => {
    [owner, account, account2, account3, treasuser] = await ethers.getSigners();
    await waitBlocks(10);
  });

  beforeEach(async () => {
    instaPunks = await new InstaPunks__factory(owner).deploy();
    await instaPunks.initialize(MINT_PRICE, MAX_SUPPLY)
  });

  describe("Mint", () => {
    it("Should mint NFT", async () => {
      await mint(account);
      expect(await instaPunks.ownerOf(0)).to.equal(account.address);
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
        await waitBlocks(MINT_BLOCK_LIMIT);
      }
      expect(await instaPunks.balanceOf(account.address)).to.equal(MAX_SUPPLY);
      expect(await instaPunks.totalSupply()).to.equal(MAX_SUPPLY);
      await expect(instaPunks.connect(account2).mint()).to.be.revertedWith(Errors.MAX_TOKEN_SUPPLY_REACHED);
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

      await transferToken(account2, account, 1);

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
      await transferToken(account, account2, 0);

      expect(await withdrawFeeShare(account)).to.equal(amountOf(0.5).div(2));
    });

    it("Should share secondary fee among holders", async () => {
      await mint(account);
      await mint(account2);

      await sendFee(1);
      await transferToken(account, account2, 0);
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
      await instaPunks.connect(owner).withdrawDevFund(treasuser.address)
    })

    it("Should not allow non-owner to withdraw dev fund", async () => {
      await expect(instaPunks.connect(account).withdrawDevFund(treasuser.address)).to.be.revertedWith(Errors.NOT_ALLOWED)
    })

    it("Should withdraw dev fund without fee distribution", async() => {
      await mint(account)
      await mint(account2)
      await mint(account3)

      const balanceBefore = await treasuser.getBalance()
      await instaPunks.withdrawDevFund(treasuser.address)
      const balanceAfter = await treasuser.getBalance()
      expect(balanceAfter.sub(balanceBefore)).to.equal(MINT_PRICE.mul(3))
    })

    it("Should withdraw dev fund after fee distribution", async() => {
      await mint(account)
      await sendFee(2)

      const balanceBefore = await treasuser.getBalance()
      await instaPunks.withdrawDevFund(treasuser.address)
      const balanceAfter = await treasuser.getBalance()

      expect(balanceAfter.sub(balanceBefore)).to.equal(amountOf(2).div(2).add(MINT_PRICE))
    })

    it("Should withdraw dev fund multiple times", async() => {
      await mint(account)
      await sendFee(2)

      const balanceBefore = await treasuser.getBalance()
      await instaPunks.withdrawDevFund(treasuser.address)
      await mint(account)
      await instaPunks.withdrawDevFund(treasuser.address)
      await sendFee(1)
      await instaPunks.withdrawDevFund(treasuser.address)
      const balanceAfter = await treasuser.getBalance()

      expect(balanceAfter.sub(balanceBefore)).to.equal(amountOf(2 + 1).div(2).add(MINT_PRICE.mul(2)))
    })


    it("Should withdraw nothing when dev fund is empty", async() => {
      await mint(account)
      await sendFee(2)

      await instaPunks.withdrawDevFund(treasuser.address)

      const balanceBefore = await treasuser.getBalance()
      await instaPunks.withdrawDevFund(treasuser.address)
      const balanceAfter = await treasuser.getBalance()

      expect(balanceAfter.sub(balanceBefore)).to.equal(0)
    })
  })

  const withdrawFeeShare = async (account: SignerWithAddress) => {
    const balanceBefore = await account.getBalance();
    const tx = await (await instaPunks.connect(account).withdrawFeeShare()).wait();
    const balanceAfter = await account.getBalance();
    return balanceAfter.sub(balanceBefore).add(tx.cumulativeGasUsed.mul(tx.effectiveGasPrice));
  };
  
  const mint = async (account: SignerWithAddress, value = MINT_PRICE) => {
    return instaPunks.connect(account).mint({value});
  }

  const waitBlocks = async (count: number) => {
    for (let i = 0; i < count; i++) {
      await ethers.provider.send("evm_mine", []);
    }
  };

  const sendFee = async (value: number, account = owner) =>
    account.sendTransaction({ to: instaPunks.address, value: amountOf(value) });

  const transferToken = async (from: SignerWithAddress, to: SignerWithAddress, tokenId: number) =>
    await instaPunks.connect(from)["safeTransferFrom(address,address,uint256)"](from.address, to.address, tokenId);
  
});