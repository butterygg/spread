async function main() {
    const [deployer] = await ethers.getSigners();
  
    console.log("Deploying contracts with the account:", deployer.address);
  
    const weiAmount = (await deployer.getBalance()).toString();
    
    console.log("Account balance:", (await ethers.utils.formatEther(weiAmount)));
  
    const StreamSwapOneWayMarket = await ethers.getContractFactory("StreamSwapOneWayMarket");
    const streamSwapOneWayMarket = await StreamSwapOneWayMarket.deploy();
  
    console.log("StreamSwapOneWayMarket address:", streamSwapOneWayMarket.address);
  }
  
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
  });
  