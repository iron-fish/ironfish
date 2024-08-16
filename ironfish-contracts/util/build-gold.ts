import { ethers } from "ethers";
import GoldToken from "../artifacts/contracts/GoldToken.sol/GoldToken.json";

async function main() {
    const factory = new ethers.ContractFactory(GoldToken.abi, GoldToken.bytecode);
    const ironfishContractAddress = "0xffffffffffffffffffffffffffffffffffffffff";
    const contract = await factory.getDeployTransaction(1000000n, ironfishContractAddress);
    console.log("Deploy bytecode:", contract.data);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });