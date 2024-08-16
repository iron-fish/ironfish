import { ethers } from "ethers";
import GoldToken from "../artifacts/contracts/GoldToken.sol/GoldToken.json";

async function main() {
    const globalContract = new ethers.Interface(GoldToken.abi)
    const data = globalContract.encodeFunctionData('transfer', ["0x9695f9dcf4e9b561c1981fb58893cac343600157", 100n])
    console.log("transfer data:", data);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });