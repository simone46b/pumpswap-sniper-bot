import dotenv from "dotenv";
dotenv.config();

import { Program } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";

import idl from "./idl.json";

const connection = new Connection(process.env.RPC_URL!);

const PUMPSWAP_PROGRAM_ID = new PublicKey('pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA');

const program = new Program(idl, {
  connection,
});

const targetToken = new PublicKey('2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv');

interface Pool {
    address: PublicKey;
    is_native_base: boolean;
    poolData: any;
}

interface PoolWithPrice extends Pool {
    price: number;
    reserves: {
        native: number;
        token: number;
    }
}

const getPoolsWithBaseMint = async (mintAddress: PublicKey) => {
    const response = await connection.getProgramAccounts(PUMPSWAP_PROGRAM_ID, {
        filters: [
            { "dataSize": 211 },
            {
              "memcmp": {
                "offset": 43,
                "bytes": mintAddress.toBase58()
              }
            }
          ]
        }
    )

    const mappedPools = response.map((pool) => {
        const data = Buffer.from(pool.account.data);
        const poolData = program.coder.accounts.decode('pool', data);
        return {
            address: pool.pubkey,
            is_native_base: false,
            poolData
        };
    })

    return mappedPools;
}

const getPoolsWithQuoteMint = async (mintAddress: PublicKey) => {
    const response = await connection.getProgramAccounts(PUMPSWAP_PROGRAM_ID, {
        filters: [
            { "dataSize": 211 },
            {
              "memcmp": {
                "offset": 75,
                "bytes": mintAddress.toBase58()
              }
            }
          ]
        }
    )

    const mappedPools = response.map((pool) => {
        const data = Buffer.from(pool.account.data);
        const poolData = program.coder.accounts.decode('pool', data);
        return {
            address: pool.pubkey,
            is_native_base: true,
            poolData
        };
    })

    return mappedPools;
}

const getPriceAndLiquidity = async (pool: Pool) => {
    const wsolAddress = pool.is_native_base ? pool.poolData.poolBaseTokenAccount : pool.poolData.poolQuoteTokenAccount;
    const tokenAddress = pool.is_native_base ? pool.poolData.poolQuoteTokenAccount : pool.poolData.poolBaseTokenAccount;
   
    const wsolBalance = await connection.getTokenAccountBalance(wsolAddress);
    const tokenBalance = await connection.getTokenAccountBalance(tokenAddress);

    const price = wsolBalance.value.uiAmount! / tokenBalance.value.uiAmount!;

    return {
        ...pool,
        price,
        reserves: {
            native: wsolBalance.value.uiAmount!,
            token: tokenBalance.value.uiAmount!
        }
    } as PoolWithPrice;
}
const getPoolsWithPrices = async (mintAddress: PublicKey) => {
    const [poolsWithBaseMint, poolsWithQuoteMint] = await Promise.all([
        getPoolsWithBaseMint(mintAddress),
        getPoolsWithQuoteMint(mintAddress)
    ])

    const pools = [...poolsWithBaseMint, ...poolsWithQuoteMint];

    const results = await Promise.all(pools.map(getPriceAndLiquidity));

    const sortedByHighestLiquidity = results.sort((a, b) => b.reserves.native - a.reserves.native);

    return sortedByHighestLiquidity;
}


getPoolsWithPrices(targetToken).then((pools) => {
    console.log(pools[0])
})
