#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, token, Address, Env};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum MarketError {
    Frozen = 90,
    InvalidAmount = 2,
}

#[contracttype]
pub enum Key {
    Usdc,
    Admin,
    Frozen,
    Balance(Address),
}

/// A stand in with the entrypoint Noether agreed for its market, for runs on testnet before the real stack exists.
#[contract]
pub struct MockMarket;

#[contractimpl]
impl MockMarket {
    pub fn __constructor(env: Env, admin: Address, usdc: Address) {
        env.storage().instance().set(&Key::Admin, &admin);
        env.storage().instance().set(&Key::Usdc, &usdc);
    }

    pub fn freeze(env: Env, on: bool) {
        let admin: Address = env.storage().instance().get(&Key::Admin).unwrap();
        admin.require_auth();
        env.storage().instance().set(&Key::Frozen, &on);
    }

    pub fn deposit_cross_margin_for(env: Env, payer: Address, beneficiary: Address, amount: i128) -> Result<(), MarketError> {
        if env.storage().instance().get(&Key::Frozen).unwrap_or(false) {
            return Err(MarketError::Frozen);
        }
        if amount <= 0 {
            return Err(MarketError::InvalidAmount);
        }
        payer.require_auth();
        let usdc: Address = env.storage().instance().get(&Key::Usdc).unwrap();
        token::Client::new(&env, &usdc).transfer(&payer, &env.current_contract_address(), &amount);
        let key = Key::Balance(beneficiary);
        let total: i128 = env.storage().persistent().get(&key).unwrap_or(0) + amount;
        env.storage().persistent().set(&key, &total);
        Ok(())
    }

    pub fn cross_margin_balance(env: Env, trader: Address) -> i128 {
        env.storage().persistent().get(&Key::Balance(trader)).unwrap_or(0)
    }
}
