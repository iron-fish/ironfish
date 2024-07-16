import { expect } from "chai";
import hre from "hardhat";

describe("Ironfish", function () {
  async function deployContractFixture() {
    const Ironfish = await hre.ethers.getContractFactory("Ironfish");
    const ironfish = await Ironfish.deploy();

    return { ironfish, Ironfish };
  }

  describe("Shield", function () {
    it("Should shield 15 $IRON", async function () {
      const { ironfish } = await deployContractFixture();
      const [owner] = await hre.ethers.getSigners(); // Get the default signer

      await expect(ironfish.connect(owner).shield("0x4d2b1d7ddc444dda84dc6b682c0faae31c01b91a31794f69246f5d5cd9255837", "0x51f33a2f14f92735e562dc658a5639279ddca3d5079a6d1242b2a588a9cbf44c", 15))
        .to.emit(ironfish, "Shield")
        .withArgs("0x4d2b1d7ddc444dda84dc6b682c0faae31c01b91a31794f69246f5d5cd9255837", "0x51f33a2f14f92735e562dc658a5639279ddca3d5079a6d1242b2a588a9cbf44c", owner.address, 15);
    });
  })
});
