export const testnetDeployments = {
  "arcTestnet": {
    "inletHub": "0xe202b28D53A26f2145f3995E48aDFBbc5148066f"
  },
  "arbitrumSepolia": {
    "inletReceiver": "0x145083628c9dF6980fe2747B286835e7c637ed22",
    "erc4626Adapter": "0x912c690f95a381e72F63a378fd906C6294412Fc9",
    "demoVault": "0x55da7c3B5e99816A7a9cD9dc47e24bfd7B19D6ED",
    "aaveV3Adapter": "0x9eD3b40bFd249Eb133Ae10b0006afae5d5947736",
    "inletExit": "0xBBA8b8f139e27101812340fc750e39f096ECD677",
    "erc4626ExitAdapter": "0x643AD7be131Aa7eE9fADB1596A66E69715F5a594",
    "aaveV3ExitAdapter": "0x6253A9a287803111eD736c0C234de17bBE7672ED",
    "compoundV3ExitAdapter": "0xeC0bBb2DA7a4c4f8F9c82bbf3AF7912d186D8001"
  },
  "baseSepolia": {
    "inletReceiver": "0x30695D945039FbBc0C36F595a8B5B54d83a945De",
    "erc4626Adapter": "0x6253A9a287803111eD736c0C234de17bBE7672ED",
    "compoundV3Adapter": "0x77D23de84220E4Dc86b6B8c181Be1E49D6a23f7c",
    "inletExit": "0xfa6000e83B141bDA1aD067a5a5A32912f43F0258",
    "erc4626ExitAdapter": "0x145083628c9dF6980fe2747B286835e7c637ed22",
    "aaveV3ExitAdapter": "0x5105e5af7a8C56d8fff2A1794aBC18e5ec31639B",
    "compoundV3ExitAdapter": "0xC7DA09Fc180062d0b31627686E7f7041E9288F90"
  },
  "unichainSepolia": {
    "inletReceiver": "0x49de71C101F1768C1ad4132AB815C163608A86d9",
    "erc4626Adapter": "0x912c690f95a381e72F63a378fd906C6294412Fc9",
    "uniswapV4LpAdapter": "0x55da7c3B5e99816A7a9cD9dc47e24bfd7B19D6ED"
  },
  "ethereumSepolia": {
    "inletReceiver": "0x55da7c3B5e99816A7a9cD9dc47e24bfd7B19D6ED",
    "erc4626Adapter": "0x912c690f95a381e72F63a378fd906C6294412Fc9"
  },
  "monadTestnet": {
    "inletReceiver": "0x38B9bCC43A585C80b7f649b9F98d394F9b321c96",
    "erc4626Adapter": "0x912c690f95a381e72F63a378fd906C6294412Fc9",
    "demoVault": "0x55da7c3B5e99816A7a9cD9dc47e24bfd7B19D6ED"
  },
  "adapters": {
    "erc4626:v1": "keccak256 of the string erc4626:v1",
    "aave-v3:v1": "keccak256 of the string aave-v3:v1",
    "compound-v3:v1": "keccak256 of the string compound-v3:v1",
    "uniswap-v4-lp:v1": "keccak256 of the string uniswap-v4-lp:v1",
    "erc4626-exit:v1": "keccak256 of the string erc4626-exit:v1",
    "aave-v3-exit:v1": "keccak256 of the string aave-v3-exit:v1",
    "compound-v3-exit:v1": "keccak256 of the string compound-v3-exit:v1"
  }
} as const;

export const mainnetDeployments = {
  "_note": "Mainnet deployment addresses, same schema as deployments.testnet.json. Every address fills as the scripts run, in the order given in docs/mainnet.md section 4. A chain with no inletReceiver is not served and a missing inletHub means the relayer refuses to start on mainnet, so nothing here is ever a placeholder.",
  "arcMainnet": {
    "inletHub": "0x84f3433550d1B6FB7f0BE197eA9faA256962408B"
  },
  "arbitrum": {
    "inletReceiver": "0x84f3433550d1B6FB7f0BE197eA9faA256962408B",
    "erc4626Adapter": "0x912c690f95a381e72F63a378fd906C6294412Fc9",
    "aaveV3Adapter": "0x55da7c3B5e99816A7a9cD9dc47e24bfd7B19D6ED",
    "inletExit": "0x49de71C101F1768C1ad4132AB815C163608A86d9",
    "erc4626ExitAdapter": "0x3f2Fea5C6dE03b4A2B3771321E5545314B1f4E26",
    "aaveV3ExitAdapter": "0x9eD3b40bFd249Eb133Ae10b0006afae5d5947736",
    "compoundV3ExitAdapter": "0x66eE772967c04A03C23466d4497a968b982f369e"
  },
  "adapters": {
    "erc4626:v1": "keccak256 of the string erc4626:v1",
    "aave-v3:v1": "keccak256 of the string aave-v3:v1",
    "compound-v3:v1": "keccak256 of the string compound-v3:v1",
    "uniswap-v4-lp:v1": "keccak256 of the string uniswap-v4-lp:v1",
    "erc4626-exit:v1": "keccak256 of the string erc4626-exit:v1",
    "aave-v3-exit:v1": "keccak256 of the string aave-v3-exit:v1",
    "compound-v3-exit:v1": "keccak256 of the string compound-v3-exit:v1"
  }
} as const;
