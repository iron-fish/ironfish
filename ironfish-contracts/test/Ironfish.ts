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

      await expect(ironfish.shield("51f33a2f14f92735e562dc658a5639279ddca3d5079a6d1242b2a588a9cbf44c", 15))
        .to.emit(ironfish, "Shield")
        .withArgs("51f33a2f14f92735e562dc658a5639279ddca3d5079a6d1242b2a588a9cbf44c", 15);
    });
  })
});
