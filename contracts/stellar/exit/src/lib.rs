#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, vec, Address, BytesN, Env, IntoVal,
    Symbol, Val, Vec,
};

#[cfg(test)]
mod test;

const DAY: u32 = 17_280;
const KEEP_BELOW: u32 = 30 * DAY;
const KEEP_FOR: u32 = 120 * DAY;
const ALLOWANCE_LEDGERS: u32 = 60;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NoLegs = 1,
    BadLeg = 2,
    AmountTooLarge = 3,
}

/// One landing: a CCTP domain, the recipient as 32 bytes, and the amount in the six decimals a CCTP message carries.
#[contracttype]
#[derive(Clone)]
pub struct ExitLeg {
    pub domain: u32,
    pub recipient: BytesN<32>,
    pub amount: i128,
}

#[contracttype]
#[derive(Clone)]
pub struct Config {
    pub admin: Address,
    pub usdc: Address,
    pub token_messenger: Address,
    pub market: Address,
}

#[contracttype]
pub enum DataKey {
    Config,
}

#[contractevent(topics = ["exited"])]
pub struct Exited {
    #[topic]
    pub trader: Address,
    pub amount: i128,
    pub legs: u32,
}

/// The way out of a Stellar position. The trader invokes this contract, so one signature covers the withdrawal and every burn.
#[contract]
pub struct InletExit;

#[contractimpl]
impl InletExit {
    pub fn __constructor(env: Env, admin: Address, usdc: Address, token_messenger: Address, market: Address) {
        env.storage().instance().set(&DataKey::Config, &Config { admin, usdc, token_messenger, market });
    }

    /// Takes the amount out of the trader's cross margin and burns it toward every leg. Nothing partial: any failure reverts the whole call.
    pub fn execute(env: Env, trader: Address, legs: Vec<ExitLeg>, max_fee: i128, min_finality: u32) -> Result<i128, Error> {
        trader.require_auth();
        if legs.is_empty() {
            return Err(Error::NoLegs);
        }
        let config = Self::config(env.clone());
        env.storage().instance().extend_ttl(KEEP_BELOW, KEEP_FOR);

        let nobody = BytesN::from_array(&env, &[0u8; 32]);
        let mut total: i128 = 0;
        for leg in legs.iter() {
            if leg.amount <= 0 || leg.recipient == nobody {
                return Err(Error::BadLeg);
            }
            total = total.checked_add(leg.amount).ok_or(Error::AmountTooLarge)?;
        }
        // A leg is in the six decimals a CCTP message carries. Stellar keeps seven, so every amount is multiplied by ten
        // on this side, which also means no leg can leave a seventh decimal behind as dust when Circle burns it.
        let withdrawn = total.checked_mul(10).ok_or(Error::AmountTooLarge)?;

        let me = env.current_contract_address();
        let args: Vec<Val> = vec![&env, trader.clone().into_val(&env), me.clone().into_val(&env), withdrawn.into_val(&env)];
        env.invoke_contract::<Val>(&config.market, &Symbol::new(&env, "withdraw_cross_margin_to"), args);

        let usdc = token::Client::new(&env, &config.usdc);
        usdc.approve(&me, &config.token_messenger, &withdrawn, &(env.ledger().sequence() + ALLOWANCE_LEDGERS));

        for leg in legs.iter() {
            let burn: Vec<Val> = vec![
                &env,
                me.clone().into_val(&env),
                (leg.amount * 10).into_val(&env),
                leg.domain.into_val(&env),
                leg.recipient.into_val(&env),
                config.usdc.clone().into_val(&env),
                nobody.clone().into_val(&env),
                max_fee.into_val(&env),
                min_finality.into_val(&env),
            ];
            env.invoke_contract::<Val>(&config.token_messenger, &Symbol::new(&env, "deposit_for_burn"), burn);
        }

        Exited { trader, amount: total, legs: legs.len() }.publish(&env);
        Ok(total)
    }

    pub fn config(env: Env) -> Config {
        env.storage().instance().get(&DataKey::Config).unwrap()
    }

    pub fn set_market(env: Env, market: Address) {
        let mut config = Self::config(env.clone());
        config.admin.require_auth();
        config.market = market;
        env.storage().instance().set(&DataKey::Config, &config);
    }

    pub fn upgrade(env: Env, wasm_hash: BytesN<32>) {
        Self::config(env.clone()).admin.require_auth();
        env.deployer().update_current_contract_wasm(wasm_hash);
    }
}
