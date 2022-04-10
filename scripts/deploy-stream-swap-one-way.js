async function main() {
    const [deployer] = await ethers.getSigners();
  
    console.log("Deploying contracts with the account:", deployer.address);
  
    const weiAmount = (await deployer.getBalance()).toString();
    
    console.log("Account balance:", (await ethers.utils.formatEther(weiAmount)));

    // TODO: replace owner here with gnosis safe
    const owner = '0x0C804A7D83E8A883aF632E0090272b9E837aB78a';
    const host = '0xeD5B5b32110c3Ded02a07c8b8e97513FAfb883B6';
    const cfa = '0xF4C5310E51F6079F601a5fb7120bC72a70b96e2A';
    const ida = '0x32E0ecb72C1dDD92B007405F8102c1556624264D';
    const registrationKey = '';
    const StreamSwapOneWayMarket = await ethers.getContractFactory("StreamSwapOneWayMarket");
    const streamSwapOneWayMarket = await StreamSwapOneWayMarket.deploy(owner, host, cfa, ida, registrationKey);
  
    console.log("StreamSwapOneWayMarket address:", streamSwapOneWayMarket.address);
  }
  
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
  });
  