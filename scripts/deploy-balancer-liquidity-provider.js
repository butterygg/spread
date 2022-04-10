async function main() {
    const [deployer] = await ethers.getSigners();
  
    console.log("Deploying contracts with the account:", deployer.address);
  
    const weiAmount = (await deployer.getBalance()).toString();
    
    console.log("Account balance:", (await ethers.utils.formatEther(weiAmount)));

    // TODO: replace owner here with gnosis safe
    const vault = '0xBA12222222228d8Ba445958a75a0704d566BF2C8';
    const BalancerLiquidityProvider = await ethers.getContractFactory("BalancerLiquidityProvider");
    const balancerLiquidityProvider = await BalancerLiquidityProvider.deploy(vault);
  
    console.log("BalancerLiquidityProvider address:", balancerLiquidityProvider.address);
  }
  
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
  });
  