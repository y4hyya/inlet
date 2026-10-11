export const testnetProtocols = {
  "arbitrumSepolia": {
    "aaveV3Pool": "0xBfC91D59fdAA134A4ED45f7B584cAf96D7792Eff",
    "aaveV3AUsdc": "0x460b97BD498E1157530AEb3086301d5225b91216"
  },
  "baseSepolia": {
    "compoundV3Comet": "0x571621Ce60Cebb0c1D442B5afb38B1663C6Bf017",
    "morphoOneshotVault": "0x405baEeC864F9FA12AB031e69f2a1Aa2e4Add240"
  },
  "unichainSepolia": {
    "uniswapV4PoolManager": "0x00B036B58a818B1BC34d502D3fE730Db729e62AC",
    "uniswapV4PositionManager": "0xf969Aee60879C54bAAed9F3eD26147Db216Fd664",
    "uniswapV4StateView": "0xc199F1072a74D4e905ABa1A84d9a45E2546B6222",
    "uniswapV4Quoter": "0x56DCD40A3F2d466F48e7F48bDBE5Cc9B92Ae4472",
    "uniswapUniversalRouter": "0xf70536B3bcC1bD1a972dc186A2cf84cC6da6Be5D",
    "permit2": "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    "ethUsdcPool": {
      "fee": 3000,
      "tickSpacing": 60
    }
  },
  "ethereumSepolia": {
    "eulerEUsdc4": "0xF4FDA4026E5C012c96557E4f2412C566a8fcbd76"
  }
} as const;

export const mainnetProtocols = {
  "arbitrum": {
    "aaveV3Pool": "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
    "aaveV3AUsdc": "0x724dc807b04555b71ed48a6896b6F41593b8C637"
  }
} as const;
